//! 配置模块
//!
//! 对外统一导出数据模型与持久化存储：
//! - `model`：配置数据模型（`AppConfig` / `WidgetConfig` / `DialogueConfig` 等）与规范化逻辑；
//! - `store`：配置的加载、内存缓存与原子写盘。

pub mod model;
pub mod store;

pub use model::*;
pub use store::*;
