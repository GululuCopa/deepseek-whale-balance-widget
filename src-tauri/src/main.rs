//! 可执行入口
//!
//! 该文件仅负责二进制程序启动时的最小转发：
//! - Windows 发布版隐藏控制台窗口；
//! - 调用库 crate 的 `run` 完成 Tauri 应用初始化。

// Windows 发布版不弹出控制台窗口（必须保留，勿删）
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// 二进制程序入口：转发到库 crate 的统一启动逻辑。
fn main() {
    ds_desktop_whale_lib::run();
}
