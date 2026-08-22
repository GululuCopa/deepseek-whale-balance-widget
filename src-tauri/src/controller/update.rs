//! 版本检查与外部链接命令
//!
//! 检查更新（调用 service::update）与打开外部链接。

use crate::model::UpdateCheckResult;

/// 检查更新：请求远端版本清单，与当前版本字符串比较。
#[tauri::command]
pub async fn check_update() -> Result<UpdateCheckResult, String> {
    crate::service::update::check_update_version().await
}

/// 用系统默认浏览器打开外部链接（Windows 下经 explorer 打开，规避 shell 特殊字符问题）。
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    if url.trim().is_empty() {
        return Err("链接为空".to_string());
    }
    std::process::Command::new("explorer")
        .arg(&url)
        .spawn()
        .map_err(|e| format!("打开浏览器失败: {}", e))?;
    Ok(())
}
