// ─────────────────────────────────────────────────────────────────────────────
// MARKETING ESTILO APPLE · V2 (`MARKETING_APPLE_V2_2026_10`, 6-oct-2026).
// Propuesta del mockup «hoy vs recomendación»; Daniel la aprobó el 6-oct-2026.
// Va ENCIMA de `MARKETING_APPLE_2026_10` (prendido): no deshace nada aprobado.
// Reglas en docs/diseno.md. 🔴 SOLO CAMBIA LA PANTALLA: lo que se guarda y lo
// que se envía es idéntico, y ningún número cambia (se leen los de siempre).
//
// Las MISMAS pantallas, 2 a 4 cambios cada una:
//
//   PROYECTO — «¿cuánto lleva este proyecto?»
//     1. «Costo total» como número grande con UNA línea gris (facturas,
//        subtotal, entregas, importación), en vez de 3 a 5 celdas en mayúsculas.
//     2. El nombre se dice una vez (en la barra de arriba); la tarjeta queda con
//        «Tienda · Inicio» en una línea.
//     3. Las marcas en una línea, sin rótulo ni párrafo; el contexto de la marca
//        como línea gris, sin caja.
//     4. Pestañas con su número: «Facturas · 3».
//
//   FACTURAS — «¿qué facturas tiene?»
//     1. Una sola acción principal: «+ Agregar factura»; la caja punteada pasa
//        a «Subir PDFs» al lado (arrastrar sobre la sección sigue subiendo).
//     2. La tarjeta en dos líneas: número y TOTAL arriba; fecha · proveedor ·
//        concepto y «Subtotal · ITBMS» en gris. Marcas en gris (paleta).
//     3. «Editar · Anular» como enlaces en la fila de la tarjeta: siguen a la
//        vista (Daniel buscó «Eliminar» en un menú y no lo encontró).
//
//   PAGOS (impulsadoras) — «¿qué período le pago y cuánto?»
//     1. El período como chips —1ª quincena · 2ª quincena · Mes completo ·
//        Rango—; las dos fechas solo con «Rango» (el panel de período).
//     2. La distribución por marca y el concepto como líneas grises bajo el
//        monto; se van las dos cajas.
//     3. Sin asterisco ni «(obligatorio)»: «Guardar pago» se toca y dice todo
//        lo que falta de una vez (regla 7).
//
//   GALERÍA (fotos de la tienda o del proyecto) — «¿qué fotos hay?»
//     1. El título lleva el número: «Fotos de la tienda · 12» (el cero se ve).
//     2. En la computadora, como en el celular: las ✕ salen con «Editar», no
//        al pasar el mouse.
//     3. Sin fotos y en solo lectura: una línea gris, sin caja punteada.
//     ⚠️ La galería PÚBLICA (`/marketing/galeria/<cliente>`) la ve el cliente
//     y no se toca.
//
// 🔴 `false` = las pantallas de hoy. Candado `marketing-apple-v2-2026-10`.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 El interruptor. `false` = la pantalla de antes.
 *  Daniel aprobó las capturas el 6-oct-2026: prendido. Proyecto y facturas
 *  (la ventana sin puerta desde el 23-sep) quedan como están. */
export const MARKETING_APPLE_V2_2026_10 = true;

/** Proyecto y facturas: su ventana no tiene puerta desde el 23-sep-2026 (un
 *  enlace de proyecto lleva a la ficha de la tienda). Su V2 queda escrita y
 *  APAGADA hasta que Daniel decida si pasa a la ficha (6-oct-2026). */
export const MARKETING_V2_PROYECTO = false;

type Fmt = (n: number) => string;

/** Solo las piezas con algo: «a · b · c». */
function unir(partes: ReadonlyArray<string | null | false | undefined>): string {
  return partes.filter((p): p is string => typeof p === "string" && p !== "").join(" · ");
}

/**
 * La línea gris bajo «Costo total» del proyecto. Los MISMOS números de las
 * celdas de hoy: entregas e importación solo si existen, como hoy.
 */
export function lineaTotalesProyecto(
  t: {
    conteo: number;
    subtotal: number;
    conteoEntregas: number;
    totalEntregas: number;
    tieneAlgunaZonaLibre: boolean;
    importacion: number;
  },
  fmt: Fmt,
  porcentajeImportacion: number,
): string {
  return unir([
    `${t.conteo} ${t.conteo === 1 ? "factura" : "facturas"}`,
    `Subtotal ${fmt(t.subtotal)}`,
    t.conteoEntregas > 0 && `${t.conteoEntregas} ${t.conteoEntregas === 1 ? "entrega" : "entregas"} ${fmt(t.totalEntregas)}`,
    t.tieneAlgunaZonaLibre && `Importación ${porcentajeImportacion}% +${fmt(t.importacion)}`,
  ]);
}

/** «Tienda X · Inicio 3 oct 2026»: lo que queda de la tarjeta sin el nombre. */
export function lineaDelProyecto(p: { tienda?: string | null; mostrarTienda: boolean; inicio: string }): string {
  return unir([p.mostrarTienda && p.tienda ? `Tienda ${p.tienda}` : null, `Inicio ${p.inicio}`]);
}

/** «Tommy Hilfiger 50% $150.00 · Calvin Klein 50% $150.00». */
export function lineaDistribucion(
  d: ReadonlyArray<{ nombre: string; porcentaje: number; monto: number }>,
  fmt: Fmt,
): string {
  return unir(d.map((x) => `${x.nombre} ${x.porcentaje}% ${fmt(x.monto)}`));
}

/** La línea gris de la factura: «Subtotal $X · ITBMS $Y» (o la importación). */
export function lineaMontosFactura(
  f: { subtotal: number; itbms: number; tiene_importacion?: boolean | null },
  fmt: Fmt,
  importacion: number,
  porcentajeImportacion: number,
): string {
  return unir([
    `Subtotal ${fmt(f.subtotal)}`,
    f.tiene_importacion ? `Importación ${porcentajeImportacion}% ${fmt(importacion)}` : `ITBMS ${fmt(f.itbms)}`,
  ]);
}

export interface AtajoPeriodo {
  clave: string;
  rotulo: string;
  desde: string;
  hasta: string;
}

/** ¿Qué chip está prendido? `null` = un rango a mano (se prende «Rango»). */
export function atajoPrendido(desde: string, hasta: string, atajos: ReadonlyArray<AtajoPeriodo>): string | null {
  return atajos.find((a) => a.desde === desde && a.hasta === hasta)?.clave ?? null;
}

/**
 * Lo que falta para guardar un pago, TODO de una vez y en el orden de la
 * pantalla. Es la MISMA regla del botón de hoy (`puedeGuardar`): período
 * válido, monto mayor que cero y comprobante.
 */
export function faltaParaGuardarPago(p: { errorPeriodo: string | null; monto: number; hayComprobante: boolean }): string[] {
  const falta: string[] = [];
  if (p.errorPeriodo) falta.push("el período");
  if (!(p.monto > 0)) falta.push("el monto");
  if (!p.hayComprobante) falta.push("el comprobante");
  return falta;
}

/** «Falta: el monto y el comprobante». */
export function textoFaltaPago(falta: ReadonlyArray<string>): string | null {
  if (falta.length === 0) return null;
  const lista = falta.length === 1 ? falta[0] : `${falta.slice(0, -1).join(", ")} y ${falta[falta.length - 1]}`;
  return `Falta: ${lista}`;
}

/** El título de la galería con su número; el cero SÍ se ve (avisa que falta). */
export function tituloGaleria(base: string, cantidad: number): string {
  return `${base} · ${cantidad}`;
}
