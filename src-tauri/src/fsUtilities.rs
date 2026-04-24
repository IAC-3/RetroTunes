//File Added by Marco Mattiuz

use std::path::{Path, PathBuf};
use walkdir::WalkDir;

fn checkFileExtension(path: &Path) -> bool {
  let audio_exts = [
    "mp3", "aac", "m4a", "flac", "wav", "ogg", "opus",
    "aiff", "aif", "alac",
    "wma",
    "wv", "ape",
    "amr",
    "mka", "caf",
    "dsf", "dff"
  ];

  if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
    return audio_exts.iter().any(|&e| e.eq_ignore_ascii_case(ext));
  }
  false
}

pub fn findMusicFiles(path: String) -> Result<Vec<PathBuf>, String> {
  let root = Path::new(&path);
  if !root.exists() {
    return Err(format!("Path does not exist: {}", path));
  }

  let mut files_paths = Vec::new();
  for entry in WalkDir::new(root) {
    match entry {
      Ok(entry) => {
        let path = entry.path();
        if checkFileExtension(path) {
          files_paths.push(path.to_path_buf());
        }
      }
      Err(err) => {
        eprintln!("Failed to read entry during scan: {}", err);
      }
    }
  }

  Ok(files_paths)
}
