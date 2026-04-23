#!/usr/bin/env bash
set -e

echo "🚀 RetroTunes Setup Script"
echo "=========================="

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check for Homebrew
echo -e "\n${YELLOW}📦 Checking Homebrew...${NC}"
if ! command -v brew &> /dev/null; then
  echo -e "${RED}❌ Homebrew non è installato.${NC}"
  echo "Installa Homebrew da: https://brew.sh"
  exit 1
fi
echo -e "${GREEN}✓ Homebrew trovato${NC}"

# Check/Install Rustup
echo -e "\n${YELLOW}🦀 Checking Rust toolchain...${NC}"
if ! command -v rustup &> /dev/null; then
  echo -e "${RED}❌ Rustup non è installato.${NC}"
  echo "Installazione di Rustup..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
else
  echo -e "${GREEN}✓ Rustup trovato${NC}"
fi

# Install Rust toolchain
echo "Installazione Rust nightly..."
rustup toolchain install nightly
rustup default nightly
rustup component add rustfmt clippy
echo -e "${GREEN}✓ Rust toolchain configurato${NC}"

# Check/Install Node.js with nvm
echo -e "\n${YELLOW}📦 Checking Node.js...${NC}"
if ! command -v nvm &> /dev/null; then
  if [ ! -d "$HOME/.nvm" ]; then
    echo "Installazione di NVM..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  fi
fi

# Load nvm if needed
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node.js version from .nvmrc
echo "Installazione Node.js $(cat .nvmrc)..."
nvm install
nvm use
echo -e "${GREEN}✓ Node.js $(node -v) configurato${NC}"

# Install npm dependencies
echo -e "\n${YELLOW}📚 Installing npm dependencies...${NC}"
npm install
echo -e "${GREEN}✓ npm dependencies installate${NC}"

# Install Tauri CLI
echo -e "\n${YELLOW}🎨 Installing Tauri CLI...${NC}"
npm install
echo -e "${GREEN}✓ Tauri CLI pronto${NC}"

# Create .env file
if [ ! -f .env ]; then
  echo -e "\n${YELLOW}⚙️  Creating .env file...${NC}"
  cp .env.example .env
  echo -e "${GREEN}✓ .env file creato${NC}"
fi

echo -e "\n${GREEN}✅ Setup completato!${NC}"
echo -e "\n${YELLOW}Prossimi passaggi:${NC}"
echo "1. npm run tauri dev    # Avvia l'app in modalità development"
echo "2. npm run tauri build  # Compila per production"
echo ""
