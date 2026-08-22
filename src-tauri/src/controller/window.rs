//! 窗口相关命令
//!
//! 挂件窗口的移动、吸附、缩放与鼠标穿透控制，以及光标位置读取。

use crate::config::WidgetPosition;
use crate::model::{SnapResult, WidgetGeometry};
use crate::view::window::{current_geometry, widget_size, work_area};
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use tauri::{PhysicalPosition, Position, WebviewWindow};
use windows::Win32::Foundation::{HWND, POINT};
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER,
};

/// 保留两位小数，避免逻辑坐标反复序列化后产生噪声。
fn round_logical(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

/// 获取当前应保留的水平方向；首次保存时默认沿用右侧朝向。
fn saved_horizontal_direction() -> String {
    crate::config::get_config()
        .widget_position
        .map(|position| position.h)
        .unwrap_or_else(|| "right".to_string())
}

/// 读取当前窗口几何并按逻辑坐标写入配置。
fn save_current_widget_position(window: &WebviewWindow, h: String) -> Result<(), String> {
    let geometry = current_geometry(window);
    let sf = window.scale_factor().unwrap_or(1.0);
    let position = WidgetPosition {
        x: round_logical(geometry.x as f64 / sf),
        y: round_logical(geometry.y as f64 / sf),
        h,
    };
    crate::config::mutate_config(|cfg| cfg.widget_position = Some(position))?;
    Ok(())
}

/// 拖拽过程中把挂件窗口移动到指定的「逻辑屏幕坐标」。
///
/// 前端传入的是 `PointerEvent.screenX/Y`（CSS 逻辑像素），此处乘以缩放因子
/// 转成物理像素后再设置窗口位置，避免高分屏下拖拽跟手漂移。
#[tauri::command]
pub fn set_window_position(window: WebviewWindow, x: f64, y: f64) {
    let sf = window.scale_factor().unwrap_or(1.0);
    let px = (x * sf).round() as i32;
    let py = (y * sf).round() as i32;
    let _ = window.set_position(Position::Physical(PhysicalPosition::new(px, py)));
}

/// 开关挂件窗口的整窗鼠标穿透（配合前端命中检测实现仅鲸鱼/气泡可交互）。
#[tauri::command]
pub fn set_ignore_cursor_events(window: WebviewWindow, ignore: bool) {
    let _ = window.set_ignore_cursor_events(ignore);
}

/// 读取全局光标位置，按窗口缩放因子换算为逻辑屏幕坐标返回。
#[tauri::command]
pub fn get_cursor_position(window: WebviewWindow) -> (f64, f64) {
    let mut point = POINT { x: 0, y: 0 };
    unsafe {
        let _ = GetCursorPos(&mut point);
    }
    let sf = window.scale_factor().unwrap_or(1.0);
    (point.x as f64 / sf, point.y as f64 / sf)
}

/// 拖拽释放后按「四分之一区域」吸附到屏幕边缘。
#[tauri::command]
pub fn snap_window(window: WebviewWindow) -> SnapResult {
    let mut result = SnapResult {
        h: "none".to_string(),
        v: "none".to_string(),
    };

    let (pos, size) = match (window.outer_position(), window.outer_size()) {
        (Ok(p), Ok(s)) => (p, s),
        _ => return result,
    };

    let Some((wa_x, wa_y, wa_w, wa_h)) = work_area(&window) else {
        return result;
    };

    let w = size.width as i32;
    let h = size.height as i32;
    let center_x = pos.x + w / 2;
    let center_y = pos.y + h / 2;

    let mut x = pos.x;
    let mut y = pos.y;

    // 水平四分之一吸附：中心点位于左 1/4 → 贴左；右 1/4 → 贴右。
    if center_x < wa_x + wa_w as i32 / 4 {
        result.h = "left".to_string();
        x = wa_x;
    } else if center_x > wa_x + (wa_w as i32 * 3) / 4 {
        result.h = "right".to_string();
        x = wa_x + wa_w as i32 - w;
    }

    // 垂直四分之一吸附：上 1/4 → 贴顶；下 3/4 → 贴底。
    if center_y < wa_y + wa_h as i32 / 4 {
        result.v = "top".to_string();
        y = wa_y;
    } else if center_y > wa_y + (wa_h as i32 * 3) / 4 {
        result.v = "bottom".to_string();
        y = wa_y + wa_h as i32 - h;
    }

    let _ = window.set_position(Position::Physical(PhysicalPosition::new(x, y)));
    if let Err(err) = save_current_widget_position(&window, result.h.clone()) {
        log::warn!("保存挂件吸附位置失败: {}", err);
    }
    result
}

/// 按倍率缩放挂件窗口：以右下角为唯一锚点，通过单次 SetWindowPos 原子调整位置与尺寸，避免闪屏抖动。
#[tauri::command]
pub fn resize_widget(window: WebviewWindow, scale: f64) -> WidgetGeometry {
    let new_logical = widget_size(scale);
    let sf = window.scale_factor().unwrap_or(1.0);
    let new_physical = (new_logical * sf).round() as i32;

    // 先读取缩放前的原始位置与尺寸，右下角固定点基于旧尺寸计算。
    if let (Ok(old_pos), Ok(old_size)) = (window.outer_position(), window.outer_size()) {
        let fixed_x = old_pos.x + old_size.width as i32;
        let fixed_y = old_pos.y + old_size.height as i32;
        let mut new_x = fixed_x - new_physical;
        let mut new_y = fixed_y - new_physical;

        // 钳制到工作区，防止缩放后溢出屏幕。
        if let Some((wa_x, wa_y, wa_w, wa_h)) = work_area(&window) {
            let max_x = (wa_x + wa_w as i32 - new_physical).max(wa_x);
            let max_y = (wa_y + wa_h as i32 - new_physical).max(wa_y);
            new_x = new_x.clamp(wa_x, max_x);
            new_y = new_y.clamp(wa_y, max_y);
        }

        // 获取原生 HWND 并单次原子设置位置 + 尺寸。
        if let Ok(handle) = window.window_handle() {
            if let RawWindowHandle::Win32(h) = handle.as_raw() {
                let hwnd = HWND(h.hwnd.get() as *mut _);
                unsafe {
                    let _ = SetWindowPos(
                        hwnd,
                        None,
                        new_x,
                        new_y,
                        new_physical,
                        new_physical,
                        SWP_NOZORDER | SWP_NOACTIVATE,
                    );
                }
            }
        }
    }

    if let Err(err) = save_current_widget_position(&window, saved_horizontal_direction()) {
        log::warn!("保存挂件缩放后位置失败: {}", err);
    }

    current_geometry(&window)
}
