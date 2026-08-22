//! 应用入口：注册命令、创建窗口（挂件窗口 + 配置窗口）与系统托盘。
//!
//! 模块划分：
//! - `config`     配置持久化
//! - `model`      跨层数据模型
//! - `view`       窗口与托盘
//! - `controller` Tauri 命令入口
//! - `service`    纯业务逻辑

mod config;
mod controller;
mod model;
mod service;
mod view;

use tauri::Manager;

/// 应用启动入口：初始化日志、构建 Tauri 应用并注册事件循环。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("warn")).init();

    let is_autostart = std::env::args().any(|a| a == "--autostart");

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 已存在实例：唤醒挂件窗口即可（单实例守护）。
            if let Some(window) = app.get_webview_window(crate::view::window::WIDGET_LABEL) {
                let _ = window.show();
            }
            if let Some(window) = app.get_webview_window(crate::view::window::CONFIG_LABEL) {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == crate::view::window::CONFIG_LABEL {
                    // 配置窗口关闭即隐藏复用，避免反复创建 WebView2 导致白屏/内存泄漏。
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            // 创建挂件窗口（默认显示在右下角）。
            let widget = crate::view::window::create_widget_window(app.handle())?;
            let _ = widget.show();

            // 系统托盘。
            crate::view::tray::setup_tray(app.handle())?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            crate::controller::config::get_config,
            crate::controller::config::save_config,
            crate::controller::config::save_widget_config,
            crate::controller::config::save_dialogue,
            crate::controller::balance::get_balance,
            crate::controller::app::set_autostart,
            crate::controller::app::pick_audio_file,
            crate::controller::app::read_audio_file,
            crate::controller::window::set_window_position,
            crate::controller::window::set_ignore_cursor_events,
            crate::controller::window::get_cursor_position,
            crate::controller::window::snap_window,
            crate::controller::window::resize_widget,
            crate::controller::update::check_update,
            crate::controller::update::open_external,
        ])
        .build(tauri::generate_context!())
        .expect("运行 Tauri 应用失败");

    app.run(move |app, event| {
        // 事件循环就绪后再创建配置窗口，避免在 setup 阶段与透明挂件窗口并发初始化导致白屏。
        if let tauri::RunEvent::Ready = event {
            if crate::config::get_config().api_key.is_empty() || !is_autostart {
                let _ = crate::view::window::ensure_config_window(app);
            }
        }
    });
}
