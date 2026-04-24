SHELL := /bin/bash

.PHONY: help setup install dev build clean lint check check-env

help:
	@echo "🎵 RetroTunes Development Commands"
	@echo "===================================="
	@echo "make setup       - Setup completo dell'ambiente"
	@echo "make install     - Installa dipendenze"
	@echo "make dev         - Avvia in modalità development"
	@echo "make build       - Compila per production"
	@echo "make clean       - Pulisce build artifacts"
	@echo "make lint        - Esegui linter Rust"
	@echo "make check       - Esegui check Rust"
	@echo "make check-env   - Verifica environment"
	@echo "make help        - Mostra questo aiuto"

setup:
	@bash scripts/setup.sh

install:
	@echo "📦 Installando dipendenze..."
	@bash -lc 'source "$$HOME/.cargo/env" && rustup toolchain install 1.80.0 && rustup default 1.80.0 && rustup component add rustfmt clippy && source "$$HOME/.nvm/nvm.sh" && export PKG_CONFIG_PATH="$$(brew --prefix libmediainfo 2>/dev/null)/lib/pkgconfig:$$PKG_CONFIG_PATH" && nvm install && nvm use && npm install'

dev:
	@echo "🚀 Avviando development server..."
	@bash -lc 'source "$$HOME/.cargo/env" && source "$$HOME/.nvm/nvm.sh" && export PKG_CONFIG_PATH="$$(brew --prefix libmediainfo 2>/dev/null)/lib/pkgconfig:$$PKG_CONFIG_PATH" && nvm install && nvm use && npm run tauri dev'

build:
	@echo "🔨 Compilando per production..."
	@bash -lc 'source "$$HOME/.cargo/env" && source "$$HOME/.nvm/nvm.sh" && export PKG_CONFIG_PATH="$$(brew --prefix libmediainfo 2>/dev/null)/lib/pkgconfig:$$PKG_CONFIG_PATH" && nvm install && nvm use && npm run tauri build'

clean:
	@echo "🧹 Pulizia build artifacts..."
	@cargo clean
	@rm -rf dist/
	@rm -rf target/

lint:
	@echo "🔍 Eseguendo rust linter..."
	@bash scripts/lint.sh

check:
	@echo "🔍 Eseguendo rust check..."
	@cd src-tauri && cargo check

check-env:
	@bash scripts/check-env.sh
