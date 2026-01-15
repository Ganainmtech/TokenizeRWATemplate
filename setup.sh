#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------
# TokenizeRWA Template - One-command setup + run script
#
# What it does:
# - Ensures AlgoKit CLI is installed
# - Installs frontend dependencies
# - Auto-creates .env files by copying .env.template
# - Runs frontend dev server
# ------------------------------------------------------------

FRONTEND_DIR="projects/TokenizeRWATemplate-frontend"
NFT_MINT_DIR="projects/TokenizeRWATemplate-contracts/NFT_mint_server"
PORT="${PORT:-5173}"

# --- Helpers ---
log()  { echo -e "\033[1;36m[setup]\033[0m $*"; }
warn() { echo -e "\033[1;33m[warn]\033[0m $*"; }
err()  { echo -e "\033[1;31m[error]\033[0m $*"; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

get_node_major() {
  if ! command_exists node; then
    echo ""
    return
  fi
  node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo ""
}

# ------------------------------------------------------------
# SANITY CHECKS
# ------------------------------------------------------------

log "Starting TokenizeRWA Template setup..."

if [ ! -d "$FRONTEND_DIR" ]; then
  err "Could not find frontend directory: $FRONTEND_DIR"
  err "Run this script from the repository root."
  exit 1
fi

if ! command_exists npm; then
  err "npm not found. Please install Node.js first."
  exit 1
fi

NODE_MAJOR="$(get_node_major)"
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 20 ]; then
  err "Node.js >= 20 is required for the frontend."
  exit 1
fi

log "Node detected: $(node -v) | npm: $(npm -v)"

# ------------------------------------------------------------
# ALGOKIT CLI
# ------------------------------------------------------------

export PATH="$HOME/.local/bin:$PATH"

if ! command_exists algokit; then
  log "AlgoKit CLI not found. Installing..."

  if command_exists python3; then
    python3 -m pip install --user --upgrade pip algokit >/dev/null
  else
    err "Python3 is required to install AlgoKit."
    exit 1
  fi

  export PATH="$HOME/.local/bin:$PATH"
fi

log "AlgoKit CLI ready"

# ------------------------------------------------------------
# FRONTEND DEPENDENCIES
# ------------------------------------------------------------

log "Installing frontend dependencies..."
(
  cd "$FRONTEND_DIR"
  npm install
  npm install idb-keyval
)

# ------------------------------------------------------------
# ENV FILE HANDLING
# ------------------------------------------------------------

create_env_file() {
  local TARGET_DIR="$1"
  local NAME="$2"

  local ENV_FILE="$TARGET_DIR/.env"
  local TEMPLATE_FILE="$TARGET_DIR/.env.template"

  if [ -f "$ENV_FILE" ]; then
    log "$NAME .env already exists — leaving it untouched."
    return
  fi

  if [ -f "$TEMPLATE_FILE" ]; then
    log "Creating $NAME .env from .env.template"
    cp "$TEMPLATE_FILE" "$ENV_FILE"
  else
    warn "$NAME .env.template not found — creating guidance-only .env"
    cat <<EOF > "$ENV_FILE"
# Copy the contents from .env.template into this one
EOF
  fi
}

# Frontend .env
create_env_file "$FRONTEND_DIR" "Frontend"

# NFT mint server .env
if [ -d "$NFT_MINT_DIR" ]; then
  create_env_file "$NFT_MINT_DIR" "NFT mint server"
else
  warn "NFT mint server directory not found — skipping .env creation."
fi

# ------------------------------------------------------------
# NFT MINT SERVER DEPENDENCIES
# ------------------------------------------------------------

if [ -d "$NFT_MINT_DIR" ]; then
  log "Installing NFT mint server dependencies..."
  warn "You may see Node engine warnings — this is expected and safe to ignore."

  (
    cd "$NFT_MINT_DIR"
    npm install
  )

  log "NFT mint server dependencies installed."
  log "Note: Server is NOT started automatically."
  log "Edit $NFT_MINT_DIR/.env before running it manually."
fi

# ------------------------------------------------------------
# RUN FRONTEND
# ------------------------------------------------------------

log "Starting frontend dev server on port $PORT..."
log "Codespaces users: forward port $PORT"

cd "$FRONTEND_DIR"
npm run dev -- --host 0.0.0.0 --port "$PORT"
