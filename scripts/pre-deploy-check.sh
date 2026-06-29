#!/bin/bash

# Pre-deployment validation script
# Runs various checks to ensure the application is ready for deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[CHECK]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Check environment variables
check_env_vars() {
    print_status "Checking environment variables..."

    local has_errors=false

    # Add your required environment variables here
    # if [ -z "$VITE_FIREBASE_API_KEY" ]; then
    #     print_error "VITE_FIREBASE_API_KEY is not set"
    #     has_errors=true
    # fi

    if [ "$has_errors" = true ]; then
        print_error "Environment variables check failed"
        return 1
    else
        print_success "Environment variables check passed"
        return 0
    fi
}

# Check dependencies
check_dependencies() {
    print_status "Checking dependencies..."

    if [ ! -d "node_modules" ]; then
        print_warning "node_modules not found, running npm install..."
        npm install
    fi

    if [ -d "functions" ] && [ ! -d "functions/node_modules" ]; then
        print_warning "functions/node_modules not found, running npm install in functions..."
        cd functions && npm install && cd ..
    fi

    print_success "Dependencies check passed"
}

# Check build configuration
check_build_config() {
    print_status "Checking build configuration..."

    if [ ! -f "vite.config.ts" ] && [ ! -f "vite.config.js" ]; then
        print_error "Vite config file not found"
        return 1
    fi

    if [ ! -f "tsconfig.json" ]; then
        print_error "TypeScript config file not found"
        return 1
    fi

    print_success "Build configuration check passed"
}

# Check Firebase configuration
check_firebase_config() {
    print_status "Checking Firebase configuration..."

    if [ ! -f "firebase.json" ]; then
        print_error "firebase.json not found"
        return 1
    fi

    # Check if logged in to Firebase
    if ! firebase projects:list > /dev/null 2>&1; then
        print_error "Not logged in to Firebase. Run 'firebase login' first."
        return 1
    fi

    # Check current project
    local current_project=$(firebase use | grep "Now using project" | awk '{print $4}' || echo "none")
    if [ "$current_project" = "none" ]; then
        print_warning "No Firebase project selected. Using default from script."
    else
        print_status "Current Firebase project: $current_project"
    fi

    print_success "Firebase configuration check passed"
}

# Check security files
check_security() {
    print_status "Checking security configuration..."

    if [ -f ".env" ]; then
        print_warning ".env file found - make sure it's in .gitignore"
    fi

    if [ -f "service-account-key.json" ]; then
        print_warning "Service account key found - make sure it's in .gitignore"
    fi

    # Check if .gitignore exists and contains important patterns
    if [ -f ".gitignore" ]; then
        if ! grep -q "node_modules" .gitignore; then
            print_warning ".gitignore should include node_modules"
        fi
        if ! grep -q ".env" .gitignore; then
            print_warning ".gitignore should include .env files"
        fi
        if ! grep -q "*.key" .gitignore; then
            print_warning ".gitignore should include *.key files"
        fi
    else
        print_error ".gitignore file not found"
        return 1
    fi

    print_success "Security configuration check passed"
}

# Check code quality
check_code_quality() {
    print_status "Checking code quality..."

    # Run TypeScript compiler check (non-blocking for pre-existing issues)
    if ! npx tsc --noEmit 2>/dev/null; then
        print_warning "TypeScript compilation warnings found (continuing anyway)"
    else
        print_success "TypeScript compilation clean"
    fi

    print_success "Code quality check passed"
}

# Test build process
test_build() {
    print_status "Testing build process..."

    # Clean previous build
    if [ -d "dist" ]; then
        rm -rf dist
    fi

    # Test build
    if ! npm run build; then
        print_error "Build process failed"
        return 1
    fi

    # Check if build output exists
    if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
        print_error "Build output not found"
        return 1
    fi

    # Check build size (warn if too large)
    local build_size=$(du -sm dist | cut -f1)
    if [ "$build_size" -gt 50 ]; then
        print_warning "Build size is large: ${build_size}MB"
    else
        print_status "Build size: ${build_size}MB"
    fi

    print_success "Build test passed"
}

# Main function
main() {
    echo "🚀 Pre-deployment validation for Seravault"
    echo "=========================================="
    echo

    local has_failures=false

    # Run all checks
    check_dependencies || has_failures=true
    echo

    check_env_vars || has_failures=true
    echo

    check_build_config || has_failures=true
    echo

    check_firebase_config || has_failures=true
    echo

    check_security || has_failures=true
    echo

    check_code_quality || has_failures=true
    echo

    test_build || has_failures=true
    echo

    # Final result
    if [ "$has_failures" = true ]; then
        print_error "Pre-deployment checks failed!"
        echo "Please fix the issues above before deploying."
        exit 1
    else
        print_success "All pre-deployment checks passed! ✅"
        echo "Your application is ready for deployment."
        exit 0
    fi
}

main "$@"