# 🆘 Troubleshooting Avanzato - RetroTunes

## Problemi di Installazione

### "Command not found: nvm"

Dopo aver eseguito lo script setup:
```bash
# Se usi bash
source ~/.bashrc

# Se usi zsh
source ~/.zshrc
```

Se non funziona ancora:
```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

### "Rustup installation failed"

Verifica che curl sia disponibile:
```bash
curl --version
```

Se non c'è, installa:
```bash
brew install curl
```

### NVM non installa Node.js

```bash
# Forza reinstallazione
nvm uninstall 20.10.0
nvm install 20.10.0 --latest-npm
nvm use 20.10.0
```

## Problemi di Build

### "error: linker `cc` not found"

Installa Xcode Command Line Tools:
```bash
xcode-select --install
```

### "error[E0514]: found crate ... compiled by an incompatible version of rustc"

Pulisci e ricompila:
```bash
make clean
rustup update nightly
cargo clean
npm install
make dev
```

### "error: workspace root Cargo.toml must have [package] or [workspace]"

Verifica che `Cargo.toml` sia corretto. Controlla:
```bash
cat Cargo.toml | head -20
```

Dovrebbe contenere `[workspace]` e `[workspace.package]`.

## Problemi di Runtime

### App si apre ma schermata bianca

1. Controlla i log:
```bash
npm run tauri dev 2>&1 | tee build.log
```

2. Verifica che Vite sia avviato su `http://localhost:5173`:
```bash
curl http://localhost:5173
```

3. Se non risponde, il build fallì. Pulisci:
```bash
make clean
npm run build
make dev
```

### Hot reload non funziona

Assicurati che Vite sia in esecuzione:
```bash
# In un terminal separato
npm run dev
```

### Errore di permessi su macOS

```bash
# Consenti l'app
sudo xattr -rd com.apple.quarantine /Applications/RetroTunes.app
```

## Problemi di Comunicazione Frontend-Backend

### "undefined is not a function" - invoke()

Verifica che il comando sia registrato in `src-tauri/src/main.rs`:
```rust
.invoke_handler(tauri::generate_handler![greet, my_command])
```

Controlla che il frontend lo chiami correttamente:
```typescript
import { invoke } from '@tauri-apps/api/tauri'
await invoke('greet', { name: 'test' })
```

### Timeout della comunicazione

Aumenta timeout nel backend:
```rust
#[tauri::command]
fn long_operation() -> String {
  // operazione lunga...
  "done".to_string()
}
```

Nel frontend, aggiungi timeout:
```typescript
const result = await Promise.race([
  invoke('long_operation'),
  new Promise((_, reject) => 
    setTimeout(() => reject('Timeout'), 30000)
  )
])
```

## Problemi di Performance

### App lenta in development

1. Disabilita i log:
```bash
RUST_LOG=info npm run tauri dev
```

2. Usa release build:
```bash
npm run tauri build
```

### Consumo memoria alto

```bash
# Controlla processi
ps aux | grep retrotunes
```

### Build lento

Primo build è sempre lento (compila dipendenze). Successivi saranno veloci.

Se rimane lento:
```bash
# Cancella cache dipendenze
rm -rf ~/.cargo/registry/cache
cargo build --release
```

## Debug Avanzato

### Vedere i log Rust dettagliati

```bash
RUST_LOG=trace npm run tauri dev
```

### Debugger Rust (con lldb)

```bash
cd src-tauri
rust-lldb target/debug/retrotunes
```

### Profiling Performance

```bash
cargo flamegraph --bin retrotunes
# Genera flamegraph.svg
```

### Analizzare dipendenze

```bash
cd src-tauri
cargo tree
```

## Reset Completo

Se niente funziona:

```bash
# Pulisci TUTTO
make clean
rm -rf node_modules
rm -rf ~/.cargo/registry/cache
rm -rf src-tauri/target

# Ricomincia
bash scripts/setup.sh
make dev
```

## Chiedere Aiuto

Se il problema persiste:

1. **Raccogli info di sistema:**
```bash
rustc --version
cargo --version
node --version
npm --version
uname -a
```

2. **Raccogli log:**
```bash
RUST_BACKTRACE=full npm run tauri dev 2>&1 > debug.log
```

3. **Apri un issue** con questi dettagli ✨

---

**Buona fortuna! 🎵** Se risolvi un problema non documentato qui, apri una PR per aggiungerlo!
