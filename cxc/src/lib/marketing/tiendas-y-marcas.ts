// ============================================================================
// Marketing — TIENDAS Y MARCAS: la estructura nueva (23-sep-2026).
// Módulo PURO: sin React, sin Supabase, sin fetch.
//
// Lo que Daniel definió, textual: el gasto *«se registra cuando llega la
// factura del proveedor»*; a la marca se le pasa *«cada 6 meses»*; *«no quiero
// que se enfoque el módulo en [el cobro], sino en registrar bien los gastos
// para pasárselos a la marca»*; Multifashion *«se queda aparte, nunca se le
// cobra a una marca»*.
//
// Entonces son DOS puertas:
//   · TIENDAS — dónde se gasta. Ahí se registra, se edita y se anula. La
//     portada abre acá: TODAS las tiendas con gasto (+ «General»), con el
//     nombre del DIRECTORIO por código, y cada fila lleva a su ficha.
//   · MARCAS  — a quién se le pasa. Es la portada Abiertos | Cerrados que ya
//     existía: se cierra y se manda el ZIP. Adentro de una marca, el período
//     abierto con UNA línea por tienda; sin lista de proyectos.
//
// 🔴 MULTIFASHION ES UNA TIENDA MÁS (D-108) y NO APARECE EN NINGUNA MARCA:
// la regla es UNA (`esTiendaMultifashion`, de `multifashion.ts`) y la leen la
// portada de marcas, la página de la marca, los reportes y el ZIP.
//
// 🔴 NINGÚN NÚMERO CAMBIA, salvo Marcas/Reportes, que dejaban entrar los
// gastos de Multifashion a Tommy y Calvin (medido el 23-sep-2026: $1.319,25 y
// $2.477,58) y ya no. Decisión de Daniel del 22-sep-2026.
//
// 🔴 EL INTERRUPTOR. `true` = portada Tiendas · Marcas · Impulsadoras ·
// Mobiliario, la ficha de la tienda como UNA lista, la marca sin proyectos.
// `false` = la portada, la ficha y el overlay de antes, intactos. Nada de lo
// que se guarda cambia de forma.
// ============================================================================

import { esMultifashion, MULTIFASHION_CODIGOS } from "./multifashion";
import { coincidePorPalabra } from "@/lib/search/texto";
import { ROTULO_DE_TIPO, TIENDA_GENERAL, type TipoGasto } from "./gasto";
import { hrefDeTienda, type FilaDeTienda } from "./vista-tienda";
import { totalesDelPeriodo, type TotalesDelPeriodo } from "./periodo-estado";
import type { ReporteTiendaFila } from "./reportes-rediseno";

/** 🔴 El interruptor. `false` = la portada, la ficha y el overlay de antes. */
export const MARKETING_TIENDAS_Y_MARCAS = true;

// ─── LAS PESTAÑAS DE LA PORTADA ──────────────────────────────────────────────

export const PESTANAS_TIENDAS_Y_MARCAS = ["tiendas", "marcas", "impulsadoras", "mobiliario"] as const;
export type PestanaTiendasYMarcas = (typeof PESTANAS_TIENDAS_Y_MARCAS)[number];

/** La portada ABRE en Tiendas: lo primero que se ve es dónde se gastó. */
export const PESTANA_INICIAL: PestanaTiendasYMarcas = "tiendas";

export const ROTULO_PESTANA_TM: Record<PestanaTiendasYMarcas, string> = {
  tiendas: "Tiendas",
  marcas: "Marcas",
  impulsadoras: "Impulsadoras",
  mobiliario: "Mobiliario",
};

export function esPestanaTiendasYMarcas(v: unknown): v is PestanaTiendasYMarcas {
  return typeof v === "string" && (PESTANAS_TIENDAS_Y_MARCAS as readonly string[]).includes(v);
}

/** La dirección de la portada en una pestaña. Tiendas es la de siempre, sin query. */
export function hrefDePestana(p: PestanaTiendasYMarcas): string {
  return p === PESTANA_INICIAL ? "/marketing" : `/marketing?tab=${p}`;
}

/** Mobiliario es una página propia: la pestaña LLEVA ahí. */
export const HREF_MOBILIARIO = "/marketing/mobiliario";

/**
 * A dónde va una dirección vieja `?vista=`. «Reportes» desapareció de la
 * pantalla: por tienda ES la lista de tiendas, por marca ES la página de la
 * marca. Un valor desconocido cae en la portada.
 */
export function destinoDeVistaVieja(vista: string | null | undefined): string {
  if (vista === "impulsadoras") return hrefDePestana("impulsadoras");
  return hrefDePestana(PESTANA_INICIAL);
}

// ─── MULTIFASHION, UNA SOLA REGLA ────────────────────────────────────────────

/** ¿Este código del directorio es la tienda propia (Multifashion)? */
export function esTiendaMultifashion(codigo: string | null | undefined): boolean {
  const c = String(codigo ?? "").trim().toUpperCase();
  return c.length > 0 && MULTIFASHION_CODIGOS.some((m) => m.toUpperCase() === c);
}

/** El código con el que Multifashion vive en el directorio. */
export const CODIGO_MULTIFASHION = MULTIFASHION_CODIGOS[0];

/**
 * ¿Este gasto es de Multifashion? Por el CÓDIGO de su tienda y, si el gasto
 * no lo trae, por su proyecto (el respaldo de siempre, `esMultifashion`).
 */
export function gastoEsDeMultifashion(g: {
  tiendaCodigo?: string | null;
  proyecto?: { tienda_codigo?: string | null; tienda?: string | null } | null;
}): boolean {
  if (esTiendaMultifashion(g.tiendaCodigo)) return true;
  return !!g.proyecto && esMultifashion(g.proyecto);
}

/** Los gastos que SÍ se le pasan a una marca: todos menos los de la tienda propia. */
export function sinMultifashion<T extends { esTiendaPropia?: boolean | null }>(
  gastos: ReadonlyArray<T>,
): T[] {
  return gastos.filter((g) => g.esTiendaPropia !== true);
}

// ─── LA PORTADA: LAS TIENDAS ─────────────────────────────────────────────────

export interface FilaTienda {
  /** Código del directorio, o `null` para «General». */
  codigo: string | null;
  nombre: string;
  /** Lo reportado, único monto de la fila. */
  total: number;
  noReportado: number;
  cantidad: number;
  /** Reportado por marca (nombre de marca → monto), para la línea gris. */
  porMarca: Record<string, number>;
  esGeneral: boolean;
  esMultifashion: boolean;
  href: string;
}

/**
 * Las filas de la portada, a partir del reporte por tienda (que ya trae el
 * nombre del directorio y «General» al final). Multifashion queda como una
 * tienda más; no se le agrega ni se le quita nada.
 */
export function filasDeTiendas(reporte: ReadonlyArray<ReporteTiendaFila>): FilaTienda[] {
  return reporte.map((r) => {
    const esGeneral = r.tiendaCodigo === null;
    return {
      codigo: r.tiendaCodigo,
      nombre: esGeneral ? TIENDA_GENERAL : r.tienda,
      total: r.total,
      noReportado: r.noReportado,
      cantidad: r.cantidad,
      porMarca: r.porMarca,
      esGeneral,
      esMultifashion: esTiendaMultifashion(r.tiendaCodigo),
      href: hrefDeTienda(r.tiendaCodigo),
    };
  });
}

/** El buscador de arriba: por palabra, sobre el nombre o el código. Vacío = todas. */
export function filtrarTiendas(filas: ReadonlyArray<FilaTienda>, texto: string): FilaTienda[] {
  const t = String(texto ?? "").trim();
  if (t.length === 0) return [...filas];
  return filas.filter((f) => coincidePorPalabra(f.nombre, t) || coincidePorPalabra(f.codigo ?? "", t));
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** La línea gris de cada tienda: el desglose por marca, o qué es. */
export function subtituloDeTienda(f: FilaTienda): string {
  if (f.esGeneral) return `sin tienda · ${plural(f.cantidad, "gasto", "gastos")}`;
  if (f.esMultifashion) {
    return `tienda propia · ${plural(f.cantidad, "gasto", "gastos")} · no se le pasa a ninguna marca`;
  }
  const partes = Object.entries(f.porMarca)
    .filter(([, monto]) => monto !== 0)
    .sort((a, b) => b[1] - a[1])
    .map(([marca, monto]) => `${marca} ${formatoMonto(monto)}`);
  if (partes.length === 0) return plural(f.cantidad, "gasto", "gastos");
  return partes.join(" · ");
}

function formatoMonto(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── LOS ENLACES VIEJOS ──────────────────────────────────────────────────────

/**
 * A dónde lleva un `?proyecto=<id>` viejo: a la ficha de la TIENDA de ese
 * proyecto. Sin código, y si el proyecto es Multifashion por su texto, a
 * D-108; sin nada, a «General».
 */
export function destinoDelProyectoViejo(
  proyecto: { tienda_codigo?: string | null; tienda?: string | null } | null | undefined,
): string {
  if (!proyecto) return hrefDeTienda(null);
  const codigo = String(proyecto.tienda_codigo ?? "").trim().toUpperCase();
  if (codigo.length > 0) return hrefDeTienda(codigo);
  if (esMultifashion(proyecto)) return hrefDeTienda(CODIGO_MULTIFASHION);
  return hrefDeTienda(null);
}

// ─── LA PÁGINA DE LA MARCA: UNA LÍNEA POR TIENDA ─────────────────────────────

/** Una tienda dentro del período de una marca (sale del agregador). */
export interface TiendaDeSeccion {
  codigo: string | null;
  nombre: string;
  monto: number;
  gastos: number;
  href: string;
}

// ─── LA FICHA DE LA TIENDA: UNA SOLA LISTA ───────────────────────────────────

export const FILTRO_TODOS = "todos";
export const FILTRO_ANULADOS = "anulados";

export interface ChipDeLaFicha {
  /** `todos` · el código de una marca · `anulados`. */
  clave: string;
  rotulo: string;
  cantidad: number;
}

/** Los chips: Todos · una por marca (con gasto vivo) · Anulados (si hay). */
export function chipsDeLaFicha(
  vivas: ReadonlyArray<FilaDeTienda>,
  anuladas: ReadonlyArray<FilaDeTienda>,
): ChipDeLaFicha[] {
  const porMarca = new Map<string, { rotulo: string; cantidad: number }>();
  for (const f of vivas) {
    const clave = String(f.marcaCodigo ?? "").trim().toUpperCase() || "—";
    const m = porMarca.get(clave) ?? { rotulo: f.marcaNombre || clave, cantidad: 0 };
    m.cantidad += 1;
    porMarca.set(clave, m);
  }
  const chips: ChipDeLaFicha[] = [{ clave: FILTRO_TODOS, rotulo: "Todos", cantidad: vivas.length }];
  for (const [clave, m] of [...porMarca.entries()].sort((a, b) => b[1].cantidad - a[1].cantidad)) {
    chips.push({ clave, rotulo: m.rotulo, cantidad: m.cantidad });
  }
  if (anuladas.length > 0) chips.push({ clave: FILTRO_ANULADOS, rotulo: "Anulados", cantidad: anuladas.length });
  return chips;
}

/** Lo más nuevo primero; el empate se rompe por id para que no baile. */
export function ordenarPorFecha<T extends { fecha: string; id: string }>(filas: ReadonlyArray<T>): T[] {
  return [...filas].sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? "") || a.id.localeCompare(b.id));
}

/** Las filas que se ven con un chip puesto. */
export function filasVisibles(
  vivas: ReadonlyArray<FilaDeTienda>,
  anuladas: ReadonlyArray<FilaDeTienda>,
  filtro: string,
): FilaDeTienda[] {
  if (filtro === FILTRO_ANULADOS) return ordenarPorFecha(anuladas);
  if (filtro === FILTRO_TODOS || !filtro) return ordenarPorFecha(vivas);
  const f = filtro.trim().toUpperCase();
  return ordenarPorFecha(vivas.filter((x) => String(x.marcaCodigo ?? "").trim().toUpperCase() === f));
}

/** Lo que dice cada renglón: la línea principal y la gris de abajo. */
export function lineaDelGasto(f: FilaDeTienda): { titulo: string; detalle: string } {
  const proveedor = String(f.proveedor ?? "").trim();
  const concepto = String(f.concepto ?? f.detalle ?? "").trim();
  const nota = String(f.nota ?? "").trim();
  if (f.tipo === "mueble") {
    const titulo = [nota || concepto || "Muebles de la bodega"].join("");
    return { titulo, detalle: "mueble · precio reportado" };
  }
  if (f.tipo === "impulsadora") {
    const titulo = proveedor ? `Impulsadora ${proveedor}` : "Pago de impulsadora";
    const mes = String(f.mes ?? "").trim();
    return { titulo, detalle: mes ? `pago de impulsadora · ${mes}` : "pago de impulsadora" };
  }
  const titulo = [proveedor, nota || concepto].filter(Boolean).join(" · ") || "Factura";
  const numero = String(f.numero ?? "").trim();
  const partes: string[] = [numero ? `factura N° ${numero}` : "factura"];
  if (typeof f.subtotal === "number" && typeof f.itbms === "number") {
    partes.push(`${formatoMonto(f.subtotal)} + ITBMS ${formatoMonto(f.itbms)}`);
  }
  return { titulo, detalle: partes.join(" · ") };
}

/** El rótulo corto del tipo (para el Excel y los chips). */
export function rotuloCortoDeTipo(tipo: TipoGasto): string {
  return ROTULO_DE_TIPO[tipo];
}

export interface PieDeLaFicha {
  gastos: number;
  facturas: number;
  montoFacturas: number;
  muebles: number;
  montoMuebles: number;
  impulsadora: number;
  montoImpulsadora: number;
  /** Lo reportado, único total. */
  total: number;
  noReportado: number;
  cantidadNoReportada: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * El pie de la tabla: cuántos de cada tipo y cuánto suman. 🔴 El total es SOLO
 * lo reportado, por la regla única de `periodo-estado.ts`; lo apagado se dice
 * aparte. Las anuladas nunca entran acá.
 */
export function pieDeLaFicha(vivas: ReadonlyArray<FilaDeTienda>): PieDeLaFicha {
  const t: TotalesDelPeriodo = totalesDelPeriodo(vivas.map((f) => ({ monto: f.monto, seReporta: f.seReporta })));
  const sumaDe = (tipo: TipoGasto) =>
    round2(vivas.filter((f) => f.tipo === tipo && f.seReporta).reduce((s, f) => s + f.monto, 0));
  const cuenta = (tipo: TipoGasto) => vivas.filter((f) => f.tipo === tipo).length;
  return {
    gastos: vivas.length,
    facturas: cuenta("factura"),
    montoFacturas: sumaDe("factura"),
    muebles: cuenta("mueble"),
    montoMuebles: sumaDe("mueble"),
    impulsadora: cuenta("impulsadora"),
    montoImpulsadora: sumaDe("impulsadora"),
    total: t.reportado,
    noReportado: t.noReportado,
    cantidadNoReportada: t.cantidadNoReportada,
  };
}

/** Lo reportado por marca, de mayor a menor, para la cabecera. */
export function totalPorMarca(vivas: ReadonlyArray<FilaDeTienda>): Array<{ codigo: string; nombre: string; monto: number }> {
  const m = new Map<string, { nombre: string; monto: number }>();
  for (const f of vivas) {
    if (!f.seReporta) continue;
    const codigo = String(f.marcaCodigo ?? "").trim().toUpperCase() || "—";
    const x = m.get(codigo) ?? { nombre: f.marcaNombre || codigo, monto: 0 };
    x.monto += f.monto;
    m.set(codigo, x);
  }
  return [...m.entries()]
    .map(([codigo, x]) => ({ codigo, nombre: x.nombre, monto: round2(x.monto) }))
    .sort((a, b) => b.monto - a.monto || a.nombre.localeCompare(b.nombre, "es"));
}

/** El texto del pie: «6 gastos · 3 facturas $1,557.84 · 3 muebles $10,622.00». */
export function textoDelPie(p: PieDeLaFicha): string {
  const partes: string[] = [plural(p.gastos, "gasto", "gastos")];
  if (p.facturas > 0) partes.push(`${plural(p.facturas, "factura", "facturas")} ${formatoMonto(p.montoFacturas)}`);
  if (p.muebles > 0) partes.push(`${plural(p.muebles, "mueble", "muebles")} ${formatoMonto(p.montoMuebles)}`);
  if (p.impulsadora > 0) {
    partes.push(`${plural(p.impulsadora, "pago de impulsadora", "pagos de impulsadora")} ${formatoMonto(p.montoImpulsadora)}`);
  }
  return partes.join(" · ");
}
