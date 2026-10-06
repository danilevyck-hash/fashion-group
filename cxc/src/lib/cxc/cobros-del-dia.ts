// ─────────────────────────────────────────────────────────────────────────────
// Resumen diario de cobros (6-oct-2026, aprobado por Daniel). Módulo PURO; el
// I/O vive en `app/api/cron/cobros-del-dia/route.ts`.
//
// Una línea por cliente y empresa con lo que pagó hoy y lo que le queda a
// +90 días DESPUÉS del pago, con la MISMA cuenta de CxC (91-120 + 121 y más,
// `saldoMas90`). Sin cobros devuelve `null`: no se manda nada.
//
// 🔴 La cartera es una FOTO (el estado de cuenta de las 4:10 p.m.). Un pago
// registrado DESPUÉS de esa foto todavía no la movió, así que se le resta a su
// +90 días.
// ponytail: se asume que el pago baja lo más viejo primero; si en Switch se
// aplicó a facturas nuevas, el +90 de ese cliente sale más bajo hasta la foto
// siguiente.
// ─────────────────────────────────────────────────────────────────────────────

import { nombreCortoEmpresa } from "@/lib/empresa-mapping";

/** Pagos listados como mucho; el resto va como «y N más». */
export const MAX_COBROS_EN_AVISO = 15;
export const URL_CXC = "https://www.fashiongr.com/cxc";

/**
 * Clientes que NO son cobros, por CÓDIGO: el mostrador (TCKCTA) y las empresas
 * del grupo como clientes — 12188 Active Shoes, D-108 Multi Fashion Holding,
 * D-38 Confecciones Boston. Medido en `switch_recibos` el 6-oct-2026. Los
 * códigos de Boston no van acá: desde el 6-oct-2026 Boston no entra al aviso.
 */
export const CLIENTES_FUERA: readonly string[] = ["TCKCTA", "12188", "D-108", "D-38"];

export interface CobroDelDia {
  empresa: string;
  codigo: string;
  cliente: string;
  monto: number;
  /** `switch_recibos.fecha_creacion`: hora de PANAMÁ guardada con «+00:00». */
  creado: string | null;
}

/** `$12,300` — pesos enteros: es un resumen, no un estado de cuenta. */
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** ¿El recibo se registró después de la foto de la cartera de su empresa? */
function despuesDeLaFoto(creado: string | null, corte: string | null | undefined): boolean {
  if (!creado || !corte) return true;
  return Date.parse(`${creado.slice(0, 19)}-05:00`) > Date.parse(corte);
}

/**
 * @param mas90 `empresa|codigo` → saldo a +90 días de la cartera (la foto).
 * @param corte empresa → ISO de cuándo se leyó esa foto.
 */
export function mensajeCobrosDelDia(
  cobros: readonly CobroDelDia[],
  mas90: ReadonlyMap<string, number>,
  corte: Readonly<Record<string, string | null>>,
): string | null {
  const porCliente = new Map<string, { empresa: string; cliente: string; monto: number; sinReflejar: number; key: string }>();
  for (const c of cobros) {
    if (CLIENTES_FUERA.includes(c.codigo.trim().toUpperCase())) continue;
    const key = `${c.empresa}|${c.codigo}`;
    const fila = porCliente.get(key) ?? { empresa: c.empresa, cliente: c.cliente.trim(), monto: 0, sinReflejar: 0, key };
    fila.monto += c.monto;
    if (despuesDeLaFoto(c.creado, corte[c.empresa])) fila.sinReflejar += c.monto;
    porCliente.set(key, fila);
  }
  const filas = [...porCliente.values()].sort((a, b) => b.monto - a.monto || a.cliente.localeCompare(b.cliente));
  const total = filas.reduce((s, f) => s + f.monto, 0);
  // Sin cobros, o con lo cobrado y lo devuelto cancelándose, no se manda nada
  // (Daniel, 6-oct-2026: «si el total queda en cero, no se manda nada»).
  if (filas.length === 0 || Math.round(total) === 0) return null;

  const n = filas.length;
  const visibles = filas.slice(0, MAX_COBROS_EN_AVISO);

  // Empresas en el orden de lo cobrado en cada una (Map conserva la inserción).
  const grupos = new Map<string, typeof visibles>();
  const totalEmpresa = (k: string) => filas.filter((f) => f.empresa === k).reduce((s, f) => s + f.monto, 0);
  for (const f of [...visibles].sort((a, b) => totalEmpresa(b.empresa) - totalEmpresa(a.empresa) || b.monto - a.monto)) {
    grupos.set(f.empresa, [...(grupos.get(f.empresa) ?? []), f]);
  }

  const linea = (f: (typeof filas)[number]) => {
    const queda = Math.max(0, (mas90.get(f.key) ?? 0) - f.sinReflejar);
    return `• ${f.cliente} · ${usd(f.monto)} · ${Math.round(queda) > 0 ? `le quedan +90 d ${usd(queda)}` : "al día ✓"}`;
  };
  return [
    `💰 Cobros de hoy · ${usd(total)} · ${n} ${n === 1 ? "pago" : "pagos"}`,
    ...[...grupos].flatMap(([k, fs]) => [nombreCortoEmpresa(k), ...fs.map(linea)]),
    ...(n > MAX_COBROS_EN_AVISO ? [`y ${n - MAX_COBROS_EN_AVISO} más · Ver en CxC ${URL_CXC}`] : []),
  ].join("\n");
}
