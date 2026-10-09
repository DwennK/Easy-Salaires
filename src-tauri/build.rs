mod migration_catalog;
fn main() {
    migration_catalog::generate(
        std::path::Path::new(&std::env::var("CARGO_MANIFEST_DIR").unwrap()),
        std::path::Path::new(&std::env::var("OUT_DIR").unwrap()),
    );
    tauri_build::build()
}
