# 📦 Struttura del Progetto RetroTunes

```
RetroTunes/
│
├── 📂 src/                          # 🎨 Frontend (HTML/CSS/TypeScript)
│   ├── main.ts                      # Entry point, logica frontend
│   └── style.css                    # Stili globali
│
├── 📂 src-tauri/                    # 🦀 Backend Tauri + Rust
│   ├── 📂 src/
│   │   └── main.rs                  # Entry point Rust, comandi Tauri
│   ├── 📂 icons/                    # Icone dell'applicazione
│   ├── Cargo.toml                   # Dipendenze Rust backend
│   ├── build.rs                     # Build script Tauri
│   └── tauri.conf.json              # Configurazione app (window, bundle, etc)
│
├── 📂 scripts/                      # 🛠️ Script di utilità
│   ├── setup.sh                     # Setup ambiente completo
│   ├── check-env.sh                 # Verifica environment
│   └── lint.sh                      # Linting Rust
│
├── 📄 index.html                    # HTML principale
├── 📄 package.json                  # Dipendenze npm (frontend + Tauri CLI)
├── 📄 Cargo.toml                    # Workspace Rust
├── 📄 vite.config.ts                # Configurazione Vite (bundler frontend)
├── 📄 tsconfig.json                 # TypeScript config
├── 📄 tsconfig.node.json            # TypeScript config per build tools
├── 📄 Makefile                      # Comandi development
├── 📄 rust-toolchain.toml           # Versione Rust fissata (nightly)
├── 📄 .nvmrc                        # Versione Node.js fissata (20.10.0)
├── 📄 .env.example                  # Template variabili environment
├── 📄 .gitignore                    # Git ignore patterns
│
├── 📚 Documentazione
│   ├── README.md                    # 📖 Guida principale (INIZIA DA QUI!)
│   ├── DEVELOPMENT.md               # 💻 Guida sviluppo
│   ├── ARCHITECTURE.md              # 🏗️ Architettura progetto
│   ├── CONTRIBUTING.md              # 🤝 Come contribuire
│   ├── TROUBLESHOOTING.md           # 🆘 Soluzione problemi
│   └── PROJECT_STRUCTURE.md         # 📦 Questo file!
│
└── 📄 LICENSE                       # Licenza MIT

Total: 22+ file configurati professionalmente
```

## Flusso File

### Build & Deployment

```
index.html (entry HTML)
   ↓
src/main.ts (entry JS/TS)
   ↓
Vite Build
   ↓
dist/ (output frontend)
   ↓
Tauri Bundler
   ↓
   ├─ macOS: dist/bundle/macos/RetroTunes.app
   ├─ Windows: dist/bundle/msi/RetroTunes.exe
   └─ Linux: dist/bundle/appimage/RetroTunes.AppImage
```

### Development Flow

```
npm run tauri dev
   ↓
   ├─ Vite dev server (http://localhost:5173)
   │  └─ Hot reload su cambiamenti src/
   │
   └─ Rust backend (Tauri)
      └─ Recarica su cambiamenti src-tauri/src/main.rs
```

## File Chiave

### 🎨 Frontend
- **index.html**: Punto di ingresso HTML
- **src/main.ts**: Logica JavaScript/TypeScript
- **src/style.css**: Stili CSS
- **vite.config.ts**: Configurazione build Vite

### 🦀 Backend
- **src-tauri/src/main.rs**: Comandi Rust, window setup, listener
- **src-tauri/Cargo.toml**: Dipendenze Rust (tokio, tauri, serde, etc)
- **src-tauri/tauri.conf.json**: Config app (window size, bundle, allowlist)

### ⚙️ Configurazione
- **Cargo.toml**: Workspace Rust
- **package.json**: Dipendenze npm
- **rust-toolchain.toml**: Pin Rust nightly
- **.nvmrc**: Pin Node.js 20.10.0
- **.env.example**: Template env vars

### 📚 Documentazione
- **README.md**: Guida completa setup e comandi
- **DEVELOPMENT.md**: Come sviluppare nuove feature
- **ARCHITECTURE.md**: Descrizione architettura
- **TROUBLESHOOTING.md**: Soluzione problemi comuni

## Versioni Fissate

Questo progetto usa versioni specifiche per garantire compatibilità:

| Tool | Versione | File |
|------|----------|------|
| Rust | nightly | `rust-toolchain.toml` |
| Node.js | 20.10.0 | `.nvmrc` |
| Tauri CLI | ~1.5.11 | `package.json` |
| Tauri API | ~1.5.3 | `package.json` |

**Perché?** Versioni nuove a volte introducono breaking changes. Fissare le versioni garantisce che chiunque cloni il progetto usa lo stesso ambiente.

## Configurazione Locale vs Globale

Questo progetto preferisce installazioni **locali** per evitare conflitti:

✅ **Locali** (gestite dal progetto):
- Node.js tramite NVM (`~/.nvm`)
- npm (viene con Node.js)
- Dipendenze npm in `node_modules/`
- Dipendenze Rust in `src-tauri/target/`

⚠️ **Globali** (solo se necessari):
- Rust (tramite Rustup - standard in Rust)
- Homebrew (per package management macOS)

## Permessi Script

I seguenti script devono essere eseguibili:

```bash
scripts/setup.sh        # Setup automatico
scripts/check-env.sh    # Verifiche environment
scripts/lint.sh         # Linting Rust
```

Sono già resi eseguibili, ma se necessario:
```bash
chmod +x scripts/*.sh
```

---

**Pronto? Inizia con:**
```bash
bash scripts/setup.sh
```

**Domande?** Vedi [README.md](README.md) per più dettagli! 🎵
