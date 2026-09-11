// ─────────────────────────────────────────────────────────────────────────────
// LAS NOVEDADES — ESCRITAS A MANO, UNA POR LÍNEA (9-sep-2026).
//
// 🔴 ESTE ARCHIVO ES EL ÚNICO LUGAR DONDE SE ESCRIBE UNA NOVEDAD. No se generan
// del historial de cambios ni de los commits: un texto para una persona lo
// escribe una persona. El historial dice «MITADES_POR_MARCA = true»; Angela
// necesita leer «una descripción casi igual a otra ahora te avisa».
//
// CÓMO SE AGREGA UNA (tres reglas, y hay candado para las tres):
//   · `modulo` es la KEY del módulo en `src/lib/modules.ts` — `cargar`, no
//     «Plantilla Switch»; `cheques`, no «Recordatorios».
//   · `id` EMPIEZA con esa key. Es lo que se guarda como «ya la vi», así que
//     dos módulos no pueden compartir uno.
//   · `texto` es UNA línea, en el idioma de ellos: sin nombres de tabla, sin
//     rutas, sin «endpoint», sin voseo. Si la persona no lo NOTA al usar la
//     pantalla, no es una novedad.
//
// 🔴 MEJOR CERO QUE UNA DE RELLENO. Un módulo que no cambió no lleva novedad, y
// un cambio que la persona no ve tampoco: por eso NO están acá la foto del
// recibo antes de que existiera su lugar donde guardarse, ni el freno del año
// base de Ventas (está en el código y hoy no mueve un solo número).
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 «SALEN TODAS — QUE SE ENTEREN DE TODO AUNQUE SEA VIEJO» (Daniel, 9-sep-2026)
//
// El aviso nació el 9-sep con las diez novedades de esa semana. Este archivo
// trae, además, lo que cambió en las DOS SEMANAS anteriores: 19 módulos, cada
// línea verificada contra el código y —donde hacía falta— contra la base de
// producción, para no anunciar algo que todavía no se ve.
//
// Por eso esas llevan `desde: "2026-09-09"`: la vigencia de 30 días se cuenta
// desde que se AVISA, no desde que el cambio salió. Sin eso, lo del 25 de agosto
// habría nacido con cuatro días de vida y se habría ido antes de que nadie lo
// leyera. `fecha` sigue diciendo la verdad de CUÁNDO cambió — es lo que ordena
// la tira y lo que Daniel ve en Usuarios › Novedades.
//
// ⚠️ Solo se ven TRES a la vez, las más nuevas (`MAX_A_LA_VEZ`). Un módulo con
// más de tres NO pierde ninguna: se ven las tres más nuevas, se cierran con la
// ×, y a la vuelta salen las siguientes. Lo que sí se prohíbe —y hay candado—
// es escribir más de tres del MISMO módulo con la MISMA fecha: entre esas no
// habría segunda vuelta que valga, quedarían empatadas para siempre.
// ─────────────────────────────────────────────────────────────────────────────

import type { Novedad } from "./seleccion";

/** El día en que arrancó el aviso de las dos semanas viejas. Ver el encabezado. */
const ARRANQUE = "2026-09-09";

export const NOVEDADES: readonly Novedad[] = [
  /* ══ Ventas y clientes ═══════════════════════════════════════════════════ */

  /* ── Vista General — módulo `vista-general` ─────────────────────────────── */
  {
    id: "vista-general-vs-el-ano-pasado-mismos-dias",
    modulo: "vista-general",
    fecha: "2026-09-03",
    desde: ARRANQUE,
    texto: "El «vs el año pasado» compara los mismos días y no el mes entero: lo que va del mes ya no sale hundido.",
  },

  /* ── Ventas — módulo `ventas` ───────────────────────────────────────────── */
  {
    id: "ventas-tres-pestanas-y-listas-enteras",
    modulo: "ventas",
    fecha: "2026-09-05",
    desde: ARRANQUE,
    texto: "Ventas tiene tres pestañas —Resumen, Clientes y Productos— y las listas salen completas, sin «Mostrar más».",
  },
  {
    id: "ventas-comisiones-tiene-su-modulo",
    modulo: "ventas",
    fecha: "2026-09-06",
    desde: ARRANQUE,
    texto: "Comisiones ya no es una pestaña de Ventas: tiene su propio módulo.",
  },
  {
    id: "ventas-vs-el-ano-pasado-mismos-dias",
    modulo: "ventas",
    fecha: "2026-09-03",
    desde: ARRANQUE,
    texto: "El «vs el año pasado» compara los mismos días, no el mes ni el año entero: a principio de mes los porcentajes ya no mienten.",
  },

  /* ── Comisiones — módulo `comisiones` ───────────────────────────────────── */
  {
    id: "comisiones-flechita-descarga-el-reporte",
    modulo: "comisiones",
    fecha: "2026-09-08",
    texto: "La flechita gris al lado de cada número descarga ese reporte sin tener que abrir el detalle.",
    dibujo: "flechita-en-el-numero",
  },
  {
    id: "comisiones-un-selector-y-un-engranaje",
    modulo: "comisiones",
    fecha: "2026-09-06",
    desde: ARRANQUE,
    texto: "Se fueron las cuatro pestañas: eliges la empresa arriba y la configuración vive en el engranaje.",
    dibujo: "pestanas-a-selector-y-engranaje",
  },
  {
    id: "comisiones-abre-en-el-mes-cerrado",
    modulo: "comisiones",
    fecha: "2026-09-06",
    desde: ARRANQUE,
    texto: "Abre en el último mes cerrado y no en el que va corriendo; el mes en curso queda a un toque.",
  },
  {
    id: "comisiones-los-que-no-se-pagan",
    modulo: "comisiones",
    fecha: "2026-09-06",
    desde: ARRANQUE,
    texto: "Oficina y Daniel Levy están detrás de «Ver los que no se pagan», así lo que ves en la tabla suma exactamente lo que se paga.",
  },

  /* ── Referencia — módulo `referencia` ───────────────────────────────────── */
  {
    id: "referencia-volvio-el-boton-de-actualizar",
    modulo: "referencia",
    fecha: "2026-09-05",
    desde: ARRANQUE,
    texto: "Volvió el botón «Actualizar datos de Switch», y ahora lo ve todo el que entra al módulo.",
  },

  /* ── Cuentas por Cobrar — módulo `cxc` ──────────────────────────────────── */
  {
    id: "cxc-descargar-en-vez-de-exportar",
    modulo: "cxc",
    fecha: "2026-09-08",
    texto: "«Exportar» ahora dice «Descargar» y ofrece dos cosas: total por cliente o detallado por compañía, en PDF o Excel.",
    dibujo: "exportar-a-descargar",
  },
  {
    id: "cxc-saldo-a-favor-no-se-cobra",
    modulo: "cxc",
    fecha: "2026-09-08",
    texto: "Al cliente que tiene saldo a favor ya no se le ofrece cobrar: sigue viéndose, pero no se le pide plata que le debemos.",
  },
  {
    id: "cxc-estado-de-cuenta-como-switch",
    modulo: "cxc",
    fecha: "2026-09-09",
    texto: "El estado de cuenta que le mandas al cliente ahora sale con la misma forma que el de Switch.",
  },
  {
    id: "cxc-cobrar-es-la-unica-puerta",
    modulo: "cxc",
    fecha: "2026-09-05",
    desde: ARRANQUE,
    texto: "«Cobrar» es la única puerta: una hoja con correo, WhatsApp, copiar el mensaje y el PDF. Se fueron el menú «···» y el clic derecho.",
    dibujo: "una-sola-puerta-cobrar",
  },
  {
    id: "cxc-el-que-no-paga-hace-90-dias",
    modulo: "cxc",
    fecha: "2026-09-05",
    desde: ARRANQUE,
    texto: "Hay un filtro nuevo: los clientes que no te pagan hace más de 90 días, aunque su fila se vea verde.",
  },

  /* ── Multifashion — módulo `multifashion` ───────────────────────────────── */
  {
    id: "multifashion-se-llama-multifashion",
    modulo: "multifashion",
    fecha: "2026-09-07",
    desde: ARRANQUE,
    texto: "La tienda se llama «Multifashion» en toda la pantalla; antes decía «American Classics».",
  },
  {
    id: "multifashion-cuatro-pestanas",
    modulo: "multifashion",
    fecha: "2026-09-07",
    desde: ARRANQUE,
    texto: "Ahora son cuatro pestañas —Resumen, Vendedoras, Productos y Clientes—: las metas viven dentro de Vendedoras y Caja se quitó.",
    dibujo: "seis-pestanas-a-cuatro",
  },
  {
    id: "multifashion-un-solo-control-de-tiempo",
    modulo: "multifashion",
    fecha: "2026-09-07",
    desde: ARRANQUE,
    texto: "Arriba hay un solo control de tiempo para toda la pantalla: el mes, el año, o los últimos 3, 6 o 12 meses.",
    dibujo: "un-solo-control-de-tiempo",
  },

  /* ── Confecciones Boston — módulo `boston` ──────────────────────────────── */
  {
    id: "boston-columnas-de-dinero-en-la-planilla",
    modulo: "boston",
    fecha: "2026-08-31",
    desde: ARRANQUE,
    texto: "La planilla de Boston ya trae sus columnas de dinero, con el mismo total que en el resto del sistema.",
  },

  /* ── Clientes — módulo `directorio` ─────────────────────────────────────── */
  {
    id: "directorio-la-ficha-empieza-por-la-plata",
    modulo: "directorio",
    fecha: "2026-09-05",
    desde: ARRANQUE,
    texto: "La ficha del cliente abre con cuánto te compró, cuánto debe, su último pago y su última compra.",
  },
  {
    id: "directorio-se-edita-tocando-el-dato",
    modulo: "directorio",
    fecha: "2026-09-05",
    desde: ARRANQUE,
    texto: "La ficha se edita tocando el dato: no hay botón de Guardar, se guarda al salir del campo.",
    dibujo: "se-edita-tocando-el-dato",
  },
  {
    id: "directorio-el-que-ya-no-esta-en-switch",
    modulo: "directorio",
    fecha: "2026-09-04",
    desde: ARRANQUE,
    texto: "El cliente que Switch ya no manda deja de ofrecerse en las listas; su ficha sigue abriendo y te lo dice.",
  },

  /* ── Proveedores — módulo `proveedores` ─────────────────────────────────── */
  {
    id: "proveedores-una-sola-fila-por-proveedor",
    modulo: "proveedores",
    fecha: "2026-09-07",
    desde: ARRANQUE,
    texto: "Cada proveedor sale en UNA sola fila aunque cada compañía lo escriba distinto, y una columna nueva dice de qué compañías viene.",
  },
  {
    id: "proveedores-la-ficha-vuelve-a-traer-sus-reclamos",
    modulo: "proveedores",
    fecha: "2026-09-05",
    desde: ARRANQUE,
    texto: "En la ficha de un proveedor vuelven a verse sus reclamos: se cruzaban por el nombre y la mayoría no cruzaba.",
  },

  /* ── Catálogos — módulo `catalogos` ─────────────────────────────────────── */
  {
    id: "catalogos-el-cliente-revisa-antes-de-confirmar",
    modulo: "catalogos",
    fecha: "2026-09-07",
    desde: ARRANQUE,
    texto: "El cliente que entra por el link ahora revisa su pedido antes de confirmarlo: cambia cantidades y quita líneas.",
  },
  {
    id: "catalogos-el-enlace-sale-limpio",
    modulo: "catalogos",
    fecha: "2026-09-07",
    desde: ARRANQUE,
    texto: "El enlace que compartes sale limpio: el cliente ve el catálogo completo, no el filtro que tenías puesto.",
  },
  {
    id: "catalogos-el-excel-de-comprobantes-cuadra",
    modulo: "catalogos",
    fecha: "2026-09-07",
    desde: ARRANQUE,
    texto: "El Excel de Comprobantes cobraba de más cuando el producto va por bultos; ahora dice lo mismo que la pantalla, que siempre estuvo bien.",
  },

  /* ══ Operación ═══════════════════════════════════════════════════════════ */

  /* ── Guías de Despacho — módulo `guias` ─────────────────────────────────── */
  {
    id: "guias-westland-bien-escrito",
    modulo: "guias",
    fecha: "2026-09-08",
    texto: "La lista de destinos ya dice «Westland» bien escrito; las guías viejas quedan como están.",
  },
  {
    id: "guias-calle-19-fuera-de-la-lista",
    modulo: "guias",
    fecha: "2026-09-08",
    texto: "«CALLE 19» salió de la lista de destinos: sola no dice a qué tienda va el envío.",
  },
  {
    id: "guias-imprimir-y-compartir-sacan-el-pdf",
    modulo: "guias",
    fecha: "2026-09-09",
    texto: "«Imprimir» y «Compartir» sacan el PDF de siempre, en el celular y en la computadora.",
  },
  {
    id: "guias-crear-con-las-facturas-del-dia",
    modulo: "guias",
    fecha: "2026-09-04",
    desde: ARRANQUE,
    texto: "Al crear la guía eliges el cliente una vez y marcas sus facturas del día; lo que va sin factura sale como «Traslado».",
  },
  {
    id: "guias-bodega-corrige-los-bultos",
    modulo: "guias",
    fecha: "2026-09-05",
    desde: ARRANQUE,
    texto: "Bodega puede corregir los bultos al despachar, mientras la guía no esté firmada, y queda anotado quién los cambió.",
    dibujo: "caja-de-bultos-al-despachar",
  },
  {
    id: "guias-la-lista-abre-con-el-ultimo-mes",
    modulo: "guias",
    fecha: "2026-09-05",
    desde: ARRANQUE,
    texto: "La lista abre con el último mes y siempre agrupada por fecha; lo viejo está en «Ver guías más viejas», y arriba te avisa lo que falta despachar.",
  },

  /* ── Packing Lists — el módulo se RETIRÓ el 10-sep-2026 (Daniel: «packing
     list no se usa, eliminar»), así que su única novedad se fue con él: sin
     módulo no hay ruta donde mostrarla, y `novedades.test.ts` exige que el
     `modulo` de cada novedad exista en `ALL_MODULE_KEYS`. ──────────────────── */

  /* ── Asistencia y Planilla — módulo `asistencia` ────────────────────────── */
  {
    id: "asistencia-la-quincena-se-cierra",
    modulo: "asistencia",
    fecha: "2026-09-01",
    desde: ARRANQUE,
    texto: "La quincena se guarda y se cierra; cerrada queda congelada, y para corregir un monto hay que reabrirla.",
  },
  {
    id: "asistencia-la-hora-extra-arranca-a-los-10-minutos",
    modulo: "asistencia",
    fecha: "2026-09-01",
    desde: ARRANQUE,
    texto: "La hora extra arranca a los 10 minutos y ya no se le resta el atraso; la tardanza se sigue descontando por su lado.",
  },
  {
    id: "asistencia-el-aviso-lleva-a-la-persona",
    modulo: "asistencia",
    fecha: "2026-09-03",
    desde: ARRANQUE,
    texto: "El aviso de «horas extra sin aprobar» ahora es un enlace: tocas el nombre y caes en esa persona, en el día que falta.",
    dibujo: "el-aviso-es-un-enlace",
  },

  /* ── Reclamos — módulo `reclamos` ───────────────────────────────────────── */
  {
    id: "reclamos-el-itbms-dice-7",
    modulo: "reclamos",
    fecha: "2026-09-01",
    desde: ARRANQUE,
    texto: "El papel del proveedor decía «ITBMS 7.7%», una tasa que no existe en Panamá: ahora dice 7%. La plata es la misma.",
  },

  /* ── Plantilla Switch (era «Depurador») — módulo `cargar` ───────────────── */
  {
    id: "cargar-se-llama-plantilla-switch",
    modulo: "cargar",
    fecha: "2026-09-08",
    texto: "El módulo ahora se llama «Plantilla Switch». Es el mismo de siempre, con el nombre de lo que hace.",
  },
  {
    id: "cargar-quitar-una-descripcion",
    modulo: "cargar",
    fecha: "2026-09-08",
    texto: "En «Reglas» ya puedes quitar una descripción que escribiste, sin pedírselo a nadie.",
    dibujo: "quitar-con-la-equis",
  },
  {
    id: "cargar-avisa-descripcion-casi-igual",
    modulo: "cargar",
    fecha: "2026-09-08",
    texto: "Si una descripción es casi igual a otra de la misma marca, el sistema te lo avisa antes de que entre.",
  },
  {
    id: "cargar-la-compania-se-reconoce-sola",
    modulo: "cargar",
    fecha: "2026-09-04",
    desde: ARRANQUE,
    texto: "Hay tres pestañas, y la compañía se reconoce sola de las marcas del archivo: ya no hay que elegirla, y si hace falta la cambias.",
    dibujo: "la-compania-se-reconoce-sola",
  },
  {
    id: "cargar-el-divisor-fuera-de-rango",
    modulo: "cargar",
    fecha: "2026-09-04",
    desde: ARRANQUE,
    texto: "Un divisor fuera de rango pone el campo en rojo y apaga la descarga: antes bajaba un Excel con los costos cien veces mal.",
  },

  /* ── Marketing — módulo `marketing` ─────────────────────────────────────── */
  {
    id: "marketing-paneles-no-es-obligatorio",
    modulo: "marketing",
    fecha: "2026-08-25",
    desde: ARRANQUE,
    texto: "Paneles dejó de ser obligatorio: una entrega de solo barras y colgadores ya se puede guardar, y el botón te dice qué falta.",
  },

  /* ── Caja Menuda — módulo `caja` ────────────────────────────────────────── */
  {
    id: "caja-el-gasto-no-lleva-responsable",
    modulo: "caja",
    fecha: "2026-09-07",
    desde: ARRANQUE,
    texto: "Al anotar un gasto ya no se pide el responsable.",
  },
  {
    id: "caja-la-foto-del-recibo",
    modulo: "caja",
    fecha: "2026-09-07",
    desde: ARRANQUE,
    texto: "A cada gasto le puedes adjuntar la foto del recibo.",
    dibujo: "foto-del-recibo",
  },
  {
    id: "caja-al-cerrar-dice-cuanto-reponer",
    modulo: "caja",
    fecha: "2026-09-04",
    desde: ARRANQUE,
    texto: "Al cerrar el período ves cuánto se gastó, cuánto queda en caja y cuánto hay que reponer.",
  },

  /* ── Gastos — módulo `gastos-contabilidad` ──────────────────────────────── */
  {
    id: "gastos-contabilidad-lo-que-no-se-pudo-leer",
    modulo: "gastos-contabilidad",
    fecha: "2026-09-02",
    desde: ARRANQUE,
    texto: "Si Switch manda un pago con un formato que el sistema no entiende, ahora sale un aviso: antes el total salía corto y nadie se enteraba.",
  },

  /* ── Préstamos — módulo `prestamos` ─────────────────────────────────────── */
  {
    id: "prestamos-de-donde-salio-el-pago",
    modulo: "prestamos",
    fecha: "2026-09-08",
    texto: "Al registrar un pago ahora eliges de dónde salió la plata; ya no viene contestado «Quincena».",
    dibujo: "de-donde-salio-la-plata",
  },
  {
    id: "prestamos-dos-cuentas-por-persona",
    modulo: "prestamos",
    fecha: "2026-09-05",
    desde: ARRANQUE,
    texto: "Cada persona tiene dos cuentas con su propia cuota: Préstamo y Daño de mercancía. Lo que debe en total no cambió.",
  },
  {
    id: "prestamos-la-lista-solo-muestra-a-quien-debe",
    modulo: "prestamos",
    fecha: "2026-09-05",
    desde: ARRANQUE,
    texto: "La lista muestra solo a quien debe: el que llega a cero sale solo, y el que ya no trabaja pero debe sigue apareciendo, marcado.",
  },
  {
    id: "prestamos-aplicar-quincena-pregunta-la-fecha",
    modulo: "prestamos",
    fecha: "2026-09-03",
    desde: ARRANQUE,
    texto: "«Aplicar quincena» te pregunta la fecha de pago y te dice a quién ya se le aplicó.",
  },

  /* ── Recordatorios (la key sigue siendo `cheques`) ──────────────────────── */
  {
    id: "cheques-una-sola-lista",
    modulo: "cheques",
    fecha: "2026-09-05",
    desde: ARRANQUE,
    texto: "Se fueron las ocho pestañas: es una sola lista agrupada por cuándo — vencido, hoy, esta semana, después y los que se repiten.",
    dibujo: "ocho-pestanas-a-una-lista",
  },
  {
    id: "cheques-escribir-es-un-renglon",
    modulo: "cheques",
    fecha: "2026-09-05",
    desde: ARRANQUE,
    texto: "Escribir un recordatorio es un renglón arriba: qué te recuerdo, cuándo y a quién. Todo sale junto en un mensaje a las 9 de la mañana.",
  },
  {
    id: "cheques-lo-depositado-se-busca",
    modulo: "cheques",
    fecha: "2026-09-05",
    desde: ARRANQUE,
    texto: "Lo depositado ya no está en la lista, pero lo encuentras buscándolo por cliente o por número de cheque.",
  },

  /* ══ Administración ══════════════════════════════════════════════════════ */

  /* ── Usuarios — módulo `usuarios` ───────────────────────────────────────── */
  {
    id: "usuarios-pestana-novedades",
    modulo: "usuarios",
    fecha: "2026-09-09",
    texto: "Hay una pestaña nueva, «Novedades»: los avisos que salen en cada módulo y quiénes ya los leyeron.",
  },
];
