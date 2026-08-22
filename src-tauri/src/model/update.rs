//! 版本检查结果模型
//!
//! 前端读取 currentVersion / latestVersion / upToDate。

use serde::Serialize;

/// 版本检查结果（前端读取 currentVersion / latestVersion / upToDate）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    /// 当前应用版本。
    pub current_version: String,
    /// 远端返回的最新版本。
    pub latest_version: String,
    /// 当前版本是否已是最新。
    pub up_to_date: bool,
}
