# 🤝 Linee Guida per Contribuire

Grazie per l'interesse nel contribuire a RetroTunes! Qui troverai come farlo correttamente.

## Prima di Iniziare

1. Fai un **fork** del progetto
2. Clona il tuo fork localmente
3. Segui [DEVELOPMENT.md](DEVELOPMENT.md) per il setup

## Processo di Contribuzione

### 1. Crea un Branch

```bash
git checkout -b feature/nome-feature
# oppure
git checkout -b fix/nome-bug
```

### 2. Sviluppa

```bash
make dev  # Avvia in dev mode
```

### 3. Testa il Codice

```bash
# Type check
npx tsc --noEmit

# Lint Rust
make lint

# Check Rust
make check

# Test Rust
cd src-tauri && cargo test
```

### 4. Commit con Messaggi Chiari

```bash
git add .
git commit -m "feat: aggiungi nuova feature" 
```

**Formato commit:**
- `feat:` nuova feature
- `fix:` correzione bug
- `docs:` documentazione
- `refactor:` rifattorizzazione
- `test:` test

### 5. Push e Pull Request

```bash
git push origin feature/nome-feature
```

Poi apri una PR su GitHub con descrizione chiara di:
- Cosa cambia
- Perché
- Come testare

## Stile di Codice

### Rust
```bash
# Formatta automaticamente
cd src-tauri && cargo fmt

# Lint automatico
cargo clippy --fix
```

### TypeScript/JavaScript
```bash
# TypeScript strict mode already enabled in tsconfig.json
npx tsc --noEmit
```

## Documentazione

Aggiorna la documentazione se:
- Aggiungi nuove feature
- Cambi l'API
- Aggiungi dipendenze

## Licenza

Contribuendo, accetti che il tuo codice sia under [LICENSE](LICENSE).

---

Grazie ancora! 🎵✨
