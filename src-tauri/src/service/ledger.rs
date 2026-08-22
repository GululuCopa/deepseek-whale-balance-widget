//! 记账数据存储模块（小鲸鱼记账）
//!
//! 复刻原 DSH 插件 `.dshw-usage.json` 的记账逻辑：
//! - 每次观测到余额后，用「余额下降的正差值」累计当天用量；
//! - 余额上升（充值）不扣减，只更新基准；
//! - 跨天自动归零，并把前一天用量归档进 `history`（保留最近 30 天）。

use crate::model::ledger::today_key;
use crate::model::UsageLedger;
use std::fs;

/// 从磁盘读取账本；缺失/损坏时返回默认账本。
fn read_ledger() -> UsageLedger {
    let path = crate::config::ledger_path();
    match fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<UsageLedger>(&content) {
            Ok(ledger) => ledger,
            Err(_) => UsageLedger::default(),
        },
        Err(_) => UsageLedger::default(),
    }
}

/// 原子写账本到磁盘。
fn write_ledger(ledger: &UsageLedger) -> Result<(), String> {
    let dir = crate::config::app_data_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let path = crate::config::ledger_path();
    let json = serde_json::to_string_pretty(ledger).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json.as_bytes()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// 记录一次余额观测，返回更新后的账本。
///
/// # 参数
/// - `current_balance`：本次观测到的余额（元）。
///
/// # 逻辑
/// 1. 跨天：归档昨日 `today_usage`，重置 `date`/`last_balance`/`today_usage`。
/// 2. 同日：余额下降时把差值累加进 `today_usage`；无论升降都更新 `last_balance`。
/// 3. 历史归档仅保留最近 30 天。
pub fn record_usage(current_balance: f64) -> UsageLedger {
    let today = today_key();
    let mut ledger = read_ledger();

    if ledger.date != today {
        // 跨天归档：只有存在有效当日用量时才写入历史。
        if ledger.today_usage > 0.0 {
            ledger
                .history
                .insert(ledger.date.clone(), ledger.today_usage);
        }
        ledger.date = today;
        ledger.last_balance = Some(current_balance);
        ledger.today_usage = 0.0;
    } else if let Some(prev) = ledger.last_balance {
        // 同日：余额下降的部分计为用量，余额上升（充值）只更新基准。
        if current_balance < prev {
            ledger.today_usage += prev - current_balance;
        }
        ledger.last_balance = Some(current_balance);
    } else {
        // 首次观测：仅建立基准。
        ledger.last_balance = Some(current_balance);
    }

    // 历史仅保留最近 30 天（BTreeMap 键有序，删最旧）。
    while ledger.history.len() > 30 {
        if let Some(oldest) = ledger.history.keys().next().cloned() {
            ledger.history.remove(&oldest);
        } else {
            break;
        }
    }

    // 记账失败不阻断余额展示，仅记录日志。
    if let Err(err) = write_ledger(&ledger) {
        log::warn!("写入记账账本失败: {}", err);
    }

    ledger
}
