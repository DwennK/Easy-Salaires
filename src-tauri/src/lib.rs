mod storage;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{fs, io::Write, path::PathBuf, sync::Mutex};
use storage::{Database, Result};
use tauri::Manager;
struct AppState {
    db: Mutex<Option<Database>>,
    config: PathBuf,
}
fn read_config(s: &AppState) -> Value {
    fs::read(&s.config)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or(json!({"recent":[],"backupDir":null}))
}
fn save_config(s: &AppState, c: &Value) -> Result<()> {
    let tmp = s.config.with_extension("tmp");
    fs::write(&tmp, c.to_string()).map_err(|e| e.to_string())?;
    fs::rename(tmp, &s.config).map_err(|e| e.to_string())
}
fn recent(s: &AppState, path: &std::path::Path) -> Result<()> {
    let mut c = read_config(s);
    let p = path.to_string_lossy().to_string();
    let mut list = vec![json!(p)];
    if let Some(items) = c["recent"].as_array() {
        list.extend(
            items
                .iter()
                .filter(|x| x.as_str() != Some(&p))
                .take(9)
                .cloned(),
        );
    }
    c["recent"] = json!(list);
    save_config(s, &c)
}
fn safe_name(name: &str) -> String {
    let n: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || "-_. ".contains(c) {
                c
            } else {
                '_'
            }
        })
        .take(150)
        .collect();
    if n.is_empty() {
        "document.pdf".into()
    } else {
        n
    }
}
fn unique_file(path: PathBuf, bytes: &[u8]) -> Result<PathBuf> {
    for i in 0..10000 {
        let p = if i == 0 {
            path.clone()
        } else {
            path.with_file_name(format!(
                "{}-{}.{}",
                path.file_stem().unwrap().to_string_lossy(),
                i,
                path.extension().unwrap_or_default().to_string_lossy()
            ))
        };
        match fs::OpenOptions::new().write(true).create_new(true).open(&p) {
            Ok(mut f) => {
                f.write_all(bytes).map_err(|e| e.to_string())?;
                f.sync_all().map_err(|e| e.to_string())?;
                return Ok(p);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("fileExists".into())
}
#[tauri::command]
async fn native(
    action: String,
    payload: Value,
    state: tauri::State<'_, AppState>,
) -> Result<Value> {
    let config = read_config(&state);
    let backup = config["backupDir"].as_str().map(PathBuf::from);
    match action.as_str() {
        "startup" => {
            let mut db = state.db.lock().map_err(|e| e.to_string())?;
            if db.is_none() {
                if let Some(path) = config["recent"]
                    .as_array()
                    .and_then(|a| a.first())
                    .and_then(|v| v.as_str())
                {
                    if let Ok(opened) =
                        Database::open(&PathBuf::from(path), false, backup.as_deref())
                    {
                        *db = Some(opened)
                    }
                }
            }
            Ok(
                json!({"state":db.as_ref().map(|d|d.load()).transpose()?.flatten(),"path":db.as_ref().map(|d|d.path.to_string_lossy()),"config":config}),
            )
        }
        "create" | "open" | "recent" | "demo" => {
            let path = match action.as_str() {
                "create" => rfd::FileDialog::new()
                    .add_filter("Easy Salaires", &["db"])
                    .set_file_name("entreprise.db")
                    .save_file(),
                "open" => rfd::FileDialog::new()
                    .add_filter("Easy Salaires", &["db"])
                    .pick_file(),
                "recent" => {
                    let p = payload["path"].as_str().ok_or("notFound")?;
                    if !config["recent"]
                        .as_array()
                        .is_some_and(|a| a.iter().any(|x| x.as_str() == Some(p)))
                    {
                        return Err("notFound".into());
                    }
                    Some(PathBuf::from(p))
                }
                _ => Some(state.config.parent().unwrap().join("demonstration.db")),
            };
            let Some(path) = path else {
                return Ok(Value::Null);
            };
            let path = if path.extension().is_none() {
                path.with_extension("db")
            } else {
                path
            };
            let mut guard = state.db.lock().map_err(|e| e.to_string())?;
            if guard.as_ref().is_some_and(|d| d.path == path) {
                return Ok(json!({"state":guard.as_ref().unwrap().load()?,"path":path}));
            }
            let create = action == "create" || (action == "demo" && !path.exists());
            let db = Database::open(&path, create, backup.as_deref())?;
            let data = db.load()?;
            recent(&state, &db.path)?;
            let result = json!({"state":data,"path":db.path});
            *guard = Some(db);
            Ok(result)
        }
        "save" => {
            let mut guard = state.db.lock().map_err(|e| e.to_string())?;
            let db = guard.as_mut().ok_or("noDatabase")?;
            Ok(json!(db.save_with_backup(&payload, backup.as_deref())?))
        }
        "backupStatus" => {
            let guard = state.db.lock().map_err(|e| e.to_string())?;
            let key = guard.as_ref().ok_or("noDatabase")?.path.to_string_lossy();
            let entry = &config["exportedBackups"][key.as_ref()];
            // Only report an exported backup that is still present on disk.
            if entry["path"]
                .as_str()
                .is_some_and(|p| std::path::Path::new(p).is_file())
            {
                Ok(entry.clone())
            } else {
                Ok(Value::Null)
            }
        }
        "backup" => {
            let Some(dest) = rfd::FileDialog::new()
                .add_filter("SQLite", &["db"])
                .set_file_name(format!(
                    "sauvegarde-{}.db",
                    chrono::Local::now().format("%Y-%m-%d-%H%M%S")
                ))
                .save_file()
            else {
                return Ok(Value::Null);
            };
            let guard = state.db.lock().map_err(|e| e.to_string())?;
            let db = guard.as_ref().ok_or("noDatabase")?;
            db.backup(&dest)?;
            let mut updated = read_config(&state);
            if !updated["exportedBackups"].is_object() {
                updated["exportedBackups"] = json!({});
            }
            updated["exportedBackups"][db.path.to_string_lossy().as_ref()] = json!({
                "path": dest,
                "date": chrono::Utc::now().to_rfc3339(),
            });
            save_config(&state, &updated)?;
            Ok(json!(dest))
        }
        "backupFolder" => {
            let Some(path) = rfd::FileDialog::new().pick_folder() else {
                return Ok(Value::Null);
            };
            let mut c = config;
            c["backupDir"] = json!(path);
            save_config(&state, &c)?;
            Ok(c)
        }
        "restore" => {
            let Some(source) = rfd::FileDialog::new()
                .add_filter("SQLite", &["db"])
                .pick_file()
            else {
                return Ok(Value::Null);
            };
            let Some(dest) = rfd::FileDialog::new()
                .add_filter("SQLite", &["db"])
                .set_file_name("entreprise-restauree.db")
                .save_file()
            else {
                return Ok(Value::Null);
            };
            if dest.exists() {
                return Err("fileExists".into());
            }
            let mut guard = state.db.lock().map_err(|e| e.to_string())?;
            if let Some(old) = guard.as_ref() {
                let safe = old.path.with_file_name(format!(
                    "{}-before-restore-{}.db",
                    old.path.file_stem().unwrap().to_string_lossy(),
                    chrono::Local::now().format("%Y%m%d-%H%M%S")
                ));
                old.backup(&safe)?;
            }
            let restored = Database::restore(&source, &dest, backup.as_deref())?;
            let data = restored.load()?;
            recent(&state, &dest)?;
            *guard = Some(restored);
            Ok(json!({"state":data,"path":dest}))
        }
        "export" => {
            let name = safe_name(payload["name"].as_str().ok_or("invalidFile")?);
            let bytes = STANDARD
                .decode(payload["data"].as_str().ok_or("invalidFile")?)
                .map_err(|e| e.to_string())?;
            let ext = name.rsplit('.').next().unwrap_or("pdf");
            if !["pdf", "csv", "xlsx"].contains(&ext) {
                return Err("invalidFile".into());
            }
            let Some(dest) = rfd::FileDialog::new()
                .add_filter(ext, &[ext])
                .set_file_name(&name)
                .save_file()
            else {
                return Ok(Value::Null);
            };
            let path = unique_file(dest, &bytes)?;
            if payload["open"].as_bool() == Some(true) && ext == "pdf" {
                open::that(&path).map_err(|e| e.to_string())?;
            }
            Ok(json!(path))
        }
        "exportBatch" => {
            let Some(folder) = rfd::FileDialog::new().pick_folder() else {
                return Ok(Value::Null);
            };
            let mut paths = vec![];
            for item in payload.as_array().ok_or("invalidFile")? {
                let name = safe_name(item["name"].as_str().ok_or("invalidFile")?);
                if !name.ends_with(".pdf") {
                    return Err("invalidFile".into());
                }
                let data = STANDARD
                    .decode(item["data"].as_str().ok_or("invalidFile")?)
                    .map_err(|e| e.to_string())?;
                paths.push(unique_file(folder.join(name), &data)?);
            }
            Ok(json!(paths))
        }
        "prepareUpdate" => {
            let guard = state.db.lock().map_err(|e| e.to_string())?;
            if let Some(db) = guard.as_ref() {
                let root = backup
                    .unwrap_or_else(|| db.path.parent().unwrap().join("Easy-Salaires-backups"));
                let folder = root.join("before-updates");
                fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
                let name = format!(
                    "{}-{}.db",
                    db.path.file_stem().unwrap().to_string_lossy(),
                    chrono::Local::now().format("%Y%m%d-%H%M%S-%f")
                );
                db.backup(&folder.join(name))?;
            }
            Ok(Value::Null)
        }
        "close" => {
            *state.db.lock().map_err(|e| e.to_string())? = None;
            Ok(Value::Null)
        }
        _ => Err("unknownAction".into()),
    }
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            fs::create_dir_all(&dir)?;
            app.manage(AppState {
                db: Mutex::new(None),
                config: dir.join("preferences.json"),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![native])
        .run(tauri::generate_context!())
        .expect("Unable to run Easy Salaires");
}
