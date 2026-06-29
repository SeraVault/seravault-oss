#!/bin/bash

# Supabase-only deployment script for SeraVault.
# This script intentionally avoids all Firebase tooling.

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

load_env_file_if_present() {
  local file="$1"
  if [ -f "$file" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$file"
    set +a
    print_status "Loaded $file"
  fi
}

confirm() {
  local message="$1"
  echo
  print_warning "$message"
  read -p "Continue? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_error "Deployment cancelled."
    exit 1
  fi
}

service="${1:-all}"

case "$service" in
  all|db|functions|secrets|app-build)
    ;;
  -h|--help|help)
    echo "Supabase-only deploy script"
    echo
    echo "Usage: ./deploy-supabase.sh [service]"
    echo
    echo "Services:"
    echo "  all        Set secrets, push DB migrations, deploy Edge Functions, build app"
    echo "  db         Push DB migrations only"
    echo "  functions  Deploy Edge Functions only"
    echo "  secrets    Set Supabase Edge Function secrets only"
    echo "  app-build  Build app with VITE_BACKEND_TYPE=supabase only"
    echo
    echo "Env loading:"
    echo "  Preferred: .env.supabase -> .env.supabase.local (exclusive)"
    echo "  Fallback:  .env -> .env.local"
    exit 0
    ;;
  *)
    print_error "Unknown service: $service"
    print_error "Available services: all, db, functions, secrets, app-build"
    exit 1
    ;;
esac

check_command "supabase"
check_command "node"
check_command "npm"

if [ -f ".env.supabase" ] || [ -f ".env.supabase.local" ]; then
  # If Supabase-specific env files exist, use them exclusively.
  load_env_file_if_present ".env.supabase"
  load_env_file_if_present ".env.supabase.local"
else
  # Backward-compatible fallback for existing setups.
  load_env_file_if_present ".env"
  load_env_file_if_present ".env.local"
fi

SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-${SUPABASE_PROJECT_REF_PROD:-}}"
if [ -z "$SUPABASE_PROJECT_REF" ]; then
  print_error "SUPABASE_PROJECT_REF or SUPABASE_PROJECT_REF_PROD must be set in env."
  exit 1
fi

set_supabase_secrets() {
  print_status "Setting Supabase secrets for project $SUPABASE_PROJECT_REF..."

  local required=(
    RESEND_API_KEY
    VITE_APP_URL
    VITE_LANDING_URL
  )

  local missing=()
  local var
  for var in "${required[@]}"; do
    if [ -z "${!var}" ] || [[ "${!var}" == your-* ]]; then
      missing+=("$var")
    fi
  done

  if [ ${#missing[@]} -gt 0 ]; then
    print_error "Missing required env vars for secrets deployment:"
    for var in "${missing[@]}"; do
      echo "  • $var"
    done
    exit 1
  fi

  local secret_args=(
    RESEND_API_KEY="$RESEND_API_KEY"
    APP_URL="$VITE_APP_URL"
    LANDING_URL="$VITE_LANDING_URL"
  )
  supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" "${secret_args[@]}"

  print_success "Supabase secrets updated"
}

push_migrations() {
  print_status "Pushing migrations to Supabase project $SUPABASE_PROJECT_REF..."
  supabase link --project-ref "$SUPABASE_PROJECT_REF"
  supabase db push --linked
  print_success "Migrations pushed"
}

deploy_functions() {
  print_status "Deploying Supabase Edge Functions to $SUPABASE_PROJECT_REF..."
  supabase functions deploy --project-ref "$SUPABASE_PROJECT_REF"
  print_success "Edge Functions deployed"
}

build_app_supabase() {
  print_status "Building app with Supabase backend only..."
  node scripts/generate-sw-config.cjs --mode=production
  node scripts/increment-sw-version.cjs
  VITE_BACKEND_TYPE=supabase npx vite build --mode production
  print_success "Supabase app build complete"
  print_status "Build output is in dist/ (deploy with your host of choice)."
}

confirm "About to run '$service' for Supabase project $SUPABASE_PROJECT_REF."

case "$service" in
  all)
    set_supabase_secrets
    push_migrations
    deploy_functions
    build_app_supabase
    ;;
  db)
    push_migrations
    ;;
  functions)
    deploy_functions
    ;;
  secrets)
    set_supabase_secrets
    ;;
  app-build)
    build_app_supabase
    ;;
esac

print_success "Supabase deployment workflow finished."