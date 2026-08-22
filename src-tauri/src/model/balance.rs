//! 余额载荷模型
//!
//! 返回给前端的余额/用量载荷结构（前端挂件据此渲染金额与「今日已用」）。

use serde::Serialize;

/// 余额/用量载荷（前端挂件据此渲染金额与「今日已用」）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalancePayload {
    /// 本次请求是否成功。
    pub ok: bool,
    /// 当前余额；失败时为空。
    pub total_balance: Option<f64>,
    /// 余额币种；失败时为空。
    pub currency: Option<String>,
    /// 今日累计用量；失败时为空。
    pub today_usage: Option<f64>,
    /// 当前是否处于峰时段。
    pub is_peak: bool,
    /// 失败时返回的错误文案。
    pub error: Option<String>,
}

impl BalancePayload {
    /// 构造成功载荷。
    pub(crate) fn ok(
        total_balance: f64,
        currency: String,
        today_usage: f64,
        is_peak: bool,
    ) -> Self {
        Self {
            ok: true,
            total_balance: Some(total_balance),
            currency: Some(currency),
            today_usage: Some(today_usage),
            is_peak,
            error: None,
        }
    }

    /// 构造失败载荷。
    pub(crate) fn err(code: &str, transient: bool, message: &str) -> Self {
        // 原插件用 `code` 字段区分错误类型；这里并入 error 文案，方便前端统一提示。
        let _ = (code, transient);
        Self {
            ok: false,
            total_balance: None,
            currency: None,
            today_usage: None,
            is_peak: false,
            error: Some(message.to_string()),
        }
    }
}
