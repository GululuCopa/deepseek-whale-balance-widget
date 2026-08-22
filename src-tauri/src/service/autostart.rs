//! 系统服务模块（开机自启）
//!
//! Windows 下直接维护两个注册表位置：
//! - `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
//! - `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run`
//!
//! 这样可以在安全软件清除 Run 项、但残留 StartupApproved 状态时主动自修复，
//! 避免界面开关与系统真实状态长期漂移。
//!
//! 非 Windows 平台仍沿用 `auto-launch` 跨平台库。

#[cfg(not(windows))]
use auto_launch::{AutoLaunch, AutoLaunchBuilder};

const APP_NAME: &str = "DSW小鲸鱼";

#[cfg(windows)]
const RUN_KEY_PATH: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
#[cfg(windows)]
const STARTUP_APPROVED_RUN_KEY_PATH: &str =
    r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
#[cfg(windows)]
const STARTUP_ENABLED_VALUE: [u8; 12] = [0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

#[cfg(windows)]
fn current_exe_path() -> Result<std::path::PathBuf, String> {
    std::env::current_exe().map_err(|e| format!("无法获取应用路径: {e}"))
}

#[cfg(windows)]
fn expected_command() -> Result<String, String> {
    let exe_path = current_exe_path()?;
    Ok(format!("\"{}\" --autostart", exe_path.to_string_lossy()))
}

#[cfg(windows)]
fn read_run_value() -> Result<Option<String>, String> {
    use std::io::ErrorKind;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    match hkcu.open_subkey(RUN_KEY_PATH) {
        Ok(key) => match key.get_value::<String, _>(APP_NAME) {
            Ok(value) => Ok(Some(value)),
            Err(err) if err.kind() == ErrorKind::NotFound => Ok(None),
            Err(err) => Err(format!("读取启动项失败: {err}")),
        },
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(None),
        Err(err) => Err(format!("打开启动项注册表失败: {err}")),
    }
}

#[cfg(windows)]
fn write_run_value(command: &str) -> Result<(), String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey(RUN_KEY_PATH)
        .map_err(|e| format!("创建启动项注册表失败: {e}"))?;
    key.set_value(APP_NAME, &command)
        .map_err(|e| format!("写入启动项失败: {e}"))
}

#[cfg(windows)]
fn delete_run_value() -> Result<(), String> {
    use std::io::ErrorKind;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    match hkcu.open_subkey_with_flags(RUN_KEY_PATH, winreg::enums::KEY_SET_VALUE) {
        Ok(key) => match key.delete_value(APP_NAME) {
            Ok(_) => Ok(()),
            Err(err) if err.kind() == ErrorKind::NotFound => Ok(()),
            Err(err) => Err(format!("删除启动项失败: {err}")),
        },
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!("打开启动项注册表失败: {err}")),
    }
}

#[cfg(windows)]
fn read_startup_approved_state() -> Result<Option<bool>, String> {
    use std::io::ErrorKind;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    match hkcu.open_subkey(STARTUP_APPROVED_RUN_KEY_PATH) {
        Ok(key) => match key.get_raw_value(APP_NAME) {
            Ok(value) => {
                let enabled = matches!(value.bytes.first().copied(), Some(0x02 | 0x06));
                Ok(Some(enabled))
            }
            Err(err) if err.kind() == ErrorKind::NotFound => Ok(None),
            Err(err) => Err(format!("读取启动审批状态失败: {err}")),
        },
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(None),
        Err(err) => Err(format!("打开启动审批注册表失败: {err}")),
    }
}

#[cfg(windows)]
fn mark_startup_approved_enabled() -> Result<(), String> {
    use winreg::enums::{HKEY_CURRENT_USER, REG_BINARY};
    use winreg::RegKey;
    use winreg::RegValue;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey(STARTUP_APPROVED_RUN_KEY_PATH)
        .map_err(|e| format!("创建启动审批注册表失败: {e}"))?;
    key.set_raw_value(
        APP_NAME,
        &RegValue {
            vtype: REG_BINARY,
            bytes: STARTUP_ENABLED_VALUE.to_vec(),
        },
    )
    .map_err(|e| format!("写入启动审批状态失败: {e}"))
}

#[cfg(windows)]
fn delete_startup_approved_value() -> Result<(), String> {
    use std::io::ErrorKind;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    match hkcu.open_subkey_with_flags(STARTUP_APPROVED_RUN_KEY_PATH, winreg::enums::KEY_SET_VALUE) {
        Ok(key) => match key.delete_value(APP_NAME) {
            Ok(_) => Ok(()),
            Err(err) if err.kind() == ErrorKind::NotFound => Ok(()),
            Err(err) => Err(format!("删除启动审批状态失败: {err}")),
        },
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!("打开启动审批注册表失败: {err}")),
    }
}

#[cfg(windows)]
fn repair_blocked_state() -> Result<(), String> {
    let has_run_value = read_run_value()?.is_some();
    let startup_approved_state = read_startup_approved_state()?;

    // 若安全软件删掉 Run 项但残留审批项，清理残留状态，让后续启用可重新建立。
    if !has_run_value && startup_approved_state.is_some() {
        delete_startup_approved_value()?;
    }

    Ok(())
}

#[cfg(not(windows))]
/// 构建 AutoLaunch 实例（使用当前可执行文件路径）。
fn build_auto_launch() -> Result<AutoLaunch, String> {
    let exe_path = std::env::current_exe().map_err(|e| format!("无法获取应用路径: {e}"))?;
    AutoLaunchBuilder::new()
        .set_app_name(APP_NAME)
        .set_app_path(&exe_path.to_string_lossy())
        .set_args(&["--autostart"])
        .build()
        .map_err(|e| format!("创建开机自启配置失败: {e}"))
}

/// 读取系统当前的开机自启真实状态。
pub fn is_autostart_enabled() -> Result<bool, String> {
    #[cfg(windows)]
    {
        repair_blocked_state()?;
        let expected = expected_command()?;
        let run_value = read_run_value()?;
        let Some(run_value) = run_value else {
            return Ok(false);
        };
        if run_value != expected {
            return Ok(false);
        }
        if matches!(read_startup_approved_state()?, Some(false)) {
            return Ok(false);
        }
        Ok(true)
    }

    #[cfg(not(windows))]
    {
        let auto_launch = build_auto_launch()?;
        auto_launch
            .is_enabled()
            .map_err(|e| format!("读取开机自启状态失败: {e}"))
    }
}

/// 设置开机自启状态。
pub fn set_autostart(enabled: bool) -> Result<bool, String> {
    #[cfg(windows)]
    {
        repair_blocked_state()?;
        if enabled {
            let command = expected_command()?;
            write_run_value(&command)?;
            mark_startup_approved_enabled()?;
        } else {
            delete_run_value()?;
            delete_startup_approved_value()?;
        }
        return is_autostart_enabled();
    }

    #[cfg(not(windows))]
    {
        let auto_launch = build_auto_launch()?;
        if enabled {
            auto_launch
                .enable()
                .map_err(|e| format!("启用开机自启失败: {e}"))?;
        } else {
            auto_launch
                .disable()
                .map_err(|e| format!("禁用开机自启失败: {e}"))?;
        }
        auto_launch
            .is_enabled()
            .map_err(|e| format!("读取开机自启状态失败: {e}"))
    }
}
