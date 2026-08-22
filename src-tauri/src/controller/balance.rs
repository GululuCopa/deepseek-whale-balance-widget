//! 余额查询命令
//!
//! 供前端调用查询余额 + 今日已用。

use crate::model::BalancePayload;

/// 查询余额 + 今日已用（异步，内部完成小鲸鱼记账）。
#[tauri::command]
pub async fn get_balance() -> BalancePayload {
    crate::service::balance::get_balance_payload().await
}
