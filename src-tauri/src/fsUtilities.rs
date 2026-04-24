//File Added by Marco Mattiuz

use std::path::{Path, PathBuf};
use walkdir::WalkDir;

fn checkFileExtension (path: &Path) -> bool{
  let audio_exts = [
    "mp3", "aac", "m4a", "flac", "wav", "ogg", "opus",
    "aiff", "aif", "alac",
    "wma",
    "wv", "ape",
    "amr",
    "mka", "caf",
    "dsf", "dff"
  ];

  if let Some(ext) = path.extension() {
    if audio_exts.iter().any(|&e| e == ext) {
        return true;
    }
  }
  return false;
}


pub fn findMusicFiles( filesPaths: &mut Vec<PathBuf>, path: String){  
  for entry in WalkDir::new(path) {
    let entry = entry.unwrap();
    let path = entry.path();
    if checkFileExtension(&path) {
        filesPaths.push(path.to_path_buf());
    }
  } 
}
