#!/bin/bash

# Cloudflare Pages deployment helper for SeraVault.
# Deploys the app without Firebase Hosting.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status()  { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

check_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    print_error "$1 is required but not installed."
    exit 1
  fi
}

load_env_if_present() {
  local file="$1"
  if [ -f "$file" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$file"
    set +a
    print_status "Loaded $file"
  fi
}

service="${1:-all}"

case "$service" in
  all|app|build)
    ;;
  -h|--help|help)
    echo "Cloudflare Pages deploy helper"
    echo
    echo "Usage: ./deploy-cloudflare.sh [service]"
    echo
    echo "Services:"
    echo "  all      Build and deploy app"
    echo "  app      Build and deploy app only"
    echo "  build    Build artifacts only (no deploy)"
    echo
    echo "Required env vars for deploy:"
    echo "  CLOUDFLARE_PAGES_APP_PROJECT"
    exit 0
    ;;
  *)
    print_error "Unknown service: $service"
    exit 1
    ;;
esac

check_command "node"
check_command "npm"

load_env_if_present ".env.supabase"
load_env_if_present ".env.supabase.local"

build_app() {
  print_status "Building app for Cloudflare Pages (Supabase backend)..."
  VITE_BACKEND_TYPE=supabase npm run build:deploy
  print_success "App build complete (dist/)"
}

deploy_app() {
  if [ -z "$CLOUDFLARE_PAGES_APP_PROJECT" ]; then
    print_error "CLOUDFLARE_PAGES_APP_PROJECT is not set."
    exit 1
  fi

  print_status "Deploying app to Cloudflare Pages project: $CLOUDFLARE_PAGES_APP_PROJECT"
  npx wrangler pages deploy dist --project-name "$CLOUDFLARE_PAGES_APP_PROJECT"
  print_success "App deployed"
}

if [ "$service" = "build" ]; then
  build_app
  exit 0
fi

print_warning "About to run Cloudflare service: $service"
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  print_error "Deployment cancelled."
  exit 1
fi

case "$service" in
  app)
    build_app
    deploy_app
    ;;
  all)
    build_app
    deploy_app
    ;;
esac

print_success "Cloudflare workflow completed."
