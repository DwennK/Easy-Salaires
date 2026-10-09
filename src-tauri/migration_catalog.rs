use std::{fs, path::Path};

// Shared by the application build and the lightweight storage test harness.
pub fn generate(root: &Path, output: &Path) {
    let dir = root.join("migrations");
    println!("cargo:rerun-if-changed={}", dir.display());
    let mut files: Vec<_> = fs::read_dir(&dir)
        .unwrap()
        .map(|f| f.unwrap().path())
        .filter(|p| p.extension().is_some_and(|ext| ext == "sql"))
        .collect();
    files.sort();
    assert!(!files.is_empty(), "No database migrations found");
    let mut catalog = String::from("const MIGRATIONS: &[&str] = &[\n");
    for (index, file) in files.iter().enumerate() {
        let name = file.file_name().unwrap().to_str().unwrap();
        assert!(
            name.starts_with(&format!("{:03}_", index + 1)),
            "Migrations must be consecutively numbered: {name}"
        );
        let sql = fs::read_to_string(file).unwrap();
        catalog.push_str(&format!("{sql:?},\n"));
    }
    catalog.push_str("];");
    fs::write(output.join("migrations.rs"), catalog).unwrap();
}
