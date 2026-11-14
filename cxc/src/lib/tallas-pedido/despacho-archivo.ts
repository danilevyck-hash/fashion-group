// ─────────────────────────────────────────────────────────────────────────────
// El Excel de despacho del proveedor → filas de `despacho_tallas`. PURO.
//
// Lo lee la carga del historial y el cron `despachos-correo`. El archivo es el
// «<factura>_TXT.xlsx» de ASW (o su gemelo .txt separado por `;`): encabezado en
// la fila 1, una fila por referencia + talla + caja. Columnas que se usan:
//   FACT · FECHA (MMDDAAAA) · REFERENCIA · EAN · TALLA · CANTIDAD · NO_TRANSPORTE
//   · NOMBRE_DESTINATARIO_MERCANCIAS · CODIGO_PREPACK · CANTIDAD_PREPACK
//   · CANTIDAD_ORD_X_PP
// Una fila sin caja (CODIGO_PREPACK vacío: ropa, accesorios) se guarda con caja
// «SIN CAJA»: su curva sale del reparto por talla del despacho (`armar.ts`).
// ─────────────────────────────────────────────────────────────────────────────

export type Celda = string | number | boolean | null | undefined;

export interface FilaDespacho {
  empresa_key: string;
  referencia: string;
  codigo_caja: string;
  talla: string;
  ean: string | null;
  cantidad: number;
  cajas: number | null;
  pares_por_caja: number | null;
  fecha_despacho: string | null;
  transporte: string | null;
  factura: string;
  proveedor: string;
  correo_id: string;
}

export interface LecturaDespacho {
  filas: FilaDespacho[];
  /** Filas del archivo sin referencia, talla o cantidad, o de una empresa que no entra. */
  descartadas: number;
  /** Destinatarios que no se reconocieron (para decirlo, nunca para adivinar). */
  destinatariosDesconocidos: string[];
}

/**
 * El destinatario del despacho → la empresa. Lista escrita a mano, por el
 * PRINCIPIO del nombre ya normalizado (ASW escribe «FASHION SHOES HOLDING» y
 * «VISTANA INTERNACIONAL PANAMA, S.A.»). Lo que no esté aquí no se guarda.
 */
const DESTINATARIOS: readonly [prefijo: string, empresa: string][] = [
  ["FASHION SHOES", "fashion_shoes"],
  ["FASHION WEAR", "fashion_wear"],
  ["VISTANA", "vistana"],
  ["ACTIVE WEAR", "active_wear"],
  ["ACTIVE SHOES", "active_shoes"],
  ["JOYSTEP", "joystep"],
  // Multifashion (MULTI FASHION HOLDING CORP.) NO entra (Daniel, 13-nov-2026):
  // sus renglones se descartan como destinatario desconocido.
];

const norm = (v: Celda) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

export function empresaDelDestinatario(nombre: Celda): string | null {
  const n = norm(nombre).replace(/\s+/g, " ");
  return DESTINATARIOS.find(([p]) => n.startsWith(p))?.[1] ?? null;
}

const num = (v: Celda): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
};

/** «10262026» (MMDDAAAA, como lo escribe ASW) → «2026-10-26». */
export function fechaDeAsw(v: Celda): string | null {
  const s = String(v ?? "").trim();
  const m = /^(\d{2})(\d{2})(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[1]}-${m[2]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

/** El código de barra como TEXTO: un 8.72E+12 de Excel se vuelve a sus dígitos. */
export function eanTexto(v: Celda): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** La talla como texto limpio: 6.5 y «6.5» son la misma; 40 y «40» también. */
export function tallaTexto(v: Celda): string {
  return String(v ?? "").trim().replace(/,/g, ".");
}

const COLUMNAS = {
  fact: "FACT",
  fecha: "FECHA",
  ref: "REFERENCIA",
  ean: "EAN",
  talla: "TALLA",
  cant: "CANTIDAD",
  transp: "NO_TRANSPORTE",
  dest: "NOMBRE_DESTINATARIO_MERCANCIAS",
  caja: "CODIGO_PREPACK",
  cajas: "CANTIDAD_PREPACK",
  porCaja: "CANTIDAD_ORD_X_PP",
} as const;

/** ¿Esta hoja es un Excel de despacho? (tiene referencia, talla, cantidad y caja). */
export function esHojaDeDespacho(encabezado: readonly Celda[]): boolean {
  const h = encabezado.map(norm);
  return [COLUMNAS.ref, COLUMNAS.talla, COLUMNAS.cant, COLUMNAS.caja].every((c) => h.includes(c));
}

/**
 * Lee las filas de la hoja (fila 1 = encabezado). `empresaPorDefecto` se usa
 * solo si el archivo no trae destinatario (nunca para pisar uno que sí viene).
 */
export function leerDespacho(
  filas: readonly (readonly Celda[])[],
  origen: { correo_id: string; proveedor?: string; empresaPorDefecto?: string | null },
): LecturaDespacho {
  const encabezado = (filas[0] ?? []).map(norm);
  const col = (n: string) => encabezado.indexOf(n);
  const c = Object.fromEntries(Object.entries(COLUMNAS).map(([k, n]) => [k, col(n)])) as Record<
    keyof typeof COLUMNAS,
    number
  >;
  const get = (fila: readonly Celda[], k: keyof typeof COLUMNAS): Celda => (c[k] >= 0 ? fila[c[k]] : null);

  // Una talla repetida en la misma caja se SUMA (el proveedor a veces parte filas).
  const porClave = new Map<string, FilaDespacho>();
  const desconocidos = new Set<string>();
  let descartadas = 0;

  for (const fila of filas.slice(1)) {
    if (!fila || fila.every((v) => v === null || v === undefined || v === "")) continue;
    const referencia = norm(get(fila, "ref")).replace(/\s+/g, "");
    const codigo_caja = norm(get(fila, "caja"));
    const talla = tallaTexto(get(fila, "talla"));
    const cantidad = num(get(fila, "cant"));
    const dest = get(fila, "dest");
    const empresa = dest ? empresaDelDestinatario(dest) : origen.empresaPorDefecto ?? null;
    if (dest && !empresa) desconocidos.add(String(dest).trim());
    // Sin caja = ropa o accesorio: se guarda igual (su curva sale del reparto por talla).
    if (!referencia || !talla || cantidad === null || !empresa) {
      descartadas++;
      continue;
    }
    const factura = String(get(fila, "fact") ?? "").trim() || "—";
    const caja = codigo_caja || SIN_CAJA;
    const clave = [factura, referencia, caja, talla].join("|");
    const previa = porClave.get(clave);
    if (previa) {
      // La misma caja en dos posiciones de la factura: se suman los pares Y las
      // cajas, así la curva (pares ÷ cajas) sigue siendo la de UNA caja.
      const cajas = num(get(fila, "cajas"));
      porClave.set(clave, {
        ...previa,
        cantidad: previa.cantidad + cantidad,
        cajas: previa.cajas !== null && cajas !== null ? previa.cajas + cajas : previa.cajas,
      });
      continue;
    }
    const transporte = String(get(fila, "transp") ?? "").trim();
    porClave.set(clave, {
      empresa_key: empresa,
      referencia,
      codigo_caja: caja,
      talla,
      ean: eanTexto(get(fila, "ean")),
      cantidad,
      cajas: num(get(fila, "cajas")),
      pares_por_caja: num(get(fila, "porCaja")),
      fecha_despacho: fechaDeAsw(get(fila, "fecha")),
      transporte: transporte || null,
      factura,
      proveedor: origen.proveedor ?? "asw",
      correo_id: origen.correo_id,
    });
  }
  return { filas: [...porClave.values()], descartadas, destinatariosDesconocidos: [...desconocidos] };
}

/** Un .txt de ASW (separado por `;`) → filas, para pasarlo por `leerDespacho`. */
export function filasDeTxt(texto: string): string[][] {
  return texto
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map((l) => l.split(";").map((v) => v.trim()));
}

// ─── Qué correos y qué adjuntos ─────────────────────────────────────────────

/** Remitentes cuyos despachos se leen, y con qué formato. */
export const REMITENTES_DE_DESPACHO: readonly { dominio: string; proveedor: string }[] = [
  { dominio: "@aswgr.com", proveedor: "asw" },
  // Reebok de Active Shoes (Fashion Fitness Group): otro formato, ver abajo.
  { dominio: "@fashionfitnessgroup.com", proveedor: "reebok" },
];

/** ¿Es una notificación de despacho? Por el remitente y el asunto, nunca por parecido. */
export function proveedorDelCorreo(remitente: string, asunto: string): string | null {
  const de = String(remitente ?? "").trim().toLowerCase();
  const p = REMITENTES_DE_DESPACHO.find((r) => de.endsWith(r.dominio));
  if (!p) return null;
  const a = norm(asunto);
  if (a.startsWith("RECUPERAR")) return null;
  if (p.proveedor === "reebok") return a.includes("DESPACHO") || a.includes("RBK") ? p.proveedor : null;
  return a.includes("NOTIFICACION DE DESPACHO") || a.includes("ADJUNTO DOCUMENTOS") ? p.proveedor : null;
}

/**
 * De los adjuntos, los «<factura>_TXT» (o «<factura>.txt»): uno por factura, el .txt si está (es el
 * mismo contenido que el Excel y no tiene celdas con formato), si no el .xlsx o el .xls viejo
 * (2000014566_TXT.xls): `XLSX.read` lee los dos.
 */
export function adjuntosDeDespacho<T extends { name: string }>(adjuntos: readonly T[], proveedor = "asw"): T[] {
  // Reebok: «Packing List Ordenes <pedido>.xlsx» (la caja) y «Detalle despacho Active.xlsx» (las tallas).
  if (proveedor === "reebok") return adjuntos.filter((a) => /^(packing list|detalle[ _]despacho).*\.xlsx?$/i.test(a.name.trim()));
  const porBase = new Map<string, T>();
  for (const a of adjuntos) {
    // «2000015706_TXT.txt» o, a veces, «2000014480.txt» (sin «_TXT»): la factura sola.
    const m = /^(.*?)(_TXT)?\.(txt|xlsx|xls)$/i.exec(a.name.trim());
    if (!m || (!m[2] && !/^\d+$/.test(m[1]))) continue;
    const base = m[1].toUpperCase();
    const previo = porBase.get(base);
    if (!previo || /\.txt$/i.test(a.name)) porBase.set(base, a);
  }
  return [...porBase.values()];
}

// ─── Reebok (Active Shoes, @fashionfitnessgroup.com) ────────────────────────
// Dos Excel, ninguno parecido al de ASW (medido el 13-nov-2026):
//  · «Packing List Ordenes <pedido>.xlsx» — Nro Pedido · Nro Carton · Articulo ·
//    SKU · Talla · Barcode · Cant Empaque. Zapatos: una fila del cartón (SKU
//    «100257651-B», sin cantidad) y debajo una fila por talla con Articulo = la
//    referencia de Switch y Cant Empaque = pares de esa talla en el cartón.
//    Ropa: una fila por cartón con su SKU y su cantidad. Sin factura: va
//    «PL <pedido>».
//  · «Detalle despacho Active.xlsx» — Document Number (factura) · Posting Date
//    (número de Excel) · SKU Father (la referencia) · Talla · EAN · UPC ·
//    Quantity. Trae talla y código de barra pero NO la caja: se guarda con
//    caja «SIN CAJA» y sirve para escribir las tallas aunque no haya curva.

export const SIN_CAJA = "SIN CAJA";

const indices = (encabezado: readonly Celda[]) => {
  const h = encabezado.map(norm);
  return (n: string) => h.indexOf(n);
};

export function esPackingListReebok(encabezado: readonly Celda[]): boolean {
  const i = indices(encabezado);
  return i("NRO CARTON") >= 0 && i("CANT EMPAQUE") >= 0 && i("ARTICULO") >= 0 && i("TALLA") >= 0;
}

export function esDetalleReebok(encabezado: readonly Celda[]): boolean {
  const i = indices(encabezado);
  return i("SKU FATHER") >= 0 && i("QUANTITY") >= 0 && i("TALLA") >= 0 && i("DOCUMENT NUMBER") >= 0;
}

/** Fecha de Excel (46325) → «2026-10-30». */
function fechaDeExcel(v: Celda): string | null {
  const n = num(v);
  if (n === null || n < 30000 || n > 80000) return fechaDeAsw(v);
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000).toISOString().slice(0, 10);
}

function leerPackingListReebok(filas: readonly (readonly Celda[])[], correo_id: string): FilaDespacho[] {
  const i = indices(filas[0] ?? []);
  const [cPed, cCart, cArt, cSku, cTalla, cBar, cCant] = ["NRO PEDIDO", "NRO CARTON", "ARTICULO", "SKU", "TALLA", "BARCODE", "CANT EMPAQUE"].map(i);
  const out: FilaDespacho[] = [];
  let carton = "";
  let pedido = "";
  for (const [n, f] of filas.slice(1).entries()) {
    const c = (k: number) => (k >= 0 ? f[k] : null);
    if (String(c(cCart) ?? "").trim()) {
      // + la fila: un N.° de cartón de 20 dígitos leído como número pierde
      // precisión y dos cartones podrían quedar con el mismo.
      carton = `${String(c(cCart)).trim()}#${n}`;
      pedido = String(c(cPed) ?? "").trim() || pedido;
    }
    const cantidad = num(c(cCant));
    const talla = tallaTexto(c(cTalla));
    const referencia = norm(c(cArt)).replace(/\s+/g, "");
    if (!carton || !referencia || cantidad === null || cantidad <= 0 || !talla || talla === "NA") continue;
    out.push({
      empresa_key: "active_shoes", referencia, codigo_caja: carton, talla,
      ean: eanTexto(c(cBar)) ?? eanTexto(c(cSku)), cantidad, cajas: 1, pares_por_caja: null,
      fecha_despacho: null, transporte: null, factura: `PL ${pedido || "—"}`, proveedor: "reebok", correo_id,
    });
  }
  // Pares por caja = la suma del cartón.
  const suma = new Map<string, number>();
  for (const x of out) suma.set(x.codigo_caja + "|" + x.referencia, (suma.get(x.codigo_caja + "|" + x.referencia) ?? 0) + x.cantidad);
  return out.map((x) => ({ ...x, pares_por_caja: suma.get(x.codigo_caja + "|" + x.referencia) ?? null }));
}

function leerDetalleReebok(filas: readonly (readonly Celda[])[], correo_id: string): FilaDespacho[] {
  const i = indices(filas[0] ?? []);
  const [cDoc, cFecha, cRef, cTalla, cEan, cUpc, cCant] = ["DOCUMENT NUMBER", "POSTING DATE", "SKU FATHER", "TALLA", "EAN", "UPC", "QUANTITY"].map(i);
  const porClave = new Map<string, FilaDespacho>();
  for (const f of filas.slice(1)) {
    const c = (k: number) => (k >= 0 ? f[k] : null);
    const referencia = norm(c(cRef)).replace(/\s+/g, "");
    const talla = tallaTexto(c(cTalla));
    const cantidad = num(c(cCant));
    if (!referencia || !talla || cantidad === null || cantidad <= 0) continue;
    const factura = String(c(cDoc) ?? "").trim() || "—";
    const k = [factura, referencia, talla].join("|");
    const previa = porClave.get(k);
    if (previa) { porClave.set(k, { ...previa, cantidad: previa.cantidad + cantidad }); continue; }
    porClave.set(k, {
      empresa_key: "active_shoes", referencia, codigo_caja: SIN_CAJA, talla,
      ean: eanTexto(c(cEan)) ?? eanTexto(c(cUpc)), cantidad, cajas: null, pares_por_caja: null,
      fecha_despacho: fechaDeExcel(c(cFecha)), transporte: null, factura, proveedor: "reebok", correo_id,
    });
  }
  return [...porClave.values()];
}

/**
 * «Packing List Ordenes <pedido> Active.xlsx» de Active Wear (camisetas Reebok):
 * Nro Pedido · Articulo · SKU · Descripcion · Bar Code · TALLA · Bultos · Empaque
 * · Piezas total. Cada renglón es UNA talla en «Bultos» cajas de «Empaque» piezas.
 */
export function esEmpaqueActiveWear(encabezado: readonly Celda[]): boolean {
  const i = indices(encabezado);
  return i("BULTOS") >= 0 && i("EMPAQUE") >= 0 && i("PIEZAS TOTAL") >= 0 && i("TALLA") >= 0 && i("ARTICULO") >= 0;
}

function leerEmpaqueActiveWear(filas: readonly (readonly Celda[])[], correo_id: string): FilaDespacho[] {
  const i = indices(filas[0] ?? []);
  const [cPed, cArt, cSku, cBar, cTalla, cBultos, cEmp, cTotal] = ["NRO PEDIDO", "ARTICULO", "SKU", "BAR CODE", "TALLA", "BULTOS", "EMPAQUE", "PIEZAS TOTAL"].map(i);
  const out: FilaDespacho[] = [];
  for (const f of filas.slice(1)) {
    const c = (k: number) => (k >= 0 ? f[k] : null);
    const referencia = norm(c(cArt)).replace(/\s+/g, "");
    const talla = tallaTexto(c(cTalla));
    const cantidad = num(c(cTotal));
    if (!referencia || !talla || cantidad === null || cantidad <= 0) continue;
    out.push({
      empresa_key: "active_wear", referencia, codigo_caja: norm(c(cSku)) || `${referencia}-${talla}`, talla,
      ean: eanTexto(c(cBar)), cantidad, cajas: num(c(cBultos)), pares_por_caja: num(c(cEmp)),
      fecha_despacho: null, transporte: null, factura: `PL ${String(c(cPed) ?? "").trim() || "—"}`, proveedor: "reebok", correo_id,
    });
  }
  return out;
}

/**
 * UN adjunto → filas, con el lector de SU formato (se reconoce por el
 * encabezado, nunca por parecido). `null` = formato desconocido (se avisa).
 */
export function leerAdjuntoDeDespacho(
  filas: readonly (readonly Celda[])[],
  origen: { correo_id: string; proveedor: string },
): FilaDespacho[] | null {
  const h = filas[0] ?? [];
  if (esHojaDeDespacho(h)) return leerDespacho(filas, origen).filas;
  if (esPackingListReebok(h)) return leerPackingListReebok(filas, origen.correo_id);
  if (esDetalleReebok(h)) return leerDetalleReebok(filas, origen.correo_id);
  if (esEmpaqueActiveWear(h)) return leerEmpaqueActiveWear(filas, origen.correo_id);
  return null;
}
