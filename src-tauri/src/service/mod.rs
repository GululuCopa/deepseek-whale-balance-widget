//! 服务层模块
//!
//! 承载纯业务逻辑：余额查询、记账、开机自启、Claude/Codex 配置落盘、版本检查。

pub mod autostart;
pub mod balance;
pub mod claude_config;
pub mod codex_config;
pub mod ledger;
pub mod update;
