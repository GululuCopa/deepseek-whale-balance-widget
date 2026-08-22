//! Tauri 构建脚本
//!
//! 负责在编译期执行 Tauri 所需的资源与配置生成步骤。

/// 构建脚本入口：调用 `tauri_build` 完成编译期准备。
fn main() {
    tauri_build::build()
}
