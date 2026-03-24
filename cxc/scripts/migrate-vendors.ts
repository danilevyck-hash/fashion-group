import { createClient } from "@supabase/supabase-js";
import vendorData from "../src/lib/vendors.json";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function migrate() {
  const rows: { company_key: string; client_name: string; vendor_name: string }[] = [];

  for (const [companyKey, clients] of Object.entries(vendorData as Record<string, Record<string, string>>)) {
    for (const [clientName, vendorName] of Object.entries(clients)) {
      rows.push({ company_key: companyKey, client_name: clientName, vendor_name: vendorName });
    }
  }

  console.log(`Migrating ${rows.length} vendor assignments...`);

  const { error } = await supabase
    .from("vendor_assignments")
    .upsert(rows, { onConflict: "company_key,client_name" });

  if (error) {
    console.error("Migration failed:", error.message);
    process.exit(1);
  }

  console.log("Migration complete!");
}

migrate();
