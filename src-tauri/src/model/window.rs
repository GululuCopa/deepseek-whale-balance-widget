//! 窗口几何与吸附结果模型
//!
//! 挂件窗口位置/尺寸及拖拽吸附结果的序列化结构，供前端状态同步。

use serde::Serialize;

/// 挂件窗口当前的物理几何信息（返回给前端用于状态同步）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetGeometry {
    /// 窗口左上角 X 坐标（物理像素）。
    pub x: i32,
    /// 窗口左上角 Y 坐标（物理像素）。
    pub y: i32,
    /// 窗口宽度（物理像素）。
    pub width: u32,
    /// 窗口高度（物理像素）。
    pub height: u32,
}

/// 吸附结果：水平/垂直锚点（供前端决定是否镜像翻转）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapResult {
    /// 水平方向吸附结果：`left` / `right` / `none`。
    pub h: String,
    /// 垂直方向吸附结果：`top` / `bottom` / `none`。
    pub v: String,
}
