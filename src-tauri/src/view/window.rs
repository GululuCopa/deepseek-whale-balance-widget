//! 窗口视图
//!
//! 挂件窗口与配置窗口的创建、复用，以及窗口几何/工作区相关的辅助函数。

use crate::model::WidgetGeometry;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// 挂件窗口 label。
pub const WIDGET_LABEL: &str = "widget";
/// 配置窗口 label。
pub const CONFIG_LABEL: &str = "config";

/// 挂件基准尺寸（scale 倍率作用于其上，最终钳制在 122–625 逻辑像素内）。
pub const WIDGET_BASE: f64 = 250.0;

/// 根据倍率计算挂件窗口的逻辑边长（正方形）。
pub fn widget_size(scale: f64) -> f64 {
    (WIDGET_BASE * scale).clamp(122.0, 625.0)
}

/// 读取挂件窗口当前物理几何信息。
pub fn current_geometry(window: &WebviewWindow) -> WidgetGeometry {
    let (x, y) = window
        .outer_position()
        .map(|p| (p.x, p.y))
        .unwrap_or((0, 0));
    let (width, height) = window
        .outer_size()
        .map(|s| (s.width, s.height))
        .unwrap_or((0, 0));
    WidgetGeometry {
        x,
        y,
        width,
        height,
    }
}

/// 获取主显示器工作区（排除任务栏），返回 (x, y, width, height) 物理坐标。
pub fn work_area(window: &WebviewWindow) -> Option<(i32, i32, u32, u32)> {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())?;
    let wa = monitor.work_area();
    let pos = wa.position;
    let size = wa.size;
    Some((pos.x, pos.y, size.width, size.height))
}

/// 创建或显示配置窗口。
pub fn ensure_config_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(CONFIG_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(window);
    }

    let window = WebviewWindowBuilder::new(
        app,
        CONFIG_LABEL,
        WebviewUrl::App("html/config.html".into()),
    )
    .title("小鲸鱼设置")
    .transparent(true)
    .inner_size(600.0, 720.0)
    .min_inner_size(520.0, 600.0)
    .resizable(true)
    .center()
    .build()
    .map_err(|e| e.to_string())?;

    let _ = window.show();
    let _ = window.set_focus();
    Ok(window)
}

/// 创建挂件窗口：无边框、透明、置顶、不占任务栏，初始停靠屏幕右下角。
pub fn create_widget_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let cfg = crate::config::get_config();
    let scale = cfg.widget.scale;
    let size = widget_size(scale);

    let mut builder = WebviewWindowBuilder::new(
        app,
        WIDGET_LABEL,
        WebviewUrl::App("html/widget.html".into()),
    )
    .title("小鲸鱼")
    .transparent(true)
    .shadow(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .inner_size(size, size);

    // 优先恢复已保存逻辑坐标，并钳制到工作区；无保存位置时回退右下角。
    if let Some(monitor) = app.primary_monitor().ok().flatten() {
        let wa = monitor.work_area();
        let sf = monitor.scale_factor();
        let wa_x = wa.position.x as f64 / sf;
        let wa_y = wa.position.y as f64 / sf;
        let wa_w = wa.size.width as f64 / sf;
        let wa_h = wa.size.height as f64 / sf;
        let max_x = (wa_x + wa_w - size).max(wa_x);
        let max_y = (wa_y + wa_h - size).max(wa_y);

        let (x, y) = if let Some(position) = cfg.widget_position.as_ref() {
            (position.x.clamp(wa_x, max_x), position.y.clamp(wa_y, max_y))
        } else {
            (max_x, max_y)
        };
        builder = builder.position(x, y);
    } else if let Some(position) = cfg.widget_position.as_ref() {
        builder = builder.position(position.x, position.y);
    }

    let window = builder.build().map_err(|e| e.to_string())?;
    Ok(window)
}
