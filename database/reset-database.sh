#!/bin/bash

# ============================================================================
# ⚠️  DANGER: DATABASE RESET SCRIPT
# ============================================================================
# 
# THIS SCRIPT WILL:
#   1. DROP the entire public schema (ALL TABLES, DATA, VIEWS, INDEXES)
#   2. RECREATE the schema from scratch using init-database.sql
#   3. DELETE ALL DATA PERMANENTLY - NO RECOVERY POSSIBLE
#
# USE ONLY DURING DEVELOPMENT
# DO NOT RUN AGAINST PRODUCTION DATABASES
#
# ============================================================================

set -e

# Color codes for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${RED}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                   ⚠️  DATABASE RESET WARNING ⚠️                ║"
echo "║                                                                ║"
echo "║  This script will PERMANENTLY DELETE all database tables,     ║"
echo "║  views, indexes, and data in the public schema.               ║"
echo "║                                                                ║"
echo "║  THIS CANNOT BE UNDONE.                                       ║"
echo "║                                                                ║"
echo "║  Only use this during development on LOCAL databases.         ║"
echo "║  DO NOT run against production environments.                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Prompt for confirmation
echo ""
echo -e "${YELLOW}To proceed, you must:${NC}"
echo "  1. Type 'yes' (all lowercase)"
echo "  2. Confirm the database URL below is correct"
echo ""

# Get database URL
if [ -z "$DATABASE_URL" ]; then
    echo "Loading DATABASE_URL from .env..."
    if [ -f "$(dirname "$0")/../.env" ]; then
        export $(cat "$(dirname "$0")/../.env" | grep DATABASE_URL)
    else
        echo -e "${RED}✗ .env file not found${NC}"
        exit 1
    fi
fi

if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}✗ DATABASE_URL not set${NC}"
    exit 1
fi

# Mask the password in display
MASKED_URL=$(echo "$DATABASE_URL" | sed 's/:.*@/:***@/')
echo -e "${YELLOW}Database URL: ${MASKED_URL}${NC}"
echo ""

# Confirmation prompt
read -p "Type 'yes' to proceed with database reset: " confirmation

if [ "$confirmation" != "yes" ]; then
    echo -e "${RED}✗ Reset cancelled${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}3... (last chance to cancel with Ctrl+C)${NC}"
sleep 1
echo -e "${YELLOW}2...${NC}"
sleep 1
echo -e "${YELLOW}1...${NC}"
sleep 1

echo ""
echo "Starting database reset..."
echo ""

# Drop public schema (CASCADE drops dependent objects)
echo "Dropping public schema..."
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE;" || {
    echo -e "${RED}✗ Failed to drop public schema${NC}"
    exit 1
}

# Recreate public schema
echo "Recreating public schema..."
psql "$DATABASE_URL" -c "CREATE SCHEMA public;" || {
    echo -e "${RED}✗ Failed to create public schema${NC}"
    exit 1
}

# Run init-database.sql
INIT_FILE="$(dirname "$0")/init-database.sql"
if [ ! -f "$INIT_FILE" ]; then
    echo -e "${RED}✗ init-database.sql not found at ${INIT_FILE}${NC}"
    exit 1
fi

echo "Running init-database.sql..."
psql "$DATABASE_URL" -f "$INIT_FILE" || {
    echo -e "${RED}✗ Failed to initialize database${NC}"
    exit 1
}

echo ""
echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                  ✓ DATABASE RESET COMPLETE                    ║"
echo "║                                                                ║"
echo "║  Schema has been dropped and recreated from init-database.sql ║"
echo "║  All tables, views, indexes, and seed data are now in place.  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
