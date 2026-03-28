/**
 * One-time migration script: hash all plaintext passwords in fg_users and role_passwords.
 *
 * Usage:
 *   npx tsx src/scripts/hash-passwords.ts
 *
 * Prerequisites:
 *   - Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   - npm install tsx (if not already installed)
 *
 * This script is idempotent — it skips passwords that are already bcrypt hashes.
 * After running, verify login still works before deleting this script.
 */

import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local from project root
config({ path: resolve(__dirname, "../.env.local") });

const SALT_ROUNDS = 10;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

function isHash(s: string): boolean {
  return s.startsWith("$2a$") || s.startsWith("$2b$");
}

async function hashTable(table: string, idColumn: string) {
  console.log(`\n--- ${table} ---`);

  const { data: rows, error } = await supabase
    .from(table)
    .select(`${idColumn}, password`);

  if (error) {
    console.error(`  Error reading ${table}:`, error.message);
    return;
  }

  if (!rows || rows.length === 0) {
    console.log("  No rows found.");
    return;
  }

  let hashed = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = row[idColumn];
    const pw: string = row.password;

    if (isHash(pw)) {
      skipped++;
      continue;
    }

    const hash = await bcrypt.hash(pw, SALT_ROUNDS);

    const { error: updateErr } = await supabase
      .from(table)
      .update({ password: hash })
      .eq(idColumn, id);

    if (updateErr) {
      console.error(`  Failed to update ${idColumn}=${id}:`, updateErr.message);
    } else {
      console.log(`  Hashed ${idColumn}=${id} (role: ${row.role || "n/a"})`);
      hashed++;
    }
  }

  console.log(`  Done: ${hashed} hashed, ${skipped} already hashed.`);
}

async function main() {
  console.log("Password hashing migration");
  console.log("Supabase URL:", url);

  await hashTable("fg_users", "id");
  await hashTable("role_passwords", "role");

  console.log("\nMigration complete. Test login before removing this script.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
