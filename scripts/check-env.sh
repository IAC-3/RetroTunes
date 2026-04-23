#!/usr/bin/env bash

# Environment Check Script per RetroTunes

echo "🔍 RetroTunes Environment Check"
echo "==============================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ISSUES=0

# Check Rust
echo -n "Rust (rustc)... "
if command -v rustc &> /dev/null; then
    VERSION=$(rustc --version | awk '{print $2}')
    if [[ $VERSION == "1.75."* ]]; then
        echo -e "${GREEN}✓${NC} ($VERSION)"
    else
        echo -e "${YELLOW}⚠${NC} (Found $VERSION, expected 1.75.x)"
        ISSUES=$((ISSUES + 1))
    fi
else
    echo -e "${RED}✗${NC} NOT INSTALLED"
    ISSUES=$((ISSUES + 1))
fi

# Check Cargo
echo -n "Cargo... "
if command -v cargo &> /dev/null; then
    VERSION=$(cargo --version | awk '{print $2}')
    echo -e "${GREEN}✓${NC} ($VERSION)"
else
    echo -e "${RED}✗${NC} NOT INSTALLED"
    ISSUES=$((ISSUES + 1))
fi

# Check Node
echo -n "Node.js... "
if command -v node &> /dev/null; then
    VERSION=$(node --version)
    if [[ $VERSION == "v20."* ]] || [[ $VERSION == "v21."* ]]; then
        echo -e "${GREEN}✓${NC} ($VERSION)"
    else
        echo -e "${YELLOW}⚠${NC} (Found $VERSION, recommended 20.10.0+)"
        ISSUES=$((ISSUES + 1))
    fi
else
    echo -e "${RED}✗${NC} NOT INSTALLED"
    ISSUES=$((ISSUES + 1))
fi

# Check npm
echo -n "npm... "
if command -v npm &> /dev/null; then
    VERSION=$(npm --version)
    echo -e "${GREEN}✓${NC} (v$VERSION)"
else
    echo -e "${RED}✗${NC} NOT INSTALLED"
    ISSUES=$((ISSUES + 1))
fi

# Check Tauri CLI
echo -n "Tauri CLI... "
if [ -d "node_modules/@tauri-apps/cli" ]; then
    echo -e "${GREEN}✓${NC} (installed)"
else
    echo -e "${YELLOW}⚠${NC} (not installed, run: npm install)"
    ISSUES=$((ISSUES + 1))
fi

# Check .env
echo -n ".env file... "
if [ -f ".env" ]; then
    echo -e "${GREEN}✓${NC} (exists)"
else
    echo -e "${YELLOW}⚠${NC} (not found, run: cp .env.example .env)"
    ISSUES=$((ISSUES + 1))
fi

echo ""
if [ $ISSUES -eq 0 ]; then
    echo -e "${GREEN}✅ Environment OK!${NC}"
    echo "Puoi iniziare con: ${GREEN}make dev${NC}"
    exit 0
else
    echo -e "${RED}⚠️  Found $ISSUES issue(s)${NC}"
    echo "Esegui: ${YELLOW}bash scripts/setup.sh${NC}"
    exit 1
fi
