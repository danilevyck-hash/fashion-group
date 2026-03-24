import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type VendorMap = Record<string, Record<string, string>>;

// Fetch all vendor assignments from Supabase and build the same map structure
export async function getVendorMap(companyKey?: string): Promise<VendorMap> {
  let query = supabase.from("vendor_assignments").select("company_key, client_name, vendor_name");
  if (companyKey) query = query.eq("company_key", companyKey);

  const { data, error } = await query;
  if (error || !data) return {};

  const map: VendorMap = {};
  for (const row of data) {
    if (!map[row.company_key]) map[row.company_key] = {};
    map[row.company_key][row.client_name] = row.vendor_name;
  }
  return map;
}

export function getVendorFromMap(map: VendorMap, companyKey: string, clientName: string): string {
  return map[companyKey]?.[clientName] || "";
}

export function getClientsForVendorFromMap(map: VendorMap, companyKey: string, vendorName: string): string[] {
  const companyMap = map[companyKey];
  if (!companyMap) return [];
  return Object.entries(companyMap)
    .filter(([, v]) => v === vendorName)
    .map(([name]) => name);
}
