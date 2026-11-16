/* ─────────────────────────────────────────────────────────────────────────────
 * LOS VIDEOS DE AYUDA, por módulo (15-nov-2026).
 *
 * 🔴 «Cómo se usa» vive en la PRIMERA pantalla que abre el módulo (su portada,
 * el `href` de `lib/modules.ts`, p. ej. `/caja`), en el «···» junto a la acción
 * principal. Si el módulo tiene pantallas de detalle, también puede ir en su
 * «···», pero NUNCA solo ahí (Daniel, 15-nov-2026: entraba a Caja menuda y no
 * encontraba los videos). Candado en `videos-ayuda.test.ts`.
 * 🔑 Agregar un módulo = subir sus archivos al bucket PRIVADO `videos-ayuda`
 * (carpeta = la key del módulo), sumar sus renglones aquí y montar en
 * `src/app/<href>/page.tsx` (la portada) el mismo patrón de `/caja/page.tsx`:
 * `conVideos = VIDEOS_AYUDA_2026_11 && tieneVideos("<key>")`, «Cómo se usa» en
 * el «···» y `<VideosAyuda modulo="<key>" … />`. Sin la portada, las pruebas salen rojas.
 * 🔑 Cambiar un video = volver a subir el archivo a la MISMA ruta: este archivo
 * no se toca (salvo que cambie la duración).
 *
 * `segundos` = los del archivo, redondeados hacia abajo (como los cuenta el reproductor).
 * `orden` 0 = «Introducción»; del 1 en adelante se muestran numerados.
 * `completo` = el video entero, el de «Ver todo»; no entra a la lista.
 * Las rutas son del bucket, nunca una URL: la URL se firma al pedirla.
 * ──────────────────────────────────────────────────────────────────────────── */

export const BUCKET_VIDEOS_AYUDA = "videos-ayuda";

export interface VideoAyuda {
  modulo: string;
  orden: number;
  titulo: string;
  segundos: number;
  video: string;
  miniatura: string;
  completo?: boolean;
  /** Serie grabada en formato de teléfono (9:16): el panel no la mete en 16:9. */
  vertical?: boolean;
}

/** Un renglón: la carpeta del bucket es la key del módulo (`modules.ts`). */
const fila = (modulo: string, { vertical = false } = {}) =>
  (orden: number, titulo: string, segundos: number, archivo: string, completo = false, esVertical = vertical): VideoAyuda => ({
    modulo,
    orden,
    titulo,
    segundos,
    video: `${modulo}/${archivo}.mp4`,
    miniatura: `${modulo}/${archivo}.jpg`,
    ...(completo ? { completo } : {}),
    ...(esVertical ? { vertical: true } : {}),
  });
const caja = fila("caja");
const cxc = fila("cxc");
const reclamos = fila("reclamos");
const marketing = fila("marketing");
const recordatorios = fila("cheques"); // Recordatorios: su key sigue siendo `cheques`.
const prestamos = fila("prestamos");
const catalogos = fila("catalogos", { vertical: true }); // serie de teléfono (9:16)
const asistencia = fila("asistencia"); // mixta: el 01 es de teléfono
const comisiones = fila("comisiones");
const despachos = fila("guias"); // Despachos: la key del módulo sigue siendo `guias`

export const VIDEOS_AYUDA: VideoAyuda[] = [
  caja(0, "Caja menuda completa", 568, "00-completo", true),
  caja(0, "Introducción", 56, "00-que-es-caja-menuda"),
  caja(1, "Abrir un período", 48, "01-abrir-periodo"),
  caja(2, "Registrar un gasto", 55, "02-registrar-gasto"),
  caja(3, "Registrar varios gastos seguidos", 58, "03-varios-gastos"),
  caja(4, "Adjuntar el comprobante", 38, "04-adjuntar-comprobante"),
  caja(5, "Editar un gasto", 42, "05-editar-gasto"),
  caja(6, "Eliminar y restaurar un gasto", 42, "06-eliminar-y-restaurar"),
  caja(7, "Buscar y filtrar", 43, "07-buscar-y-filtrar"),
  caja(8, "Imprimir y descargar Excel", 42, "08-imprimir-y-excel"),
  caja(9, "Cerrar el período", 77, "09-cerrar-periodo"),
  caja(10, "Abrir el período siguiente", 47, "10-periodo-siguiente"),

  cxc(0, "Cuentas por cobrar completo", 565, "00-completo", true),
  cxc(0, "Introducción", 61, "00-que-es-cuentas-por-cobrar"),
  cxc(1, "Leer la lista", 62, "01-leer-la-lista"),
  cxc(2, "Buscar y filtrar", 49, "02-buscar-y-filtrar"),
  cxc(3, "El detalle de un cliente", 39, "03-detalle-del-cliente"),
  cxc(4, "El estado de cuenta", 49, "04-estado-de-cuenta"),
  cxc(5, "Enviar por correo", 52, "05-enviar-por-correo"),
  cxc(6, "WhatsApp y copiar mensaje", 47, "06-whatsapp-y-copiar"),
  cxc(7, "Descargar el PDF", 47, "07-descargar-pdf"),
  cxc(8, "Editar el mensaje", 39, "08-editar-mensaje"),
  cxc(9, "Enviar a varios", 48, "09-enviar-a-varios"),
  cxc(10, "Descargar y actualizar", 54, "10-descargar-y-actualizar"),

  reclamos(0, "Reclamos completo", 572, "00-completo", true),
  reclamos(0, "Introducción", 60, "00-que-es-reclamos"),
  reclamos(1, "La lista de una empresa", 50, "01-lista-de-una-empresa"),
  reclamos(2, "Crear un reclamo: la factura", 48, "02-crear-la-factura"),
  reclamos(3, "Crear un reclamo: qué reclamas", 52, "03-crear-que-reclamas"),
  reclamos(4, "El reclamo por dentro", 69, "04-el-reclamo-por-dentro"),
  reclamos(5, "Enviar al proveedor", 57, "05-enviar-al-proveedor"),
  reclamos(6, "Descargar en Excel o PDF", 51, "06-descargar-excel-y-pdf"),
  reclamos(7, "Marcar como cobrado", 56, "07-marcar-como-cobrado"),
  reclamos(8, "Editar un reclamo", 39, "08-editar-un-reclamo"),
  reclamos(9, "Buscar un reclamo", 36, "09-buscar-un-reclamo"),
  reclamos(10, "Eliminar y deshacer", 33, "10-eliminar-y-deshacer"),

  marketing(0, "Marketing completo", 688, "00-completo", true),
  marketing(0, "Introducción", 54, "00-que-es-marketing"),
  marketing(1, "Por cobrar", 49, "01-por-cobrar"),
  marketing(2, "Registrar una factura", 63, "02-registrar-factura"),
  marketing(3, "Cuánto se le cobra a la marca", 59, "03-cuanto-se-cobra"),
  marketing(4, "Pago de impulsadora", 60, "04-pago-impulsadora"),
  marketing(5, "Entrega de mobiliario", 61, "05-entrega-mobiliario"),
  marketing(6, "El inventario de mobiliario", 40, "06-inventario-mobiliario"),
  marketing(7, "La lista de gastos", 47, "07-lista-de-gastos"),
  marketing(8, "Corregir un gasto", 43, "08-corregir-gasto"),
  marketing(9, "Fotos de la tienda", 43, "09-fotos-de-la-tienda"),
  marketing(10, "El cobro y el ZIP", 56, "10-cobro-y-zip"),
  marketing(11, "Cerrar el cobro", 58, "11-cerrar-cobro"),
  marketing(12, "Proveedores", 38, "12-proveedores"),

  recordatorios(0, "Recordatorios completo", 582, "00-completo", true),
  recordatorios(0, "Introducción", 45, "00-que-es-recordatorios"),
  recordatorios(1, "Leer la lista", 47, "01-la-lista"),
  recordatorios(2, "Registrar un cheque", 49, "02-registrar-cheque"),
  recordatorios(3, "Crear una nota", 50, "03-crear-nota"),
  recordatorios(4, "Notas que se repiten", 47, "04-notas-que-se-repiten"),
  recordatorios(5, "Confirmar un depósito", 33, "05-confirmar-deposito"),
  recordatorios(6, "Cheque devuelto", 42, "06-cheque-devuelto"),
  recordatorios(7, "Ver y corregir un cheque", 43, "07-ver-y-corregir-cheque"),
  recordatorios(8, "Corregir o eliminar una nota", 36, "08-corregir-o-eliminar-nota"),
  recordatorios(9, "Buscar un cheque", 37, "09-buscar"),
  recordatorios(10, "Ver el calendario", 42, "10-calendario"),
  recordatorios(11, "Solo el administrador", 49, "11-solo-administrador"),
  recordatorios(12, "El aviso de las 9:00", 45, "12-el-aviso-de-las-nueve"),

  prestamos(0, "Préstamos completo", 672, "00-completo", true),
  prestamos(0, "Introducción", 63, "00-que-es-prestamos"),
  prestamos(1, "Leer la lista de saldos", 63, "01-leer-la-lista"),
  prestamos(2, "Registrar un préstamo", 55, "02-nuevo-prestamo"),
  prestamos(3, "Daño de mercancía y descuento a terceros", 52, "03-dano-y-terceros"),
  prestamos(4, "El tope de un sueldo", 58, "04-el-tope"),
  prestamos(5, "Registrar un abono", 54, "05-registrar-abono"),
  prestamos(6, "La ficha del colaborador", 60, "06-la-ficha"),
  prestamos(7, "Cambiar la cuota", 42, "07-cambiar-la-cuota"),
  prestamos(8, "Unir un préstamo a su colaborador", 47, "08-unir-al-colaborador"),
  prestamos(9, "Corregir o eliminar un movimiento", 46, "09-corregir-o-eliminar"),
  prestamos(10, "La quincena y los movimientos", 60, "10-la-quincena"),
  prestamos(11, "Buscar, filtrar y descargar", 49, "11-buscar-filtrar-y-descargar"),

  catalogos(0, "Catálogos completo", 535, "00-completo", true),
  catalogos(0, "Introducción", 53, "00-que-es-catalogos"),
  catalogos(1, "Ver el catálogo y buscar", 61, "01-ver-y-buscar"),
  catalogos(2, "Armar un pedido", 50, "02-armar-pedido"),
  catalogos(3, "Cliente, vendedor y precio", 58, "03-cliente-vendedor-precio"),
  catalogos(4, "Pedido o cotización", 46, "04-pedido-o-cotizacion"),
  catalogos(5, "Comprobantes", 49, "05-comprobantes"),
  catalogos(6, "Abrir un comprobante", 47, "06-abrir-comprobante"),
  catalogos(7, "El enlace para el cliente", 48, "07-enlace-para-el-cliente"),
  catalogos(8, "Completar el pedido del cliente", 51, "08-completar-pedido-del-cliente"),
  catalogos(9, "Administrar el catálogo", 54, "09-administrar"),
  asistencia(0, "Asistencia y planilla completo", 598, "00-completo", true),
  asistencia(0, "Introducción", 53, "00-que-es-asistencia"),
  asistencia(1, "Marcar desde el teléfono", 61, "01-marcar-desde-el-telefono", false, true),
  asistencia(2, "Revisar la quincena", 63, "02-revisar-la-quincena"),
  asistencia(3, "Corregir una marca", 53, "03-corregir-una-marca"),
  asistencia(4, "Justificar una ausencia", 53, "04-justificar-una-ausencia"),
  asistencia(5, "Aprobar horas extra", 59, "05-aprobar-horas-extra"),
  asistencia(6, "La ficha del colaborador", 59, "06-ficha-del-colaborador"),
  asistencia(7, "Cerrar la quincena", 62, "07-cerrar-la-quincena"),
  asistencia(8, "La planilla y los comprobantes", 59, "08-la-planilla-y-comprobantes"),
  asistencia(9, "Horarios, feriados y reglas", 56, "09-horarios-y-feriados"),
  comisiones(0, "Comisiones completo", 556, "00-completo", true),
  comisiones(0, "Introducción", 54, "00-que-es-comisiones"),
  comisiones(1, "Leer la pantalla", 49, "01-leer-la-pantalla"),
  comisiones(2, "Elegir el mes", 42, "02-elegir-el-mes"),
  comisiones(3, "Ver una sola empresa", 42, "03-ver-una-empresa"),
  comisiones(4, "El detalle de un vendedor", 43, "04-detalle-del-vendedor"),
  comisiones(5, "Apagar un descuento este mes", 41, "05-apagar-un-descuento"),
  comisiones(6, "Descargar y enviar", 44, "06-descargar-y-enviar"),
  comisiones(7, "Rango de fechas", 40, "07-rango-de-fechas"),
  comisiones(8, "No pagables, criterios y actualizar", 42, "08-no-pagables-y-actualizar"),
  comisiones(9, "Tasas por vendedor", 42, "09-tasas-por-vendedor"),
  comisiones(10, "Exclusiones de comisión", 51, "10-exclusiones"),
  comisiones(11, "Descuentos fijos", 48, "11-descuentos-fijos"),
  despachos(0, "Despachos completo", 1000, "00-completo", true),
  despachos(0, "Introducción", 64, "00-que-es-despachos"),
  despachos(1, "La lista de pedidos", 77, "01-lista-de-pedidos"),
  despachos(2, "Iniciar la preparación", 54, "02-iniciar-preparacion"),
  despachos(3, "En espera de muestra", 57, "03-espera-de-muestra"),
  despachos(4, "Marcar preparado", 67, "04-marcar-preparado"),
  despachos(5, "Recibir el pedido", 47, "05-recibir-pedido"),
  despachos(6, "Etiquetas de un pedido", 69, "06-etiquetas-de-un-pedido"),
  despachos(7, "Varias facturas en un envío", 57, "07-varias-facturas"),
  despachos(8, "Etiqueta de un traslado", 48, "08-etiqueta-de-traslado"),
  despachos(9, "La lista de etiquetas", 68, "09-lista-de-etiquetas"),
  despachos(10, "Nueva guía de despacho", 88, "10-nueva-guia"),
  despachos(11, "Despachar la guía", 71, "11-despachar-la-guia"),
  despachos(12, "Imprimir y compartir la guía", 48, "12-imprimir-y-compartir"),
  despachos(13, "La lista de guías", 52, "13-lista-de-guias"),
  despachos(14, "Corregir o eliminar una guía", 53, "14-corregir-o-eliminar"),
  despachos(15, "Configuración", 58, "15-configuracion"),
];

/** Los videos de un módulo: la lista en orden y el completo aparte. */
export function videosDelModulo(modulo: string): { lista: VideoAyuda[]; completo: VideoAyuda | null } {
  const del = VIDEOS_AYUDA.filter((v) => v.modulo === modulo);
  return {
    lista: del.filter((v) => !v.completo).sort((a, b) => a.orden - b.orden),
    completo: del.find((v) => v.completo) ?? null,
  };
}

export const tieneVideos = (modulo: string): boolean => VIDEOS_AYUDA.some((v) => v.modulo === modulo && !v.completo);

/** 0:57 · 9:28 */
export function duracion(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** «Introducción» · «2. Registrar un gasto» */
export const tituloEnLista = (v: Pick<VideoAyuda, "orden" | "titulo">): string =>
  v.orden > 0 ? `${v.orden}. ${v.titulo}` : v.titulo;
