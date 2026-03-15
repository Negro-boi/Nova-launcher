#!/usr/bin/env bash
# Nova Launcher - Quick setup script
set -e

echo "Nova Launcher Setup"
echo "========================"

if ! command -v node &>/dev/null; then
  echo "Node.js is required. Download from: https://nodejs.org"
  exit 1
fi

NODE_VER=$(node -v | cut -c2- | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "Node.js 18+ required (found $(node -v))"
  exit 1
fi

echo "Node.js $(node -v) found"
echo "Installing dependencies..."
npm install

echo ""
echo "Done! Starting Nova Launcher..."
npm start
