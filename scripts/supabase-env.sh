#!/usr/bin/env bash
# Prints the local Supabase values PostIA needs, in .env format. Paste them into .env.local once.
set -euo pipefail
supabase status -o env | sed -n \
  -e 's/^API_URL=/NEXT_PUBLIC_SUPABASE_URL=/p' \
  -e 's/^ANON_KEY=/NEXT_PUBLIC_SUPABASE_ANON_KEY=/p' \
  -e 's/^SERVICE_ROLE_KEY=/SUPABASE_SERVICE_ROLE_KEY=/p'
