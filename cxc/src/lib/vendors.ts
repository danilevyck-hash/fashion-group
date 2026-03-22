import vendorData from "./vendors.json";

// vendor map: { company_key: { normalized_client_name: vendor_name } }
export const VENDOR_MAP: Record<string, Record<string, string>> = vendorData;

export function getVendor(companyKey: string, clientName: string): string {
  return VENDOR_MAP[companyKey]?.[clientName] || "";
}

export function getClientsForVendor(companyKey: string, vendorName: string): string[] {
  const map = VENDOR_MAP[companyKey];
  if (!map) return [];
  return Object.entries(map)
    .filter(([, v]) => v === vendorName)
    .map(([name]) => name);
}
