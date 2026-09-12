#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -n "${QUARTO_BIN:-}" ]; then
  quarto_bin="$QUARTO_BIN"
elif command -v quarto >/dev/null 2>&1; then
  quarto_bin="quarto"
elif [ -x /Applications/RStudio.app/Contents/Resources/app/quarto/bin/quarto ]; then
  quarto_bin=/Applications/RStudio.app/Contents/Resources/app/quarto/bin/quarto
else
  echo 'Quarto is required. Install Quarto or set QUARTO_BIN to its executable.' >&2
  exit 1
fi
"$quarto_bin" render
touch docs/.nojekyll
