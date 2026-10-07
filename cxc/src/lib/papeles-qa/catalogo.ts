// ─────────────────────────────────────────────────────────────────────────────
// TODOS LOS PAPELES DEL SISTEMA, CON DATOS DE EJEMPLO (6-oct-2026).
//
// Cada entrada arma el PDF o el Excel con la MISMA función que usa la
// pantalla, sobre datos inventados (nunca la base). Los nombres y montos son
// largos a propósito: el peor caso es el que encima textos.
//
// 🔴 Un papel nuevo se agrega AQUÍ: así entra a la prueba
// `papeles-sin-encimar.test.ts` y a la galería de `scripts/revisar-papeles.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import type jsPDF from "jspdf";
import type { WorkBook, WorkSheet } from "xlsx-js-style";
import { construirPdfComision } from "@/lib/comisiones/pdf-comision";
import { construirPdfTablaComisiones } from "@/lib/comisiones/pdf-tabla-comisiones";
import { TITULO_PAPEL_GRUPO, tituloPapelEmpresa, type TablaPapel } from "@/lib/comisiones/tabla-papel";
import {
  buildComisionDetalleSheet,
  buildComisionesConsolidadoSheet,
  buildComisionesResumenSheet,
  type ComisionDetalle,
} from "@/lib/ventas/comisionExcel";
import { construirPdfGuias } from "@/lib/guias/pdf-guia";
import { buildGuiasSheet } from "@/app/despachos/components/excel-guias";
import type { Guia, GuiaItem } from "@/app/despachos/components/types";
import { construirPdfEtiquetas, datosDeEtiqueta } from "@/lib/guias/pdf-etiquetas";
import { cajasDelJuego, type EtiquetaFila } from "@/lib/guias/etiquetas";
import { construirPdfPedidos } from "@/lib/guias/pdf-pedidos";
import type { PedidoBodega } from "@/lib/guias/pedidos-bodega";
import { construirPdfPedidoBultos, type PapelDeBultos } from "@/lib/guias/pdf-pedido-bultos";
import { buildOrderPdfDoc, type PdfOrderItem } from "@/lib/catalogo/order-pdf-core";
import { buildCatalogPdfDoc } from "@/lib/catalogo/catalog-pdf";
import { buildEstadoCuentaLotePDF, buildEstadoCuentaPDF } from "@/lib/pdf-estado-cuenta";
import type { EstadoCuenta } from "@/lib/cxc/estado-cuenta-tipos";
import { pdfPorCompania, pdfTotalPorCliente } from "@/lib/pdf-cxc";
import { bloquesPorCompania, bloquesSaldoAFavor, filasSaldoAFavor, filasTotalPorCliente } from "@/lib/cxc/descargas";
import { libroPorCompania, libroTotalPorCliente } from "@/lib/cxc/excel-cartera";
import { B2B_COMPANIES } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";
import { buildBulkReclamosPdf } from "@/lib/reclamos/pdf-bulk";
import { buildBulkReclamosExcel } from "@/lib/reclamos/excel-bulk";
import { construirExcel, construirPdf } from "@/lib/asistencia/exportar";
import { construirExcelPlanilla, construirPdfPlanilla, type DatosPlanillaExport } from "@/lib/asistencia/planilla-exportar";
import { totalizar, type DineroLinea, type HorasPersona, type LineaPlanilla } from "@/lib/asistencia/planilla";
import type { PersonaReporte } from "@/lib/asistencia/reporte";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { textoAvisoPrestamo } from "@/lib/asistencia/prestamos-planilla";
import { armarComprobante } from "@/lib/asistencia/comprobante";
import { construirPdfComprobantes } from "@/lib/asistencia/comprobante-pdf";
import { buildComprobanteEntregaDoc } from "@/lib/marketing/pdf-entrega-mueble";
import { buildCajaWorkbook } from "@/lib/exports/caja-excel";
import { buildPrestamosWorkbook } from "@/lib/exports/prestamos-excel";
import { workbookBytes, workbookFromSheets } from "@/lib/excel-export";

export interface Papel {
  nombre: string;
  tipo: "pdf" | "xlsx";
  generar: () => Promise<Uint8Array>;
  /**
   * Por qué este papel NO sigue el estilo único (`pdf-estilo.ts`): la revisión
   * de colores no lo mide. Solo etiquetas térmicas y piezas de marca.
   */
  estiloPropio?: string;
}

const TERMICA = "Etiqueta para la Zebra térmica: blanco y negro, letra grande (docs/diseno.md, regla 11).";
const MARCA = "Lo ve el cliente: lleva el color de su marca (excepción de marca de docs/diseno.md).";

const pdf = (doc: jsPDF) => new Uint8Array(doc.output("arraybuffer"));
const libro = (wb: WorkBook) => workbookBytes(wb);
const hoja = (ws: WorkSheet, name = "Hoja") => workbookBytes(workbookFromSheets([{ name, ws }]));

// ── Comisiones ───────────────────────────────────────────────────────────────

const RODRIGO: ComisionDetalle = {
  empresa_key: "vistana",
  year: 2026,
  mes: 9,
  vendedor: "RODRIGO",
  tasa_venta: 0.0025,
  tasa_cobro: 0.0025,
  ventas: Array.from({ length: 14 }, (_, i) => ({
    fecha: `2026-09-${String(i + 2).padStart(2, "0")}`,
    cliente: i % 3 === 0 ? "Inversiones y Distribuidora Paso Canoas Internacional, S.A." : "City Mall Paso Canoa",
    secuencial: `11-0000031${String(i).padStart(2, "0")}`,
    tipo: i === 5 ? "Nota de Crédito" : "Factura",
    subtotal: i === 5 ? -420.5 : 1180.35 + i * 37,
    pct_utilidad: i === 5 ? null : 32,
  })),
  cobros: [
    { fecha: "2026-09-12", cliente: "City Mall Paso Canoa", monto: 2500 },
    { fecha: "2026-09-20", cliente: "Inversiones y Distribuidora Paso Canoas Internacional, S.A.", monto: 1800.4 },
  ],
  ventas_base: 16268,
  cobros_base: 4300.4,
  comision_venta: 40.67,
  comision_cobro: 10.75,
  comision_total: 51.42,
};

const hojaComision = (data: ComisionDetalle) => ({
  data,
  descuentos: [{ id: "d1", concepto: "Adelanto de quincena", monto: 10.75, activo: true }] as never,
  empresaNombre: "Vistana",
  vendedor: data.vendedor,
  year: data.year,
  mes: data.mes,
});

const EMPRESAS6 = [
  ["vistana", "Vistana"], ["fashion_wear", "Fashion Wear"], ["fashion_shoes", "Fashion Shoes"],
  ["active_shoes", "Active Shoes"], ["active_wear", "Active Wear"], ["joystep", "Joystep"],
] as const;
const VENDEDORES = ["Rodrigo", "Edwin", "Reynaldo Espinosa", "Oficina (sin vendedor)", "Daniel Levy"];

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Los totales SUMAN: un ejemplo que no cierra esconde un papel que no cierra.
const MONTOS_GRUPO = VENDEDORES.map((_, i) => EMPRESAS6.map((__, j) => Math.round(1234.56 * (i + 1) * 100 + j * 1111) / 100));
const PAGAN = VENDEDORES.map((_, i) => i <= 2);
const TABLA_GRUPO: TablaPapel = {
  titulo: TITULO_PAPEL_GRUPO,
  subtitulo: "Septiembre 2026",
  columnas: [{ header: "Vendedor", numerica: false }, ...EMPRESAS6.map(([, n]) => ({ header: n, numerica: true })), { header: "Total", numerica: true }],
  filas: VENDEDORES.map((v, i) => ({ celdas: [v, ...MONTOS_GRUPO[i].map(usd), usd(MONTOS_GRUPO[i].reduce((s, n) => s + n, 0))], apagada: !PAGAN[i] })),
  totales: [
    "Total a pagar",
    ...EMPRESAS6.map((_, j) => usd(MONTOS_GRUPO.reduce((s, fila, i) => s + (PAGAN[i] ? fila[j] : 0), 0))),
    usd(MONTOS_GRUPO.reduce((s, fila, i) => s + (PAGAN[i] ? fila.reduce((a, n) => a + n, 0) : 0), 0)),
  ],
} as unknown as TablaPapel;

const TABLA_EMPRESA: TablaPapel = {
  titulo: tituloPapelEmpresa("Vistana"),
  subtitulo: "Septiembre 2026",
  columnas: ["Vendedor", "Ventas", "Com. venta", "Cobros", "Com. cobro", "Com. total"].map((h, i) => ({ header: h, numerica: i > 0 })),
  filas: VENDEDORES.map((v) => ({ celdas: [v, "$116,268.00", "$290.67", "$84,300.40", "$210.75", "$501.42"] })),
  totales: ["Total a pagar", "$581,340.00", "$1,453.35", "$421,502.00", "$1,053.75", "$2,507.10"],
} as unknown as TablaPapel;

// ── Guías ────────────────────────────────────────────────────────────────────

const envio = (i: number): GuiaItem => ({
  id: `it-${i}`, orden: i,
  cliente: i % 2 ? "INVERSIONES Y DISTRIBUIDORA PASO CANOAS INTERNACIONAL" : "CITY MALL PASO CANOA",
  cliente_codigo: "D-25",
  direccion: "Paso Canoas, frontera, local 14 al lado de la aduana",
  empresa: "Fashion Wear",
  facturas: "11-000003121, 11-000003122, 11-000003124",
  bultos: 4 + i,
  numero_guia_transp: `TR-44${i}`,
}) as GuiaItem;

const GUIA = {
  id: "g-1", numero: 206, fecha: "2026-09-25",
  transportista: "Transporte y Mudanzas del Sol Internacional", modo_entrega: "transportista", transportista_id: "t-1",
  placa: "EK0700", observaciones: "Entregar en horario de la mañana; llamar antes al encargado de bodega.",
  total_bultos: 39, item_count: 6, monto_total: 0,
  estado: "Completada", tipo_despacho: "externo",
  entregado_por: "Julio Guzmán", numero_guia_transp: "",
  receptor_nombre: "María Elena Rodríguez de González", cedula: "8-1022-869",
  guia_items: Array.from({ length: 6 }, (_, i) => envio(i + 1)),
} as unknown as Guia;

const ETIQUETA: EtiquetaFila = {
  id: 1, empresa_key: "fashion_shoes", empresa: "Fashion Shoes",
  switch_factura_id: 52558, secuencial: "11-000002558", fecha_factura: "2026-09-18",
  cliente_codigo: "D-170", cliente_nombre: "Inversiones y Distribuidora Nova Lux Internacional, S.A.",
  destino: "Paso Canoas, frontera, local 14 al lado de la aduana", cajas: 14,
  creado_en: "2026-09-18T14:41:00-05:00", guia_numero: null,
} as EtiquetaFila;

const PEDIDOS: PedidoBodega[] = Array.from({ length: 12 }, (_, i) => ({
  empresa_key: i % 2 ? "vistana" : "fashion_wear",
  pedido_switch_id: 1000 + i,
  secuencial: `05-0000012${String(i).padStart(2, "0")}`,
  fecha: `2026-09-${String(20 + (i % 9)).padStart(2, "0")}`,
  cliente_codigo: "D-25",
  cliente_nombre: i % 3 ? "City Mall Paso Canoa" : "Inversiones y Distribuidora Paso Canoas Internacional, S.A.",
  vendedor_nombre: "REYNALDO ESPINOSA",
  estado: "pendiente",
  cambiado_por: null,
  cambiado_en: null,
})) as unknown as PedidoBodega[];

// El peor caso del papel de bultos: talla y color van ADENTRO de la descripción
// (Switch no los manda aparte), el cliente lleva razón social completa, hay un
// bulto de tres dígitos (el envío medido tuvo 416) y dos artículos siguen sin
// bulto, para que salga el bloque «Sin bulto todavía».
const linea = (
  i: number,
  descripcion: string,
  cantidad: number,
  bulto: number | null,
) => {
  const codigo = `4RG82${2000 + i}`;
  const precio = 49.95;
  return {
    codigo_barra_id: 900000 + i,
    codigo,
    descripcion,
    talla: null,
    color: null,
    cantidad,
    precio,
    // El total lo manda Switch; aquí se escribe el que cuadra, porque un
    // ejemplo que no cierra esconde un papel que no cierra.
    total: Math.round(cantidad * precio * 100) / 100,
    bulto,
  };
};

const BULTOS: PapelDeBultos = {
  secuencial: "05-000001274",
  empresa: "Fashion Shoes",
  cliente: "INVERSIONES Y DISTRIBUIDORA PASO CANOAS INTERNACIONAL, S.A.",
  // Las dos firmas del control de dos personas, que van al pie del papel.
  firmas: {
    preparado_por: "Julio",
    preparado_en: "2026-10-06T15:42:00-05:00",
    verificado_por: "Angela",
    verificado_en: "2026-10-06T16:15:00-05:00",
  },
  lineas: [
    linea(1, "NIKE AIR MAX 90 ESSENTIAL BLANCO/NEGRO TALLA 10.5 US", 12, 1),
    linea(2, "NIKE AIR MAX 90 ESSENTIAL BLANCO/NEGRO TALLA 11 US", 6, 1),
    linea(3, "TOMMY HILFIGER CHAQUETA ACOLCHADA REVERSIBLE AZUL MARINO/CRUDO TALLA XL", 3, 1),
    linea(4, "REEBOK CLASSIC LEATHER LEGACY AZ GRIS JASPEADO/BLANCO TALLA 9 US", 24, 2),
    linea(5, "REEBOK CLASSIC LEATHER LEGACY AZ GRIS JASPEADO/BLANCO TALLA 9.5 US", 18, 2),
    linea(6, "CALVIN KLEIN JEANS CAMISA OXFORD MANGA LARGA CELESTE RAYADO TALLA M", 9, 7),
    linea(7, "CALVIN KLEIN FOOTWEAR SANDALIA PLATAFORMA CUERO NEGRO TALLA 7 US", 4.5, 7),
    linea(8, "JOYBEES VARSITY CLOG NIÑO AZUL ELÉCTRICO/AMARILLO TALLA 13 LITTLE KID", 36, 38),
    linea(9, "JOYBEES ACTIVE CLOG ADULTO NEGRO/GRAFITO TALLA 10 US", 30, 38),
    linea(10, "ADIDAS SUPERSTAR FOUNDATION BLANCO/NEGRO/ORO METÁLICO TALLA 8.5 US", 15, 416),
    linea(11, "ADIDAS PANTALÓN DEPORTIVO TIRO 23 NEGRO CON TRES RAYAS BLANCAS TALLA L", 7, 416),
    linea(12, "PUMA SUEDE CLASSIC XXI ROJO INTENSO/BLANCO TALLA 12 US", 10, null),
    linea(13, "PUMA ESSENTIALS SUDADERA CON CAPUCHA GRIS MEDIO JASPEADO TALLA XXL", 2, null),
  ],
};

// ── Catálogos ────────────────────────────────────────────────────────────────

const itemsPedido = (n: number): PdfOrderItem[] => Array.from({ length: n }, (_, i) => ({
  sku: `100${2000 + i}-NEGRO`,
  name: `Zapatilla Classic Leather Legacy AZ edición especial ${i + 1}`,
  quantity: 2 + (i % 3),
  unit_price: 49.5,
  image_url: "",
  is_preorder: i % 7 === 0,
  category: "footwear",
}));

const seccion = (label: string, n: number) => ({
  label,
  items: Array.from({ length: n }, (_, i) => ({
    name: `Modelo Classic Leather Legacy AZ ${label} ${i + 1}`, sku: `${label}-${1000 + i}`, price: 89.95, image_url: null, badge: i % 4 === 0 ? "Nuevo" : null,
  })),
});

// ── CxC ──────────────────────────────────────────────────────────────────────

const ESTADO: EstadoCuenta = {
  codigo: "D-25",
  clienteNombre: "Inversiones y Distribuidora Paso Canoas Internacional, S.A.",
  cliente: {
    nombre: "Inversiones y Distribuidora Paso Canoas Internacional, S.A.",
    identificacion: "1513069-1-650069", telefono: "727-7247",
    email: "contabilidad.cuentasporpagar@citymallpasocanoa.com.pa",
    direccion: "Paso Canoas, frontera, local 14 al lado de la aduana, Chiriquí",
    limiteCredito: 25000, tiempoMorosidad: 90,
  },
  total: 6578.71,
  generadoEn: "2026-09-09T12:00:00.000Z",
  empresas: [
    {
      empresa_key: "fashion_wear", empresa_nombre: "Fashion Wear", subtotal: 5578.71, saldoSwitch: null,
      documentos: [
        { numero: "11-000003121", fecha: "2026-06-16", tipo: "Factura", monto: 2978.88, saldo: 1006.8, debito: 1006.8, credito: 0, dias: 85, plazoCredito: 90, numeroFiscal: "FE012000040254-103-278837-5400012026061600000031210010114344239888" },
        { numero: "11-000003122", fecha: "2026-06-17", tipo: "Factura", monto: 2792.7, saldo: 2701.35, debito: 2701.35, credito: 0, dias: 84, plazoCredito: 90, numeroFiscal: null },
        { numero: "14-000000258", fecha: "2026-06-23", tipo: "Nota de Débito", monto: 8.16, saldo: 8.16, debito: 8.16, credito: 0, dias: 78, plazoCredito: 90, numeroFiscal: null },
        { numero: "11-000003124", fecha: "2026-06-24", tipo: "Factura", monto: 1926, saldo: 1863, debito: 1863, credito: 0, dias: 77, plazoCredito: 0, numeroFiscal: null },
        // Switch manda la NC con `debito: 0` y el monto en `credito` (verificado el 6-oct-2026 en `switch_estadocuenta`).
        { numero: "13-000000031", fecha: "2026-06-25", tipo: "Nota de Crédito", monto: 0.6, saldo: 0.6, debito: 0, credito: 0.6, dias: 76, plazoCredito: 90, numeroFiscal: null },
      ],
    },
    {
      empresa_key: "vistana", empresa_nombre: "Vistana International", subtotal: 1000, saldoSwitch: null,
      documentos: [{ numero: "11-000000001", fecha: "2026-07-01", tipo: "Factura", monto: 1000, saldo: 1000, debito: 1000, credito: 0, dias: 70, plazoCredito: 90, numeroFiscal: null }],
    },
  ],
} as unknown as EstadoCuenta;

function empresaCxc(codigo: string, nombre: string, b: Record<string, number>) {
  const base = { d0_30: 0, d31_60: 0, d61_90: 0, d91_120: 0, d121_180: 0, d181_270: 0, d271_365: 0, mas_365: 0, ...b };
  return { nombre, codigo, ...base, total: Object.values(base).reduce((s, n) => s + n, 0), ultimoPagoFecha: null, ultimoPagoMonto: null, ultimaCompraFecha: null, ultimaCompraMonto: null };
}
function clienteCxc(llave: string, companies: Record<string, ReturnType<typeof empresaCxc>>): ConsolidatedClient {
  // Los tramos del cliente salen de sus empresas, como en la consolidación real.
  const suma = (f: (c: ReturnType<typeof empresaCxc>) => number) => Object.values(companies).reduce((s, c) => s + f(c), 0);
  const d0_30 = suma((c) => c.d0_30), d31_60 = suma((c) => c.d31_60), d61_90 = suma((c) => c.d61_90), d91_120 = suma((c) => c.d91_120);
  const total = suma((c) => c.total);
  const d121_plus = total - d0_30 - d31_60 - d61_90 - d91_120;
  return { nombre_normalized: llave, companies, correo: "", telefono: "", celular: "", contacto: "", total, current: d0_30 + d31_60 + d61_90, watch: d91_120, overdue: d121_plus, d0_30, d31_60, d61_90, d91_120, d121_plus } as unknown as ConsolidatedClient;
}
const CARTERA = [
  clienteCxc("INVERSIONES Y DISTRIBUIDORA PASO CANOAS INTERNACIONAL", {
    vistana: empresaCxc("D-25", "Inversiones y Distribuidora Paso Canoas Internacional, S.A.", { d0_30: 101000.55, d91_120: 20000 }),
    fashion_wear: empresaCxc("D-25", "Inversiones y Distribuidora Paso Canoas Internacional, S.A.", { d121_180: 500 }),
  }),
  clienteCxc("CITY MALL PASO CANOA", { vistana: empresaCxc("D-26", "City Mall Paso Canoa", { d31_60: 1500 }) }),
  clienteCxc("VIVA PANAMA DUTTY FREE", { vistana: empresaCxc("D-139", "Viva Panama Dutty Free", { d0_30: -1147.52 }) }),
];
const DOS = B2B_COMPANIES.filter((c) => c.key === "vistana" || c.key === "fashion_wear");
// ⚠️ El papel de Cartera también se GUARDA (`doc.save`): va a la carpeta temporal, nunca al repo.
const OPTS_CXC = { subtitulo: "Todas las empresas · al 20 sep 2026", archivo: `${process.env.TMPDIR ?? "/tmp"}/revisar-papeles-cartera.pdf`, hoy: "2026-09-20" };

// ── Reclamos ─────────────────────────────────────────────────────────────────

const RECLAMO = {
  id: "11111111-2222-3333-4444-555555555555", nro_reclamo: "REC-2026-0026", empresa: "Vistana International",
  proveedor: "American Designer Fashion Distribution Group LLC", marca: "Calvin Klein",
  nro_factura: "3000014229", nro_orden_compra: "PO-778812", fecha_factura: "2026-06-19", fecha_reclamo: "2026-06-24", estado: "Creado",
  reclamo_items: [
    { referencia: "QF8518433", descripcion: "PANTI PARA DAMA ALGODÓN ELÁSTICO", talla: "S", cantidad: 1, precio_unitario: 7.0, motivo: "Sobrante" },
    { referencia: "4D5081G001", descripcion: "GORRA PARA HOMBRE", talla: "OS", cantidad: 2, precio_unitario: 12.8, motivo: "Faltante en la caja 3 de 14" },
    { referencia: "4RF216G410", descripcion: "POLO PARA HOMBRE M/C", talla: "M", cantidad: 8, precio_unitario: 19.2, motivo: "Talla equivocada" },
  ],
  reclamo_fotos: [],
};
const CONTACTO = { nombre_contacto: "Isaac Amar" };

// ── Asistencia y planilla ────────────────────────────────────────────────────

const QUINCENA = { anio: 2026, mes: 9, n: 1, desde: "2026-09-01", hasta: "2026-09-15", etiqueta: "1 al 15 de septiembre de 2026", clave: "2026-09-1" };

const personaReporte = (i: number) => ({
  codigo: String(100 + i), nombre: `MARIA ELENA RODRIGUEZ DE GONZALEZ ${i}`, salida: "17:00", almuerzoMin: 30, dias: [],
  resumen: {
    diasTrabajados: 10, ausenciasSinJustificar: 1, ausenciasJustificadas: 0, diasTrabajandoFuera: 2, diasVacaciones: 0,
    diasVacacionesYaPagadas: 0, vecesTarde: 3, minutosTarde: 45.5, minutosTardeDeDiasARevisar: 10, diasConPermiso: 0,
    minutosPerdonadosPorPermiso: 0, excesoAlmuerzoMin: 12, salidaTempranaMin: 5, extraMin: 30, diasARevisar: 2,
    diasEnCurso: 0, tiempoNoTrabajadoMin: 62.5, diasCorregidos: 4, correcciones: 6,
  },
}) as unknown as PersonaReporte;

const DINERO = {
  rataHora: 4.81, valorMinuto: 0.08, salarioQuincenal: 500, extraDiurno: 12.34, extraNocturno: 0, excedente: 0,
  domingos: 0, feriados: 0, ausencias: 38.48, ausenciaPorTardanza: 8.12, ausenciaDeDiaCompleto: 0, vacacionesYaPagadas: 0,
  tardanzas: 3.21, salidaTemprana: 0, totalBruto: 470.65, baseSeguros: null, seguroSocial: 46.83, seguroEducativo: 6.12,
  isr: 0, prestamo: 25, terceros: 0, mercancia: 0, totalDeducciones: 77.95, otrosServicios: 0, netoPagar: 392.7,
} as unknown as DineroLinea;

const HORAS_CERO = {
  extraDiurnoMin: 0, extraNocturnoMin: 0, extraNoAprobadaMin: 0, extraNoAprobadaDiurnoMin: 0, extraNoAprobadaNocturnoMin: 0,
  excedenteMin: 0, domingoMin: 0, feriadoMin: 0, tardanzaMin: 0, tardanzaGraveMin: 0, tardanzaGraveDias: 0,
  ausenciaMin: 0, ausenciaDias: 0, ausenciaJustificadaDias: 0, vacacionesYaPagadasMin: 0, vacacionesYaPagadasDias: 0,
  vacacionesDias: 0, sabadoMin: 0, diasTrabajados: 0, diasARevisar: 0, tardanzaDeDiasARevisarMin: 0, jornadaDiariaMin: 480,
} as unknown as HorasPersona;

const lineaPlanilla = (i: number): LineaPlanilla => ({
  codigo: String(200 + i), etiqueta: `SAMUEL ANTONIO GOMEZ ADAMES DE LA ROSA ${i}`, nombre: `SAMUEL ANTONIO GOMEZ ADAMES DE LA ROSA ${i}`,
  empresa: "fashion_wear", empresaEtiqueta: "Fashion Wear", salarioMensual: 1000, jornadaSemanal: 48,
  horas: HORAS_CERO, faltaConfigurar: [], fueraDePlanilla: false, pagaSeguros: true, baseSeguros: null, noMarcaReloj: false,
  parte: null, decidirAMano: null, quincenalReferencia: null, extraMedido: null, extraNoAprobada: null, extraAprobada: true,
  dinero: DINERO, manuales: { isr: 0, prestamo: 25, terceros: 0, mercancia: 0, otrosServicios: 0 },
}) as unknown as LineaPlanilla;

const LINEAS = Array.from({ length: 8 }, (_, i) => lineaPlanilla(i + 1));
const PLANILLA = {
  lineas: LINEAS,
  totales: totalizar(LINEAS),
  quincena: QUINCENA,
  empresaEtiqueta: "Fashion Wear",
  reglas: REGLAS_DEFAULT,
  // El aviso real, con los nombres como llegan de la base (en mayúsculas).
  avisoPrestamo: textoAvisoPrestamo([
    { tipo: "ultima-cuota", codigo: "201", etiqueta: "SAMUEL ANTONIO GOMEZ ADAMES DE LA ROSA", cuenta: "prestamo", cuota: 45, saldo: 40 },
    { tipo: "no-cobra", codigo: "300", etiqueta: "MARIA ELENA RODRIGUEZ DE GONZALEZ", saldo: 75 },
  ]),
} as unknown as DatosPlanillaExport;

const COMPROBANTES = [1, 2, 3].map((i) =>
  armarComprobante(
    { linea: lineaPlanilla(i), posicion: i === 2 ? null : "Supervisor de Bodega y Despacho", cedula: "8-1022-869" },
    { esQuincena: true, anio: 2026, mes: 9, n: 1, etiqueta: "1 al 15 de septiembre de 2026" } as never,
  ),
);

// ── Marketing, caja y préstamos ──────────────────────────────────────────────

const ENTREGA = {
  entregaId: "a1e6b971-0000-0000-0000-000000000000", numero: 21, fecha: "2026-09-10T15:00:00Z",
  cliente: "Inversiones y Distribuidora Paso Canoas Internacional, S.A.", clienteCodigo: "D-25",
  tienda: "City Mall Paso Canoa, local 14", proyecto: "Remodelación de la tienda", notas: "Se entregó completo; falta instalar la góndola 3.",
  items: [
    { articulo: "Góndola central de madera con iluminación LED", cantidad: 2, bultos: 4, precioUnitario: 850 },
    { articulo: "Mesa exhibidora", cantidad: 1, bultos: null, precioUnitario: 420.5 },
  ],
  porMarca: [{ marca: "Reebok", monto: 1200 }, { marca: "Calvin Klein", monto: 920.5 }],
  total: 2120.5,
};

const GASTOS = Array.from({ length: 10 }, (_, i) => ({
  fecha: `2026-09-${String(i + 1).padStart(2, "0")}`, descripcion: "Compra de útiles de limpieza y papelería para la oficina",
  nombre: "Angela", proveedor: "Super 99 Vía España", categoria: "Limpieza", nro_factura: `FAC-${1000 + i}`,
  subtotal: 9.35, itbms: 0.65, total: 10,
}));

const EMPLEADOS = [1, 2].map((i) => ({
  id: `e${i}`, nombre: `CARLOS BALTODANO ${i}`, empresa: "Fashion Wear", deduccion_quincenal: 25, deduccion_dano: null,
  prestamos_movimientos: [
    { id: `m${i}a`, fecha: "2026-08-01", concepto: "Préstamo", monto: 500, estado: "aprobado", notas: null, created_at: "2026-08-01" },
    { id: `m${i}b`, fecha: "2026-08-15", concepto: "Pago", monto: 25, estado: "aprobado", notas: null, created_at: "2026-08-15" },
  ],
}));

// ── El catálogo ──────────────────────────────────────────────────────────────

export const PAPELES: Papel[] = [
  { nombre: "Comisiones — detalle del vendedor", tipo: "pdf", generar: async () => pdf(construirPdfComision([hojaComision(RODRIGO)])) },
  { nombre: "Comisiones — por empresa", tipo: "pdf", generar: async () => pdf(construirPdfTablaComisiones(TABLA_EMPRESA)) },
  { nombre: "Comisiones — consolidado", tipo: "pdf", generar: async () => pdf(construirPdfTablaComisiones(TABLA_GRUPO)) },
  { nombre: "Guías — guía de despacho", tipo: "pdf", generar: async () => pdf(construirPdfGuias([GUIA])) },
  { nombre: "Guías — etiquetas carta", tipo: "pdf", generar: async () => pdf(construirPdfEtiquetas(datosDeEtiqueta(ETIQUETA), cajasDelJuego(4), "carta")), estiloPropio: TERMICA },
  { nombre: "Guías — etiquetas 4x6", tipo: "pdf", generar: async () => pdf(construirPdfEtiquetas(datosDeEtiqueta(ETIQUETA), cajasDelJuego(2), "4x6")), estiloPropio: TERMICA },
  { nombre: "Guías — pedidos impresos", tipo: "pdf", generar: async () => pdf(construirPdfPedidos("Pedidos pendientes", PEDIDOS, "2026-10-06")) },
  { nombre: "Guías — bultos de un pedido", tipo: "pdf", generar: async () => pdf(construirPdfPedidoBultos(BULTOS)) },
  { nombre: "Guías — bultos de un pedido, sin precios", tipo: "pdf", generar: async () => pdf(construirPdfPedidoBultos({ ...BULTOS, conPrecios: false })) },
  { nombre: "Catálogos — pedido Reebok", tipo: "pdf", generar: async () => pdf(buildOrderPdfDoc({ marca: "reebok", orderNumber: "RBK-001", clientName: "Inversiones y Distribuidora Paso Canoas Internacional, S.A.", createdAt: "2026-09-24T12:00:00Z", items: itemsPedido(30), bultoSize: () => 12, images: {} })), estiloPropio: MARCA },
  { nombre: "Catálogos — pedido Joybees", tipo: "pdf", generar: async () => pdf(buildOrderPdfDoc({ marca: "joybees", orderNumber: "JB-001", clientName: "City Mall Paso Canoa", createdAt: "2026-09-24", items: itemsPedido(8), bultoSize: () => 12, images: {} })), estiloPropio: MARCA },
  { nombre: "Catálogos — catálogo Reebok", tipo: "pdf", generar: async () => pdf(buildCatalogPdfDoc({ marca: "reebok", sections: [seccion("HOMBRE", 9), seccion("MUJER", 4)], subtitle: "Todos los productos", totalCount: 13, images: {} })), estiloPropio: MARCA },
  { nombre: "CxC — estado de cuenta", tipo: "pdf", generar: async () => pdf(buildEstadoCuentaPDF(ESTADO, "INVERSIONES Y DISTRIBUIDORA PASO CANOAS INTERNACIONAL").doc) },
  { nombre: "CxC — estado de cuenta (lote)", tipo: "pdf", generar: async () => pdf(buildEstadoCuentaLotePDF([{ data: ESTADO, nombre: "A" }, { data: ESTADO, nombre: "B" }]).doc) },
  { nombre: "CxC — cartera por cliente", tipo: "pdf", generar: async () => pdf(pdfTotalPorCliente(filasTotalPorCliente(CARTERA), filasSaldoAFavor(CARTERA), OPTS_CXC)) },
  { nombre: "CxC — cartera por compañía", tipo: "pdf", generar: async () => pdf(pdfPorCompania(bloquesPorCompania(CARTERA, DOS), bloquesSaldoAFavor(CARTERA, DOS), OPTS_CXC)) },
  { nombre: "Reclamos — reclamo", tipo: "pdf", generar: async () => pdf(await buildBulkReclamosPdf([RECLAMO as never], RECLAMO.empresa, CONTACTO)) },
  { nombre: "Reclamos — lote", tipo: "pdf", generar: async () => pdf(await buildBulkReclamosPdf([RECLAMO, { ...RECLAMO, id: "x2", nro_reclamo: "REC-2026-0027" }] as never, RECLAMO.empresa, CONTACTO)) },
  { nombre: "Asistencia — reporte", tipo: "pdf", generar: async () => pdf(construirPdf({ personas: [1, 2, 3].map(personaReporte), desde: QUINCENA.desde, hasta: QUINCENA.hasta })) },
  { nombre: "Asistencia — planilla", tipo: "pdf", generar: async () => pdf(construirPdfPlanilla(PLANILLA)) },
  { nombre: "Asistencia — comprobantes de pago", tipo: "pdf", generar: async () => pdf(construirPdfComprobantes(COMPROBANTES)) },
  { nombre: "Marketing — nota de entrega", tipo: "pdf", generar: async () => pdf(buildComprobanteEntregaDoc(ENTREGA)) },
  { nombre: "Marketing — comprobante de entrega", tipo: "pdf", generar: async () => pdf(buildComprobanteEntregaDoc(ENTREGA, { incluirBultos: false })) },

  { nombre: "Comisiones — detalle (Excel)", tipo: "xlsx", generar: async () => hoja(await buildComisionDetalleSheet(RODRIGO, "Vistana")) },
  { nombre: "Comisiones — por empresa (Excel)", tipo: "xlsx", generar: async () => hoja(await buildComisionesResumenSheet({ empresaKey: "vistana", empresaNombre: "Vistana", year: 2026, mes: 9, vendedores: [{ vendedor: "RODRIGO", base: 16268, comision: 40.67, base_cobro: 4300.4, comision_cobro: 10.75, comision_total: 51.42 }, { vendedor: "DANIEL LEVY", base: 100, comision: 1, base_cobro: 0, comision_cobro: 0, comision_total: 1, se_paga: false }] })) },
  { nombre: "Comisiones — consolidado (Excel)", tipo: "xlsx", generar: async () => hoja(await buildComisionesConsolidadoSheet({ year: 2026, mes: 9, empresas: EMPRESAS6.map(([key, nombre]) => ({ key, nombre })), vendedores: [{ vendedor: "RODRIGO", porEmpresa: { vistana: 51.42, fashion_wear: 12 }, total: 63.42 }] })) },
  { nombre: "Guías (Excel)", tipo: "xlsx", generar: async () => hoja(buildGuiasSheet([GUIA])) },
  { nombre: "CxC — cartera por cliente (Excel)", tipo: "xlsx", generar: async () => libro(libroTotalPorCliente(filasTotalPorCliente(CARTERA), filasSaldoAFavor(CARTERA), "Cartera")) },
  { nombre: "CxC — cartera por compañía (Excel)", tipo: "xlsx", generar: async () => libro(libroPorCompania(bloquesPorCompania(CARTERA, DOS), bloquesSaldoAFavor(CARTERA, DOS), "Cartera")) },
  { nombre: "Reclamos (Excel)", tipo: "xlsx", generar: async () => new Uint8Array(await buildBulkReclamosExcel([RECLAMO] as never, RECLAMO.empresa, CONTACTO)) },
  { nombre: "Asistencia — reporte (Excel)", tipo: "xlsx", generar: async () => libro(construirExcel({ personas: [1, 2].map(personaReporte), desde: QUINCENA.desde, hasta: QUINCENA.hasta })) },
  { nombre: "Asistencia — planilla (Excel)", tipo: "xlsx", generar: async () => libro(construirExcelPlanilla(PLANILLA)) },
  { nombre: "Caja menuda (Excel)", tipo: "xlsx", generar: async () => libro(buildCajaWorkbook({ numero: 42, fecha_apertura: "2026-09-01", fondo_inicial: 200 }, GASTOS)) },
  { nombre: "Préstamos (Excel)", tipo: "xlsx", generar: async () => libro(buildPrestamosWorkbook(EMPLEADOS as never)) },
];
