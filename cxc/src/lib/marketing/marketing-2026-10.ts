// ─────────────────────────────────────────────────────────────────────────────
// MARKETING ESTILO APPLE (`MARKETING_APPLE_2026_10`, 1-oct-2026) — propuesta del
// mockup «hoy vs recomendación», APAGADA hasta el «sí» de Daniel. Reglas en
// docs/diseno.md. 🔴 SOLO CAMBIA LA PANTALLA: lo que se guarda y lo que se
// envía es idéntico, y ningún número cambia.
//
// Medido contra producción el 1-oct-2026 (solo lectura):
//   · Angela entra solo desde la computadora (10 de 10 visitas).
//   · «Se reporta a la marca»: prendida en 104 de 104 gastos → va detrás de un
//     enlace (menos de 1 de cada 10 la apaga).
//   · «Nota»: escrita en 4 de 103 gastos → «+ Agregar observaciones».
//   · Tiendas en «Abierto»: 6 → el buscador sobra; sale con más de 10.
//   · Impulsadoras: 2 creadas en total; sus pagos son 22 de los 36 gastos de
//     los últimos 90 días → «Registrar pago» manda, «+ Nueva» es secundario.
//
// Lo que cambia (computadora; el celular se aprobó letra por letra el
// 24-sep-2026 y solo hereda los cambios del formulario de gasto):
//   1. «＋ Gasto» en la misma línea de las pestañas (sin franja vacía arriba).
//   2. Tiendas: buscador solo con más de 10 tiendas; sin la línea de ayuda.
//   3. Marcas: sin el rótulo «MARCAS»; las marcas con gasto van primero.
//   4. Ficha de tienda: los chips de marca llevan su monto y se va la tarjeta
//      que repetía lo mismo; «Fotos · 0» no se dibuja en cero.
//   5. Ficha de marca: «Cerrar período» y «Descargar ZIP» dicen lo que hacen;
//      sin la nota fija de Multifashion (la regla sigue igual).
//   6. Impulsadoras: sin título repetido, «+ Nueva impulsadora» secundario y
//      los tres botones en UNA fila (los tres siguen visibles: Daniel buscó
//      «Eliminar» y no lo encontró cuando estaba en un menú).
//   7. Mobiliario: «Editar · Borrar» pasan a «···» (Editar · Eliminar) y el
//      resumen por tienda usa la letra y el total de la tabla de productos.
//   8. Registrar gasto: sin asteriscos, «Se reporta a la marca» y
//      «Observaciones» detrás de un enlace, y lo que falta se dice al tocar
//      «Continuar» (computadora).
//
// 🔴 `false` = la pantalla de hoy, intacta.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 Marketing estilo Apple. `false` = como el 30-sep-2026. */
export const MARKETING_APPLE_2026_10 = false;

/** Con más tiendas que esto en la lista, aparece el buscador. */
export const TIENDAS_PARA_BUSCADOR = 10;

export function mostrarBuscadorDeTiendas(cantidad: number): boolean {
  return cantidad > TIENDAS_PARA_BUSCADOR;
}

/**
 * Las marcas con gasto primero, sin cambiar el orden dentro de cada grupo.
 * No suma ni quita filas: solo las reordena.
 */
export function marcasConGastoPrimero<
  T extends { cantidadReportada: number; cantidadNoReportada: number },
>(filas: ReadonlyArray<T>): T[] {
  const conGasto = (f: T) => f.cantidadReportada + f.cantidadNoReportada > 0;
  return [...filas.filter(conGasto), ...filas.filter((f) => !conGasto(f))];
}

/**
 * El monto que lleva cada chip de marca de la ficha: «todos» = el total del
 * pie; una marca = su total reportado (`totalPorMarca`). Sin monto → null.
 * No calcula nada nuevo: lee lo que ya se mostraba en la tarjeta.
 */
export function montoDelChip(
  clave: string,
  claveTodos: string,
  total: number,
  porMarca: ReadonlyArray<{ codigo: string; monto: number }>,
): number | null {
  if (clave === claveTodos) return total;
  const m = porMarca.find((x) => x.codigo === String(clave).trim().toUpperCase());
  return m ? m.monto : null;
}

/** «Se reporta a la marca» se ve abierto solo si alguien ya la apagó. */
export function seReportaAbierto(seReporta: boolean, tocado: boolean): boolean {
  return tocado || !seReporta;
}

/** «Observaciones» se ve abierto si ya tiene texto o si se tocó el enlace. */
export function observacionesAbiertas(nota: string, tocado: boolean): boolean {
  return tocado || nota.trim() !== "";
}

// ─── 2-oct-2026: lo que Daniel pidió al aprobar ─────────────────────────────
// · «Fotos · 0» SÍ se ve: un cero que avisa que falta algo (docs/diseno.md).
// · Una sola «Marca»: queda el rótulo y el desplegable dice «Seleccionar…».
// · Los colores de todo el sistema: negro y grises, como Guías, Asistencia y
//   Comisiones. Se van el teal, el azul y el fucsia de los controles.
// · La tarjeta de impulsadora dice lo esencial en dos líneas; los meses, al
//   tocar. Los chips de mes nunca se tocaron para pagar: el pago sigue en
//   «Registrar pago», que abre en el mes más antiguo como hoy.

/** Pestaña de una barra: seleccionada en negro, como Guías y Asistencia. */
export const PESTANA_ACTIVA = "border-gray-900 text-gray-900";
export const PESTANA_INACTIVA = "border-transparent text-gray-500 hover:text-gray-900";

/** Chip de filtro (período, marca): seleccionado en negro, el resto en gris. */
export const CHIP_ACTIVO = "bg-black border-black text-white";
export const CHIP_INACTIVO = "bg-white border-gray-200 text-gray-700 hover:border-gray-400";

/** Enlace de texto, como «Deshacer» de Guías o los enlaces de Asistencia. */
export const ENLACE = "text-gray-600 underline underline-offset-2 hover:text-black";

/**
 * La línea corta de la tarjeta de impulsadora: «23 meses pendientes · desde
 * mayo 2024». Cuenta los MISMOS meses que hoy (`mesesSinPagar`); los
 * parciales y los días que faltan van al desplegar. No hay monto pendiente:
 * la base no lo guarda y no se inventa.
 */
export function resumenCortoDeMeses(
  meses: ReadonlyArray<{ mes: string }>,
  etiqueta: (mesISO: string) => string,
): string {
  if (meses.length === 0) return "";
  const n = meses.length;
  return `${n} ${n === 1 ? "mes pendiente" : "meses pendientes"} · desde ${etiqueta(meses[0].mes)}`;
}
