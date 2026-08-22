//! 配置持久化存储
//!
//! 负责应用配置（API Key、请求地址、模型、挂件显示、开机自启）的加载、
//! 内存缓存与原子写盘。借鉴 cc-switch 的 `settings.rs` 模式，使用
//! `OnceLock<RwLock<AppConfig>>` 做进程内唯一实例，避免多命令并发读写冲突。

use super::model::AppConfig;
use std::fs;
use std::path::PathBuf;
use std::sync::{OnceLock, RwLock};

/// 应用数据目录：`<config_dir>/DS Desktop Whale`（Windows 为 `%APPDATA%/DS Desktop Whale`）。
pub fn app_data_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("DS Desktop Whale")
}

/// 配置文件路径。
fn config_path() -> PathBuf {
    app_data_dir().join("config.json")
}

/// 账本文件路径（小鲸鱼记账数据）。
pub fn ledger_path() -> PathBuf {
    app_data_dir().join("usage.json")
}

/// 进程内唯一配置实例。
static CONFIG_STORE: OnceLock<RwLock<AppConfig>> = OnceLock::new();

/// 返回全局配置缓存实例，首次访问时从磁盘加载。
fn config_store() -> &'static RwLock<AppConfig> {
    CONFIG_STORE.get_or_init(|| RwLock::new(load_from_file()))
}

/// 从磁盘加载配置；文件缺失或解析失败时回退默认值。
fn load_from_file() -> AppConfig {
    let path = config_path();
    match fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<AppConfig>(&content) {
            Ok(mut cfg) => {
                cfg.normalize();
                cfg
            }
            Err(err) => {
                log::warn!(
                    "解析配置文件失败，使用默认配置（{}）: {}",
                    path.display(),
                    err
                );
                AppConfig::default()
            }
        },
        Err(_) => AppConfig::default(),
    }
}

/// 原子写入配置到磁盘（先写临时文件再替换，避免半写损坏）。
fn save_to_file(cfg: &AppConfig) -> Result<(), String> {
    let mut normalized = cfg.clone();
    normalized.normalize();

    let dir = app_data_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let path = config_path();
    let json = serde_json::to_string_pretty(&normalized).map_err(|e| e.to_string())?;

    // 原子写：临时文件 + rename。
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json.as_bytes()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// 获取当前配置快照。
pub fn get_config() -> AppConfig {
    config_store()
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

/// 全量更新配置（保存到磁盘并刷新内存缓存）。
pub fn update_config(new_cfg: AppConfig) -> Result<AppConfig, String> {
    let mut cfg = new_cfg;
    cfg.normalize();
    save_to_file(&cfg)?;

    let mut guard = config_store()
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *guard = cfg.clone();
    Ok(cfg)
}

/// 局部修改配置（闭包内修改副本，成功后写盘并刷新缓存）。
pub fn mutate_config<F>(mutator: F) -> Result<AppConfig, String>
where
    F: FnOnce(&mut AppConfig),
{
    let current = get_config();
    let mut next = current;
    mutator(&mut next);
    update_config(next)
}
