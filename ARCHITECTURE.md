# 🎯 Architettura di RetroTunes

## Overview

RetroTunes è un'app desktop costruita con:
- **Frontend**: Vite + TypeScript + Vanilla JS
- **Backend**: Rust + Tauri framework

## Flusso di Comunicazione

```
┌─────────────────────┐
│   Frontend (Vite)   │
│  HTML/CSS/TypeScript│
└──────────┬──────────┘
           │
           │ Tauri API
           │ (async/await)
           │
┌──────────▼──────────┐
│   Backend (Rust)    │
│  Tauri Commands     │
│  Tokio Runtime      │
└─────────────────────┘
```

## Struttura Frontend

```
src/
├── main.ts          # Entry point, inizializza app
└── style.css        # Stili globali

index.html            # HTML principale
vite.config.ts        # Configurazione build
```

**Stack:**
- Vite: dev server veloce, bundler moderno
- TypeScript: type safety
- Tauri API: bridge con Rust

## Struttura Backend

```
src-tauri/
├── src/
│   └── main.rs      # Entry point Tauri, comandi Rust
├── Cargo.toml       # Dipendenze Rust
├── build.rs         # Build script Tauri
└── tauri.conf.json  # Configurazione app
```

**Stack:**
- Tauri 1.6: desktop framework leggero
- Rust 1.75: linguaggio di sistema
- Tokio: runtime asincrono

## Ciclo di Vita

1. **Startup**: `main.rs` inizializza Tauri + finestra
2. **Frontend Load**: HTML/CSS/JS caricate da Vite/dist
3. **IPC Communication**: Frontend chiama comandi Rust
4. **Response**: Rust ritorna dati al frontend

## Modelli di Comunicazione

### Command-Response (richiesta singola)
```rust
#[tauri::command]
fn get_data() -> String { "data" }
```

```typescript
const data = await invoke('get_data')
```

### Streaming (eventi multipli)
```typescript
import { listen } from '@tauri-apps/api/event'
await listen('event-name', (e) => console.log(e.payload))
```

## Build Pipeline

```
npm run tauri dev
    ↓
Vite dev server (hot reload)
    ↓
Tauri CLI avvia backend Rust
    ↓
App window apre index.html
    ↓
Frontend comunica con Rust via IPC
```

## Production Build

```
npm run tauri build
    ↓
Vite compila frontend → dist/
    ↓
Cargo compila Rust → release binary
    ↓
Tauri bundle crea .dmg/.exe/etc
    ↓
Distribuzione finale
```

## Variabili d'Ambiente

```
TAURI_ENV=development   # dev vs production
RUST_LOG=debug          # log level Rust
RUST_BACKTRACE=1        # backtrace su panic
```

## Estensioni Future

### Aggiungere Database
```bash
cargo add rusqlite  # SQLite
# o
cargo add sqlx      # SQL async
```

### Aggiungere File Dialog
```rust
use tauri::api::dialog;
dialog::FileDialogBuilder::new()
  .pick_file(|path| { /* ... */ })
```

### Aggiungere Notifiche
```rust
tauri::api::notification::Notification::new(&context.config().tauri.bundle.identifier)
  .title("Titolo")
  .body("Messaggio")
  .show()
  .unwrap();
```

---

Per domande: vedi [DEVELOPMENT.md](DEVELOPMENT.md) 🎵
