//! 数据模型模块
//!
//! 集中存放跨层复用的纯数据结构（无业务逻辑），供 `controller` / `service` /
//! `view` 引用，不依赖其它业务模块。

pub mod balance;
pub mod ledger;
pub mod update;
pub mod window;

pub use balance::BalancePayload;
pub use ledger::UsageLedger;
pub use update::UpdateCheckResult;
pub use window::{SnapResult, WidgetGeometry};
