import { mapEmpresaName } from "@/lib/empresa-mapping";

/**
 * Revisión 110, n.º 82 · Búsqueda global › Cuentas por cobrar. El servidor junta
 * las claves de las empresas donde debe el cliente («vistana, fashion_wear, …»):
 * en pantalla va el NOMBRE si es una sola y «N empresas» si son varias.
 */
export function empresasDelSaldo(companyKeys: string): string {
  const claves = Array.from(new Set(companyKeys.split(",").map((k) => k.trim()).filter(Boolean)));
  if (claves.length === 0) return "";
  if (claves.length === 1) return mapEmpresaName(claves[0]);
  return `${claves.length} empresas`;
}
