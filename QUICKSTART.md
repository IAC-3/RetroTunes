# ⚡ Quick Start - RetroTunes

## 🚀 Se hai fretta (3 minuti)

```bash
# 1. Setup ambiente (1-2 minuti, esegui UNA SOLA VOLTA)
bash scripts/setup.sh

# 2. Avvia app in development
make dev

# 3. Fatto! Apri http://localhost:5173 nel browser integrato
```

## 📝 Se hai già Rust e Node.js

```bash
npm install
make dev
```

## 🎨 Dove modificare il codice

| Cosa | Dove | Ricarica |
|------|------|----------|
| UI (HTML/CSS/JS) | `src/` e `index.html` | 🔥 Istantanea (hot reload) |
| Comandi Rust | `src-tauri/src/main.rs` | 🔄 Riavvia dev server |

## 💾 Build per Distribution

```bash
make build
# Output: src-tauri/target/release/bundle/
```

## ✅ Verifica Setup

```bash
make check-env
```

## 📚 Documentazione Completa

- **[README.md](README.md)** - Guida completa
- **[DEVELOPMENT.md](DEVELOPMENT.md)** - Come sviluppare
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Architettura
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Problemi?

---

**Got stuck?** → `make check-env` e poi controlla [TROUBLESHOOTING.md](TROUBLESHOOTING.md) 🎵
