// ─────────────────────────────────────────────────────────────────────────────
// Resumen diario de cobros (6-oct-2026, aprobado por Daniel). Módulo PURO; el
// I/O vive en `app/api/cron/cobros-del-dia/route.ts` y `cobros-del-dia-io.ts`.
// Sin cobros devuelve `null`: no se manda nada.
//
// 🔒 Formato (24-nov-2026, Daniel; reemplaza el del 7-oct, que agrupaba por
// empresa): POR CLIENTE, por código, con su total del día, y debajo un renglón
// por empresa donde pagó. Se cuentan clientes, no pagos:
//   <b>💰 Cobros · $79,305</b>   (26-nov-2026: HTML, renglones con «– »)
//
//   <b>City Mall David · $78,245</b>
//   – Fashion Wear · $50,885 · le quedan +90 d $106,152
//   – Vistana · $16,314   (al día: solo el monto)
// Sin +90 = «al día ✓», sin tramo intermedio (Daniel, 7-oct-2026).
//
// 🔴 EL +90 ES EL DE SWITCH, NUNCA UNA CUENTA PROPIA (24-nov-2026). Hasta ese
// día se le restaba el pago a la foto de las 4:10 p. m. cuando el recibo era
// posterior, y a otros no: dos criterios mezclados. City Mall David en Fashion
// Wear salió $55,267 y Switch decía $106,152 (el pago quedó sin aplicar). Ahora
// el cron le pregunta a Switch al momento, solo por los clientes y empresas que
// pagaron hoy (`cobros-del-dia-io.ts`); si no contesta, «+90 sin actualizar».
// ─────────────────────────────────────────────────────────────────────────────

import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { cuadreDeSwitch } from "@/lib/switch-api/estadocuenta-cuadre";

/** Suma de los tramos de Switch que empiezan en 91 días o más. `null` si no vino el aging. */
export function mas90DeLaRespuesta(respuesta: unknown): number | null {
  const saldos = cuadreDeSwitch(respuesta).saldos;
  if (!saldos) return null;
  let suma = 0;
  for (const t of saldos as Array<{ desde?: unknown; saldo?: unknown }>) {
    const desde = Number(t?.desde);
    const saldo = Number(t?.saldo);
    if (!Number.isFinite(desde) || !Number.isFinite(saldo)) return null;
    if (desde >= 91) suma += saldo;
  }
  return suma;
}

/** Clientes listados como mucho; el resto va como «y N más». */
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
}

/** Escapa el texto para el parse_mode HTML de Telegram. */
export const escHtml = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** `$12,300` — pesos enteros: es un resumen, no un estado de cuenta. */
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** `empresa|codigo` — la llave del +90 de Switch. */
export const llaveMas90 = (empresa: string, codigo: string): string => `${empresa}|${codigo.trim()}`;

/** Lo que quedó fuera del aviso por código (mostrador, empresas del grupo). */
export const cobroCuenta = (c: CobroDelDia): boolean => !CLIENTES_FUERA.includes(c.codigo.trim().toUpperCase());

/**
 * @param mas90 `empresa|codigo` → saldo a +90 días que Switch dice AHORA (sus
 *   tramos de 91 días en adelante). `null` o ausente = no se pudo leer.
 */
export function mensajeCobrosDelDia(
  cobros: readonly CobroDelDia[],
  mas90: ReadonlyMap<string, number | null>,
): string | null {
  type Fila = { empresa: string; monto: number };
  type Cliente = { cliente: string; codigo: string; filas: Map<string, Fila> };
  const porCliente = new Map<string, Cliente>();
  for (const c of cobros.filter(cobroCuenta)) {
    const codigo = c.codigo.trim();
    const g = porCliente.get(codigo) ?? { cliente: c.cliente.trim() || codigo, codigo, filas: new Map<string, Fila>() };
    const f = g.filas.get(c.empresa) ?? { empresa: c.empresa, monto: 0 };
    f.monto += c.monto;
    g.filas.set(c.empresa, f);
    porCliente.set(codigo, g);
  }
  const totalDe = (g: Cliente) => [...g.filas.values()].reduce((s, f) => s + f.monto, 0);
  const clientes = [...porCliente.values()].sort((a, b) => totalDe(b) - totalDe(a) || a.cliente.localeCompare(b.cliente));
  const total = clientes.reduce((s, g) => s + totalDe(g), 0);
  // Sin cobros, o con lo cobrado y lo devuelto cancelándose, no se manda nada
  // (Daniel, 6-oct-2026: «si el total queda en cero, no se manda nada»).
  if (clientes.length === 0 || Math.round(total) === 0) return null;

  const renglon = (codigo: string, f: Fila) => {
    const q = mas90.get(llaveMas90(f.empresa, codigo));
    // 26-nov-2026 (Daniel): al día = solo el monto, sin «· al día ✓».
    const estado = q == null ? "+90 sin actualizar" : Math.round(q) > 0 ? `le quedan +90 d ${usd(q)}` : "";
    return `– ${nombreCortoEmpresa(f.empresa)} · ${usd(f.monto)}${estado ? ` · ${estado}` : ""}`;
  };
  const n = clientes.length;
  return [
    `<b>💰 Cobros · ${usd(total)}</b>`,
    ...clientes.slice(0, MAX_COBROS_EN_AVISO).map((g) =>
      [
        `<b>${escHtml(g.cliente)} · ${usd(totalDe(g))}</b>`,
        ...[...g.filas.values()].sort((a, b) => b.monto - a.monto).map((f) => renglon(g.codigo, f)),
      ].join("\n"),
    ),
    ...(n > MAX_COBROS_EN_AVISO ? [`y ${n - MAX_COBROS_EN_AVISO} más · Ver en CxC ${URL_CXC}`] : []),
  ].join("\n\n");
}
