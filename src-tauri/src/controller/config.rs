//! 配置相关命令
//!
//! 读取/保存应用配置、挂件显示配置与台词配置。

use crate::config::{AppConfig, DialogueConfig, WidgetConfig};
use tauri::{AppHandle, Emitter};

const BALANCE_REFRESH_REQUESTED_EVENT: &str = "balance-refresh-requested";

fn balance_source_changed(previous: &AppConfig, next: &AppConfig) -> bool {
    previous.api_key.trim() != next.api_key.trim()
        || previous.base_url.trim().trim_end_matches('/')
            != next.base_url.trim().trim_end_matches('/')
}

/// 读取完整应用配置。
#[tauri::command]
pub fn get_config() -> AppConfig {
    let mut cfg = crate::config::get_config();
    if let Ok(actual) = crate::service::autostart::is_autostart_enabled() {
        if cfg.autostart != actual {
            cfg.autostart = actual;
            let _ = crate::config::mutate_config(|c| c.autostart = actual);
        }
    }
    cfg
}

/// 保存完整应用配置（写盘 + 刷新缓存）。
#[tauri::command]
pub fn save_config(app: AppHandle, cfg: AppConfig) -> Result<AppConfig, String> {
    let previous = crate::config::get_config();
    let saved = crate::config::update_config(cfg)?;
    if let Err(e) = crate::service::claude_config::write_claude_settings(&saved) {
        log::error!("写入 Claude 配置失败: {}", e);
    }
    if let Err(e) = crate::service::codex_config::write_codex_settings(&saved) {
        log::error!("写入 Codex 配置失败: {}", e);
    }
    if balance_source_changed(&previous, &saved) {
        let _ = app.emit(BALANCE_REFRESH_REQUESTED_EVENT, true);
    }
    Ok(saved)
}

/// 快速保存挂件显示配置（汉堡菜单实时调整时使用）。
#[tauri::command]
pub fn save_widget_config(app: AppHandle, widget: WidgetConfig) -> Result<WidgetConfig, String> {
    let cfg = crate::config::mutate_config(|c| c.widget = widget)?;
    // 广播给挂件窗口，使其实时应用来自配置窗口的显示设置。
    let _ = app.emit("widget-config-changed", &cfg.widget);
    Ok(cfg.widget)
}

/// 保存台词管理配置（写盘 + 广播给挂件窗口）。
#[tauri::command]
pub fn save_dialogue(app: AppHandle, dialogue: DialogueConfig) -> Result<DialogueConfig, String> {
    let cfg = crate::config::mutate_config(|c| c.dialogue = dialogue)?;
    let _ = app.emit("dialogue-changed", &cfg.dialogue);
    Ok(cfg.dialogue)
}
