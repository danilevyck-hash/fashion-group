// ─────────────────────────────────────────────────────────────────────────────
// 🔒 EL RESUMEN DEL DÍA (24-nov-2026, aprobado por Daniel). Módulo PURO; el I/O
// vive en `resumen-del-dia-io.ts` y lo manda el cron `cobros-del-dia` a las
// 7:00 p. m. de Panamá, al chat privado (`enviarNegocioPrivado`).
//
// TRES mensajes (26-nov-2026; eran uno), en este orden, y el vacío no sale:
//   🧾 Ventas de hoy — las 6 de Fashion Group, sin ITBMS (`subtotal_descuento`,
//      la MISMA columna y los MISMOS signos de Ventas › Resumen), NC restadas.
//   🚚 Despachos de hoy — guías que pasaron a «Completada» hoy.
//   💰 Cobros de hoy — `lib/cxc/cobros-del-dia.ts` (por cliente, +90 de Switch al momento).
//
// `RESUMEN_DEL_DIA_2026_11 = false` = lo de antes: un mensaje por guía al
// despacharla y el cron manda solo los cobros.
// ─────────────────────────────────────────────────────────────────────────────

import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { CLIENTES_FUERA, escHtml } from "@/lib/cxc/cobros-del-dia";
import { signoVenta } from "@/lib/ventas/tipos-comprobante";
import { nombreSinGritar } from "@/lib/cxc/nombre-cliente";

export const RESUMEN_DEL_DIA_2026_11 = true;

/** Tope de Telegram por mensaje. */
export const TOPE_TELEGRAM = 4096;

/** `$12,300` · `−$288` — pesos enteros, como el bloque de cobros. */
const usd = (n: number) => {
  const r = Math.round(n);
  return `${r < 0 ? "−" : ""}$${Math.abs(r).toLocaleString("en-US")}`;
};
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** `2026-11-26` → `jue 26 nov`. */
export function fechaDelTitulo(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

// ── 🧾 Ventas ────────────────────────────────────────────────────────────────

export interface FacturaDelDia {
  empresa: string; // empresa_key
  codigo: string | null; // switch_clientes.codigo
  cliente: string | null; // como lo escribe Switch
  tipo: string;
  subtotal: number; // subtotal_descuento (sin ITBMS), siempre positivo
}

/**
 * 🔒 26-nov-2026 (Daniel): tres mensajes, sin números de factura, títulos en
 * negrita (HTML) y renglones con «– ». El cliente va por su NETO del día (factura
 * y nota de crédito ya restadas); el que queda en $0 no sale; los negativos, tal cual.
 */
export function bloqueFacturas(facturas: readonly FacturaDelDia[], fecha: string): string | null {
  type Cli = { nombre: string; total: number };
  const porEmpresa = new Map<string, Map<string, Cli>>();
  let total = 0;
  let n = 0;
  for (const f of facturas) {
    const signo = signoVenta(f.tipo);
    if (signo === 0) continue;
    const codigo = (f.codigo ?? "").trim();
    if (CLIENTES_FUERA.includes(codigo.toUpperCase())) continue;
    const monto = signo * (Number(f.subtotal) || 0);
    total += monto;
    n += 1;
    const clientes = porEmpresa.get(f.empresa) ?? new Map<string, Cli>();
    const llave = codigo || `?${f.cliente ?? ""}`;
    const c = clientes.get(llave) ?? { nombre: (f.cliente ?? "").trim() || codigo || "Sin cliente", total: 0 };
    c.total += monto;
    clientes.set(llave, c);
    porEmpresa.set(f.empresa, clientes);
  }
  if (n === 0) return null;

  const grupos = [...porEmpresa]
    .map(([emp, m]) => {
      const vivos = [...m.values()].filter((c) => Math.round(c.total) !== 0);
      return { emp, vivos, suma: [...m.values()].reduce((s, c) => s + c.total, 0) };
    })
    .filter((g) => g.vivos.length > 0)
    .sort((a, b) => b.suma - a.suma);
  return [
    `<b>🧾 Ventas · ${fechaDelTitulo(fecha)}</b>\n<b>${usd(total)}</b>`,
    ...grupos.map((g) =>
      [
        `<b>${escHtml(nombreCortoEmpresa(g.emp))} · ${usd(g.suma)}</b>`,
        ...g.vivos
          .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre))
          .map((c) => `– ${escHtml(c.nombre)} · ${usd(c.total)}`),
      ].join("\n"),
    ),
  ].join("\n\n");
}

// ── 🚚 Despachos ─────────────────────────────────────────────────────────────

export interface RenglonDespacho {
  empresa: string | null; // guia_items.empresa — nombre largo («Vistana International»)
  codigo: string | null;
  cliente: string | null;
  facturas: string | null;
  bultos: number | null;
}
export interface GuiaDespachada {
  numero: string | number | null;
  transportista: string; // `transportistaLabel` («Entrega directa» o el nombre)
  renglones: readonly RenglonDespacho[];
}

export function bloqueDespachos(guias: readonly GuiaDespachada[], fecha: string): string | null {
  if (guias.length === 0) return null;
  let bultos = 0;
  const bloques = [...guias]
    .sort((a, b) => Number(a.numero) - Number(b.numero))
    .map((g) => {
      const porCliente = new Map<string, { nombre: string; bultos: number }>();
      let suma = 0;
      for (const r of g.renglones) {
        const b = Number(r.bultos) || 0;
        suma += b;
        const llave = (r.codigo ?? "").trim() || `?${r.cliente ?? ""}`;
        const c = porCliente.get(llave) ?? { nombre: nombreSinGritar(r.cliente) || "Sin cliente", bultos: 0 };
        c.bultos += b;
        porCliente.set(llave, c);
      }
      bultos += suma;
      return [
        `<b>Guía ${escHtml(String(g.numero ?? "—"))} · ${escHtml(g.transportista || "—")} · ${plural(suma, "bulto", "bultos")}</b>`,
        ...[...porCliente.values()]
          .sort((a, b) => b.bultos - a.bultos || a.nombre.localeCompare(b.nombre))
          .map((c) => `– ${escHtml(c.nombre)} · ${c.bultos}`),
      ].join("\n");
    });
  return [`<b>🚚 Despachos · ${fechaDelTitulo(fecha)}</b>\n${plural(guias.length, "guía", "guías")} · ${plural(bultos, "bulto", "bultos")}`, ...bloques].join("\n\n");
}

// ── Unir y partir ────────────────────────────────────────────────────────────

/** Las secciones que tengan algo, cada una como SU mensaje y en su orden. */
export function resumenDelDia(bloques: readonly (string | null)[]): string[] {
  return bloques.filter((b): b is string => !!b);
}

/**
 * Parte el texto en mensajes de hasta `tope` caracteres, primero por párrafo,
 * después por línea; nada se descarta. Una línea más larga que el tope (no
 * pasa) se corta en pedazos del tope.
 */
export function partirParaTelegram(texto: string, tope = TOPE_TELEGRAM): string[] {
  const juntar = (partes: string[], sep: string): string[] => {
    const out: string[] = [];
    let actual = "";
    for (const p of partes) {
      if (actual && actual.length + sep.length + p.length > tope) {
        out.push(actual);
        actual = p;
      } else actual = actual ? actual + sep + p : p;
    }
    if (actual) out.push(actual);
    return out;
  };
  const piezas = texto.split("\n\n").flatMap((p) => {
    if (p.length <= tope) return [p];
    const lineas = p.split("\n").flatMap((l) => (l.length <= tope ? [l] : l.match(new RegExp(`[\\s\\S]{1,${tope}}`, "g")) ?? []));
    return juntar(lineas, "\n");
  });
  return juntar(piezas, "\n\n");
}
