// ─────────────────────────────────────────────────────────────────────────────
// LO QUE LA FILA DE TOTALES TIENE QUE DECIR, EN LAS DOS PANTALLAS (17-sep-2026)
//
// Módulo PURO: sin DOM, sin red, sin xlsx. Lo usan las DOS pantallas de
// Plantilla Switch —`ReebokClient` y `DepuradorClient` (Calvin / Tommy / KL)—
// porque son la misma pregunta hecha sobre las mismas 25 columnas.
//
// 🔴 ESTO NO CALCULA NADA NUEVO. Lee `Costo FOB *`, `Costo CIF *` y
// `Stock Ideal` de las filas que YA se van a descargar, tal como quedaron. No
// hay un segundo redondeo, ni un segundo flete, ni una segunda regla de costo:
// el costo de un artículo se decide en `costoReebok` (Reebok) y en `processRows`
// (CK/TH/KL), y aquí solo se suma. Si este archivo tuviera una multiplicación
// por un factor, sería la segunda definición de costo del módulo — que es
// exactamente el defecto que `costoReebok` cerró el 14-sep-2026.
//
// 🔴 UN ARTÍCULO SIN COSTO NO VALE CERO. Sumarlo como 0 da un total que miente
// y que cuadra mal contra la factura del proveedor sin decir por qué. Acá el
// artículo sin costo se SACA de la suma y se CUENTA aparte, para decirlo.
// ⚠️ Un costo que de verdad es 0 —los SERVICIOS de CK/TH (tipo de artículo 02:
// «Ajuste de Precio», «Mercancía Defectuosa»…), que `processRows` emite con
// `fob = 0` a propósito— SÍ cuenta: es un número, no un hueco.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo único que este módulo necesita de una fila: sus 25 columnas. Lo cumplen
 *  `ProcessedRow` (CK/TH/KL) y `SwitchRow` (Reebok) sin adaptador. */
export interface FilaConColumnas {
  cols: Record<string, string | number | null>;
}

export interface CostoDelArchivo {
  /** Σ (Costo FOB × Stock Ideal) sobre las filas CON costo, a centavos. */
  fob: number;
  /** Σ (Costo CIF × Stock Ideal) sobre las filas CON costo, a centavos. */
  cif: number;
  /** Artículos que no traen costo y por eso NO entraron a ninguna de las dos
   *  sumas. Cero = el total está completo. */
  sinCosto: number;
  /** Artículos que sí entraron (los que tienen costo). */
  conCosto: number;
}

/** Un número de verdad, o `null`. `""`, `null` y la basura NO son cero. */
function numeroONulo(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

const redondear = (x: number): number => Math.round(x * 100) / 100;

/**
 * El costo del archivo, para cuadrarlo contra la factura del proveedor.
 *
 * Se suma sobre LAS FILAS QUE SE VAN A DESCARGAR, ni una más: el llamador pasa
 * exactamente el arreglo que alimenta el Excel (ya filtrado por «sin piezas» /
 * «sin cantidad»), y esta función no filtra nada por su cuenta.
 *
 * ⚠️ Una fila a la que le falta el FOB pero le sobra el CIF (o al revés) cuenta
 * como SIN COSTO entera: medio artículo en un total es peor que un artículo
 * menos, porque nadie lo ve.
 */
export function costoDelArchivo(filas: readonly FilaConColumnas[]): CostoDelArchivo {
  return costoDeArticulos(
    filas.map((f) => ({
      fob: f.cols["Costo FOB *"],
      cif: f.cols["Costo CIF *"],
      unidades: f.cols["Stock Ideal"],
    })),
  );
}

/** Un artículo visto por el costo: lo que cuesta una unidad y cuántas van. */
export interface ArticuloConCosto {
  fob: string | number | null | undefined;
  cif: string | number | null | undefined;
  unidades: string | number | null | undefined;
}

/**
 * La MISMA cuenta, para las filas que no guardan las 25 columnas — la preforma
 * de Reebok («pedido para cliente»), que agrupa por PO + artículo.
 *
 * 🔑 `costoDelArchivo` la llama: hay UNA suma en el módulo, no dos.
 */
export function costoDeArticulos(articulos: readonly ArticuloConCosto[]): CostoDelArchivo {
  let fob = 0;
  let cif = 0;
  let sinCosto = 0;
  let conCosto = 0;
  for (const a of articulos) {
    const unidades = numeroONulo(a.unidades) ?? 0;
    const cFob = numeroONulo(a.fob);
    const cCif = numeroONulo(a.cif);
    if (cFob === null || cCif === null) {
      sinCosto++;
      continue;
    }
    conCosto++;
    fob += cFob * unidades;
    cif += cCif * unidades;
  }
  return { fob: redondear(fob), cif: redondear(cif), sinCosto, conCosto };
}

/**
 * Las facturas del proveedor que trae el archivo, sin repetir y en el orden en
 * que aparecen.
 *
 * 🔴 SI EL ARCHIVO NO LAS TRAE, NO SE INVENTAN: la lista vuelve vacía y la
 * pantalla no dibuja nada. Un número de factura equivocado en una pantalla que
 * se usa para cuadrar contra la factura de verdad es peor que no decir nada.
 *
 * ⚠️ El valor se compara TAL CUAL viene, solo recortado: Reebok manda
 * `Document Number` como número (3971) y CK/TH lo trae como texto en
 * `Codigo CPBS`. Nada se normaliza más allá del recorte, porque un «0» que se
 * cae adelante ya no es el número de la factura.
 */
export function facturasDelArchivo(valores: readonly (string | number | null | undefined)[]): string[] {
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const v of valores) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (!s) continue;
    if (vistas.has(s)) continue;
    vistas.add(s);
    out.push(s);
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * QUÉ ES NUEVO Y QUÉ YA ESTÁ EN SWITCH
 * ═══════════════════════════════════════════════════════════════════════════
 * Cambia lo que va a pasar al subir el archivo: lo nuevo se crea, lo que ya
 * está se pisa. Hoy no se dice, y se ve recién del otro lado.
 *
 * Se cuenta contra `switch_articulo_info`, que el sistema ya sincroniza de las
 * seis empresas (medido el 17-sep-2026: active_shoes 1.763 · vistana 8.274 ·
 * fashion_wear 5.117 · fashion_shoes 731 · active_wear 592 · joystep 207). No
 * hace falta subir nada ni pedirle un archivo a nadie.
 *
 * 🔴 SE COMPARA POR `codigo`, ACOTADO A LA EMPRESA. El mismo código nombra
 * artículos distintos en dos empresas: contar contra el catálogo del grupo
 * entero diría «ya está» de algo que en ESA empresa no existe.
 *
 * ⚠️ FALLA ABIERTA: si la consulta falla, o la empresa no se reconoció, o esa
 * empresa no tiene catálogo sincronizado, la línea NO SALE y la pantalla
 * funciona igual. Nunca frena la descarga.
 * ═════════════════════════════════════════════════════════════════════════ */

export interface ContraSwitch {
  /** Códigos del archivo que `switch_articulo_info` NO tiene en esa empresa. */
  nuevos: number;
  /** Códigos del archivo que ya existen en esa empresa. */
  yaEstan: number;
}

/** Recorta y sube a mayúsculas. Switch guarda los códigos en mayúscula y el
 *  archivo del proveedor los manda como se le ocurre. */
export const normalizarCodigo = (v: string | number | null | undefined): string =>
  String(v ?? "").trim().toUpperCase();

/**
 * Cuántos códigos del archivo son nuevos y cuántos ya están. PURA.
 *
 * Un código repetido en el archivo cuenta UNA vez: el grano de la pregunta es
 * el artículo, no la fila.
 */
export function contarContraSwitch(
  codigos: readonly (string | number | null | undefined)[],
  enSwitch: ReadonlySet<string>,
): ContraSwitch {
  const unicos = new Set<string>();
  for (const c of codigos) {
    const k = normalizarCodigo(c);
    if (k) unicos.add(k);
  }
  let yaEstan = 0;
  for (const k of unicos) if (enSwitch.has(k)) yaEstan++;
  return { nuevos: unicos.size - yaEstan, yaEstan };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SINGULAR Y PLURAL DE VERDAD
 * ═══════════════════════════════════════════════════════════════════════════
 * «1 marca(s)» es lo primero que se lee en la fila de totales. Es chico y se
 * arregla una vez para las dos pantallas.
 */

/** «1 marca» · «2 marcas». El plural se escribe entero: los del español no
 *  siempre son + «s» («1 aviso» / «2 avisos», pero «1 mes» / «2 meses»). */
export const plural = (n: number, singular: string, plural: string): string =>
  `${n === 1 ? singular : plural}`;
