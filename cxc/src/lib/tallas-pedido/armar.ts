// ─────────────────────────────────────────────────────────────────────────────
// El Excel de tallas de UN pedido: las líneas del pedido de Switch + las curvas
// de caja de los despachos del proveedor → las filas del Excel. PURO.
//
// Reglas (Daniel, 13-nov-2026, sobre el pedido 16-000002182 de Fashion Shoes):
//   · Una fila por TALLA: Referencia · Descripción · Talla · Código de barra ·
//     Pares · Opción, y una fila «Total <referencia>» por referencia u opción.
//   · Pares de la talla = (pares del pedido ÷ pares por caja) × pares de esa
//     talla en la caja. El total cuadra con los pares del pedido.
//   · Se ofrecen TODAS las curvas distintas de todos los despachos (Daniel,
//     13-nov-2026: «si llegó en varios despachos con curvas distintas, todas»).
//   · Ropa y accesorios (sin caja): la curva es el reparto por talla del
//     despacho reducido a su mínima proporción; si el pedido no la completa,
//     NARANJA con las tallas y el código de barra y las cantidades vacías.
//   · Varias curvas DISTINTAS para la referencia → «Opción 1», «Opción 2»…
//     La MISMA curva en dos despachos (o con dos códigos de caja) es UNA opción:
//     así se arregló THS10474T, que salía con las opciones 4 y 5 repitiendo las
//     cajas de una sola talla 8 y 9 de las opciones 1 y 2.
//   · La opción lleva el código de la caja (Daniel, 14-nov-2026): «Opción 1 ·
//     W1B»; con una sola curva, solo «W1B»; sin código, como antes. Si la misma
//     curva vino con varios códigos, va el que más se repite.
//   · Sin despacho conocido → UNA fila AMARILLA (referencia, descripción y los
//     pares del pedido; talla y código vacíos) para llenarla a mano.
//   · Los pares del pedido NO llenan cajas completas → la opción entera va en
//     NARANJA con los Pares VACÍOS, para llenarlos a mano. Nunca decimales.
//   · Tallas conocidas pero sin caja (Reebok «Detalle despacho») → las tallas y
//     su código de barra en NARANJA, con los Pares VACÍOS.
// ─────────────────────────────────────────────────────────────────────────────

import { SIN_CAJA } from "./despacho-archivo";

export interface LineaDelPedido {
  codigo: string;
  descripcion: string;
  cantidad: number;
}

/** Lo que se lee de `despacho_tallas`. */
export interface TallaDeDespacho {
  referencia: string;
  codigo_caja: string;
  talla: string;
  ean: string | null;
  cantidad: number;
  cajas: number | null;
  pares_por_caja: number | null;
  factura: string;
  correo_id: string;
  fecha_despacho: string | null;
  /** «asw», «reebok»… (columna `proveedor`; sin ella no se muestra código). */
  proveedor?: string | null;
  /** Reebok: la letra de la curva del cartón (columna `curva`). */
  curva?: string | null;
}

export type ColorFila = "amarillo" | "naranja" | null;

export interface FilaTallas {
  referencia: string;
  descripcion: string;
  talla: string;
  codigoBarra: string;
  /** `null` = se llena a mano. */
  pares: number | null;
  opcion: string;
  esTotal: boolean;
  color: ColorFila;
}

export interface ResumenTallas {
  referencias: number;
  /** Referencias con al menos una opción que llena cajas completas. */
  conTallas: number;
  /** Sin despacho conocido, o ninguna opción llena cajas completas. */
  aMano: number;
  pares: number;
}

export const normRef = (s: string) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, "");

/** Switch escribe TH101074T000; ASW, TH101074T. Se aceptan las dos. */
export function candidatosDeReferencia(codigoSwitch: string): string[] {
  const r = normRef(codigoSwitch);
  if (r.endsWith("000") && r.length > 3) return [r, r.slice(0, -3)];
  // Active Wear escribe en Switch la talla pegada: «RBKFP26008_M», «RBKFP26097_10»;
  // el proveedor, «RBKFP26008».
  const sinTalla = r.replace(/_(XXS|XS|S|M|L|XL|XXL|2XL|3XL|\d{1,2})$/, "");
  if (sinTalla !== r && sinTalla) return [r, sinTalla];
  return [r];
}

/** Tallas numéricas ascendentes, luego las de texto. */
export function compararTallas(a: string, b: string): number {
  const na = Number(a), nb = Number(b);
  const aN = a !== "" && Number.isFinite(na), bN = b !== "" && Number.isFinite(nb);
  if (aN && bN) return na - nb;
  if (aN) return -1;
  if (bN) return 1;
  // Ropa: de la más chica a la más grande, no por abecedario (S, M, L, XL…).
  const ia = ORDEN_ROPA.indexOf(a.toUpperCase()), ib = ORDEN_ROPA.indexOf(b.toUpperCase());
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0) return -1;
  if (ib >= 0) return 1;
  return a.localeCompare(b, "es");
}

const ORDEN_ROPA = ["XXS", "XS", "S", "SM", "M", "ML", "L", "LXL", "XL", "XXL", "2XL", "XXXL", "3XL", "OS", "OSFM", "OSFA"];

interface TallaDeCurva {
  talla: string;
  porCaja: number;
  ean: string | null;
}

interface Curva {
  tallas: TallaDeCurva[];
  paresPorCaja: number;
  /** El despacho más reciente con esta curva (para el código de barra). */
  fecha: string;
  /** Código de caja → cuántas cajas de despacho lo traen con esta curva. */
  codigos: Map<string, number>;
}

/**
 * El código de la curva: en ASW, `codigo_caja` (su CODIGO_PREPACK: W1A, W1B…);
 * en Reebok, la letra del cartón (`curva`: A, B, C…; 14-nov-2026). En Reebok /
 * Fashion Fitness (y Active Wear) `codigo_caja` es un N.° de CARTÓN
 * («ILPN18K…#3») o un SKU: nunca se muestra. Se decide por `proveedor`.
 */
function codigoDeCurva(f: TallaDeDespacho): string | null {
  if (f.proveedor === "reebok") return f.curva?.trim() || null;
  if (f.proveedor !== "asw") return null;
  const c = String(f.codigo_caja ?? "").trim();
  return c && c !== SIN_CAJA ? c : null;
}

/** El código que más se repite; empate → el primero en orden alfabético. */
function codigoMasFrecuente(codigos: Map<string, number>): string | null {
  let mejor: string | null = null;
  for (const [c, n] of [...codigos].sort(([a], [b]) => a.localeCompare(b))) {
    if (mejor === null || n > codigos.get(mejor)!) mejor = c;
  }
  return mejor;
}

/**
 * La curva de UNA caja de un despacho, o `null` si no cuadra (división no exacta
 * o la suma no da los pares por caja): una curva dudosa no se ofrece.
 */
function curvaDeCaja(filas: TallaDeDespacho[]): Curva | null {
  if (filas[0]?.codigo_caja === SIN_CAJA) return curvaDelDespacho(filas);
  const total = filas.reduce((s, f) => s + Number(f.cantidad), 0);
  const declarado = filas.find((f) => f.pares_por_caja && f.pares_por_caja > 0)?.pares_por_caja ?? null;
  const cajasDecl = filas.find((f) => f.cajas && f.cajas > 0)?.cajas ?? null;
  const cajas = cajasDecl ?? (declarado ? total / declarado : null);
  if (!cajas || !Number.isInteger(cajas) || cajas <= 0) return null;
  const tallas: TallaDeCurva[] = [];
  for (const f of filas) {
    const porCaja = Number(f.cantidad) / cajas;
    if (!Number.isInteger(porCaja) || porCaja <= 0) return null;
    tallas.push({ talla: f.talla, porCaja, ean: f.ean });
  }
  const paresPorCaja = tallas.reduce((s, t) => s + t.porCaja, 0);
  if (declarado !== null && paresPorCaja !== declarado) return null;
  tallas.sort((a, b) => compararTallas(a.talla, b.talla));
  const fecha = filas.map((f) => f.fecha_despacho ?? "").sort().at(-1) ?? "";
  return { tallas, paresPorCaja, fecha, codigos: codigosDe(filas) };
}

const codigosDe = (filas: TallaDeDespacho[]): Map<string, number> => {
  const c = filas.map(codigoDeCurva).find((x) => x !== null);
  return new Map(c ? [[c, 1]] : []);
};

const mcd = (a: number, b: number): number => (b ? mcd(b, a % b) : a);

/**
 * Ropa y accesorios (sin caja; Daniel, 13-nov-2026): la curva es el reparto por
 * talla de ESE despacho reducido a su mínima proporción. S 6 · M 12 · L 12 ·
 * XL 6 · XXL 6 → 1-2-2-1-1 (7 piezas). Una cantidad no entera → sin curva.
 */
function curvaDelDespacho(filas: TallaDeDespacho[]): Curva | null {
  const cant = filas.map((f) => Number(f.cantidad));
  if (cant.some((n) => !Number.isInteger(n) || n <= 0)) return null;
  const m = cant.reduce(mcd, 0);
  const tallas = filas.map((f, i) => ({ talla: f.talla, porCaja: cant[i] / m, ean: f.ean }));
  tallas.sort((a, b) => compararTallas(a.talla, b.talla));
  const fecha = filas.map((f) => f.fecha_despacho ?? "").sort().at(-1) ?? "";
  return { tallas, paresPorCaja: tallas.reduce((s, t) => s + t.porCaja, 0), fecha, codigos: codigosDe(filas) };
}

const firma = (c: Curva) => c.tallas.map((t) => `${t.talla}:${t.porCaja}`).join(",");

/** Orden de las opciones: por talla y, a igual talla, la caja con menos pares primero. */
function compararCurvas(a: Curva, b: Curva): number {
  const n = Math.min(a.tallas.length, b.tallas.length);
  for (let i = 0; i < n; i++) {
    const t = compararTallas(a.tallas[i].talla, b.tallas[i].talla);
    if (t !== 0) return t;
    if (a.tallas[i].porCaja !== b.tallas[i].porCaja) return a.tallas[i].porCaja - b.tallas[i].porCaja;
  }
  return a.tallas.length - b.tallas.length;
}

/** Las curvas DISTINTAS de una referencia, ya ordenadas. */
export function curvasDeReferencia(filas: TallaDeDespacho[]): Curva[] {
  const porCaja = new Map<string, TallaDeDespacho[]>();
  for (const f of filas) {
    const k = [f.correo_id, f.factura, normRef(f.referencia), f.codigo_caja].join("|");
    porCaja.set(k, [...(porCaja.get(k) ?? []), f]);
  }
  const unicas = new Map<string, Curva>();
  for (const grupo of porCaja.values()) {
    const c = curvaDeCaja(grupo);
    if (!c) continue;
    const k = firma(c);
    const previa = unicas.get(k);
    if (!previa) {
      unicas.set(k, c);
      continue;
    }
    // Misma curva: el código de barra sale del despacho más reciente; si le
    // falta a una talla, se toma del otro.
    const [nueva, vieja] = c.fecha > previa.fecha ? [c, previa] : [previa, c];
    const codigos = new Map(previa.codigos);
    for (const [cod, n] of c.codigos) codigos.set(cod, (codigos.get(cod) ?? 0) + n);
    unicas.set(k, {
      ...nueva,
      codigos,
      tallas: nueva.tallas.map((t, i) => ({ ...t, ean: t.ean ?? vieja.tallas[i]?.ean ?? null })),
    });
  }
  return [...unicas.values()].sort(compararCurvas);
}

/** Las filas del Excel y la línea de resumen. */
export function armarTallasDelPedido(
  lineas: readonly LineaDelPedido[],
  despachos: readonly TallaDeDespacho[],
): { filas: FilaTallas[]; resumen: ResumenTallas } {
  const porRef = new Map<string, TallaDeDespacho[]>();
  for (const d of despachos) {
    const r = normRef(d.referencia);
    porRef.set(r, [...(porRef.get(r) ?? []), d]);
  }

  const filas: FilaTallas[] = [];
  let conTallas = 0;
  let pares = 0;

  for (const l of lineas) {
    const referencia = normRef(l.codigo);
    const cantidad = Number(l.cantidad) || 0;
    pares += cantidad;
    const deEsta = candidatosDeReferencia(referencia).flatMap((r) => porRef.get(r) ?? []);
    const curvas = curvasDeReferencia(deEsta);

    if (curvas.length === 0 && deEsta.length > 0) {
      // Hay tallas pero ninguna caja (el «Detalle despacho» de Reebok): se
      // escriben las tallas con su código de barra, en NARANJA y con los pares
      // vacíos para llenarlos a mano.
      const porTalla = new Map<string, TallaDeDespacho>();
      for (const d of deEsta) {
        const p = porTalla.get(d.talla);
        if (!p || (d.fecha_despacho ?? "") > (p.fecha_despacho ?? "") || (!p.ean && d.ean)) porTalla.set(d.talla, d);
      }
      for (const t of [...porTalla.keys()].sort(compararTallas)) {
        filas.push({
          referencia, descripcion: l.descripcion, talla: t, codigoBarra: porTalla.get(t)?.ean ?? "",
          pares: null, opcion: "", esTotal: false, color: "naranja",
        });
      }
      filas.push({
        referencia: `Total ${referencia}`, descripcion: "", talla: "", codigoBarra: "",
        pares: cantidad, opcion: "", esTotal: true, color: "naranja",
      });
      continue;
    }

    if (curvas.length === 0) {
      filas.push({
        referencia, descripcion: l.descripcion, talla: "", codigoBarra: "",
        pares: cantidad, opcion: "", esTotal: false, color: "amarillo",
      });
      continue;
    }

    let algunaCompleta = false;
    curvas.forEach((c, i) => {
      const codigo = codigoMasFrecuente(c.codigos);
      const numero = curvas.length > 1 ? `Opción ${i + 1}` : "";
      const opcion = [numero, codigo].filter(Boolean).join(" · ");
      const cajas = cantidad / c.paresPorCaja;
      const completa = Number.isInteger(cajas) && cajas > 0;
      if (completa) algunaCompleta = true;
      const color: ColorFila = completa ? null : "naranja";
      for (const t of c.tallas) {
        filas.push({
          referencia, descripcion: l.descripcion, talla: t.talla, codigoBarra: t.ean ?? "",
          pares: completa ? cajas * t.porCaja : null, opcion, esTotal: false, color,
        });
      }
      filas.push({
        referencia: `Total ${referencia}${opcion ? ` · ${opcion}` : ""}`,
        descripcion: "", talla: "", codigoBarra: "", pares: cantidad, opcion, esTotal: true, color,
      });
    });
    if (algunaCompleta) conTallas++;
  }

  return {
    filas,
    resumen: { referencias: lineas.length, conTallas, aMano: lineas.length - conTallas, pares },
  };
}

/** Tallas-<pedido>-<AAAA-MM-DD>.xlsx */
export function nombreDelArchivo(pedido: string, hoy: string): string {
  const limpio = String(pedido).trim().replace(/[^\w-]+/g, "");
  return `Tallas-${limpio}-${hoy}.xlsx`;
}

/** «16-000002182», «2182» o «16-2182» → 2182 (el id del pedido en Switch es su correlativo). */
export function idDelPedido(texto: string): number | null {
  const m = /(\d+)\s*$/.exec(String(texto ?? "").trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * ¿El número escrito es este pedido? Sirve el número completo («16-000002182»,
 * «2182») o sus últimos dígitos («2182», «0182»): los dígitos escritos tienen
 * que ser el FINAL de los dígitos del secuencial. Nunca por parecido.
 */
export function coincideElPedido(escrito: string, secuencial: string): boolean {
  const d = String(escrito ?? "").replace(/\D/g, "");
  return d.length > 0 && String(secuencial ?? "").replace(/\D/g, "").endsWith(d);
}

/**
 * Una referencia repetida (talla o color distintos en Switch) se suma en una
 * sola línea, en el orden en que aparece. Igual para pedido y factura.
 */
export function sumarPorCodigo(lineas: readonly LineaDelPedido[]): LineaDelPedido[] {
  const porCodigo = new Map<string, LineaDelPedido>();
  for (const l of lineas) {
    const previa = porCodigo.get(l.codigo);
    porCodigo.set(l.codigo, previa ? { ...previa, cantidad: previa.cantidad + l.cantidad } : { codigo: l.codigo, descripcion: l.descripcion, cantidad: l.cantidad });
  }
  return [...porCodigo.values()];
}

/** Pedidos y facturas encontrados, los más recientes primero; como mucho 10. */
export function juntarEncontrados<T extends { fecha: string }>(...grupos: T[][]): T[] {
  return grupos.flat().sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 10);
}
