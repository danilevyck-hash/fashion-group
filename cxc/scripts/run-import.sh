#!/bin/bash
cd "$(dirname "$0")/.."
npx tsx scripts/import-reclamos.ts
