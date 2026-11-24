// ─────────────────────────────────────────────────────────────────────────────
// 🔒 EL RESUMEN DEL DÍA (24-nov-2026, aprobado por Daniel). Módulo PURO; el I/O
// vive en `resumen-del-dia-io.ts` y lo manda el cron `cobros-del-dia` a las
// 7:00 p. m. de Panamá, al chat privado (`enviarNegocioPrivado`).
//
// UN solo mensaje con tres bloques, en este orden, y el vacío no sale:
//   🧾 Facturas de hoy — las 6 de Fashion Group, sin ITBMS (`subtotal_descuento`,
//      la MISMA columna y los MISMOS signos de Ventas › Resumen), NC restadas.
//   🚚 Despachos de hoy — guías que pasaron a «Completada» hoy.
//   💰 Cobros de hoy — el bloque de siempre (`lib/cxc/cobros-del-dia.ts`), sin
//      cambiar su texto.
//
// `RESUMEN_DEL_DIA_2026_11 = false` = lo de antes: un mensaje por guía al
// despacharla y el cron manda solo los cobros.
// ─────────────────────────────────────────────────────────────────────────────

import { nombreCortoEmpresa, EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { CLIENTES_FUERA } from "@/lib/cxc/cobros-del-dia";
import { signoVenta } from "@/lib/ventas/tipos-comprobante";
import { facturasParaMostrar } from "@/lib/guias/numero-factura";
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

// ── 🧾 Facturas ──────────────────────────────────────────────────────────────

export interface FacturaDelDia {
  empresa: string; // empresa_key
  codigo: string | null; // switch_clientes.codigo
  cliente: string | null; // como lo escribe Switch
  tipo: string;
  subtotal: number; // subtotal_descuento (sin ITBMS), siempre positivo
}

export function bloqueFacturas(facturas: readonly FacturaDelDia[]): string | null {
  type Cli = { nombre: string; total: number };
  const porEmpresa = new Map<string, Map<string, Cli>>();
  let total = 0;
  let nFacturas = 0;
  let nNC = 0;
  let montoNC = 0;
  for (const f of facturas) {
    const signo = signoVenta(f.tipo);
    if (signo === 0) continue;
    const codigo = (f.codigo ?? "").trim();
    if (CLIENTES_FUERA.includes(codigo.toUpperCase())) continue;
    const monto = signo * (Number(f.subtotal) || 0);
    total += monto;
    if (signo < 0) {
      nNC += 1;
      montoNC += -monto;
    } else nFacturas += 1;
    const clientes = porEmpresa.get(f.empresa) ?? new Map<string, Cli>();
    const llave = codigo || `?${f.cliente ?? ""}`;
    const c = clientes.get(llave) ?? { nombre: (f.cliente ?? "").trim() || codigo || "Sin cliente", total: 0 };
    c.total += monto;
    clientes.set(llave, c);
    porEmpresa.set(f.empresa, clientes);
  }
  if (nFacturas + nNC === 0) return null;

  const encabezado =
    `🧾 Facturas de hoy · ${usd(total)} · ${plural(nFacturas, "factura", "facturas")}` +
    (nNC ? ` (ya restadas ${plural(nNC, "nota de crédito", "notas de crédito")} · ${usd(montoNC)})` : "");
  const suma = (m: Map<string, Cli>) => [...m.values()].reduce((s, c) => s + c.total, 0);
  const empresas = [...porEmpresa].sort((a, b) => suma(b[1]) - suma(a[1]));
  return [
    encabezado,
    ...empresas.map(([emp, clientes]) =>
      [
        `${nombreCortoEmpresa(emp)} · ${usd(suma(clientes))}`,
        ...[...clientes.values()]
          .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre))
          .map((c) => `• ${c.nombre} · ${usd(c.total)}`),
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
  transportista: string; // `transportistaLabel` («Entrega directa» o el nombre)
  renglones: readonly RenglonDespacho[];
}

const CLAVE_DE_NOMBRE = new Map(Object.entries(EMPRESA_KEY_TO_NAME).map(([k, v]) => [v.toLowerCase(), k]));
const empresaCorta = (nombre: string | null) => {
  const n = (nombre ?? "").trim();
  const k = CLAVE_DE_NOMBRE.get(n.toLowerCase());
  return k ? nombreCortoEmpresa(k) : n || "Sin empresa";
};

export function bloqueDespachos(guias: readonly GuiaDespachada[]): string | null {
  type Cli = { nombre: string; transp: string; facturas: string[]; bultos: number };
  const porEmpresa = new Map<string, Map<string, Cli>>();
  let bultos = 0;
  for (const g of guias) {
    for (const r of g.renglones) {
      const b = Number(r.bultos) || 0;
      bultos += b;
      const emp = empresaCorta(r.empresa);
      const clientes = porEmpresa.get(emp) ?? new Map<string, Cli>();
      const llave = `${(r.codigo ?? "").trim() || `?${r.cliente ?? ""}`}|${g.transportista}`;
      const c = clientes.get(llave) ?? { nombre: nombreSinGritar(r.cliente) || "Sin cliente", transp: g.transportista || "—", facturas: [], bultos: 0 };
      const fs = facturasParaMostrar(r.facturas).split(",").map((s) => s.trim()).filter(Boolean);
      c.facturas = [...c.facturas, ...fs.filter((x) => !c.facturas.includes(x))];
      c.bultos += b;
      clientes.set(llave, c);
      porEmpresa.set(emp, clientes);
    }
  }
  if (guias.length === 0) return null;
  const suma = (m: Map<string, Cli>) => [...m.values()].reduce((s, c) => s + c.bultos, 0);
  return [
    `🚚 Despachos de hoy · ${plural(guias.length, "guía", "guías")} · ${plural(bultos, "bulto", "bultos")}`,
    ...[...porEmpresa]
      .sort((a, b) => suma(b[1]) - suma(a[1]))
      .map(([emp, clientes]) =>
        [
          `${emp} · ${plural(suma(clientes), "bulto", "bultos")}`,
          ...[...clientes.values()]
            .sort((a, b) => b.bultos - a.bultos || a.nombre.localeCompare(b.nombre))
            .map((c) =>
              [`• ${c.nombre}`, c.facturas.join(", "), plural(c.bultos, "bulto", "bultos"), c.transp].filter(Boolean).join(" · "),
            ),
        ].join("\n"),
      ),
  ].join("\n\n");
}

// ── Unir y partir ────────────────────────────────────────────────────────────

/** Los bloques que tengan algo, separados por una línea en blanco doble. */
export function resumenDelDia(bloques: readonly (string | null)[]): string | null {
  const vivos = bloques.filter((b): b is string => !!b);
  return vivos.length ? vivos.join("\n\n\n") : null;
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
