# 🎵 RetroTunes

Una moderna app desktop per la musica, costruita con **Rust** e **Tauri**.

## 📋 Prerequisiti del Sistema

Prima di iniziare, assicurati di avere:

- **macOS 11+** (supportati sia Intel che Apple Silicon)
- **Homebrew** (package manager per macOS)
- **Connessione Internet** (per i download iniziali)

## 🚀 Setup Rapido (Una sola volta)

Se non hai **nulla** installato, il modo più semplice è:

```bash
cd /path/to/RetroTunes
bash scripts/setup.sh
```

Questo script automaticamente:
- ✅ Installa **Rustup** (Rust toolchain)
- ✅ Configura Rust **nightly** con componenti necessari
- ✅ Installa **NVM** (Node Version Manager)
- ✅ Configura Node.js **20.10.0** localmente
- ✅ Installa tutte le dipendenze npm
- ✅ Crea il file `.env` da `.env.example`

### Alternativa: Setup Manuale

Se preferisci controllare ogni passaggio:

#### 1️⃣ Installa Rust

```bash
# Installa Rustup (gestore versioni Rust)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

# Installa la versione corretta di Rust
rustup toolchain install nightly
rustup default nightly
rustup component add rustfmt clippy
```

Verifica l'installazione:
```bash
rustc --version  # Dovrebbe mostrare nightly
cargo --version
```

#### 2️⃣ Installa Node.js (Local via NVM)

```bash
# Installa NVM se non lo hai già
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Ricarica il profilo shell
source ~/.bashrc  # oppure ~/.zshrc se usi zsh

# Installa Node.js dalla versione specificata in .nvmrc
nvm install
nvm use
```

Verifica l'installazione:
```bash
node --version   # Dovrebbe mostrare v20.10.0
npm --version
```

#### 3️⃣ Installa Dipendenze del Progetto

```bash
npm install
```

#### 4️⃣ Configura Variabili di Ambiente

```bash
cp .env.example .env
# Modifica .env se necessario
```

## 💻 Comandi di Sviluppo

Usa `make` per i comandi comuni (consigliato):

```bash
make help       # Mostra tutti i comandi disponibili
make dev        # Avvia app in development mode
make build      # Compila per production
make install    # Installa dipendenze
make clean      # Pulisce build artifacts
make lint       # Esegui linter Rust
make check      # Check del codice Rust
```

Oppure comandi npm direttamente:

```bash
# Avvia il dev server (con hot reload)
npm run tauri dev

# Compila per production
npm run tauri build

# Anteprima della build
npm run preview

# Solo build del frontend
npm run build
```

## 📁 Struttura del Progetto

```
RetroTunes/
├── src/                      # Frontend (HTML, CSS, TypeScript)
│   ├── main.ts               # Entry point del frontend
│   └── style.css             # Stili globali
├── src-tauri/                # Backend Tauri + Rust
│   ├── src/
│   │   └── main.rs           # Punto di ingresso Rust
│   ├── icons/                # Icone dell'app
│   ├── Cargo.toml            # Dipendenze Rust
│   ├── build.rs              # Build script Tauri
│   └── tauri.conf.json       # Configurazione Tauri
├── index.html                # HTML principale
├── package.json              # Dipendenze npm
├── Cargo.toml                # Workspace Rust
├── Makefile                  # Comandi di sviluppo
├── vite.config.ts            # Configurazione Vite
├── rust-toolchain.toml       # Versione Rust fissata
├── .nvmrc                     # Versione Node.js fissata
├── .env.example              # Template variabili ambiente
└── scripts/
    └── setup.sh              # Script setup automatico
```

## 🔧 Architettura

### Frontend (Vite + TypeScript)
- **Vite**: bundler moderno e velocissimo
- **TypeScript**: type safety
- **Tauri API**: comunicazione con backend Rust

### Backend (Tauri + Rust)
- **Tauri**: framework desktop leggero
- **Rust nightly**: performance e safety
- **Tokio**: runtime asincrono

## 🌐 Come Aggiungere Dipendenze

### Dipendenze Rust (Backend)

```bash
# Aggiungi dipendenza nel workspace
cd src-tauri
cargo add nome_crate
```

Oppure modifica `src-tauri/Cargo.toml` manualmente.

### Dipendenze npm (Frontend)

```bash
npm install nome-pacchetto
```

## 🐛 Troubleshooting

### "Command not found: rustup"

```bash
# Aggiungi Rust al PATH
source "$HOME/.cargo/env"
```

### "Incompatible Rust version"

```bash
# Assicurati di usare la versione corretta
rustup default nightly
rustup update nightly
```

### "Node version not found"

```bash
# Installa la versione da .nvmrc
nvm install
nvm use
```

### La app non si avvia

```bash
# Pulisci e ricompila
make clean
npm install
make dev
```

## 📦 Compilazione per Distribution

```bash
# Build per macOS
npm run tauri build

# L'app compilata sarà in: src-tauri/target/release/bundle/macos/
```

## 🤝 Contributing

Prima di sviluppare nuove feature:

```bash
# Assicurati che il codice compili
make check

# Esegui linter
make lint

# Avvia in dev mode per testare
make dev
```

## 📄 Licenza

Vedi il file [LICENSE](LICENSE).

## 🆘 Supporto

Se riscontri problemi:

1. Controlla che le versioni siano corrette:
   - Rust: `rustc --version` (deve essere nightly)
   - Node: `node --version` (deve essere v20.10.0)

2. Prova il setup pulito:
   ```bash
   make clean
   bash scripts/setup.sh
   ```

3. Controlla i log:
   ```bash
   RUST_BACKTRACE=1 npm run tauri dev
   ```

---

**Happy coding! 🎵🚀**
