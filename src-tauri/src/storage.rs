use base64::{engine::general_purpose::STANDARD, Engine};
use fs2::FileExt;
use rusqlite::{params, Connection, OpenFlags};
use serde_json::{json, Value};
use std::{
    fs::{self, File, OpenOptions},
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    time::Duration,
};
pub type Result<T> = std::result::Result<T, String>;
const APP_ID: i64 = 1163084115;
include!(concat!(env!("OUT_DIR"), "/migrations.rs"));
fn latest_schema() -> i64 {
    MIGRATIONS.len() as i64
}
fn latest_model() -> i64 {
    serde_json::from_str::<Value>(include_str!("../../data-format.json"))
        .expect("valid data-format.json")["dataModel"]
        .as_i64()
        .unwrap()
}
fn schema_version(conn: &Connection) -> Result<i64> {
    conn.query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(err)
}
fn check_model(value: &Value) -> Result<i64> {
    if value.is_null() {
        return Ok(1);
    }
    let version = value.as_i64().ok_or("incompatibleDatabase")?;
    if !(1..=latest_model()).contains(&version) {
        return Err("incompatibleDatabase".into());
    }
    Ok(version)
}
fn data_model(conn: &Connection) -> Result<i64> {
    let company: Option<String> = conn
        .query_row("SELECT (SELECT company FROM meta WHERE id=1)", [], |r| {
            r.get(0)
        })
        .map_err(err)?;
    let legacy = match company {
        Some(company) => {
            check_model(&serde_json::from_str::<Value>(&company).map_err(err)?["modelVersion"])?
        }
        None => 1,
    };
    if schema_version(conn)? >= 2 {
        let model: i64 = conn
            .query_row("SELECT data_model FROM app_metadata WHERE id=1", [], |r| {
                r.get(0)
            })
            .map_err(err)?;
        Ok(check_model(&json!(model))?.max(legacy))
    } else {
        Ok(legacy)
    }
}
// Snapshot through SQLite's backup API, including committed WAL pages.
// Works on old supported formats: validation must not require the latest schema.
fn snapshot(conn: &Connection, path: &Path) -> Result<()> {
    if path.exists() {
        return Err("fileExists".into());
    }
    let temp = tempfile::NamedTempFile::new_in(path.parent().ok_or("invalidFile")?).map_err(err)?;
    conn.backup("main", temp.path(), None).map_err(err)?;
    let copy = Connection::open(temp.path()).map_err(err)?;
    copy.execute_batch("PRAGMA journal_mode=DELETE;")
        .map_err(err)?;
    validate(&copy)?;
    drop(copy);
    temp.as_file().sync_all().map_err(err)?;
    temp.persist_noclobber(path).map_err(err)?;
    Ok(())
}
fn apply_migrations(conn: &mut Connection, migrations: &[&str]) -> Result<()> {
    let from = schema_version(conn)? as usize;
    let tx = conn.transaction().map_err(err)?;
    for (index, sql) in migrations.iter().enumerate().skip(from) {
        tx.execute_batch(sql).map_err(err)?;
        tx.pragma_update(None, "user_version", (index + 1) as i64)
            .map_err(err)?;
    }
    validate(&tx)?;
    tx.commit().map_err(err)
}
pub struct Database {
    pub conn: Connection,
    pub path: PathBuf,
    _lock: File,
}
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
pub fn validate(conn: &Connection) -> Result<()> {
    let app: i64 = conn
        .query_row("PRAGMA application_id", [], |r| r.get(0))
        .map_err(err)?;
    let ver: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(err)?;
    if app != APP_ID || !(1..=latest_schema()).contains(&ver) {
        return Err("incompatibleDatabase".into());
    }
    let integrity: String = conn
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(err)?;
    if integrity != "ok" {
        return Err("corruptDatabase".into());
    }
    let foreign: i64 = conn
        .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| {
            r.get(0)
        })
        .map_err(err)?;
    if foreign != 0 {
        return Err("corruptDatabase".into());
    }
    data_model(conn)?;
    Ok(())
}
impl Database {
    pub fn open(path: &Path, create: bool, backup_dir: Option<&Path>) -> Result<Self> {
        if create && path.exists() {
            return Err("fileExists".into());
        }
        if !create && !path.is_file() {
            return Err("notFound".into());
        }
        let path = if create {
            path.to_path_buf()
        } else {
            fs::canonicalize(path).map_err(err)?
        };
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(path.with_extension("db.lockfile"))
            .map_err(err)?;
        lock.try_lock_exclusive()
            .map_err(|_| "databaseAlreadyOpen".to_string())?;
        // Read-only preflight: reject future or foreign files before any database write.
        if !create {
            let probe = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)
                .map_err(err)?;
            validate(&probe)?;
        }
        let mut conn = Connection::open_with_flags(
            &path,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | if create {
                    OpenFlags::SQLITE_OPEN_CREATE
                } else {
                    OpenFlags::empty()
                },
        )
        .map_err(err)?;
        conn.busy_timeout(Duration::from_secs(3)).map_err(err)?;
        conn.execute_batch("PRAGMA foreign_keys=ON;").map_err(err)?;
        if create {
            apply_migrations(&mut conn, MIGRATIONS)?;
        } else {
            validate(&conn)?;
        }
        let mut db = Self {
            conn,
            path,
            _lock: lock,
        };
        if !create {
            if schema_version(&db.conn)? < latest_schema() {
                db.before_migration(backup_dir)?;
                apply_migrations(&mut db.conn, MIGRATIONS)?;
            }
            db.daily_backup(backup_dir)?;
        }
        db.conn
            .execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;")
            .map_err(err)?;
        Ok(db)
    }
    pub fn backup(&self, path: &Path) -> Result<()> {
        snapshot(&self.conn, path)
    }
    fn before_migration(&self, folder: Option<&Path>) -> Result<()> {
        let root = folder
            .map(Path::to_path_buf)
            .unwrap_or_else(|| self.path.parent().unwrap().join("Easy-Salaires-backups"));
        let folder = root.join("before-migrations");
        fs::create_dir_all(&folder).map_err(err)?;
        // Separate from daily retention; even repeated upgrades on the same day are protected.
        let name = format!(
            "{}-schema{}-model{}-{}.db",
            self.path.file_stem().unwrap().to_string_lossy(),
            schema_version(&self.conn)?,
            data_model(&self.conn)?,
            chrono::Local::now().format("%Y%m%d-%H%M%S-%f")
        );
        self.backup(&folder.join(name))
    }
    pub fn restore(source: &Path, dest: &Path, backup_dir: Option<&Path>) -> Result<Self> {
        let source =
            Connection::open_with_flags(source, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(err)?;
        validate(&source)?;
        snapshot(&source, dest)?;
        drop(source);
        Self::open(dest, false, backup_dir)
    }
    pub fn daily_backup(&self, folder: Option<&Path>) -> Result<()> {
        let root = folder
            .map(Path::to_path_buf)
            .unwrap_or_else(|| self.path.parent().unwrap().join("Easy-Salaires-backups"));
        // A per-database folder prevents retention from deleting another company's backups.
        let mut hash = std::collections::hash_map::DefaultHasher::new();
        self.path.hash(&mut hash);
        let folder = root.join(format!(
            "{}-{:016x}",
            self.path.file_stem().unwrap().to_string_lossy(),
            hash.finish()
        ));
        fs::create_dir_all(&folder).map_err(err)?;
        let dest = folder.join(format!(
            "auto-{}.db",
            chrono::Local::now().format("%Y-%m-%d")
        ));
        if !dest.exists() {
            self.backup(&dest)?;
        }
        let mut files: Vec<_> = fs::read_dir(&folder)
            .map_err(err)?
            .filter_map(|x| x.ok())
            .map(|x| x.path())
            .filter(|p| {
                p.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with("auto-")
                    && p.extension().is_some_and(|x| x == "db")
            })
            .collect();
        files.sort();
        let excess = files.len().saturating_sub(30);
        for p in files.into_iter().take(excess) {
            fs::remove_file(p).map_err(err)?;
        }
        Ok(())
    }
    pub fn load(&self) -> Result<Option<Value>> {
        let count: i64 = self
            .conn
            .query_row("SELECT count(*) FROM meta", [], |r| r.get(0))
            .map_err(err)?;
        if count == 0 {
            return Ok(None);
        }
        let (version, company): (i64, String) = self
            .conn
            .query_row("SELECT version,company FROM meta WHERE id=1", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .map_err(err)?;
        let mut state = json!({"version":version,"dataModel":data_model(&self.conn)?,"company":serde_json::from_str::<Value>(&company).map_err(err)?});
        for table in ["employees", "rules", "payrolls", "exports"] {
            let mut stmt = self
                .conn
                .prepare(&format!("SELECT data FROM {table} ORDER BY rowid"))
                .map_err(err)?;
            let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(err)?;
            let values: std::result::Result<Vec<_>, String> = rows
                .map(|r| serde_json::from_str::<Value>(&r.map_err(err)?).map_err(err))
                .collect();
            state[table] = json!(values?);
        }
        let mut stmt = self
            .conn
            .prepare("SELECT data,pdf FROM revisions ORDER BY rowid")
            .map_err(err)?;
        let rows = stmt
            .query_map([], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, Vec<u8>>(1)?))
            })
            .map_err(err)?;
        let mut revisions = vec![];
        for row in rows {
            let (data, pdf) = row.map_err(err)?;
            let mut data: Value = serde_json::from_str(&data).map_err(err)?;
            data["pdf"] = json!(STANDARD.encode(pdf));
            revisions.push(data);
        }
        state["revisions"] = json!(revisions);
        Ok(Some(state))
    }
    #[cfg(test)]
    pub fn save(&mut self, state: &Value) -> Result<i64> {
        self.save_with_backup(state, None)
    }
    pub fn save_with_backup(&mut self, state: &Value, backup_dir: Option<&Path>) -> Result<i64> {
        if schema_version(&self.conn)? != latest_schema() {
            return Err("incompatibleDatabase".into());
        }
        let model =
            check_model(&state["dataModel"])?.max(check_model(&state["company"]["modelVersion"])?);
        let current_model = data_model(&self.conn)?;
        if model < current_model {
            return Err("incompatibleDatabase".into());
        }
        let expected = state["version"].as_i64().ok_or("invalidState")?;
        if !state["company"].is_object() {
            return Err("invalidState".into());
        }
        for name in ["employees", "rules", "payrolls", "revisions", "exports"] {
            if !state[name].is_array() {
                return Err("invalidState".into());
            }
        }
        if model > current_model {
            self.before_migration(backup_dir)?;
        }
        let tx = self.conn.transaction().map_err(err)?;
        let current: i64 = tx
            .query_row(
                "SELECT COALESCE((SELECT version FROM meta WHERE id=1),0)",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        if current != expected {
            return Err("staleState".into());
        }
        tx.execute("UPDATE app_metadata SET data_model=?1 WHERE id=1", [model])
            .map_err(err)?;
        tx.execute("INSERT INTO meta VALUES(1,?1,?2) ON CONFLICT(id) DO UPDATE SET version=excluded.version, company=excluded.company",params![current+1,state["company"].to_string()]).map_err(err)?;
        for table in ["employees", "rules", "exports"] {
            for row in state[table].as_array().unwrap() {
                let id = row["id"].as_str().ok_or("invalidState")?;
                tx.execute(&format!("INSERT INTO {table}(id,data) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET data=excluded.data"),params![id,row.to_string()]).map_err(err)?;
            }
        }
        for row in state["payrolls"].as_array().unwrap() {
            tx.execute("INSERT INTO payrolls VALUES(?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET data=excluded.data",params![row["id"].as_str().ok_or("invalidState")?,row["employeeId"].as_str().ok_or("invalidState")?,row["period"].as_str().ok_or("invalidState")?,row.to_string()]).map_err(err)?;
        }
        for row in state["revisions"].as_array().unwrap() {
            let mut row = row.clone();
            let pdf = STANDARD
                .decode(row["pdf"].as_str().ok_or("invalidPdf")?)
                .map_err(err)?;
            if !pdf.starts_with(b"%PDF-") {
                return Err("invalidPdf".into());
            }
            row.as_object_mut().unwrap().remove("pdf");
            let id = row["id"].as_str().ok_or("invalidState")?;
            let count: i64 = tx
                .query_row("SELECT count(*) FROM revisions WHERE id=?1", [id], |r| {
                    r.get(0)
                })
                .map_err(err)?;
            if count == 0 {
                tx.execute(
                    "INSERT INTO revisions VALUES(?1,?2,?3,?4,?5)",
                    params![
                        id,
                        row["payrollId"].as_str().ok_or("invalidState")?,
                        row["number"].as_i64().ok_or("invalidState")?,
                        row.to_string(),
                        pdf
                    ],
                )
                .map_err(err)?;
            } else {
                let (old, old_pdf): (String, Vec<u8>) = tx
                    .query_row("SELECT data,pdf FROM revisions WHERE id=?1", [id], |r| {
                        Ok((r.get(0)?, r.get(1)?))
                    })
                    .map_err(err)?;
                if old != row.to_string() || old_pdf != pdf {
                    return Err("immutableRevision".into());
                }
            }
        }
        // Only employees with no historical records can actually be deleted.
        let ids: Vec<&str> = state["employees"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|e| e["id"].as_str())
            .collect();
        tx.execute("DELETE FROM employees WHERE id NOT IN (SELECT value FROM json_each(?1)) AND id NOT IN (SELECT employee_id FROM payrolls)",[serde_json::to_string(&ids).map_err(err)?]).map_err(err)?;
        tx.commit().map_err(err)?;
        Ok(current + 1)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn state() -> Value {
        json!({"version":0,"dataModel":1,"company":{"name":"Test"},"employees":[{"id":"e"}],"rules":[],"payrolls":[{"id":"p","employeeId":"e","period":"2026-01"}],"revisions":[],"exports":[]})
    }
    fn legacy(path: &Path) -> Value {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(include_str!("../../tests/fixtures/data/schema-v1.sql"))
            .unwrap();
        let s: Value =
            serde_json::from_str(include_str!("../../tests/fixtures/data/model-v1.json")).unwrap();
        conn.execute(
            "INSERT INTO meta VALUES(1,?1,?2)",
            params![s["version"].as_i64().unwrap(), s["company"].to_string()],
        )
        .unwrap();
        for table in ["employees", "rules", "exports"] {
            for row in s[table].as_array().unwrap() {
                conn.execute(
                    &format!("INSERT INTO {table} VALUES(?1,?2)"),
                    params![row["id"].as_str().unwrap(), row.to_string()],
                )
                .unwrap();
            }
        }
        for row in s["payrolls"].as_array().unwrap() {
            conn.execute(
                "INSERT INTO payrolls VALUES(?1,?2,?3,?4)",
                params![
                    row["id"].as_str().unwrap(),
                    row["employeeId"].as_str().unwrap(),
                    row["period"].as_str().unwrap(),
                    row.to_string()
                ],
            )
            .unwrap();
        }
        for row in s["revisions"].as_array().unwrap() {
            let mut row = row.clone();
            let pdf = STANDARD.decode(row["pdf"].as_str().unwrap()).unwrap();
            row.as_object_mut().unwrap().remove("pdf");
            conn.execute(
                "INSERT INTO revisions VALUES(?1,?2,?3,?4,?5)",
                params![
                    row["id"].as_str().unwrap(),
                    row["payrollId"].as_str().unwrap(),
                    row["number"].as_i64().unwrap(),
                    row.to_string(),
                    pdf
                ],
            )
            .unwrap();
        }
        s
    }
    #[test]
    fn every_historical_schema_opens_without_losing_data_and_is_idempotent() {
        for version in 1..=MIGRATIONS.len() {
            let tmp = tempfile::tempdir().unwrap();
            let path = tmp.path().join("historical.db");
            let mut expected = legacy(&path);
            expected["dataModel"] = json!(1);
            let conn = Connection::open(&path).unwrap();
            for (index, sql) in MIGRATIONS.iter().enumerate().take(version).skip(1) {
                conn.execute_batch(sql).unwrap();
                conn.pragma_update(None, "user_version", (index + 1) as i64)
                    .unwrap();
            }
            drop(conn);
            let db = Database::open(&path, false, None).unwrap();
            assert_eq!(schema_version(&db.conn).unwrap(), latest_schema());
            assert_eq!(db.load().unwrap().unwrap(), expected);
            let backups = tmp.path().join("Easy-Salaires-backups/before-migrations");
            if version < MIGRATIONS.len() {
                let files: Vec<_> = fs::read_dir(&backups)
                    .unwrap()
                    .map(|p| p.unwrap().path())
                    .collect();
                assert_eq!(files.len(), 1);
                let original =
                    Connection::open_with_flags(&files[0], OpenFlags::SQLITE_OPEN_READ_ONLY)
                        .unwrap();
                assert_eq!(schema_version(&original).unwrap(), version as i64);
            }
            drop(db);
            let reopened = Database::open(&path, false, None).unwrap();
            assert_eq!(reopened.load().unwrap().unwrap(), expected);
            if backups.exists() {
                assert_eq!(fs::read_dir(backups).unwrap().count(), 1);
            }
        }
    }
    #[test]
    fn restores_old_backup_without_touching_source_even_in_wal_mode() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("source.db");
        let mut expected = legacy(&path);
        expected["dataModel"] = json!(1);
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL;").unwrap();
        expected["company"]["name"] = json!("Committed WAL data");
        conn.execute(
            "UPDATE meta SET company=?1",
            [expected["company"].to_string()],
        )
        .unwrap();
        let bytes = fs::read(&path).unwrap();
        let dest = tmp.path().join("restored.db");
        let restored = Database::restore(&path, &dest, None).unwrap();
        assert_eq!(restored.load().unwrap().unwrap(), expected);
        assert_eq!(fs::read(&path).unwrap(), bytes);
        assert_eq!(schema_version(&conn).unwrap(), 1);
        assert!(Database::restore(&path, &dest, None).is_err());
    }
    #[test]
    fn backup_failure_aborts_before_schema_changes() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("legacy.db");
        legacy(&path);
        let bytes = fs::read(&path).unwrap();
        let blocked = tmp.path().join("not-a-directory");
        fs::write(&blocked, "blocked").unwrap();
        assert!(Database::open(&path, false, Some(&blocked)).is_err());
        assert_eq!(fs::read(&path).unwrap(), bytes);
    }
    #[test]
    fn failed_migration_rolls_back_all_steps_and_version() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("legacy.db");
        legacy(&path);
        let mut conn = Connection::open(&path).unwrap();
        let broken = [
            MIGRATIONS[0],
            "CREATE TABLE attempted(id INTEGER);",
            "INSERT INTO missing_table VALUES(1);",
        ];
        assert!(apply_migrations(&mut conn, &broken).is_err());
        assert_eq!(schema_version(&conn).unwrap(), 1);
        assert!(conn.prepare("SELECT * FROM attempted").is_err());
        validate(&conn).unwrap();
    }
    #[test]
    fn rejects_future_schema_and_json_without_changing_source() {
        for future_schema in [true, false] {
            let tmp = tempfile::tempdir().unwrap();
            let path = tmp.path().join("future.db");
            legacy(&path);
            let conn = Connection::open(&path).unwrap();
            if future_schema {
                conn.pragma_update(None, "user_version", latest_schema() + 1)
                    .unwrap();
            } else {
                conn.execute(
                    "UPDATE meta SET company=json_set(company, '$.modelVersion', ?1)",
                    [latest_model() + 1],
                )
                .unwrap();
            }
            drop(conn);
            let bytes = fs::read(&path).unwrap();
            assert!(Database::open(&path, false, None).is_err());
            assert!(Database::restore(&path, &tmp.path().join("copy.db"), None).is_err());
            assert!(!tmp.path().join("copy.db").exists());
            assert_eq!(fs::read(&path).unwrap(), bytes);
        }
    }
    #[test]
    fn model_upgrade_has_dedicated_backup_and_rejects_downgrades() {
        let tmp = tempfile::tempdir().unwrap();
        let mut db = Database::open(&tmp.path().join("model.db"), true, None).unwrap();
        let mut s = state();
        s["version"] = json!(db.save(&s).unwrap());
        s["dataModel"] = json!(latest_model());
        let blocked = tmp.path().join("blocked");
        fs::write(&blocked, "blocked").unwrap();
        assert!(db.save_with_backup(&s, Some(&blocked)).is_err());
        assert_eq!(db.load().unwrap().unwrap()["dataModel"], 1);
        let folder = tmp.path().join("configured-backups");
        s["version"] = json!(db.save_with_backup(&s, Some(&folder)).unwrap());
        assert_eq!(db.load().unwrap().unwrap(), s);
        let files: Vec<_> = fs::read_dir(folder.join("before-migrations"))
            .unwrap()
            .map(|p| p.unwrap().path())
            .collect();
        assert_eq!(files.len(), 1);
        let old = Connection::open(&files[0]).unwrap();
        assert_eq!(data_model(&old).unwrap(), 1);
        s["dataModel"] = json!(1);
        assert!(db.save(&s).is_err());
        s["dataModel"] = json!(latest_model() + 1);
        assert!(db.save(&s).is_err());
    }
    #[test]
    fn persistence_backup_and_lock() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("company.db");
        let mut db = Database::open(&p, true, None).unwrap();
        let mut s = state();
        s["version"] = json!(db.save(&s).unwrap());
        assert!(Database::open(&p, false, None).is_err());
        let back = tmp.path().join("backup.db");
        db.backup(&back).unwrap();
        assert!(db.backup(&back).is_err());
        drop(db);
        let db = Database::open(&p, false, None).unwrap();
        assert_eq!(db.load().unwrap().unwrap(), s);
        let restored = Database::open(&back, false, None).unwrap();
        assert_eq!(restored.load().unwrap().unwrap(), s);
    }
    #[test]
    fn rollback_and_duplicate() {
        let tmp = tempfile::tempdir().unwrap();
        let mut db = Database::open(&tmp.path().join("test.db"), true, None).unwrap();
        let mut s = state();
        db.save(&s).unwrap();
        assert!(db.save(&s).is_err());
        s["version"] = json!(1);
        s["payrolls"]
            .as_array_mut()
            .unwrap()
            .push(json!({"id":"p2","employeeId":"e","period":"2026-01"}));
        assert!(db.save(&s).is_err());
        assert_eq!(db.load().unwrap().unwrap()["version"], 1);
        assert_eq!(
            db.load().unwrap().unwrap()["payrolls"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }
    #[test]
    fn incompatible() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("foreign.db");
        let c = Connection::open(&p).unwrap();
        c.execute_batch("PRAGMA user_version=999;").unwrap();
        drop(c);
        assert!(Database::open(&p, false, None).is_err());
    }
    #[test]
    fn immutable_archive() {
        let tmp = tempfile::tempdir().unwrap();
        let mut db = Database::open(&tmp.path().join("test.db"), true, None).unwrap();
        let mut s = state();
        s["revisions"] =
            json!([{"id":"r","payrollId":"p","number":1,"pdf":STANDARD.encode(b"%PDF-test")}]);
        s["version"] = json!(db.save(&s).unwrap());
        let original = db.load().unwrap().unwrap();
        s["revisions"][0]["pdf"] = json!(STANDARD.encode(b"%PDF-modified"));
        assert!(db.save(&s).is_err());
        assert_eq!(db.load().unwrap().unwrap(), original);
        assert!(db.conn.execute("DELETE FROM revisions", []).is_err());
    }

    #[test]
    fn restore_preserves_document_bytes_and_original_database() {
        let tmp = tempfile::tempdir().unwrap();
        let original_path = tmp.path().join("original.db");
        let mut original = Database::open(&original_path, true, None).unwrap();
        let mut s = state();
        let pdf = [b"%PDF-1.7\n".as_slice(), &vec![42; 500_000]].concat();
        s["company"]["logo"] = json!("data:image/png;base64,aGVsbG8=");
        s["revisions"] = json!([{"id":"r","payrollId":"p","number":1,"pdf":STANDARD.encode(&pdf)}]);
        s["exports"] = json!([{"id":"x","data":STANDARD.encode(&pdf),"stale":false}]);
        s["version"] = json!(original.save(&s).unwrap());
        let backup = tmp.path().join("backup.db");
        original.backup(&backup).unwrap();
        let source = Database::open(&backup, false, None).unwrap();
        let dest = tmp.path().join("restored.db");
        original
            .backup(&tmp.path().join("before-restore.db"))
            .unwrap();
        source.backup(&dest).unwrap();
        let restored = Database::open(&dest, false, None).unwrap();
        assert_eq!(restored.load().unwrap().unwrap(), s);
        assert_eq!(original.load().unwrap().unwrap(), s);
        assert_eq!(
            STANDARD
                .decode(
                    restored.load().unwrap().unwrap()["revisions"][0]["pdf"]
                        .as_str()
                        .unwrap()
                )
                .unwrap(),
            pdf
        );
    }

    #[test]
    fn daily_backup_is_once_per_day_and_retains_thirty_per_company() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("backups");
        let mut db = Database::open(&tmp.path().join("company.db"), true, None).unwrap();
        let mut s = state();
        s["version"] = json!(db.save(&s).unwrap());
        db.daily_backup(Some(&root)).unwrap();
        let folder = fs::read_dir(&root).unwrap().next().unwrap().unwrap().path();
        let today = fs::read_dir(&folder)
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        let first = fs::read(&today).unwrap();
        s["company"]["name"] = json!("Changed after opening");
        db.save(&s).unwrap();
        for day in 1..=31 {
            fs::write(folder.join(format!("auto-2025-01-{day:02}.db")), &first).unwrap();
        }
        db.daily_backup(Some(&root)).unwrap();
        assert_eq!(fs::read(&today).unwrap(), first);
        assert_eq!(fs::read_dir(folder).unwrap().count(), 30);
        let other = Database::open(&tmp.path().join("other.db"), true, None).unwrap();
        other.daily_backup(Some(&root)).unwrap();
        assert_eq!(fs::read_dir(root).unwrap().count(), 2);
    }

    #[test]
    fn rejects_corrupt_files_without_overwriting_them() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("broken.db");
        let bytes = b"This is not a SQLite database";
        fs::write(&path, bytes).unwrap();
        assert!(Database::open(&path, false, None).is_err());
        assert_eq!(fs::read(path).unwrap(), bytes);
    }
}
