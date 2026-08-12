// ============================================================================
// Marketing — el ZIP de UNA MARCA, para su encargado.
//
// 🔑 EL MODELO, en palabras de Daniel: *"ellos facturan a mi bajo compañia
// diferentes. una por marca. cada marca tiene su encargado"*. Al cerrar el
// período de una marca sale UN archivo con SOLO esa marca, y ese archivo se le
// manda a esa persona. Por eso no hay un ZIP "del grupo" que el encargado tenga
// que filtrar: filtrar el archivo de otro es exactamente lo que no puede pasar.
//
// La ESTRUCTURA es la que Daniel ya recibe (ver `zip-export.ts`) y no se
// reinventa:
//
//   resumen_gastos.xlsx          hoja "Resumen" + una hoja por cliente
//   <Cliente>/facturas/          los comprobantes
//   <Cliente>/fotos/             las fotos de instalación
//   General/facturas/            ← gastos SIN cliente (impulsadoras, catálogos,
//   General/fotos/                 eventos): comprobantes Y fotos
//
// Lo único que cambia respecto del ZIP global: el contenido va filtrado a UNA
// marca y UN período, el nombre de cada comprobante lleva la marca, y la
// carpeta/fila **General** reemplaza a la vieja "Impulsadoras" — porque el
// lugar de los gastos sin cliente no es solo de las impulsadoras: un evento o
// una tanda de catálogos tampoco tienen cliente, y tienen su papel igual.
//
// ────────────────────────────────────────────────────────────────────────────
// 🔴 LA PLATA SE CONGELA, LOS PAPELES NO.
//
// Decisión de Daniel, textual: *"la foto sí, la plata no"*. Es el corazón del
// diseño y no es un detalle de implementación:
//
//   - Los MONTOS de un período CERRADO salen del reporte congelado en
//     `mk_periodos.reporte`. No se recalculan NUNCA. El papel que el encargado
//     ya tiene en la mano no puede cambiar solo porque alguien corrigió un
//     porcentaje tres semanas después.
//   - Los PDFs y las FOTOS se leen EN VIVO de Storage al armar el ZIP. Por eso
//     volver a bajar el mismo ZIP la semana que viene trae los MISMOS números y
//     MÁS fotos: la foto de la instalación llega días después de la factura, y
//     obligarlo a re-cerrar el período para que entre sería absurdo.
//
// El candado que cuida esto vive en `marketing-zip-marca.test.ts`: agregar una
// foto a un período cerrado no puede mover ni un centavo.
//
// ⚠️ El período ABIERTO también se puede bajar cuando uno quiera, sin cerrar
// nada. Ahí NO hay reporte congelado todavía, así que los montos se calculan EN
// VIVO con la misma aritmética con la que se van a congelar (total × porción de
// la marca). El resultado dice cuál de los dos caminos se usó
// (`fuenteMontos`), para que nadie tenga que adivinarlo.
//
// 🩸 Y un período CERRADO puede tener el reporte en NULL — medido en producción
// el 11-ago-2026: "mid 2026" está cerrado y su `reporte` es null. Ahí también
// se calcula en vivo: negarse a armar el ZIP dejaría a Daniel sin el archivo de
// un período que ya cerró, que es peor que armarlo diciendo de dónde salió cada
// número.
// ============================================================================

import JSZip from "jszip";
import XLSX from "xlsx-js-style";
import { supabaseServer } from "@/lib/supabase-server";
import {
  MULTIFASHION_KEY,
  clavesDeSello,
  esMarcaCodigo,
  nombreDeBloque,
  nombreZipDeMarca,
  type MarcaCodigo,
} from "./bloques";
import { esMultifashion, MULTIFASHION_LABEL } from "./multifashion";
import { formatearFecha } from "./normalizar";
import { etiquetaPeriodoCorta, periodoEfectivo } from "./periodo";
import { marcasDeEntrega, porcionEntregaParaMarca } from "./resumen-inicio";
import { cargarComprobantes } from "./entrega-comprobante";
import { signEntregaToken } from "./gallery-token";
import {
  buildComprobanteEntregaPdf,
  nombreArchivoComprobante,
  numeroComprobante,
} from "./pdf-entrega-mueble";
import {
  CONCURRENCY,
  buildResumenGastosWorkbook,
  comprimirFoto,
  descargar,
  firmarLote,
  mapLimit,
  sanitizeName,
  truncar,
  unico,
  type ClienteResumenXlsx,
  type FotoXlsx,
  type GastoXlsx,
} from "./zip-export";

/**
 * Carpeta (y pestaña) de los gastos SIN cliente.
 *
 * Reemplaza a la vieja "Impulsadoras". Decisión de Daniel: el lugar no es de un
 * tipo de gasto, es de los gastos que no tienen a quién atribuirle una tienda.
 */
export const CARPETA_GENERAL = "General";

/**
 * Encabezado de la columna de dinero del ZIP por marca.
 *
 * ⚠️ Es el TOTAL, no el subtotal — a diferencia del ZIP global. La cifra que se
 * le reporta a la marca es la que quedó congelada en el reporte del período, y
 * esa es `mk_facturas.total`. Medido contra producción: el período cerrado "mid
 * 2026" da $62.381,57 por total y $58.025,57 por subtotal; el número que Daniel
 * ya reportó es el primero.
 */
export const COL_TOTAL_MARCA = "Total";

/**
 * `Content-Disposition` con el nombre real del archivo.
 *
 * El nombre lleva acentos y el separador `·`, que no son ASCII: `filename=`
 * a secas los rompe. Se manda `filename*=UTF-8''…` (RFC 5987) para los
 * navegadores de verdad y un `filename=` sin adornos como respaldo.
 */
export function contentDisposition(nombre: string): string {
  const ascii = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "-")
    .replace(/["\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `attachment; filename="${ascii || "reporte.zip"}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}


const BUCKET = "marketing";
const LINK_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 año, igual que el ZIP global
const GALERIA_BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.fashiongr.com";

/** Textos de "no hay cliente" que el reporte congelado usa como centinela. */
const RE_SIN_CLIENTE = /^(impulsadoras y gastos sueltos|sin cliente|sin proyecto|)$/i;

// ----------------------------------------------------------------------------
// Errores con código, para que la ruta conteste en español simple
// ----------------------------------------------------------------------------

export type CodigoErrorZipMarca =
  | "MARCA_DESCONOCIDA"
  | "SIN_TABLAS_DE_PERIODO"
  | "PERIODO_NO_ENCONTRADO"
  | "PERIODO_DE_OTRA_MARCA"
  | "SIN_PERIODO_ABIERTO"
  | "MARCA_SIN_GASTO";

export class ErrorZipMarca extends Error {
  readonly codigo: CodigoErrorZipMarca;
  constructor(codigo: CodigoErrorZipMarca, mensaje: string) {
    super(mensaje);
    this.name = "ErrorZipMarca";
    this.codigo = codigo;
  }
}

// ----------------------------------------------------------------------------
// Formas de las filas que se leen
// ----------------------------------------------------------------------------

interface FacturaFila {
  id: string;
  proyecto_id: string | null;
  numero_factura: string | null;
  fecha_factura: string | null;
  proveedor: string | null;
  concepto: string | null;
  subtotal: number | null;
  total: number | null;
  impulsadora_id: string | null;
  impulsadora_mes?: string | null;
  periodo_desde?: string | null;
  periodo_hasta?: string | null;
  anulado_en: string | null;
}
interface EntregaFila {
  id: string;
  proyecto_id: string | null;
  total: number | null;
  total_por_marca: Record<string, number> | null;
  total_por_empresa_interna: Record<string, number> | null;
  notas: string | null;
  created_at: string | null;
}
interface ProyectoFila {
  id: string;
  nombre: string | null;
  tienda: string | null;
  tienda_codigo: string | null;
  anulado_en: string | null;
}
interface MarcaFila {
  id: string;
  nombre: string | null;
  codigo: string | null;
  empresa_codigo: string | null;
}
interface AdjuntoFila {
  id: string;
  tipo: string;
  factura_id: string | null;
  proyecto_id: string | null;
  url: string;
  nombre_original: string | null;
}
export interface PeriodoDeMarca {
  id: string;
  proveedor_key: string;
  nombre: string;
  estado: string;
  cerrado_en?: string | null;
  reporte?: unknown;
}
interface SelloFila {
  periodo_id: string;
  proveedor_key: string;
  tipo: string;
  documento_id: string;
}

/**
 * Línea del reporte CONGELADO, leída de forma estructural.
 *
 * ⚠️ A propósito NO se importa el tipo de `periodos-reporte.ts` en runtime: ese
 * módulo es de otro dueño y lo que llega acá es un jsonb guardado hace semanas,
 * que puede tener una forma vieja. Se lee lo que hace falta y lo que no esté se
 * trata como vacío — un reporte que no se puede leer entero no puede impedir
 * que salga el archivo.
 */
interface LineaCongelada {
  fecha: string;
  numero: string;
  proveedor: string;
  concepto: string;
  cliente: string;
  clienteCodigo: string | null;
  marca: string;
  notas: string | null;
  monto: number;
  tipo: "factura" | "entrega";
}

// ----------------------------------------------------------------------------
// Utilidades chicas
// ----------------------------------------------------------------------------

function num(x: unknown): number {
  const n = Number(x ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}
function txt(x: unknown): string {
  return String(x ?? "").trim();
}
/** Normaliza un texto para comparar (sin acentos, sin dobles espacios). */
function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
/** Extensión de un archivo de Storage, con punto. `.pdf` por defecto. */
function extensionDe(url: string, nombreOriginal: string | null): string {
  const base = String(nombreOriginal || url || "");
  const m = base.match(/\.([a-z0-9]{2,5})(?:\?|$)/i);
  return m ? `.${m[1].toLowerCase()}` : ".pdf";
}

// ----------------------------------------------------------------------------
// Lectura del reporte congelado
// ----------------------------------------------------------------------------

/** ¿El jsonb guardado tiene forma de reporte de período? */
export function tieneReporteCongelado(x: unknown): boolean {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return Array.isArray(r.facturas) || Array.isArray(r.entregas);
}

/**
 * Aplana el reporte congelado a líneas comparables.
 *
 * Facturas y entregas se leen igual porque acá se las trata igual: las dos son
 * "un papel con un monto atribuido a una marca".
 */
export function lineasDelReporte(reporte: unknown): LineaCongelada[] {
  if (!tieneReporteCongelado(reporte)) return [];
  const r = reporte as Record<string, unknown>;
  const out: LineaCongelada[] = [];
  const leer = (arr: unknown, tipo: "factura" | "entrega") => {
    if (!Array.isArray(arr)) return;
    for (const raw of arr) {
      if (!raw || typeof raw !== "object") continue;
      const l = raw as Record<string, unknown>;
      out.push({
        fecha: txt(l.fecha).slice(0, 10),
        numero: txt(l.numero),
        proveedor: txt(l.proveedor),
        concepto: txt(l.concepto),
        cliente: txt(l.cliente),
        clienteCodigo: txt(l.clienteCodigo) || null,
        marca: txt(l.marca),
        notas: l.notas == null ? null : txt(l.notas),
        monto: round2(num(l.monto)),
        tipo,
      });
    }
  };
  leer(r.facturas, "factura");
  leer(r.entregas, "entrega");
  return out;
}

/**
 * ¿A qué código de marca corresponde el texto `marca` de una línea congelada?
 *
 * 🔴 EL NOMBRE ES LO ÚNICO QUE LA LÍNEA GUARDA, y el nombre se edita: `French
 * Connection` se renombró a `Karl Lagerfeld` el 11-ago-2026. Por eso se
 * consulta el catálogo VIVO primero (que es donde vive la verdad de hoy) y
 * después los nombres de respaldo de `bloques.ts`. Una línea que no se pueda
 * reconocer NO se le adjudica a nadie: se cuenta aparte (`lineasSinMarca`) para
 * que la verificación lo vea en cero, porque meterla en la marca equivocada
 * mandaría plata ajena en el reporte de alguien.
 */
export function codigoDeNombreDeMarca(
  nombre: string,
  marcas: ReadonlyArray<{ codigo?: string | null; nombre?: string | null }>,
): string | null {
  const n = norm(nombre);
  if (!n) return null;
  for (const m of marcas) {
    const cod = txt(m.codigo).toUpperCase();
    if (!cod) continue;
    if (norm(m.nombre) === n) return cod;
    if (norm(cod) === n) return cod; // la línea guardó el código pelado
  }
  // Respaldo: los nombres constantes de bloques.ts (catálogo no disponible).
  for (const cod of ["TH", "CK", "KL", "RBK", "J"]) {
    if (norm(nombreDeBloque(cod)) === n) return cod;
  }
  return null;
}

// ----------------------------------------------------------------------------
// Entrada / salida públicas
// ----------------------------------------------------------------------------

export interface ZipMarcaOpciones {
  marcaCodigo: string;
  /** `null`/ausente = el período ABIERTO de esa marca. */
  periodoId?: string | null;
}

export type FuenteMontos = "congelado" | "en_vivo";

export interface ZipMarcaResult {
  buffer: Buffer;
  /** `<Marca> · <Período>.zip` (`Multifashion · <fecha>.zip` sin período). */
  filename: string;
  /** Código de marca, o `multifashion` (tienda propia, sin período). */
  marcaCodigo: MarcaCodigo | typeof MULTIFASHION_KEY;
  marcaNombre: string;
  /** Vacíos para Multifashion: no tiene períodos y `periodoEstado` lo dice. */
  periodoId: string;
  periodoNombre: string;
  periodoEstado: string;
  /** De dónde salió cada monto. Ver el encabezado del módulo. */
  fuenteMontos: FuenteMontos;
  /** Suma de la hoja Resumen. */
  total: number;
  gastos: number;
  facturas: number;
  entregas: number;
  fotosIncluidas: number;
  fotosOmitidas: number;
  pdfsIncluidos: number;
  pdfsOmitidos: number;
  /** Carpetas de primer nivel dentro del ZIP, ordenadas. */
  carpetas: string[];
  /** Líneas congeladas cuya marca no se reconoció. Tiene que ser 0. */
  lineasSinMarca: number;
}

// ----------------------------------------------------------------------------
// Gasto interno (lo que alimenta el Excel y las carpetas)
// ----------------------------------------------------------------------------

interface GastoDeMarca {
  tipo: "factura" | "entrega";
  /** Id del documento vivo, o `null` si la línea congelada no tiene par. */
  documentoId: string | null;
  fecha: string;
  numero: string;
  concepto: string;
  proveedor: string;
  /** Período trabajado (quincenas de impulsadora). "" si no aplica. */
  periodoTrabajado: string;
  carpeta: string;
  /** Código D-XXX del cliente, o null (General / sin código). */
  clienteCodigo: string | null;
  monto: number;
}

/** Carpeta de un gasto: el cliente del directorio, su texto, o General. */
function carpetaDeCliente(
  codigo: string | null,
  texto: string | null,
  nombrePorCodigo: ReadonlyMap<string, string>,
): string {
  const cod = txt(codigo);
  if (cod) {
    const nombre = nombrePorCodigo.get(cod);
    if (nombre) return sanitizeName(nombre, CARPETA_GENERAL);
  }
  const t = txt(texto);
  if (!t || RE_SIN_CLIENTE.test(t)) return CARPETA_GENERAL;
  return sanitizeName(t, CARPETA_GENERAL);
}

// ----------------------------------------------------------------------------
// Construcción
// ----------------------------------------------------------------------------

/**
 * El ZIP de una descarga: una MARCA (con su período) o Multifashion (tienda
 * propia, sin período — Daniel, textual: *"descargas por marca te basta y
 * multifashion es una marca"*).
 */
export async function buildZipDeMarca(op: ZipMarcaOpciones): Promise<ZipMarcaResult> {
  return armarZipDescarga(await prepararDescarga(op));
}

/** El ZIP de Multifashion: todos sus gastos, sin concepto de período. */
export async function buildZipMultifashion(): Promise<ZipMarcaResult> {
  return armarZipDescarga(await prepararDescargaMultifashion());
}

export interface ExcelDescargaResult {
  buffer: Buffer;
  marcaNombre: string;
  periodoId: string;
  periodoNombre: string;
  periodoEstado: string;
  fuenteMontos: FuenteMontos;
  total: number;
  gastos: number;
  lineasSinMarca: number;
}

/**
 * El EXCEL de un período (el botón "Excel" del inicio), SIN armar el ZIP.
 *
 * 🔴 Es el MISMO `resumen_gastos.xlsx` que va dentro del ZIP — misma
 * preparación, mismo workbook, mismos links firmados. Si el botón Excel y el
 * ZIP dijeran números distintos sobre el mismo período, Daniel no sabría a
 * cuál creerle. Lo único que se saltea acá es bajar los archivos.
 */
export async function buildExcelDeMarca(op: ZipMarcaOpciones): Promise<ExcelDescargaResult> {
  const prep = await prepararDescarga(op);
  return {
    buffer: armarWorkbookDescarga(prep),
    marcaNombre: prep.marcaNombre,
    periodoId: prep.periodo ? String(prep.periodo.id) : "",
    periodoNombre: prep.periodo ? txt(prep.periodo.nombre) : "",
    periodoEstado: prep.periodo ? txt(prep.periodo.estado) : "sin_periodo",
    fuenteMontos: prep.usarCongelado ? "congelado" : "en_vivo",
    total: prep.total,
    gastos: prep.gastos.length,
    lineasSinMarca: prep.lineasSinMarca,
  };
}

// ----------------------------------------------------------------------------
// Preparación compartida (ZIP y Excel dicen SIEMPRE el mismo número)
// ----------------------------------------------------------------------------

/**
 * Todo lo que una descarga necesita tener resuelto: el período, los gastos con
 * su monto (congelado o en vivo), los links firmados y las fotos por carpeta.
 */
interface PrepDescarga {
  codigo: MarcaCodigo | typeof MULTIFASHION_KEY;
  marcaNombre: string;
  /** `null` = Multifashion: tienda propia, sin períodos. */
  periodo: PeriodoDeMarca | null;
  usarCongelado: boolean;
  lineasSinMarca: number;
  gastos: GastoDeMarca[];
  total: number;
  comprobantesPorFactura: Map<string, AdjuntoFila[]>;
  fotosPorCarpeta: Map<string, AdjuntoFila[]>;
  urlFirmada: Map<string, string>;
  comprobantesEntrega: Awaited<ReturnType<typeof cargarComprobantes>>;
  linkPorGasto: Map<string, string>;
}

async function prepararDescarga(op: ZipMarcaOpciones): Promise<PrepDescarga> {
  if (txt(op.marcaCodigo).toLowerCase() === MULTIFASHION_KEY) {
    return prepararDescargaMultifashion();
  }
  return prepararDescargaDeMarca(op);
}

async function prepararDescargaDeMarca(op: ZipMarcaOpciones): Promise<PrepDescarga> {
  const marcaCodigo = txt(op.marcaCodigo).toUpperCase();
  if (!esMarcaCodigo(marcaCodigo)) {
    throw new ErrorZipMarca(
      "MARCA_DESCONOCIDA",
      "Esa marca no existe. Las marcas con reporte son Tommy, Calvin, Karl, Reebok y Joybees.",
    );
  }
  const marca = marcaCodigo as MarcaCodigo;
  const claves = clavesDeSello(marca);
  const periodoIdPedido = txt(op.periodoId) || null;

  // 1. UNA sola tanda de lecturas. La base de Daniel se satura fácil: nada de
  //    una consulta por documento ni de barridos en bucle.
  const [perRes, selloRes, factRes, fmRes, proyRes, marcasRes, entRes, adjRes] =
    await Promise.all([
      supabaseServer
        .from("mk_periodos")
        .select("id, proveedor_key, nombre, estado, cerrado_en, reporte"),
      supabaseServer
        .from("mk_periodo_documentos")
        .select("periodo_id, proveedor_key, tipo, documento_id"),
      supabaseServer
        .from("mk_facturas")
        .select(
          "id, proyecto_id, numero_factura, fecha_factura, proveedor, concepto, subtotal, total, impulsadora_id, impulsadora_mes, periodo_desde, periodo_hasta, anulado_en",
        ),
      supabaseServer.from("mk_factura_marcas").select("factura_id, marca_id, porcentaje"),
      supabaseServer
        .from("mk_proyectos")
        .select("id, nombre, tienda, tienda_codigo, anulado_en"),
      supabaseServer.from("mk_marcas").select("id, nombre, codigo, empresa_codigo"),
      supabaseServer
        .from("mk_entregas_muebles")
        .select(
          "id, proyecto_id, total, total_por_marca, total_por_empresa_interna, notas, created_at",
        ),
      supabaseServer
        .from("mk_adjuntos")
        .select("id, tipo, factura_id, proyecto_id, url, nombre_original")
        // `foto_instalacion` la habilita la migración 20260811180000. Pedirla
        // antes no rompe nada: si todavía no existe ninguna, no viene ninguna.
        .in("tipo", ["pdf_factura", "foto_factura", "foto_proyecto", "foto_instalacion"]),
    ]);

  if (perRes.error || selloRes.error) {
    throw new ErrorZipMarca(
      "SIN_TABLAS_DE_PERIODO",
      "Todavía no están creados los períodos de marketing. Hay que correr la migración antes de bajar el reporte.",
    );
  }
  if (factRes.error) throw new Error(`facturas: ${factRes.error.message}`);
  if (fmRes.error) throw new Error(`factura_marcas: ${fmRes.error.message}`);
  if (proyRes.error) throw new Error(`proyectos: ${proyRes.error.message}`);
  if (marcasRes.error) throw new Error(`marcas: ${marcasRes.error.message}`);
  if (entRes.error) throw new Error(`entregas: ${entRes.error.message}`);
  if (adjRes.error) throw new Error(`adjuntos: ${adjRes.error.message}`);

  const periodos = (perRes.data ?? []) as PeriodoDeMarca[];
  const sellos = (selloRes.data ?? []) as SelloFila[];
  const facturas = (factRes.data ?? []) as FacturaFila[];
  const facturaMarcas = (fmRes.data ?? []) as Array<{
    factura_id: string;
    marca_id: string;
    porcentaje: number | null;
  }>;
  const proyectos = (proyRes.data ?? []) as ProyectoFila[];
  const marcas = (marcasRes.data ?? []) as MarcaFila[];
  const entregas = (entRes.data ?? []) as EntregaFila[];
  const adjuntos = (adjRes.data ?? []) as AdjuntoFila[];

  const marcaNombre = nombreDeBloque(marca, marcas);

  // 2. El período. Con id → ese; sin id → el ABIERTO de la marca.
  const periodo = elegirPeriodo(periodos, claves, periodoIdPedido, marcaNombre);

  // 3. Qué documentos son de ESTA marca (dato vivo, no un monto).
  const marcaFila = marcas.find(
    (m) => txt(m.codigo).toUpperCase() === marca,
  );
  const marcaId = marcaFila ? String(marcaFila.id) : null;

  const proyectoById = new Map(proyectos.map((p) => [String(p.id), p]));
  const esProyectoMultifashion = (pid: string | null): boolean => {
    if (!pid) return false;
    const p = proyectoById.get(String(pid));
    return !!p && esMultifashion(p);
  };
  const proyectoVivo = (pid: string | null): boolean => {
    if (!pid) return false;
    const p = proyectoById.get(String(pid));
    return !!p && !p.anulado_en;
  };

  // 4. Sello efectivo de un documento para ESTA marca: primero por código de
  //    marca, después por la clave vieja del proveedor. Sin esto, con la DDL
  //    sin correr no se encontraría ningún sello y el ZIP saldría VACÍO.
  const selloPorClave = new Map<string, string>();
  for (const s of sellos) {
    selloPorClave.set(
      `${txt(s.tipo)}::${String(s.documento_id)}::${txt(s.proveedor_key)}`,
      String(s.periodo_id),
    );
  }
  const periodoSellado = (tipo: string, docId: string): string | null => {
    for (const k of claves) {
      const pid = selloPorClave.get(`${tipo}::${docId}::${k}`);
      if (pid) return pid;
    }
    return null;
  };
  const estadoPeriodo = new Map(periodos.map((p) => [String(p.id), txt(p.estado)]));

  /**
   * ¿Este documento entra en el período que se está bajando?
   *
   * Cerrado: SOLO lo que quedó sellado a él. Abierto: lo suyo, lo que no tiene
   * sello (sin sello = período actual, el mismo default de la pantalla) y lo
   * que está sellado a otro período que TAMPOCO se cerró — que es lo que hace
   * que la marca vea sus gastos aunque sus sellos sigan bajo la clave vieja.
   */
  const entraEnElPeriodo = (tipo: "factura" | "entrega", docId: string): boolean => {
    const pid = periodoSellado(tipo, docId);
    if (txt(periodo.estado) === "cerrado") return pid === periodo.id;
    if (!pid) return true;
    if (pid === periodo.id) return true;
    return estadoPeriodo.get(pid) !== "cerrado";
  };

  // 4b. Facturas de la marca, con su porción. Misma aritmética que el reporte:
  //     total × (porcentaje / suma de porcentajes de esa factura).
  const rowsPorFactura = new Map<string, Array<{ marcaId: string; pct: number }>>();
  const facturaById = new Map(facturas.map((f) => [String(f.id), f]));
  for (const r of facturaMarcas) {
    const fid = String(r.factura_id);
    if (!facturaById.has(fid)) continue;
    const arr = rowsPorFactura.get(fid) ?? [];
    arr.push({ marcaId: String(r.marca_id), pct: num(r.porcentaje) });
    rowsPorFactura.set(fid, arr);
  }

  const nombrePorCodigo = await leerNombresDeCliente(proyectos);

  const facturasDeMarca: Array<{ f: FacturaFila; monto: number }> = [];
  if (marcaId) {
    for (const f of facturas) {
      if (f.anulado_en) continue;
      const pid = f.proyecto_id ? String(f.proyecto_id) : null;
      // 🔴 Multifashion NUNCA entra: es tienda propia, no se le reporta a nadie.
      if (esProyectoMultifashion(pid)) continue;
      if (pid && !proyectoVivo(pid)) continue;
      const rows = rowsPorFactura.get(String(f.id)) ?? [];
      const mia = rows.find((r) => r.marcaId === marcaId);
      if (!mia) continue;
      if (!entraEnElPeriodo("factura", String(f.id))) continue;
      const sumPct = rows.reduce((s, r) => s + r.pct, 0) || 1;
      facturasDeMarca.push({ f, monto: round2(num(f.total) * (mia.pct / sumPct)) });
    }
  }

  const empresaPorMarca = new Map(
    marcas.map((m) => [String(m.id), m.empresa_codigo ?? null]),
  );
  const entregasDeMarca: Array<{ e: EntregaFila; monto: number }> = [];
  if (marcaId) {
    for (const e of entregas) {
      const pid = e.proyecto_id ? String(e.proyecto_id) : null;
      if (!pid || !proyectoVivo(pid) || esProyectoMultifashion(pid)) continue;
      if (!marcasDeEntrega(e).includes(marcaId)) continue;
      if (!entraEnElPeriodo("entrega", String(e.id))) continue;
      const monto = porcionEntregaParaMarca(e, marcaId, empresaPorMarca.get(marcaId));
      if (monto <= 0) continue;
      entregasDeMarca.push({ e, monto: round2(monto) });
    }
  }

  // 5. LOS MONTOS. Congelados si el período cerrado los tiene; en vivo si no.
  const congeladas = lineasDelReporte(periodo.reporte).filter(
    (l) => codigoDeNombreDeMarca(l.marca, marcas) === marca,
  );
  const lineasSinMarca = lineasDelReporte(periodo.reporte).filter(
    (l) => codigoDeNombreDeMarca(l.marca, marcas) === null,
  ).length;
  const usarCongelado =
    txt(periodo.estado) === "cerrado" && tieneReporteCongelado(periodo.reporte);

  let gastos: GastoDeMarca[];
  if (usarCongelado) {
    gastos = congelarEnFilas(congeladas, {
      facturasDeMarca,
      entregasDeMarca,
      proyectoById,
      nombrePorCodigo,
      periodoTrabajadoDe,
    });
  } else {
    gastos = [
      ...facturasDeMarca.map(({ f, monto }) => {
        const p = f.proyecto_id ? proyectoById.get(String(f.proyecto_id)) : undefined;
        return {
          tipo: "factura" as const,
          documentoId: String(f.id),
          fecha: txt(f.fecha_factura).slice(0, 10),
          numero: txt(f.numero_factura),
          concepto: txt(f.concepto),
          proveedor: txt(f.proveedor),
          periodoTrabajado: periodoTrabajadoDe(f),
          carpeta: carpetaDeCliente(p?.tienda_codigo ?? null, p?.tienda ?? null, nombrePorCodigo),
          clienteCodigo: p?.tienda_codigo ?? null,
          monto,
        };
      }),
      ...entregasDeMarca.map(({ e, monto }) => {
        const p = e.proyecto_id ? proyectoById.get(String(e.proyecto_id)) : undefined;
        return {
          tipo: "entrega" as const,
          documentoId: String(e.id),
          fecha: txt(e.created_at).slice(0, 10),
          numero: "",
          concepto: txt(e.notas) || "Entrega de muebles",
          proveedor: "Mobiliario",
          periodoTrabajado: "",
          carpeta: carpetaDeCliente(p?.tienda_codigo ?? null, p?.tienda ?? null, nombrePorCodigo),
          clienteCodigo: p?.tienda_codigo ?? null,
          monto,
        };
      }),
    ];
  }
  gastos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

  const total = round2(gastos.reduce((s, g) => s + g.monto, 0));

  // 6. Una marca sin gasto NO genera ZIP (decisión de Daniel). Mandarle un
  //    archivo vacío a un encargado es peor que no mandarle nada.
  if (gastos.length === 0 || total === 0) {
    throw new ErrorZipMarca(
      "MARCA_SIN_GASTO",
      `${marcaNombre} no tiene gastos en "${periodo.nombre}", así que no hay reporte que mandar.`,
    );
  }

  // 7. Los PAPELES, en vivo desde Storage: links firmados y fotos por carpeta.
  const comprobantesPorFactura = armarComprobantesPorFactura(adjuntos);
  const fotosPorCarpeta = armarFotosPorCarpeta(gastos, adjuntos, {
    proyectoDeFactura: (fid) => {
      const f = facturaById.get(fid);
      return f?.proyecto_id ? String(f.proyecto_id) : null;
    },
    proyectoDeEntrega: (eid) => {
      const e = entregas.find((x) => String(x.id) === eid);
      return e?.proyecto_id ? String(e.proyecto_id) : null;
    },
  });
  const urlFirmada = await firmarLote(
    pathsParaFirmar(gastos, comprobantesPorFactura, fotosPorCarpeta),
  );
  const comprobantesEntrega = await cargarComprobantes(
    gastos.filter((g) => g.tipo === "entrega" && g.documentoId).map((g) => g.documentoId!),
  );
  const linkPorGasto = asignarLinksYNumeros(gastos, {
    comprobantesPorFactura,
    comprobantesEntrega,
    urlFirmada,
  });

  return {
    codigo: marca,
    marcaNombre,
    periodo,
    usarCongelado,
    lineasSinMarca: usarCongelado ? lineasSinMarca : 0,
    gastos,
    total,
    comprobantesPorFactura,
    fotosPorCarpeta,
    urlFirmada,
    comprobantesEntrega,
    linkPorGasto,
  };
}

/**
 * Multifashion: tienda PROPIA. Todos los gastos de sus proyectos, sin concepto
 * de período (no se le reporta a nadie) y con el TOTAL COMPLETO de cada
 * documento — su gasto no se reparte con ninguna contraparte, que es el mismo
 * número que suma su tarjeta en el inicio (`resumen-bloques` suma `f.total`
 * entero). La regla de pertenencia es la de `lib/marketing/multifashion.ts`.
 */
async function prepararDescargaMultifashion(): Promise<PrepDescarga> {
  const [factRes, proyRes, entRes, adjRes] = await Promise.all([
    supabaseServer
      .from("mk_facturas")
      .select(
        "id, proyecto_id, numero_factura, fecha_factura, proveedor, concepto, subtotal, total, impulsadora_id, impulsadora_mes, periodo_desde, periodo_hasta, anulado_en",
      ),
    supabaseServer
      .from("mk_proyectos")
      .select("id, nombre, tienda, tienda_codigo, anulado_en"),
    supabaseServer
      .from("mk_entregas_muebles")
      .select(
        "id, proyecto_id, total, total_por_marca, total_por_empresa_interna, notas, created_at",
      ),
    supabaseServer
      .from("mk_adjuntos")
      .select("id, tipo, factura_id, proyecto_id, url, nombre_original")
      .in("tipo", ["pdf_factura", "foto_factura", "foto_proyecto", "foto_instalacion"]),
  ]);
  if (factRes.error) throw new Error(`facturas: ${factRes.error.message}`);
  if (proyRes.error) throw new Error(`proyectos: ${proyRes.error.message}`);
  if (entRes.error) throw new Error(`entregas: ${entRes.error.message}`);
  if (adjRes.error) throw new Error(`adjuntos: ${adjRes.error.message}`);

  const facturas = (factRes.data ?? []) as FacturaFila[];
  const proyectos = (proyRes.data ?? []) as ProyectoFila[];
  const entregas = (entRes.data ?? []) as EntregaFila[];
  const adjuntos = (adjRes.data ?? []) as AdjuntoFila[];

  // SOLO los proyectos Multifashion vivos. Un gasto sin proyecto (los pagos de
  // impulsadora) nunca es Multifashion: sin proyecto no hay tienda que mirar.
  const proyectosMf = proyectos.filter((p) => !p.anulado_en && esMultifashion(p));
  const proyectoById = new Map(proyectosMf.map((p) => [String(p.id), p]));
  const facturaById = new Map(facturas.map((f) => [String(f.id), f]));
  const nombrePorCodigo = await leerNombresDeCliente(proyectosMf);

  const gastos: GastoDeMarca[] = [];
  for (const f of facturas) {
    if (f.anulado_en) continue;
    const pid = f.proyecto_id ? String(f.proyecto_id) : null;
    const p = pid ? proyectoById.get(pid) : undefined;
    if (!p) continue; // no es Multifashion (o su proyecto está en papelera)
    gastos.push({
      tipo: "factura",
      documentoId: String(f.id),
      fecha: txt(f.fecha_factura).slice(0, 10),
      numero: txt(f.numero_factura),
      concepto: txt(f.concepto),
      proveedor: txt(f.proveedor),
      periodoTrabajado: periodoTrabajadoDe(f),
      carpeta: carpetaDeCliente(p.tienda_codigo ?? null, p.tienda ?? null, nombrePorCodigo),
      clienteCodigo: p.tienda_codigo ?? null,
      monto: round2(num(f.total)),
    });
  }
  for (const e of entregas) {
    const pid = e.proyecto_id ? String(e.proyecto_id) : null;
    const p = pid ? proyectoById.get(pid) : undefined;
    if (!p) continue;
    gastos.push({
      tipo: "entrega",
      documentoId: String(e.id),
      fecha: txt(e.created_at).slice(0, 10),
      numero: "",
      concepto: txt(e.notas) || "Entrega de muebles",
      proveedor: "Mobiliario",
      periodoTrabajado: "",
      carpeta: carpetaDeCliente(p.tienda_codigo ?? null, p.tienda ?? null, nombrePorCodigo),
      clienteCodigo: p.tienda_codigo ?? null,
      monto: round2(num(e.total)),
    });
  }
  gastos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  const total = round2(gastos.reduce((s, g) => s + g.monto, 0));

  if (gastos.length === 0 || total === 0) {
    throw new ErrorZipMarca(
      "MARCA_SIN_GASTO",
      "Multifashion no tiene gastos registrados, así que no hay archivo que bajar.",
    );
  }

  const comprobantesPorFactura = armarComprobantesPorFactura(adjuntos);
  const fotosPorCarpeta = armarFotosPorCarpeta(gastos, adjuntos, {
    proyectoDeFactura: (fid) => {
      const f = facturaById.get(fid);
      return f?.proyecto_id ? String(f.proyecto_id) : null;
    },
    proyectoDeEntrega: (eid) => {
      const e = entregas.find((x) => String(x.id) === eid);
      return e?.proyecto_id ? String(e.proyecto_id) : null;
    },
  });
  const urlFirmada = await firmarLote(
    pathsParaFirmar(gastos, comprobantesPorFactura, fotosPorCarpeta),
  );
  const comprobantesEntrega = await cargarComprobantes(
    gastos.filter((g) => g.tipo === "entrega" && g.documentoId).map((g) => g.documentoId!),
  );
  const linkPorGasto = asignarLinksYNumeros(gastos, {
    comprobantesPorFactura,
    comprobantesEntrega,
    urlFirmada,
  });

  return {
    codigo: MULTIFASHION_KEY,
    marcaNombre: MULTIFASHION_LABEL,
    periodo: null,
    usarCongelado: false,
    lineasSinMarca: 0,
    gastos,
    total,
    comprobantesPorFactura,
    fotosPorCarpeta,
    urlFirmada,
    comprobantesEntrega,
    linkPorGasto,
  };
}

// ----------------------------------------------------------------------------
// Piezas compartidas de la preparación
// ----------------------------------------------------------------------------

/** Período trabajado (quincenas de impulsadora). "" si no aplica. */
function periodoTrabajadoDe(f: FacturaFila | undefined): string {
  if (!f) return "";
  const per = periodoEfectivo(f);
  return per ? etiquetaPeriodoCorta(per) : "";
}

/** Hoy en día-calendario de Panamá (UTC-5 fijo, sin horario de verano). */
function hoyPanamaISO(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Comprobante = pdf_factura o foto_factura. Lo lleva TODO gasto, impulsadoras
 * incluidas: *"pero impulsadora tambien necesita comprobante, pero no foto.
 * aunq el comprobante sea una foto."*
 */
function armarComprobantesPorFactura(
  adjuntos: ReadonlyArray<AdjuntoFila>,
): Map<string, AdjuntoFila[]> {
  const out = new Map<string, AdjuntoFila[]>();
  for (const a of adjuntos) {
    if ((a.tipo === "pdf_factura" || a.tipo === "foto_factura") && a.factura_id) {
      const arr = out.get(String(a.factura_id)) ?? [];
      arr.push(a);
      out.set(String(a.factura_id), arr);
    }
  }
  return out;
}

/**
 * Fotos por carpeta: las de INSTALACIÓN del gasto (`foto_instalacion`, cuelga
 * de la factura — un evento sin cliente tiene fotos igual y salen en
 * General/fotos/) + las del proyecto (`foto_proyecto`). Dedup por id — dos
 * gastos del mismo proyecto comparten fotos.
 */
function armarFotosPorCarpeta(
  gastos: ReadonlyArray<GastoDeMarca>,
  adjuntos: ReadonlyArray<AdjuntoFila>,
  ctx: {
    proyectoDeFactura: (facturaId: string) => string | null;
    proyectoDeEntrega: (entregaId: string) => string | null;
  },
): Map<string, AdjuntoFila[]> {
  const fotosPorFactura = new Map<string, AdjuntoFila[]>();
  const fotosPorProyecto = new Map<string, AdjuntoFila[]>();
  for (const a of adjuntos) {
    if (a.tipo === "foto_instalacion" && a.factura_id) {
      const arr = fotosPorFactura.get(String(a.factura_id)) ?? [];
      arr.push(a);
      fotosPorFactura.set(String(a.factura_id), arr);
    } else if (a.tipo === "foto_proyecto" && a.proyecto_id) {
      const arr = fotosPorProyecto.get(String(a.proyecto_id)) ?? [];
      arr.push(a);
      fotosPorProyecto.set(String(a.proyecto_id), arr);
    }
  }

  const out = new Map<string, AdjuntoFila[]>();
  const vistas = new Set<string>();
  const anotarFoto = (carpeta: string, a: AdjuntoFila) => {
    const k = `${carpeta}::${a.id}`;
    if (vistas.has(k)) return;
    vistas.add(k);
    const arr = out.get(carpeta) ?? [];
    arr.push(a);
    out.set(carpeta, arr);
  };
  for (const g of gastos) {
    if (!g.documentoId) continue;
    if (g.tipo === "factura") {
      for (const a of fotosPorFactura.get(g.documentoId) ?? []) anotarFoto(g.carpeta, a);
      const pid = ctx.proyectoDeFactura(g.documentoId);
      if (pid) for (const a of fotosPorProyecto.get(pid) ?? []) anotarFoto(g.carpeta, a);
    } else {
      const pid = ctx.proyectoDeEntrega(g.documentoId);
      if (pid) for (const a of fotosPorProyecto.get(pid) ?? []) anotarFoto(g.carpeta, a);
    }
  }
  return out;
}

/** Todo lo que va con link en el Excel, para firmarlo en UNA llamada. */
function pathsParaFirmar(
  gastos: ReadonlyArray<GastoDeMarca>,
  comprobantesPorFactura: ReadonlyMap<string, AdjuntoFila[]>,
  fotosPorCarpeta: ReadonlyMap<string, AdjuntoFila[]>,
): string[] {
  const paths: string[] = [];
  for (const g of gastos) {
    if (g.tipo !== "factura" || !g.documentoId) continue;
    for (const c of comprobantesPorFactura.get(g.documentoId) ?? []) paths.push(c.url);
  }
  for (const arr of fotosPorCarpeta.values()) for (const a of arr) paths.push(a.url);
  return Array.from(new Set(paths));
}

/**
 * Links y números de comprobante de cada gasto — SIN bajar un solo archivo.
 * Por eso el Excel del botón y el del ZIP llevan los MISMOS links: los dos
 * salen de acá. A las entregas les pone su número (`ME-0007`) — antes lo hacía
 * el armado del ZIP y el Excel suelto habría salido sin número.
 */
function asignarLinksYNumeros(
  gastos: GastoDeMarca[],
  ctx: {
    comprobantesPorFactura: ReadonlyMap<string, AdjuntoFila[]>;
    comprobantesEntrega: PrepDescarga["comprobantesEntrega"];
    urlFirmada: ReadonlyMap<string, string>;
  },
): Map<string, string> {
  const out = new Map<string, string>();
  for (const g of gastos) {
    if (!g.documentoId) continue; // línea congelada sin papel vivo: sin link
    if (g.tipo === "factura") {
      const primero = (ctx.comprobantesPorFactura.get(g.documentoId) ?? [])[0];
      const firmado = primero ? ctx.urlFirmada.get(primero.url) : undefined;
      if (firmado) out.set(claveGasto(g), firmado);
    } else {
      const datos = ctx.comprobantesEntrega.get(g.documentoId);
      if (!datos) continue;
      // El "N° de factura" de una entrega es el del comprobante que generamos.
      g.numero = numeroComprobante(datos);
      try {
        out.set(
          claveGasto(g),
          `${GALERIA_BASE}/api/marketing/entregas-pdf/${encodeURIComponent(g.documentoId)}?t=${signEntregaToken(g.documentoId)}`,
        );
      } catch {
        // Sin SESSION_SECRET no se firma: la fila queda sin link, con su PDF.
      }
    }
  }
  return out;
}

// ----------------------------------------------------------------------------
// El Excel y el ZIP, desde la MISMA preparación
// ----------------------------------------------------------------------------

/**
 * Subtítulo del Excel: de qué período es y de dónde salieron los montos.
 * El camino "cerrado sin reporte congelado" LO DECLARA — no se le miente a
 * quien lee el archivo.
 */
function subtituloDescarga(prep: PrepDescarga): string {
  const hoy = formatearFecha(hoyPanamaISO());
  if (!prep.periodo) return `Gastos al ${hoy}`; // Multifashion, sin período
  const nombre = txt(prep.periodo.nombre);
  if (txt(prep.periodo.estado) !== "cerrado") {
    return `${nombre} · período abierto — gastos al ${hoy}`;
  }
  if (prep.usarCongelado) {
    const f = prep.periodo.cerrado_en ? formatearFecha(prep.periodo.cerrado_en) : "";
    return f ? `${nombre} · cerrado el ${f}` : `${nombre} · cerrado`;
  }
  return `${nombre} · calculado el ${hoy} (este período se cerró sin reporte guardado)`;
}

/**
 * El `resumen_gastos.xlsx` de la descarga — MISMO constructor que el ZIP
 * global, SIN columnas de marca (cada archivo ya es de UNA sola) y con el
 * título/subtítulo del período. No hay un segundo Excel.
 */
function armarWorkbookDescarga(prep: PrepDescarga): Buffer {
  const clientes = armarClientes(prep.gastos, {
    linkPorGasto: prep.linkPorGasto,
    fotosPorCarpeta: prep.fotosPorCarpeta,
    urlFirmada: prep.urlFirmada,
    marcaCodigo: prep.codigo,
    marcaNombre: prep.marcaNombre,
  });
  const wb = buildResumenGastosWorkbook(clientes, {
    etiquetaMonto: COL_TOTAL_MARCA,
    sinColumnasDeMarca: true,
    titulo: `FASHION GROUP — ${prep.marcaNombre}`,
    subtitulo: subtituloDescarga(prep),
  });
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

async function armarZipDescarga(prep: PrepDescarga): Promise<ZipMarcaResult> {
  const {
    gastos,
    marcaNombre,
    comprobantesPorFactura,
    comprobantesEntrega,
    fotosPorCarpeta,
  } = prep;

  // 8. Armado del ZIP.
  const zip = new JSZip();
  let fotosIncluidas = 0;
  let fotosOmitidas = 0;
  let pdfsIncluidos = 0;
  let pdfsOmitidos = 0;
  const usadosPorCarpeta = new Map<string, Set<string>>();
  const setDe = (m: Map<string, Set<string>>, k: string): Set<string> => {
    let s = m.get(k);
    if (!s) {
      s = new Set<string>();
      m.set(k, s);
    }
    return s;
  };

  // 8a. Comprobantes de factura. El nombre lleva LA MARCA, que es lo que hace
  //     que dos ZIP distintos abiertos en la misma carpeta no se pisen.
  //     (Los links del Excel ya vienen resueltos en la preparación.)
  await mapLimit(
    gastos.filter((g) => g.tipo === "factura" && g.documentoId),
    CONCURRENCY,
    async (g) => {
      const comps = comprobantesPorFactura.get(g.documentoId!) ?? [];
      if (comps.length === 0) return;
      const usados = setDe(usadosPorCarpeta, `${g.carpeta}/facturas`);
      const base = sanitizeName(
        `${g.fecha} · ${marcaNombre} · ${truncar(g.concepto, 50)}`,
        `${marcaNombre} · ${g.numero || "comprobante"}`,
      );
      let idx = 0;
      for (const c of comps) {
        const buf = await descargar(c.url);
        if (!buf) {
          pdfsOmitidos++;
          continue;
        }
        const etiqueta = comps.length > 1 ? `${base} (${++idx})` : base;
        zip.file(
          `${g.carpeta}/facturas/${unico(etiqueta, usados)}${extensionDe(c.url, c.nombre_original)}`,
          buf,
        );
        pdfsIncluidos++;
      }
    },
  );

  // 8b. Comprobante de cada entrega de mobiliario: se GENERA al vuelo (no
  //     existe como adjunto), igual que en el ZIP global.
  for (const g of gastos) {
    if (g.tipo !== "entrega" || !g.documentoId) continue;
    const datos = comprobantesEntrega.get(g.documentoId);
    if (!datos) {
      pdfsOmitidos++;
      continue;
    }
    const usados = setDe(usadosPorCarpeta, `${g.carpeta}/facturas`);
    try {
      // SIN bultos: este papel va a la MARCA, no viaja con la mercancía.
      // Daniel: *"lo de los bultos no es para el comprobante que le mando a la
      // marca, sino para el envio del producto al cliente"*.
      const buf = buildComprobanteEntregaPdf(datos, { incluirBultos: false });
      const nombre = unico(
        sanitizeName(
          `${nombreArchivoComprobante(datos)} · ${marcaNombre}`,
          `${marcaNombre} · Entrega de mobiliario`,
        ),
        usados,
      );
      zip.file(`${g.carpeta}/facturas/${nombre}.pdf`, buf);
      pdfsIncluidos++;
      // El link del Excel y el número del comprobante ya vienen puestos por la
      // preparación (`asignarLinksYNumeros`) — el mismo par que usa el botón
      // Excel, para que ZIP y Excel no puedan decir cosas distintas.
    } catch {
      pdfsOmitidos++; // un comprobante que falle no tumba el ZIP entero
    }
  }

  // 8c. Fotos (comprimidas), por carpeta. General incluida.
  for (const [carpeta, arr] of fotosPorCarpeta) {
    const usados = setDe(usadosPorCarpeta, `${carpeta}/fotos`);
    await mapLimit(arr, CONCURRENCY, async (foto, i) => {
      const raw = await descargar(foto.url);
      const out = raw ? await comprimirFoto(raw) : null;
      if (!out) {
        fotosOmitidas++;
        return;
      }
      const base = sanitizeName(
        foto.nombre_original?.replace(/\.[^.]+$/, ""),
        `foto_${i + 1}`,
      );
      zip.file(`${carpeta}/fotos/${unico(base, usados)}.jpg`, out);
      fotosIncluidas++;
    });
  }

  // 9. El Excel — el MISMO workbook que baja el botón "Excel". No hay dos.
  zip.file("resumen_gastos.xlsx", armarWorkbookDescarga(prep));

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const carpetas = Array.from(
    new Set(
      Object.keys(zip.files)
        .map((n) => n.split("/")[0])
        .filter((n) => n && n !== "resumen_gastos.xlsx"),
    ),
  ).sort((a, b) => a.localeCompare(b, "es"));

  return {
    buffer,
    filename: nombreZipDeMarca(
      marcaNombre,
      // Sin período (Multifashion) el archivo se fecha: "Multifashion · 12 ago 2026.zip".
      prep.periodo ? prep.periodo.nombre : formatearFecha(hoyPanamaISO()),
    ),
    marcaCodigo: prep.codigo,
    marcaNombre,
    periodoId: prep.periodo ? String(prep.periodo.id) : "",
    periodoNombre: prep.periodo ? txt(prep.periodo.nombre) : "",
    periodoEstado: prep.periodo ? txt(prep.periodo.estado) : "sin_periodo",
    fuenteMontos: prep.usarCongelado ? "congelado" : "en_vivo",
    total: prep.total,
    gastos: gastos.length,
    facturas: gastos.filter((g) => g.tipo === "factura").length,
    entregas: gastos.filter((g) => g.tipo === "entrega").length,
    fotosIncluidas,
    fotosOmitidas,
    pdfsIncluidos,
    pdfsOmitidos,
    carpetas,
    lineasSinMarca: prep.lineasSinMarca,
  };
}

// ----------------------------------------------------------------------------
// Piezas
// ----------------------------------------------------------------------------

function claveGasto(g: GastoDeMarca): string {
  return `${g.tipo}::${g.documentoId ?? `${g.fecha}|${g.numero}|${g.concepto}`}`;
}

/** El período que se va a bajar. */
export function elegirPeriodo(
  periodos: ReadonlyArray<PeriodoDeMarca>,
  claves: ReadonlyArray<string>,
  periodoIdPedido: string | null,
  marcaNombre: string,
): PeriodoDeMarca {
  if (periodoIdPedido) {
    const p = periodos.find((x) => String(x.id) === periodoIdPedido);
    if (!p) {
      throw new ErrorZipMarca(
        "PERIODO_NO_ENCONTRADO",
        "Ese período no existe. Puede que lo hayan borrado o que el enlace sea viejo.",
      );
    }
    if (!claves.includes(txt(p.proveedor_key))) {
      throw new ErrorZipMarca(
        "PERIODO_DE_OTRA_MARCA",
        `Ese período no es de ${marcaNombre}.`,
      );
    }
    return p;
  }
  // Sin id: el ABIERTO de la marca. Primero por código; si la migración
  // todavía no corrió, por la clave vieja del proveedor.
  for (const k of claves) {
    const p = periodos.find(
      (x) => txt(x.proveedor_key) === k && txt(x.estado) === "abierto",
    );
    if (p) return p;
  }
  throw new ErrorZipMarca(
    "SIN_PERIODO_ABIERTO",
    `${marcaNombre} no tiene un período abierto. Hay que abrir uno antes de bajar el reporte.`,
  );
}

/** Nombre de cliente del directorio por código D-XXX. */
async function leerNombresDeCliente(
  proyectos: ReadonlyArray<ProyectoFila>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const codigos = Array.from(
    new Set(proyectos.map((p) => txt(p.tienda_codigo)).filter((c) => c.length > 0)),
  );
  if (codigos.length === 0) return out;
  const { data } = await supabaseServer
    .from("clientes_master")
    .select("codigo, nombre")
    .in("codigo", codigos);
  for (const c of (data ?? []) as Array<{ codigo: string; nombre: string }>) {
    out.set(String(c.codigo), String(c.nombre ?? ""));
  }
  return out;
}

/**
 * Convierte las líneas CONGELADAS en filas del Excel.
 *
 * 🔴 TODA línea congelada produce una fila. Ninguna se descarta por no
 * encontrar su documento vivo: si el papel se borró, la plata igual se reportó
 * y tiene que seguir apareciendo. Lo que se busca en los documentos vivos es
 * SOLO el link y el id — cosas cosméticas al lado del monto.
 */
function congelarEnFilas(
  lineas: ReadonlyArray<LineaCongelada>,
  ctx: {
    facturasDeMarca: ReadonlyArray<{ f: FacturaFila; monto: number }>;
    entregasDeMarca: ReadonlyArray<{ e: EntregaFila; monto: number }>;
    proyectoById: ReadonlyMap<string, ProyectoFila>;
    nombrePorCodigo: ReadonlyMap<string, string>;
    periodoTrabajadoDe: (f: FacturaFila | undefined) => string;
  },
): GastoDeMarca[] {
  // Índices "consumibles": una línea congelada se aparea con UN documento vivo.
  const porFactura = new Map<string, FacturaFila[]>();
  for (const { f } of ctx.facturasDeMarca) {
    const k = claveFacturaCongelada(
      txt(f.fecha_factura).slice(0, 10),
      txt(f.numero_factura),
      txt(f.concepto),
      txt(f.proveedor),
    );
    const arr = porFactura.get(k) ?? [];
    arr.push(f);
    porFactura.set(k, arr);
  }
  const porEntrega = new Map<string, EntregaFila[]>();
  for (const { e } of ctx.entregasDeMarca) {
    const k = claveEntregaCongelada(txt(e.created_at).slice(0, 10), e.notas);
    const arr = porEntrega.get(k) ?? [];
    arr.push(e);
    porEntrega.set(k, arr);
  }

  return lineas.map((l) => {
    let documentoId: string | null = null;
    let periodoTrabajado = "";
    if (l.tipo === "factura") {
      const arr = porFactura.get(
        claveFacturaCongelada(l.fecha, l.numero, l.concepto, l.proveedor),
      );
      const f = arr?.shift();
      documentoId = f ? String(f.id) : null;
      periodoTrabajado = ctx.periodoTrabajadoDe(f);
    } else {
      const arr = porEntrega.get(claveEntregaCongelada(l.fecha, l.notas));
      const e = arr?.shift();
      documentoId = e ? String(e.id) : null;
    }
    return {
      tipo: l.tipo,
      documentoId,
      fecha: l.fecha,
      numero: l.numero,
      concepto:
        l.tipo === "entrega" ? l.notas?.trim() || "Entrega de muebles" : l.concepto,
      proveedor: l.tipo === "entrega" ? "Mobiliario" : l.proveedor,
      periodoTrabajado,
      carpeta: carpetaDeCliente(l.clienteCodigo, l.cliente, ctx.nombrePorCodigo),
      clienteCodigo: l.clienteCodigo,
      // 🔴 EL MONTO SALE TAL CUAL DEL REPORTE. No se recalcula, no se redondea
      //    de vuelta, no se compara contra el documento vivo.
      monto: l.monto,
    };
  });
}

function claveFacturaCongelada(
  fecha: string,
  numero: string,
  concepto: string,
  proveedor: string,
): string {
  return [fecha, norm(numero), norm(concepto), norm(proveedor)].join("|");
}
function claveEntregaCongelada(fecha: string, notas: string | null): string {
  return [fecha, norm(notas ?? "")].join("|");
}

/**
 * Agrupa los gastos por carpeta y los deja con la forma que pide
 * `buildResumenGastosWorkbook`. General va SIEMPRE al final.
 */
function armarClientes(
  gastos: ReadonlyArray<GastoDeMarca>,
  ctx: {
    linkPorGasto: ReadonlyMap<string, string>;
    fotosPorCarpeta: ReadonlyMap<string, AdjuntoFila[]>;
    urlFirmada: ReadonlyMap<string, string>;
    marcaCodigo: MarcaCodigo | typeof MULTIFASHION_KEY;
    marcaNombre: string;
  },
): ClienteResumenXlsx[] {
  const buckets = new Map<
    string,
    { gastos: GastoXlsx[]; codigo: string | null; total: number }
  >();
  const bucket = (nombre: string) => {
    let b = buckets.get(nombre);
    if (!b) {
      b = { gastos: [], codigo: null, total: 0 };
      buckets.set(nombre, b);
    }
    return b;
  };

  for (const g of gastos) {
    const b = bucket(g.carpeta);
    if (!b.codigo && g.clienteCodigo) b.codigo = g.clienteCodigo;
    b.total += g.monto;
    b.gastos.push({
      fecha: g.fecha,
      periodo: g.periodoTrabajado,
      concepto: g.concepto,
      proveedor: g.proveedor,
      marca: ctx.marcaNombre,
      numero: g.numero,
      // La única columna de dinero: el monto reportado a la marca. `subtotal` y
      // `total` van iguales a propósito — el constructor usa el primero para
      // las columnas y el segundo para ordenar, y dos cifras distintas harían
      // que el orden de la hoja no correspondiera con lo que la hoja muestra.
      subtotal: g.monto,
      total: g.monto,
      partes: [{ codigo: ctx.marcaCodigo, monto: g.monto }],
      signed: ctx.linkPorGasto.get(claveGasto(g)),
      etiquetaLink: g.tipo === "entrega" ? "Ver comprobante" : "Ver factura",
    });
  }

  // Las carpetas que solo tienen fotos también existen como pestaña.
  for (const carpeta of ctx.fotosPorCarpeta.keys()) bucket(carpeta);

  const fotosDe = (carpeta: string): FotoXlsx[] =>
    (ctx.fotosPorCarpeta.get(carpeta) ?? []).map((a) => ({
      archivo: a.nombre_original || "foto",
      signed: ctx.urlFirmada.get(a.url),
    }));

  const nombres = Array.from(buckets.keys()).sort((a, b) => {
    if (a === CARPETA_GENERAL) return 1;
    if (b === CARPETA_GENERAL) return -1;
    return buckets.get(b)!.total - buckets.get(a)!.total;
  });

  return nombres.map((nombre) => {
    const b = buckets.get(nombre)!;
    return {
      nombre,
      codigo: b.codigo,
      marcas: ctx.marcaCodigo,
      gastos: b.gastos,
      fotos: fotosDe(nombre),
    };
  });
}
