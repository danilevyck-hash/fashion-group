// ─────────────────────────────────────────────────────────────────────────────
// LOS DIBUJITOS DEL AVISO «QUÉ CAMBIÓ» — CATÁLOGO PURO (9-sep-2026).
//
// Daniel, textual: *«pero hazlo con una imagen cada punto de ser necesario para
// que el usuario lo vea»*, y al acotarlo: *«las que cambian de botón o algo más
// que sea necesario para facilidad de usuario»*. Y cómo:
// *«yo dibujo un cuadrito simple — la flechita, el botón nuevo — sin captura
// real»*.
//
// 🔴 NO SON CAPTURAS. Son cuadritos dibujados a mano con unas pocas formas: una
// caja con su rótulo, una flecha, una tira de pestañas y una lista. Nada de
// archivos de imagen, nada de dependencias.
//
// 🔴 SE TIENEN QUE SENTIR DEL SISTEMA (Daniel, 9-sep-2026: *«que se sienta como
// si fuese del sistema»*). Dos cosas lo logran, y las dos se DERIVAN:
//   · el acento sale del COLOR DEL MÓDULO (`src/lib/moduleColors.ts`) — el
//     mismo del filete del encabezado: Guías esmeralda, Préstamos rosa, Caja
//     violeta… Nunca uno solo para los catorce, y un módulo sin color cae al
//     gris de siempre;
//   · el botón principal se dibuja NEGRO RELLENO (`bg-black text-white`), que
//     es como se ve en la app — pero SOLO donde de verdad lo es.
//
// 🔴 EL RECORDATORIO QUE MANDA SOBRE TODO: *«acuérdate que solo lo verá una vez
// cada vez que entra al módulo por usuario»*. Es UNA sola oportunidad de que la
// persona entienda, así que un dibujo que no aclara ESTORBA. Por eso solo llevan
// dibujo las novedades donde la persona **no puede encontrar la cosa sola**:
//   · un botón que se movió, cambió de nombre o nació;
//   · un control que desapareció y hay que decir a dónde se fue.
// Una novedad que solo cambia un número, una regla o un texto NO lleva dibujo:
// ahí el dibujo no agrega nada.
//
// 🔴 ESTE ARCHIVO ES DATO, NO PINTURA. Acá viven la lista de piezas y el texto
// alternativo de cada dibujo; quien las convierte en SVG es
// `src/components/novedades/DibujoNovedad.tsx`. Así el catálogo se prueba sin
// montar React, y los colores salen de las CLASES de la app (nunca un `#hex`).
//
// 🔴 LOS ANCHOS SE CALCULAN, no se teclean uno por uno: `anchoDePieza` los
// deriva del largo del rótulo. Un ancho escrito a mano es el que se queda corto
// el día que alguien cambia una palabra.
// ─────────────────────────────────────────────────────────────────────────────

/** Alto de todo dibujo, en px. Entra en la línea de texto de la tira. */
export const ALTO = 26;
/** La caja: dónde arranca y cuánto mide de alto. */
export const CAJA_Y = 5;
export const CAJA_H = 16;
/** Letra de los rótulos de adentro. Es un dibujo, no un dato de pantalla. */
export const FUENTE = 10;
/** Aire entre una pieza y la siguiente. */
export const SEPARACION = 6;
/** Una pestaña de la tira: ancho y aire. */
export const PESTANA_W = 8;
export const PESTANA_GAP = 3;

/** Ancho aproximado de un rótulo a `FUENTE` px, en una tipografía de palo seco. */
export function anchoDeTexto(texto: string): number {
  return Math.round(texto.length * 5.4);
}

/**
 * Las piezas con las que se arma un cuadrito. Cuatro y nada más:
 *   · `caja`     — un control con su rótulo (un botón, un campo, una celda);
 *   · `flecha`   — el «pasó a ser» entre lo de antes y lo de ahora;
 *   · `pestanas` — una tira de pestañas, con las que se fueron tachadas;
 *   · `lista`    — tres renglones, o sea «una sola lista»;
 *   · `punteada` — una caja de línea cortada: un lugar donde soltar algo;
 *   · `enlace`   — texto subrayado, o sea «esto se toca»;
 *   · `engranaje`— el ⚙ de configuración.
 */
export type Pieza =
  | {
      t: "caja";
      texto: string;
      /** Como estaba ANTES: se dibuja tenue. */
      apagado?: boolean;
      /** Se fue: lleva una raya encima. */
      tachado?: boolean;
      /** Lo NUEVO: trazo grueso y color de acento del módulo. */
      fuerte?: boolean;
      /**
       * 🔴 EL BOTÓN PRINCIPAL DE LA CASA: NEGRO RELLENO, letra blanca
       * (`bg-black text-white` del sistema de diseño). Solo donde en la app de
       * verdad ES ese botón — medido, no supuesto. Un botón dibujado con borde
       * manda a la persona a buscar un campo de texto.
       */
      boton?: boolean;
      /** Una rayita de cursor al final del rótulo: acá se escribe. */
      caret?: boolean;
      /** La flechita gris de descargar, pegada al rótulo. */
      flechita?: boolean;
    }
  | { t: "flecha" }
  | { t: "pestanas"; n: number; tachadasDesde?: number; fuerte?: boolean }
  | { t: "lista" }
  | { t: "punteada"; texto: string }
  | { t: "enlace"; texto: string }
  | { t: "engranaje" };

/** Ancho mínimo de una caja: un rótulo de una letra igual tiene que verse. */
export const CAJA_MIN = 22;
/** Ancho mínimo de la caja punteada: es un lugar donde cae algo. */
export const PUNTEADA_MIN = 60;
/** Lo que ocupa la flechita de descargar dentro de la caja. */
export const FLECHITA_W = 12;
/** Lo que ocupa el cursor dentro de la caja. */
export const CARET_W = 6;

/** Cuánto mide una pieza de ancho. Derivado, nunca escrito a mano. */
export function anchoDePieza(p: Pieza): number {
  switch (p.t) {
    case "caja": {
      const extra = (p.flechita ? FLECHITA_W : 0) + (p.caret ? CARET_W : 0);
      return Math.max(CAJA_MIN, anchoDeTexto(p.texto) + 14 + extra);
    }
    case "flecha":
      return 12;
    case "pestanas":
      return p.n * (PESTANA_W + PESTANA_GAP) - PESTANA_GAP;
    case "lista":
      return 40;
    case "punteada":
      return Math.max(PUNTEADA_MIN, anchoDeTexto(p.texto) + 14);
    case "enlace":
      return anchoDeTexto(p.texto) + 2;
    case "engranaje":
      return 18;
  }
}

/** Dónde arranca cada pieza, de izquierda a derecha. */
export function posicionesDe(piezas: readonly Pieza[]): number[] {
  const xs: number[] = [];
  let x = 1;
  for (const p of piezas) {
    xs.push(x);
    x += anchoDePieza(p) + SEPARACION;
  }
  return xs;
}

/** Ancho total del cuadrito, con su margen de 1 px a cada lado. */
export function anchoTotal(piezas: readonly Pieza[]): number {
  if (piezas.length === 0) return 0;
  const xs = posicionesDe(piezas);
  const ultima = piezas[piezas.length - 1];
  return xs[xs.length - 1] + anchoDePieza(ultima) + 1;
}

/** Un cuadrito: qué se dibuja y qué dice quien no lo puede ver. */
export interface Dibujo {
  /**
   * El texto alternativo. Dice LA COSA, no «imagen de…»: es lo que escucha
   * quien usa lector de pantalla y lo que se lee si el dibujo no carga.
   */
  alt: string;
  piezas: readonly Pieza[];
}

/**
 * 🔴 LOS CATORCE CUADRITOS. Uno por novedad donde la persona no encuentra la
 * cosa sola. Las demás novedades no llevan y se ven exactamente como antes.
 */
export const DIBUJOS = {
  /* ── Comisiones ─────────────────────────────────────────────────────────── */
  "flechita-en-el-numero": {
    alt: "El número de la tabla, con la flechita gris al lado que descarga el reporte.",
    piezas: [{ t: "caja", texto: "$1,234.00", flechita: true }],
  },
  "pestanas-a-selector-y-engranaje": {
    alt: "Antes cuatro pestañas; ahora eliges la empresa arriba y la configuración vive en el engranaje.",
    piezas: [
      { t: "pestanas", n: 4, tachadasDesde: 0 },
      { t: "flecha" },
      { t: "caja", texto: "Empresa ⌄", fuerte: true },
      { t: "engranaje" },
    ],
  },

  /* ── Cuentas por Cobrar ─────────────────────────────────────────────────── */
  "exportar-a-descargar": {
    alt: "El botón que decía «Exportar» ahora dice «Descargar» y abre un menú.",
    piezas: [
      // 🩸 Medido MAL la primera vez: se miró `MenuDescargar.tsx`, que es el
      // `PDF · EXCEL` gris de ADENTRO del menú. El botón que la persona busca es
      // el de la barra (`cxc/page.tsx`), y es `bg-black text-white` — su propio
      // comentario lo dice: *«mismo botón, mismo lugar, mismo color; cambia el
      // verbo»*. Por eso los DOS se dibujan negros: no se movió, se renombró.
      { t: "caja", texto: "Exportar", boton: true, apagado: true, tachado: true },
      { t: "flecha" },
      { t: "caja", texto: "Descargar ⌄", boton: true },
    ],
  },
  "una-sola-puerta-cobrar": {
    alt: "Se fueron el menú «···» y el clic derecho: en cada fila está el botón «Cobrar».",
    piezas: [
      // «Menú ···» y no «···» a secas: medido en pantalla, tres puntos tenues
      // dentro de una caja tachada se leen como una caja VACÍA.
      { t: "caja", texto: "Menú ···", apagado: true, tachado: true },
      { t: "flecha" },
      // Medido: `ClientRow.tsx` lo pinta `rounded-md bg-black … text-white`.
      { t: "caja", texto: "Cobrar", boton: true },
    ],
  },

  /* ── Multifashion ───────────────────────────────────────────────────────── */
  "un-solo-control-de-tiempo": {
    alt: "Arriba hay un solo control de tiempo para toda la pantalla.",
    piezas: [{ t: "caja", texto: "Septiembre 2026 ⌄", fuerte: true }],
  },
  "seis-pestanas-a-cuatro": {
    alt: "De seis pestañas quedan cuatro: las metas viven dentro de Vendedoras y Caja se quitó.",
    piezas: [
      { t: "pestanas", n: 6, tachadasDesde: 4 },
      { t: "flecha" },
      { t: "pestanas", n: 4, fuerte: true },
    ],
  },

  /* ── Recordatorios ──────────────────────────────────────────────────────── */
  "ocho-pestanas-a-una-lista": {
    alt: "Se fueron las ocho pestañas: ahora es una sola lista agrupada por cuándo.",
    piezas: [
      { t: "pestanas", n: 8, tachadasDesde: 0 },
      { t: "flecha" },
      { t: "lista" },
    ],
  },

  /* ── Clientes ───────────────────────────────────────────────────────────── */
  "se-edita-tocando-el-dato": {
    alt: "El botón «Guardar» ya no está: tocas el dato y se guarda al salir del campo.",
    piezas: [
      // Medido en el commit que lo quitó (`0b2701d5`): era `bg-black text-white`.
      // Se dibuja negro y tachado — es EL botón que la persona busca y ya no está.
      { t: "caja", texto: "Guardar", boton: true, apagado: true, tachado: true },
      { t: "flecha" },
      { t: "caja", texto: "Correo", fuerte: true, caret: true },
    ],
  },

  /* ── Guías de Despacho ──────────────────────────────────────────────────── */
  "caja-de-bultos-al-despachar": {
    alt: "Al despachar, al lado del número del transportista hay una caja para corregir los bultos.",
    piezas: [
      { t: "caja", texto: "N° transp." },
      { t: "caja", texto: "Bultos 8", fuerte: true },
    ],
  },

  /* ── Plantilla Switch ───────────────────────────────────────────────────── */
  "la-compania-se-reconoce-sola": {
    alt: "Ya no eliges la compañía: el archivo la dice, y queda un «cambiar» por si hace falta.",
    piezas: [
      { t: "caja", texto: "Compañía ⌄", apagado: true, tachado: true },
      { t: "flecha" },
      { t: "caja", texto: "Vistana", fuerte: true },
    ],
  },
  "quitar-con-la-equis": {
    alt: "Cada descripción que escribiste ahora trae una × al lado para quitarla.",
    piezas: [
      { t: "caja", texto: "Descripción" },
      { t: "caja", texto: "×", fuerte: true },
    ],
  },

  /* ── Préstamos ──────────────────────────────────────────────────────────── */
  "de-donde-salio-la-plata": {
    alt: "Antes venía contestado «Quincena»; ahora un desplegable pregunta de dónde salió la plata.",
    piezas: [
      { t: "caja", texto: "Quincena", apagado: true, tachado: true },
      { t: "flecha" },
      { t: "caja", texto: "¿De dónde? ⌄", fuerte: true },
    ],
  },

  /* ── Caja Menuda ────────────────────────────────────────────────────────── */
  "foto-del-recibo": {
    alt: "En el gasto hay un cuadro nuevo para adjuntar la foto del recibo.",
    piezas: [{ t: "punteada", texto: "＋ Foto" }],
  },

  /* ── Asistencia y Planilla ──────────────────────────────────────────────── */
  "el-aviso-es-un-enlace": {
    alt: "El aviso de horas extra sin aprobar es un enlace: tocas el nombre y caes en su día.",
    piezas: [
      { t: "enlace", texto: "el nombre" },
      { t: "flecha" },
      { t: "caja", texto: "su día", fuerte: true },
    ],
  },
} as const satisfies Record<string, Dibujo>;

/** La llave de un cuadrito. Es lo que una novedad guarda en `dibujo`. */
export type DibujoKey = keyof typeof DIBUJOS;

/** Las llaves, derivadas — nunca una lista escrita al lado. */
export const DIBUJO_KEYS = Object.keys(DIBUJOS) as DibujoKey[];

/**
 * ¿Esta llave existe? El dato viaja por la red desde el servidor, así que la
 * pantalla no confía: una llave que no conoce **no se dibuja** y la novedad se
 * ve como si no tuviera dibujo. Nunca un cuadro roto.
 */
export function esDibujoConocido(clave: string | undefined): clave is DibujoKey {
  return typeof clave === "string" && Object.prototype.hasOwnProperty.call(DIBUJOS, clave);
}
