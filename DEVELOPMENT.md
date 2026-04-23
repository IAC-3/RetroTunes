# 🔨 Guida allo Sviluppo - RetroTunes

## Flusso di Sviluppo Locale

### 1. Setup Iniziale (Una sola volta)

```bash
bash scripts/setup.sh
```

### 2. Avvia il Dev Server

```bash
make dev
# oppure
npm run tauri dev
```

Questo avvierà:
- ✅ Vite dev server su `http://localhost:5173`
- ✅ Backend Rust con Tauri
- ✅ Hot reload del frontend (cambiamenti istantanei)

### 3. Sviluppa il Codice

#### Frontend (HTML/CSS/TypeScript)
- Modifica file in `src/` e `index.html`
- Cambiamenti visibili istantaneamente (hot reload)
- TypeScript compilato automaticamente

#### Backend (Rust)
- Modifica `src-tauri/src/main.rs`
- Riavvia il dev server per applicare cambiamenti
- Usa `RUST_BACKTRACE=1` per debug dettagliato

### 4. Crea Comandi Tauri

Per aggiungere nuovi comandi Rust richiamabili dal frontend:

**src-tauri/src/main.rs:**
```rust
#[tauri::command]
fn my_command(input: String) -> String {
  format!("Echo: {}", input)
}

// Nel builder:
.invoke_handler(tauri::generate_handler![greet, my_command])
```

**Frontend (src/main.ts):**
```typescript
import { invoke } from '@tauri-apps/api/tauri'

const result = await invoke<string>('my_command', { input: 'test' })
```

## Gestione Dipendenze

### Aggiungere Dipendenza Rust

```bash
cd src-tauri
cargo add nuova-dipendenza
```

### Aggiungere Dipendenza npm

```bash
npm install nuovo-pacchetto
```

## Testing

```bash
# Test Rust
cd src-tauri
cargo test

# Linting Rust
cargo clippy -- -D warnings

# Type check TypeScript
npx tsc --noEmit
```

## Build per Production

```bash
npm run tauri build
```

Output: `src-tauri/target/release/bundle/`

## Debugging

### Rust
```bash
RUST_BACKTRACE=1 npm run tauri dev
```

### Frontend
- Apri Developer Tools: `Cmd+Option+I`
- Usa console e debugger standard

## Tips

- 💡 Usa `cargo check` prima di `cargo build` per verifiche veloci
- 💡 Vite cache: `npm run build --force` se hai problemi
- 💡 Pulisci di tanto in tanto: `make clean`
- 💡 Consulta i log: `RUST_LOG=debug npm run tauri dev`

---

Hai domande? Controlla il README principale o apri un issue! 🎵
