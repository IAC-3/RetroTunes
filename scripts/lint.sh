#!/usr/bin/env bash

# Rust Linting & Formatting

echo "🔍 Running Rust Clippy..."
cd src-tauri
cargo clippy --all-targets --all-features -- -D warnings
CLIPPY_EXIT=$?

echo ""
echo "🎨 Checking code format..."
cargo fmt --check
FORMAT_EXIT=$?

if [ $CLIPPY_EXIT -eq 0 ] && [ $FORMAT_EXIT -eq 0 ]; then
    echo ""
    echo "✅ All checks passed!"
    exit 0
else
    echo ""
    echo "❌ Some checks failed"
    echo "Run: cargo fmt --all to auto-fix formatting"
    exit 1
fi
