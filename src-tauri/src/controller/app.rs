//! 应用相关命令
//!
//! 开机自启、自定义音效选择与音频读取。

/// 设置开机自启，并把结果同步回配置。
#[tauri::command]
pub fn set_autostart(enabled: bool) -> Result<bool, String> {
    let result = crate::service::autostart::set_autostart(enabled)?;
    let _ = crate::config::mutate_config(|c| c.autostart = result);
    Ok(result)
}

/// 打开系统文件对话框选择自定义音效，返回所选文件路径（未选择返回 None）。
#[tauri::command]
pub fn pick_audio_file() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("选择自定义音效")
        .add_filter(
            "音频文件",
            &[
                "wav", "flac", "alac", "ape", "mp3", "aac", "wma", "ogg", "m4a", "opus", "caf",
            ],
        )
        .pick_file()
        .map(|p| p.to_string_lossy().to_string())
}

/// 读取本地音频文件并返回 base64 Data URL，供前端直接播放（绕开资产协议作用域限制）。
#[tauri::command]
pub fn read_audio_file(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    // 基于扩展名推断 MIME，便于前端直接把 Data URL 交给 `<audio>` 播放。
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    let mime = match ext.as_str() {
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "opus" => "audio/ogg",
        "flac" => "audio/flac",
        "m4a" | "alac" => "audio/mp4",
        "aac" => "audio/aac",
        "wma" => "audio/x-ms-wma",
        "ape" => "audio/ape",
        "caf" => "audio/x-caf",
        _ => "application/octet-stream",
    };
    use base64::Engine as _;
    // 统一转成 Data URL，避免前端再处理本地文件协议与权限问题。
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}
