use base64::{engine::general_purpose::STANDARD, Engine};
use fs2::FileExt;
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::{
    fs::{self, File, OpenOptions},
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    time::Duration,
};
pub type Result<T> = std::result::Result<T, String>;
const APP_ID: i64 = 1163084115;
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
    if app != APP_ID || ver != 1 {
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
        let mut conn = Connection::open(&path).map_err(err)?;
        conn.busy_timeout(Duration::from_secs(3)).map_err(err)?;
        conn.execute_batch("PRAGMA foreign_keys=ON;").map_err(err)?;
        if create {
            let tx = conn.transaction().map_err(err)?;
            tx.execute_batch(include_str!("../migrations/001_initial.sql"))
                .map_err(err)?;
            tx.commit().map_err(err)?;
        } else {
            validate(&conn)?;
        }
        let db = Self {
            conn,
            path,
            _lock: lock,
        };
        if !create {
            db.daily_backup(backup_dir)?;
        }
        db.conn
            .execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;")
            .map_err(err)?;
        Ok(db)
    }
    pub fn backup(&self, path: &Path) -> Result<()> {
        if path.exists() {
            return Err("fileExists".into());
        }
        let temp =
            tempfile::NamedTempFile::new_in(path.parent().ok_or("invalidFile")?).map_err(err)?;
        self.conn.backup("main", temp.path(), None).map_err(err)?;
        let copy = Connection::open(temp.path()).map_err(err)?;
        // A portable backup must open without requiring WAL sidecars.
        copy.execute_batch("PRAGMA journal_mode=DELETE;")
            .map_err(err)?;
        validate(&copy)?;
        drop(copy);
        temp.as_file().sync_all().map_err(err)?;
        temp.persist_noclobber(path).map_err(err)?;
        Ok(())
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
        let mut state = json!({"version":version,"company":serde_json::from_str::<Value>(&company).map_err(err)?});
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
    pub fn save(&mut self, state: &Value) -> Result<i64> {
        let expected = state["version"].as_i64().ok_or("invalidState")?;
        if !state["company"].is_object() {
            return Err("invalidState".into());
        }
        for name in ["employees", "rules", "payrolls", "revisions", "exports"] {
            if !state[name].is_array() {
                return Err("invalidState".into());
            }
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
        json!({"version":0,"company":{"name":"Test"},"employees":[{"id":"e"}],"rules":[],"payrolls":[{"id":"p","employeeId":"e","period":"2026-01"}],"revisions":[],"exports":[]})
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
