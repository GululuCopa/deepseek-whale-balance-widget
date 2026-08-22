//! 记账账本模型
//!
//! 小鲸鱼记账的磁盘 JSON 结构（`UsageLedger`）与日期键工具。

use chrono::Local;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// 返回当天日期键（本地时区）。
pub(crate) fn today_key() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

/// 记账账本结构（磁盘 JSON 结构）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageLedger {
    /// 当前记账日期（`YYYY-MM-DD`）。
    pub date: String,
    /// 最近一次观测到的余额（作为差值计算基准）。
    pub last_balance: Option<f64>,
    /// 当日累计用量（单位：元）。
    pub today_usage: f64,
    /// 历史归档：日期 -> 当日用量。
    pub history: BTreeMap<String, f64>,
}

impl Default for UsageLedger {
    /// 返回空账本默认值，并以当天日期初始化日期键。
    fn default() -> Self {
        Self {
            date: today_key(),
            last_balance: None,
            today_usage: 0.0,
            history: BTreeMap::new(),
        }
    }
}
