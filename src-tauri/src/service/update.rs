//! 版本检查服务
//!
//! 负责请求远端版本清单并与当前编译版本比较，结果供 `controller::update`
//! 的 `check_update` 命令调用。

use crate::model::UpdateCheckResult;
use serde_json::Value;
use std::time::Duration;

/// 远端版本清单地址。
const VERSION_URL: &str = "https://www.xiaolin.help/update/dswDesktopVersion.json";

/// 请求远端版本清单并与当前版本字符串比较，返回版本检查结果。
pub async fn check_update_version() -> Result<UpdateCheckResult, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {}", e))?;

    let resp = client
        .get(VERSION_URL)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("版本检查请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("版本检查请求失败: HTTP {}", resp.status().as_u16()));
    }

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("读取版本响应失败: {}", e))?;

    let latest_version = body
        .get("latestVersion")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "版本接口返回结构异常".to_string())?
        .to_string();

    let up_to_date = latest_version == current_version;

    Ok(UpdateCheckResult {
        current_version,
        latest_version,
        up_to_date,
    })
}
