// ─────────────────────────────────────────────────────────────────────────────
// GUÍA › CADA FACTURA AMARRADA A SWITCH (25-nov-2026, Daniel: «sí, los tres»).
// Las reglas, PURAS: las leen la pantalla y el servidor.
//
//   1. Al COMPLETAR (despachar) una guía, cada número de factura de cada
//      renglón tiene que ser una factura de Switch de la MISMA empresa y del
//      MISMO cliente (si el renglón tiene código), o «Traslado». Lo que no
//      aparece se señala y no se completa. Guardar la guía NO se frena: la
//      factura de hoy puede bajar de Switch después (13 renglones del último
//      mes se facturaron después de crear su guía).
//   2. Se compara como el resto del módulo: últimos 4 dígitos (`claveDeFactura`).
//      «0000» ya no vale: es «Traslado».
//   3. 🔑 Lo que el sistema no puede saber, no lo frena: empresas fuera de las 6
//      del grupo (Boston, Multifashion) no tienen facturas para comparar.
//   4. Al completar, las etiquetas pendientes de esas facturas (misma empresa,
//      últimos 4 dígitos) pasan solas a «ya salió» en esa guía.
//
// Medido el 25-nov-2026 sobre las 34 guías del último mes: 217 de 218 números
// existen; el que no (GT-313, 2943) era la 2643 mal escrita.
// ─────────────────────────────────────────────────────────────────────────────

import { B2B_EMPRESA_KEYS, mapEmpresaName } from "@/lib/empresa-mapping";
import { claveDeFactura } from "./numero-factura";
import { esTraslado } from "./atajos-facturas";

/** 🔴 PRENDIDO (25-nov-2026). `false` = las facturas se escriben sin revisar, como antes. */
export const GUIA_AMARRE_FACTURAS_2026_11 = true;

export interface RenglonParaAmarrar {
  id?: string | null;
  /** Nombre de display («Fashion Shoes»), como lo guarda `guia_items.empresa`. */
  empresa?: string | null;
  cliente?: string | null;
  cliente_codigo?: string | null;
  facturas?: string | null;
}

/** Una factura de Switch, con el código del cliente que la compró. */
export interface FacturaDeSwitch {
  empresa_key: string;
  secuencial: string;
  cliente_codigo: string | null;
}

export type TipoParte = "ok" | "traslado" | "falta" | "sin_dato";

export interface ParteDelRenglon {
  texto: string;
  tipo: TipoParte;
  factura?: FacturaDeSwitch;
}

/** «2612, 2643» → ["2612", "2643"]. */
export function partesDeFacturas(texto: string | null | undefined): string[] {
  return (texto ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** La empresa del grupo de un renglón, o `null` si no es de las 6 (no hay con qué comparar). */
export function empresaKeyDelRenglon(empresa: string | null | undefined): string | null {
  const n = (empresa ?? "").trim();
  return B2B_EMPRESA_KEYS.find((k) => mapEmpresaName(k) === n || k === n) ?? null;
}

/**
 * Cada número del renglón: amarrado (`ok`), `traslado`, `falta`, o `sin_dato`
 * (empresa fuera del grupo, o no se pudo leer Switch: no se afirma nada).
 * `facturas = null` = no se pudo leer.
 */
export function partesDelRenglon(r: RenglonParaAmarrar, facturas: readonly FacturaDeSwitch[] | null): ParteDelRenglon[] {
  const key = empresaKeyDelRenglon(r.empresa);
  const codigo = (r.cliente_codigo ?? "").trim();
  return partesDeFacturas(r.facturas).map((texto) => {
    if (esTraslado(texto)) return { texto, tipo: "traslado" };
    if (!key || !facturas) return { texto, tipo: "sin_dato" };
    const clave = claveDeFactura(texto);
    const f = clave
      ? facturas.find((x) => x.empresa_key === key && claveDeFactura(x.secuencial) === clave && (!codigo || x.cliente_codigo === codigo))
      : undefined;
    return f ? { texto, tipo: "ok", factura: f } : { texto, tipo: "falta" };
  });
}

/** «Renglón 10: la factura 2943 no está en Fashion Shoes». Vacío = se puede completar. */
export function sinAmarre(renglones: readonly RenglonParaAmarrar[], facturas: readonly FacturaDeSwitch[] | null): string[] {
  if (!GUIA_AMARRE_FACTURAS_2026_11) return [];
  return renglones.flatMap((r, i) =>
    partesDelRenglon(r, facturas)
      .filter((p) => p.tipo === "falta")
      .map((p) => `Renglón ${i + 1}: la factura ${p.texto} no está en ${r.empresa || "esa empresa"}${(r.cliente_codigo ?? "").trim() ? ` para ${r.cliente || r.cliente_codigo}` : ""}`),
  );
}

/** Lo que dice la pantalla y contesta el servidor cuando falta amarrar. */
export function textoSinAmarre(faltan: readonly string[]): string {
  if (faltan.length === 0) return "";
  const n = faltan.length === 1 ? "1 factura" : `${faltan.length} facturas`;
  return `Falta amarrar ${n} — ${faltan.join(" · ")}. Selecciona la factura del cliente o marca Traslado.`;
}

/** Las claves (últimos 4 dígitos) que hay que buscar en Switch, por empresa del grupo. */
export function clavesPorEmpresa(renglones: readonly RenglonParaAmarrar[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const r of renglones) {
    const key = empresaKeyDelRenglon(r.empresa);
    if (!key) continue;
    for (const t of partesDeFacturas(r.facturas)) {
      const c = esTraslado(t) ? "" : claveDeFactura(t);
      if (c) m.set(key, (m.get(key) ?? new Set()).add(c));
    }
  }
  return m;
}

// ─── Al completar: las etiquetas pendientes pasan a «ya salió» ─────────────────

export interface EtiquetaPendiente {
  id: number;
  empresa_key: string | null;
  secuencial: string;
}

/**
 * Cada etiqueta pendiente que sale en esta guía → el renglón que lleva su
 * factura (misma empresa, últimos 4 dígitos). Si dos renglones la llevan, el
 * primero. El MISMO criterio que la limpieza del 25-nov-2026.
 */
export function etiquetasQueSalen(
  renglones: readonly RenglonParaAmarrar[],
  etiquetas: readonly EtiquetaPendiente[],
): Array<{ etiquetaId: number; renglonId: string }> {
  const fuera: Array<{ etiquetaId: number; renglonId: string }> = [];
  for (const e of etiquetas) {
    const clave = claveDeFactura(e.secuencial);
    if (!clave || !e.empresa_key) continue;
    const r = renglones.find(
      (x) =>
        !!x.id &&
        empresaKeyDelRenglon(x.empresa) === e.empresa_key &&
        partesDeFacturas(x.facturas).some((t) => !esTraslado(t) && claveDeFactura(t) === clave),
    );
    if (r?.id) fuera.push({ etiquetaId: e.id, renglonId: r.id });
  }
  return fuera;
}
