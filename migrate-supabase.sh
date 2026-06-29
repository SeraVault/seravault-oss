#!/bin/bash

# Seravault — Migrate to a new Supabase project
#
# Before running:
#   1. Fill in SUPABASE_PROJECT_REF_NEW, SUPABASE_URL_NEW, SUPABASE_ANON_KEY_NEW,
#      SUPABASE_SERVICE_ROLE_KEY_NEW, and RESEND_API_KEY in .env
#   2. Run: supabase login  (if not already authenticated)
#   3. Run: ./migrate-supabase.sh

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

# ── Load .env ────────────────────────────────────────────────────────────────

if [ ! -f ".env" ]; then
    print_error ".env file not found."
    exit 1
fi

set -a
# shellcheck source=.env
source .env
set +a
print_status "Loaded .env"

# ── Validate required variables ──────────────────────────────────────────────

required_vars=(
    SUPABASE_PROJECT_REF_NEW
    SUPABASE_URL_NEW
    SUPABASE_ANON_KEY_NEW
    SUPABASE_SERVICE_ROLE_KEY_NEW
    RESEND_API_KEY
)

missing=()
for var in "${required_vars[@]}"; do
    val="${!var}"
    if [ -z "$val" ] || [[ "$val" == your-* ]]; then
        missing+=("$var")
    fi
done

if [ ${#missing[@]} -gt 0 ]; then
    print_error "The following variables must be filled in .env before migrating:"
    for var in "${missing[@]}"; do
        echo "  • $var"
    done
    exit 1
fi

if ! command -v supabase &> /dev/null; then
    print_error "'supabase' CLI is required but not installed."
    echo "  Linux: curl -sL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz | tar xz && sudo mv supabase /usr/local/bin/"
    echo "  macOS: brew install supabase/tap/supabase"
    exit 1
fi

# ── Confirm ──────────────────────────────────────────────────────────────────

echo
print_warning "This will migrate the Seravault Supabase backend to a new project."
echo -e "  New project ref : ${SUPABASE_PROJECT_REF_NEW}"
echo -e "  New project URL : ${SUPABASE_URL_NEW}"
echo
echo "Steps:"
echo "  1. Link CLI to new project"
echo "  2. Apply database schema (supabase db push)"
echo "  3. Configure database settings"
echo "  4. Set edge function secrets"
echo "  5. Deploy edge functions"
echo "  6. Update .env and .env.local with new credentials"
echo
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_error "Migration cancelled."
    exit 1
fi

# ── Step 1: Link ─────────────────────────────────────────────────────────────

print_status "Linking CLI to new project ${SUPABASE_PROJECT_REF_NEW}..."
supabase link --project-ref "$SUPABASE_PROJECT_REF_NEW"
print_success "Linked to new project"

# ── Step 2: Apply schema ─────────────────────────────────────────────────────

print_status "Applying database schema..."
supabase db push --project-ref "$SUPABASE_PROJECT_REF_NEW"
print_success "Schema applied"

# ── Step 3: Configure database settings ──────────────────────────────────────

print_status "Configuring database settings (app.supabase_url + service_role_key)..."
supabase db execute --project-ref "$SUPABASE_PROJECT_REF_NEW" \
    --sql "ALTER DATABASE postgres SET app.supabase_url = '${SUPABASE_URL_NEW}'; ALTER DATABASE postgres SET app.supabase_service_role_key = '${SUPABASE_SERVICE_ROLE_KEY_NEW}';"
print_success "Database settings configured"

# ── Step 4: Set secrets ───────────────────────────────────────────────────────

print_status "Setting edge function secrets..."
secret_args=(
    RESEND_API_KEY="$RESEND_API_KEY"
    APP_URL="${VITE_APP_URL}"
    LANDING_URL="${VITE_LANDING_URL}"
)
supabase secrets set --project-ref "$SUPABASE_PROJECT_REF_NEW" "${secret_args[@]}"
print_success "Secrets set"

# ── Step 5: Deploy edge functions ─────────────────────────────────────────────

print_status "Deploying edge functions..."
supabase functions deploy --project-ref "$SUPABASE_PROJECT_REF_NEW"
print_success "Edge functions deployed"

# ── Step 6: Update .env and .env.local ────────────────────────────────────────

print_status "Updating .env with new project credentials..."

OLD_REF="$SUPABASE_PROJECT_REF_PROD"
NEW_REF="$SUPABASE_PROJECT_REF_NEW"

update_env_file() {
    local file="$1"
    if [ ! -f "$file" ]; then
        return
    fi

    sed -i \
        -e "s|SUPABASE_PROJECT_REF_PROD=.*|SUPABASE_PROJECT_REF_PROD=${NEW_REF}|g" \
        -e "s|VITE_SUPABASE_URL=.*|VITE_SUPABASE_URL=${SUPABASE_URL_NEW}|g" \
        -e "s|VITE_SUPABASE_ANON_KEY=.*|VITE_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY_NEW}|g" \
        -e "s|SUPABASE_SERVICE_ROLE_KEY=.*|SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY_NEW}|g" \
        "$file"

    # Also clear the _NEW migration vars since they've been applied
    sed -i \
        -e "s|SUPABASE_PROJECT_REF_NEW=.*|SUPABASE_PROJECT_REF_NEW=|g" \
        -e "s|SUPABASE_URL_NEW=.*|SUPABASE_URL_NEW=|g" \
        -e "s|SUPABASE_ANON_KEY_NEW=.*|SUPABASE_ANON_KEY_NEW=|g" \
        -e "s|SUPABASE_SERVICE_ROLE_KEY_NEW=.*|SUPABASE_SERVICE_ROLE_KEY_NEW=|g" \
        "$file"

    # Update any hardcoded old project ref in comments/URLs
    if [ -n "$OLD_REF" ]; then
        sed -i "s|${OLD_REF}|${NEW_REF}|g" "$file"
    fi

    print_success "Updated $file"
}

update_env_file ".env"
update_env_file ".env.local"

# ── Done ──────────────────────────────────────────────────────────────────────

echo
print_success "Migration complete!"
echo
echo "Next steps:"
echo "  • Go to the Supabase dashboard and enable your OAuth providers (Google, Apple)"
echo "    https://app.supabase.com/project/${NEW_REF}/auth/providers"
echo "  • Set the Site URL and redirect URLs under Authentication > URL Configuration"
echo "  • Rebuild and redeploy the app:  ./deploy.sh --supabase-prod sb-app"
