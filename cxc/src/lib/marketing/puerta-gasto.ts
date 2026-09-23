// ============================================================================
// Marketing — LA PUERTA «＋ Gasto» (pieza A del rediseño, 22-sep-2026).
// Módulo PURO: sin React, sin Supabase, sin fetch.
//
// Daniel, textual: *«para meter un gasto poner un botón de agregar gasto y
// automáticamente se guardó en el cliente que está y ya»* · *«reportar gasto,
// estilo reclamos que esta claro todo»* · *«cada gasto se le carga a una
// marca, sin repartir»* · *«si es de una tienda [la tienda] es obligatoria»* ·
// *«hay gastos o muebles que son para tienda pero no quiero reportar como
// gastos pero saber que existen»* (= «Se reporta a la marca» apagado).
//
// Lo que acá vive, y en ningún otro lado:
//   · El INTERRUPTOR. En `false`, «Registrar gasto» es la pantalla de antes
//     campo por campo, y el servidor escribe lo de siempre.
//   · Los TRES tipos que la puerta ofrece, derivados de `gasto.ts` (la lista
//     cerrada), nunca escritos dos veces.
//   · Qué le falta al gasto para poder seguir, dicho con todas las letras al
//     lado del botón apagado («Falta: la marca y la tienda»), con el patrón
//     de Préstamos (`prestamos-registrar.ts`) y de Guías.
//   · Cómo se leen del cuerpo de la petición las tres columnas del rediseño
//     (`se_reporta` · `tienda_codigo` · `nota`) para que las tres puertas del
//     servidor las escriban IGUAL. Ausentes = no se escriben = como hoy.
//   · El error del duplicado, con nombre, para que la ruta conteste 400 y la
//     pantalla lo diga en español simple. El freno mismo (proveedor
//     normalizado + monto + fecha) es `duplicado.ts`; acá solo se le pone
//     nombre al error.
//
// 🔴 `proyecto_id` NO aparece acá: la tienda es del gasto (`gasto.ts`).
// ============================================================================

import { unirEnHumano } from "@/lib/guias/falta-para-despachar";
import { mensajeDuplicado, type HuellaDeGasto } from "./duplicado";
import {
  ROTULO_DE_TIPO,
  SE_REPORTA_POR_DEFECTO,
  TIENDA_GENERAL,
  TIPOS_DE_GASTO,
  esTipoDeGasto,
  seReportaDe,
  type TipoGasto,
} from "./gasto";

/**
 * 🔴 EL INTERRUPTOR — un solo lugar. Nació PRENDIDO (22-sep-2026) para que
 * Daniel lo pruebe en producción con su secretaria. En `false`:
 *   · `RegistrarGastoModal` vuelve a ser la pantalla de antes, entera.
 *   · El freno de duplicados del servidor NO corre (hoy solo avisa por número).
 * Las columnas del rediseño se escriben SOLO si la pantalla las manda, y la
 * pantalla de antes no las manda: apagar el interruptor deja el servidor como
 * estaba.
 */
export const MARKETING_PUERTA_GASTO = true;

// ─── LOS TRES TIPOS, COMO SE OFRECEN ─────────────────────────────────────────

export interface OpcionDeTipo {
  key: TipoGasto;
  titulo: string;
}

/**
 * Las tarjetas del primer paso, en el orden de `TIPOS_DE_GASTO`. Derivadas, no
 * escritas: si un día entra un cuarto tipo a `gasto.ts`, aparece solo; si uno
 * se retira, desaparece solo. Sin bajada explicativa: el rótulo ya lo dice.
 */
export const OPCIONES_DE_TIPO: ReadonlyArray<OpcionDeTipo> = TIPOS_DE_GASTO.map(
  (key) => ({ key, titulo: ROTULO_DE_TIPO[key] }),
);

// ─── LO QUE LA PUERTA PREGUNTA ANTES DEL FORMULARIO ──────────────────────────

/** Lo que la persona contesta en el paso «de quién es», tal como se teclea. */
export interface DatosDelGasto {
  /** `mk_marcas.id`. "" = todavía no eligió. */
  marcaId: string;
  /** true = es de una tienda (y entonces la tienda es obligatoria); false = «General». */
  esDeTienda: boolean;
  /** Código del directorio (D-25). "" hasta que se elija. */
  tiendaCodigo: string;
  /** El nombre como lo escribe el directorio, para enseñarlo. */
  tiendaNombre: string;
  /** «Se reporta a la marca». Nace prendido. */
  seReporta: boolean;
  /** Qué fue («Apertura», «Remodelación»). Libre y opcional. */
  nota: string;
}

/**
 * Con qué arranca el paso. La casilla nace PRENDIDA (`SE_REPORTA_POR_DEFECTO`).
 * La factura y el mueble arrancan «de una tienda» (lo más común); el pago de
 * impulsadora arranca en «General» (medido: el 72 % de lo abierto sin tienda
 * son impulsadoras y muebles de Boston). Se puede cambiar en la pantalla.
 */
export function datosPorDefecto(
  tipo: TipoGasto,
  base: Partial<DatosDelGasto> = {},
): DatosDelGasto {
  return {
    marcaId: "",
    esDeTienda: tipo !== "impulsadora",
    tiendaCodigo: "",
    tiendaNombre: "",
    seReporta: SE_REPORTA_POR_DEFECTO,
    nota: "",
    ...base,
  };
}

export type FaltanteDeLaPuerta = "tipo" | "impulsadora" | "marca" | "tienda";

/**
 * Qué falta para tocar «Continuar». Lista vacía = se puede.
 *
 *   · Sin tipo no hay formulario que abrir.
 *   · En un pago de impulsadora la MARCA es la de ella (una sola, por
 *     `exigirUnaMarca` en `impulsadoras.ts`): lo que falta es a quién se le
 *     paga, no la marca.
 *   · En factura y mueble la marca es obligatoria.
 *   · La tienda solo se exige si el gasto «es de una tienda»; «General» no
 *     pide nada.
 */
export function queFaltaEnLaPuerta(e: {
  tipo: unknown;
  datos: DatosDelGasto;
  impulsadoraId?: string | null;
}): FaltanteDeLaPuerta[] {
  const out: FaltanteDeLaPuerta[] = [];
  if (!esTipoDeGasto(e.tipo)) return ["tipo"];
  if (e.tipo === "impulsadora") {
    if (String(e.impulsadoraId ?? "").trim() === "") out.push("impulsadora");
  } else if (e.datos.marcaId.trim() === "") {
    out.push("marca");
  }
  if (e.datos.esDeTienda && e.datos.tiendaCodigo.trim() === "") out.push("tienda");
  return out;
}

const NOMBRE_FALTANTE: Readonly<Record<FaltanteDeLaPuerta, string>> = {
  tipo: "qué tipo de gasto es",
  impulsadora: "a quién le pagas",
  marca: "la marca",
  tienda: "la tienda",
};

/** «Falta: la marca» · «Falta: la marca y la tienda». Sin faltantes, "". */
export function textoFaltaEnLaPuerta(faltantes: readonly FaltanteDeLaPuerta[]): string {
  if (faltantes.length === 0) return "";
  return `Falta: ${unirEnHumano(faltantes.map((f) => NOMBRE_FALTANTE[f]))}`;
}

/** La línea de arriba del formulario: «Tommy Hilfiger · City Mall (D-25) · No se reporta». */
export function resumenDelGasto(d: DatosDelGasto, marcaNombre: string | null): string {
  const partes: string[] = [];
  if (marcaNombre) partes.push(marcaNombre);
  if (d.esDeTienda && d.tiendaCodigo.trim()) {
    const nombre = d.tiendaNombre.trim();
    partes.push(nombre ? `${nombre} (${d.tiendaCodigo.trim()})` : d.tiendaCodigo.trim());
  } else {
    partes.push(TIENDA_GENERAL);
  }
  if (!d.seReporta) partes.push("No se reporta");
  return partes.join(" · ");
}

// ─── LO QUE VIAJA AL SERVIDOR ────────────────────────────────────────────────

/** Las tres columnas del rediseño, como las manda la pantalla en el cuerpo. */
export interface DatosDelGastoParaGuardar {
  tiendaCodigo: string | null;
  seReporta: boolean;
  nota: string | null;
}

export function paraGuardar(d: DatosDelGasto): DatosDelGastoParaGuardar {
  const tienda = d.esDeTienda ? d.tiendaCodigo.trim().toUpperCase() : "";
  const nota = d.nota.replace(/\s+/g, " ").trim();
  return {
    tiendaCodigo: tienda.length > 0 ? tienda : null,
    seReporta: d.seReporta !== false,
    nota: nota.length > 0 ? nota : null,
  };
}

/** Lo que una ruta recibe (sin confiar en el tipo: viene de afuera). */
export interface ColumnasDelGastoInput {
  seReporta?: unknown;
  tiendaCodigo?: unknown;
  nota?: unknown;
}

/** Las columnas ya con su nombre de base, listas para el `insert`/`update`. */
export interface ColumnasDelGasto {
  se_reporta?: boolean;
  tienda_codigo?: string | null;
  nota?: string | null;
}

/**
 * 🔴 UNA sola lectura para las tres puertas del servidor (factura · entrega ·
 * pago de impulsadora). Solo entra lo que VINO: una clave ausente no se
 * escribe, así la pantalla de antes —que no manda nada— deja la base como
 * hoy y el DEFAULT de la columna (`se_reporta = true`) hace su trabajo.
 *
 *   · `seReporta`: solo un `false` explícito apaga (`seReportaDe`).
 *   · `tiendaCodigo`: recortado y en mayúsculas; vacío = `null` = General.
 *   · `nota`: espacios colapsados; vacía = `null`.
 */
export function columnasDelGasto(input: ColumnasDelGastoInput): ColumnasDelGasto {
  const out: ColumnasDelGasto = {};
  if (input.seReporta !== undefined) out.se_reporta = seReportaDe(input.seReporta);
  if (input.tiendaCodigo !== undefined) {
    const t = String(input.tiendaCodigo ?? "").trim().toUpperCase();
    out.tienda_codigo = t.length > 0 ? t : null;
  }
  if (input.nota !== undefined) {
    const n = String(input.nota ?? "").replace(/\s+/g, " ").trim();
    out.nota = n.length > 0 ? n : null;
  }
  return out;
}

/** ¿Vino alguna de las tres? (Si no, no hay reintento «sin columnas» que hacer.) */
export function traeColumnasDelGasto(cols: ColumnasDelGasto): boolean {
  return Object.keys(cols).length > 0;
}

// ─── EL DUPLICADO, CON NOMBRE ────────────────────────────────────────────────

/**
 * El error que frena un gasto igual a otro que ya está. Con nombre para que la
 * ruta lo reconozca y conteste 400 con `duplicado: true`, y la pantalla lo
 * diga tal cual: «Ya existe un gasto de X por $Y del Z para <tienda> (N° …).
 * No se guarda dos veces.» — la tienda entró el 23-sep-2026 con la llave.
 */
export class ErrorGastoDuplicado extends Error {
  readonly existente: HuellaDeGasto & { id?: string; numero?: string | null };
  constructor(existente: HuellaDeGasto & { id?: string; numero?: string | null }) {
    super(mensajeDuplicado(existente));
    this.name = "ErrorGastoDuplicado";
    this.existente = existente;
  }
}

export function esErrorDeDuplicado(e: unknown): e is ErrorGastoDuplicado {
  return e instanceof ErrorGastoDuplicado || (e instanceof Error && e.name === "ErrorGastoDuplicado");
}

/** El mensaje cuando la tienda que mandó la pantalla no está en el directorio. */
export function mensajeTiendaDesconocida(codigo: string): string {
  return `La tienda ${codigo} no está en el directorio. Elígela de la lista o deja el gasto en ${TIENDA_GENERAL}.`;
}
