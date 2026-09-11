/* ─────────────────────────────────────────────────────────────────────────────
 * «NO DESCONTAR EL PRÉSTAMO ESTA QUINCENA» — los tres estados de la casilla.
 *
 * Módulo PURO: sin base, sin red, sin `new Date()`.
 *
 * Daniel (11-sep-2026): *«sí»* a poder saltarse una quincena.
 *
 * ── 🩸 QUÉ VINO A ARREGLAR ──────────────────────────────────────────────────
 *
 * Desde el 11-sep-2026 la cuota del préstamo entra sola a la casilla de la
 * planilla y lo escrito a mano manda. Pero la columna era `NOT NULL DEFAULT 0`
 * y el 0 se leía como «vacío → va la cuota»: borrar la casilla traía la cuota,
 * escribir 0 traía la cuota. No había forma de decir «esta quincena, nada».
 * El único camino era bajar la cuota en la ficha del módulo y volver a subirla
 * la quincena siguiente — dos ediciones de un dato permanente para una decisión
 * de una sola quincena.
 *
 * ── 🔴 LOS TRES ESTADOS (migración 20261115120000) ──────────────────────────
 *
 *     null   → «vacía»          nadie escribió nada: va la cuota que propone Préstamos
 *     0      → «sin-descontar»  escrito a propósito: ESTA quincena no se descuenta
 *     monto  → «escrita»        escrito a mano: se descuenta ESE monto, no la cuota
 *
 * Vale para las DOS casillas con cuota automática: «Préstamo» y «Terceros».
 * «Mercancía», «ISR» y «Otros servicios» no proponen cuota, así que en ellas
 * 0 y vacío dicen lo mismo y siguen siendo `number`.
 *
 * 🔑 Dónde se decide: en la FILA de la planilla, que es donde la contadora está
 * cuando decide. La ficha del préstamo (`/prestamos/[id]`) y «Anotar abono» no
 * se tocan. Y el cierre respeta el 0: no anota pago (ver `cierre-prestamo.ts`).
 * ────────────────────────────────────────────────────────────────────────── */

import type { ManualesLinea } from "./planilla";

/** Las dos casillas que Préstamos llena solo. */
export const CASILLAS_AUTOMATICAS = ["prestamo", "terceros"] as const;
export type CasillaAutomatica = (typeof CASILLAS_AUTOMATICAS)[number];

export function esCasillaAutomatica(campo: keyof ManualesLinea): campo is CasillaAutomatica {
  return (CASILLAS_AUTOMATICAS as readonly string[]).includes(campo);
}

export type EstadoCasilla = "vacia" | "sin-descontar" | "escrita";

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

/**
 * Qué dice la casilla. `null`, basura o un negativo = vacía (en la duda, la
 * cuota de siempre); un 0 exacto = «esta quincena no»; un monto = ese monto.
 *
 * 🔑 El 0 se compara al centavo: `0.004` es 0 y `0.01` es un monto.
 */
export function estadoCasilla(escrito: number | null | undefined): EstadoCasilla {
  const x = num(escrito);
  if (x === null || x < 0) return "vacia";
  if (Math.round(x * 100) === 0) return "sin-descontar";
  return "escrita";
}

/**
 * Lo que se guarda a partir de lo que la persona TECLEÓ en una casilla.
 *
 *   · casilla automática: vacío → `null` (vuelve la cuota) · «0» → 0 (no se
 *     descuenta) · «50» → 50 · basura o negativo → `null`.
 *   · las otras tres: como siempre — un monto > 0, o 0.
 *
 * Es UNA función para la pantalla y para `normalizarManuales`: lo que se
 * guarda y lo que se suma no pueden separarse.
 */
export function valorTecleado(campo: keyof ManualesLinea, texto: unknown): number | null {
  const t = String(texto ?? "").trim().replace(",", ".");
  const x = num(t);
  if (esCasillaAutomatica(campo)) {
    if (x === null || x < 0) return null;
    return Math.round(x * 100) === 0 ? 0 : x;
  }
  return x !== null && x > 0 ? x : 0;
}

/** Lo que dice la celda, en gris, cuando la casilla tiene un 0 a propósito. */
export const TEXTO_SIN_DESCONTAR = "No se descuenta esta quincena";

/** El `title` de esa celda: cómo se deshace. */
export const TITULO_SIN_DESCONTAR =
  "Escribiste 0: esta quincena no se le descuenta. Borra el 0 para que vuelva la cuota.";

/** Una casilla con 0 a propósito, y cuánto era la cuota que NO entró. */
export interface SinDescontar {
  codigo: string;
  etiqueta: string;
  cuenta: CasillaAutomatica;
  /** La cuota que Préstamos proponía y se dejó afuera. Siempre > 0. */
  monto: number;
}

/**
 * Las casillas con un 0 a propósito en un cuadro.
 *
 * 🔑 Solo cuenta donde HABÍA algo que saltar: un 0 en la casilla de alguien
 * sin préstamo no se salta nada, y decir «1 préstamo sin descontar» sobre esa
 * persona sería un aviso falso. El monto que no entró viaja en
 * `prestamoAutomatico.sinDescontar` (lo pone `aplicarPrestamoEnLinea`).
 */
export function prestamosSinDescontar(
  lineas: readonly {
    codigo: string;
    etiqueta: string;
    manuales: ManualesLinea;
    prestamoAutomatico?: { sinDescontar?: { prestamo: number; terceros: number } };
  }[],
): SinDescontar[] {
  const out: SinDescontar[] = [];
  for (const l of lineas) {
    for (const cuenta of CASILLAS_AUTOMATICAS) {
      if (estadoCasilla(l.manuales[cuenta]) !== "sin-descontar") continue;
      const monto = Number(l.prestamoAutomatico?.sinDescontar?.[cuenta] ?? 0);
      if (!(monto > 0)) continue;
      out.push({ codigo: l.codigo, etiqueta: l.etiqueta, cuenta, monto: Math.round(monto * 100) / 100 });
    }
  }
  return out;
}

/**
 * La línea informativa de «Antes de cerrar»:
 * «2 préstamos sin descontar esta quincena, a propósito (Ana Pérez · $50.00 — Luis Parajón · $70.00)».
 * `null` sin ninguno — un cartel permanente se deja de leer.
 */
export function textoSinDescontar(items: readonly SinDescontar[]): string | null {
  if (items.length === 0) return null;
  const detalle = items
    .map((s) => `${s.etiqueta}${s.cuenta === "terceros" ? " (terceros)" : ""} · $${s.monto.toFixed(2)}`)
    .join(" — ");
  const cabeza = items.length === 1
    ? "préstamo sin descontar esta quincena, a propósito"
    : "préstamos sin descontar esta quincena, a propósito";
  return `${cabeza} (${detalle})`;
}
