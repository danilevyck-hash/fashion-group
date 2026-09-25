// ─────────────────────────────────────────────────────────────────────────────
// 🔴 VENTAS EN EL CELULAR (25-sep-2026). Daniel aprobó el mockup letra por
// letra: 1b · 2a · 3f · 3g · 4d (con 3c) · 5b · 6a.
//
// 🩸 QUÉ REEMPLAZA, medido el 25-sep-2026 contra producción a 390 px:
//   · **Resumen**: el primer número llegaba a y=296 (35 % del pantallazo) y el
//     total del grupo se decía DOS veces ($7,069,116.31 en la tarjeta VENTAS y
//     otra vez en la fila «TOTAL GRUPO»): los únicos dos montos repetidos de
//     los 21 visibles. Las nueve filas medían **65, 78 y 112 px** —tres altos
//     en una lista— porque «SEP EN CURSO … +4%» bajaba a dos líneas.
//   · **Clientes**: el primer cliente empezaba a y=487 (58 %) y su monto a
//     y=572 (68 %), con **13 cosas tocables** antes. Abría por «última compra»,
//     así que los 10 primeros eran los 10 que compraron ayer, en orden
//     alfabético, y el más grande del año ($1.431.353) quedaba cuarto de
//     casualidad. La fecha que mandaba el orden iba **sin nombre**, en gris de
//     12 px, justo donde el ☰ le comía 39 px.
//   · **Productos**: el primer producto empezaba a **y=825 de 844** —un
//     pantallazo entero antes del primer renglón—, con «Dejó de venderse»
//     ENCIMA de lo principal (de 123 a 385 px según la empresa) y los cuatro
//     chips de ordenar en DOS filas (94 px para cuatro palabras).
//   · **«Descargar en Excel»** se llevaba un renglón entero él solo en dos
//     pestañas (166 × 44 px), para un botón medido en **3 usos en 7 días** —y
//     los tres fueron el 20-sep entre las 08:35 y las 08:36, uno por pestaña:
//     la huella de querer UN archivo.
//
// 🔴 NINGÚN NÚMERO CAMBIA. Este archivo no suma, no promedia y no compara: solo
// da la FORMA de lo que ya calculan `lib/ventas/queries.ts`, las RPC del
// Resumen y `clientes-corte-comparativo.ts`. Los totales del celular salen de
// las MISMAS lecturas que la computadora.
//
// ⚠️ SOLO CAMBIA HASTA `sm`. La computadora se dibuja igual que siempre — con
// dos excepciones que Daniel pidió de frente y que NO son de celular: las
// cinco columnas de Productos (4d) y la tabla de «Clientes que no comisionan»
// del otro módulo.
//
// ⚠️ Es un interruptor de CÓDIGO, no de variable de entorno: Daniel prueba en
// producción con su secretaria y apagarlo es un cambio de una línea más un
// despliegue.
// ─────────────────────────────────────────────────────────────────────────────

import { fmtMoneyCompact } from "./format";

/** 🔴 Hoy PRENDIDO. `false` = las tres pestañas de antes, intactas. */
export const VENTAS_CELULAR = true;

/** Hasta qué ancho manda esta pantalla: el mismo corte `sm` de Tailwind. */
export const HASTA_SM_VENTAS = "(max-width: 639px)";

/**
 * ¿Quien mira está en un celular?
 *
 * 🔑 SE MONTA UN SOLO ÁRBOL, NO DOS ESCONDIDOS CON CSS. Con las dos vistas
 * dibujadas a la vez —una con `hidden sm:block`— cada nombre de empresa y cada
 * nombre de cliente saldría DOS veces en el documento, y los candados que
 * cuentan nombres (`iphone-ancho-nombres`, `iphone-targets-ventas-clientes`)
 * empezarían a ver el doble. Es el mismo patrón de Marketing y Asistencia.
 *
 * ⚠️ En el servidor no hay `matchMedia`: ante la duda, COMPUTADORA.
 */
export function esPantallaDeCelularVentas(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const mq = window.matchMedia?.(HASTA_SM_VENTAS);
    if (mq) return mq.matches;
  } catch {
    /* un navegador sin matchMedia se porta como computadora */
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1b · Los cuatro números en UNA línea, y el total del año una sola vez
// ─────────────────────────────────────────────────────────────────────────────

/** Un número de la tira de arriba: su cifra corta, su rótulo y su cambio. */
export interface NumeroDeLaTira {
  /** «Ventas» · «Utilidad» · «Margen» · «Cierra». Corto a propósito: son cuatro. */
  rotulo: string;
  /** Lo que se dibuja grande. Compacto: en una línea de cuatro no cabe otra cosa. */
  valor: string;
  /** «▲ +8%» · «▼ −12%» · «▲ +1.3» · «+$920k». `null` = no hay con qué comparar. */
  cambio: string | null;
  /** El signo, para el color. `null` = gris. */
  signo: number | null;
}

/**
 * La cifra corta de la tira: «$7.07M», «$920k», «$431».
 *
 * 🔑 NO ES UN NÚMERO NUEVO: es el MISMO monto del año con menos dígitos, y el
 * exacto con centavos sigue viviendo al pie, en «Total grupo». Ése es
 * justamente el arreglo de la 1b — que el exacto se diga UNA vez, donde
 * siempre estuvo.
 */
export function cifraDeLaTira(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const signo = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${signo}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${signo}$${Math.round(abs / 1_000)}k`;
  return fmtMoneyCompact(n);
}

/** «▲ +8%» / «▼ −12%» / «+0%». Recibe la FRACCIÓN, como todo el módulo. */
export function cambioDeLaTira(ratio: number | null | undefined): string | null {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  const pct = Math.round(Math.abs(ratio * 100));
  if (ratio > 0) return `▲ +${pct}%`;
  if (ratio < 0) return `▼ −${pct}%`;
  return "+0%";
}

// ─────────────────────────────────────────────────────────────────────────────
// 2a · La lista por empresa: tabla compacta, un solo alto por fila
// ─────────────────────────────────────────────────────────────────────────────

/** El monto de una celda de la tabla: ENTERO, sin centavos. Nunca redondeado a «K». */
export function montoDeLaTabla(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const redondeado = Math.round(Math.abs(n));
  return (n < 0 && redondeado !== 0 ? "−" : "") + "$" + redondeado.toLocaleString("en-US");
}

/**
 * El % de una celda: «▲ +17%» · «▼ −78%» · «+4%».
 *
 * 🔴 LA FLECHA SALE SIEMPRE QUE HAYA MOVIMIENTO DE VERDAD. Dentro de ±5 % va
 * el número pelado en gris —es la misma zona neutra de `formatDeltaRatio`, no
 * un corte nuevo—, así que la tabla del celular y la matriz de la computadora
 * pintan el mismo verde y el mismo rojo.
 */
export function porcentajeDeLaTabla(
  ratio: number | null | undefined,
): { texto: string; tono: "up" | "dn" | "fl" } {
  if (ratio == null || !Number.isFinite(ratio)) return { texto: "n/a", tono: "fl" };
  const pct = ratio * 100;
  const entero = Math.round(Math.abs(pct));
  if (pct > 5) return { texto: `▲ +${entero}%`, tono: "up" };
  if (pct < -5) return { texto: `▼ −${entero}%`, tono: "dn" };
  return { texto: `${pct < 0 && entero !== 0 ? "−" : "+"}${entero}%`, tono: "fl" };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3f · La fila del cliente: «compró ayer» / «3 meses sin comprar»
// ─────────────────────────────────────────────────────────────────────────────

/** A partir de cuántos meses sin comprar la línea gris se pinta en ámbar. */
export const MESES_SIN_COMPRAR_AVISA = 2;

/** Lo que dice la línea gris de la fila del cliente, y si avisa. */
export interface UltimaCompraEnPalabras {
  /** «compró hoy» · «compró ayer» · «compró hace 8 días» · «3 meses sin comprar». */
  texto: string;
  /** `true` = va en ámbar: hace meses que no compra. */
  avisa: boolean;
}

/**
 * Hace cuánto compró, en palabras.
 *
 * 🔴 SE CALCULA DE LA ÚLTIMA COMPRA REAL, no del orden de la lista. Hoy la
 * tarjeta dibuja «24 sept 2026» sin rótulo, en 12 px, en la esquina donde el ☰
 * le come 39 px: la fecha que MANDA el orden va sin nombre. Acá se dice lo que
 * significa y se deja de decir el día.
 *
 * ⚠️ «Hoy» es el de PANAMÁ y llega por parámetro: esta función no mira el
 * reloj. Las dos fechas son `AAAA-MM-DD`; una fecha vacía o rara devuelve
 * `null` y la fila no dibuja nada —nunca «hace 0 días»—.
 */
export function ultimaCompraEnPalabras(
  ultimaCompraIso: string | null | undefined,
  hoyIso: string,
): UltimaCompraEnPalabras | null {
  const dias = diasEntre(ultimaCompraIso, hoyIso);
  if (dias == null || dias < 0) return null;
  if (dias === 0) return { texto: "compró hoy", avisa: false };
  if (dias === 1) return { texto: "compró ayer", avisa: false };
  if (dias < 30) return { texto: `compró hace ${dias} días`, avisa: false };
  const meses = Math.floor(dias / 30);
  return {
    texto: `${meses} ${meses === 1 ? "mes" : "meses"} sin comprar`,
    avisa: meses >= MESES_SIN_COMPRAR_AVISA,
  };
}

/** Días enteros entre dos fechas `AAAA-MM-DD`. `null` si alguna no sirve. */
export function diasEntre(desdeIso: string | null | undefined, hastaIso: string): number | null {
  const a = aFecha(desdeIso);
  const b = aFecha(hastaIso);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86_400_000);
}

function aFecha(iso: string | null | undefined): number | null {
  if (!iso || typeof iso !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : null;
}

/**
 * El % grande de la fila del cliente.
 *
 * 🔴 «NUEVO», NO «+0 %», cuando no hay año pasado con qué compararse. Ya es la
 * regla del sistema (`rotuloCompras`, `deltaCeldaDe`): un cliente que empezó
 * este año no subió un 0 %, es nuevo.
 */
export function porcentajeDelCliente(
  ratio: number | null | undefined,
): { texto: string; tono: "up" | "dn" | "fl" | "nv" } {
  if (ratio == null || !Number.isFinite(ratio)) return { texto: "Nuevo", tono: "nv" };
  const pct = ratio * 100;
  const entero = Math.round(Math.abs(pct));
  if (pct > 5) return { texto: `▲ +${entero} %`, tono: "up" };
  if (pct < -5) return { texto: `▼ −${entero} %`, tono: "dn" };
  return { texto: `${pct < 0 && entero !== 0 ? "−" : "+"}${entero} %`, tono: "fl" };
}

/** «D-25 · 6 empresas · compró ayer». Las partes vacías no dejan un « · » suelto. */
export function lineaGrisDelCliente(
  codigo: string | null | undefined,
  empresas: number | null | undefined,
  ultima: UltimaCompraEnPalabras | null,
): string {
  const partes: string[] = [];
  if (codigo) partes.push(codigo);
  if (empresas != null && empresas > 0) {
    partes.push(`${empresas} ${empresas === 1 ? "empresa" : "empresas"}`);
  }
  if (ultima) partes.push(ultima.texto);
  return partes.join(" · ");
}

// ─────────────────────────────────────────────────────────────────────────────
// 3g · La hoja del cliente: el mes a mes, con el mes negativo hacia abajo
// ─────────────────────────────────────────────────────────────────────────────

/** Un mes de la barra del cliente, ya listo para dibujar. */
export interface BarraDelMes {
  /** «ene» … «dic». */
  mes: string;
  /** El monto de este año. Puede ser NEGATIVO (más notas de crédito que ventas). */
  monto: number;
  /** El mismo mes del año pasado. */
  montoPrevio: number | null;
  /** Alto de la barra en % del máximo, 0–100. */
  alto: number;
  /** `true` = la barra va hacia ABAJO, en rojo. */
  haciaAbajo: boolean;
  /** «+51 %» · «−102 %» · `null` si no hay con qué comparar. */
  cambio: string | null;
  /** El signo del cambio, para el color. */
  signo: number | null;
}

/**
 * Las barras del mes a mes de una empresa del cliente.
 *
 * 🔴 UN MES NEGATIVO SE DIBUJA HACIA ABAJO, EN ROJO — no se esconde ni se pone
 * en cero. Medido el 25-sep-2026: enero 2026 de Fashion Wear en City Mall Paso
 * Canoa fue **−$1.026,14** (se facturaron $794,00 y 10 notas de débito por
 * $664,03 contra **8 notas de crédito por $2.484,17**). Ese mes es un hecho del
 * negocio: se le devolvió más de lo que se le vendió.
 *
 * 🔑 EL ALTO SE MIDE CONTRA EL MAYOR VALOR ABSOLUTO del año, así que el mes más
 * grande llega al 100 % y el negativo se ve en su proporción. Con todos los
 * meses en cero, ninguna barra se dibuja (y no se divide entre cero).
 */
export function barrasDelMesAMes(
  meses: readonly string[],
  actual: readonly (number | null)[],
  previo: readonly (number | null)[],
): BarraDelMes[] {
  const tope = Math.max(0, ...actual.map((v) => Math.abs(v ?? 0)));
  return meses.map((mes, i) => {
    const monto = actual[i] ?? 0;
    const montoPrevio = previo[i] ?? null;
    const ratio =
      montoPrevio != null && montoPrevio !== 0 ? (monto - montoPrevio) / Math.abs(montoPrevio) : null;
    return {
      mes,
      monto,
      montoPrevio,
      alto: tope > 0 ? Math.max(2, Math.round((Math.abs(monto) / tope) * 100)) : 0,
      haciaAbajo: monto < 0,
      cambio: ratio == null ? null : `${ratio >= 0 ? "+" : "−"}${Math.round(Math.abs(ratio * 100))} %`,
      signo: ratio,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4d · Productos: cinco columnas y dos desplegables
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Las CINCO columnas que Daniel pidió, en su orden, y en un solo lugar.
 *
 * 🔴 NINGÚN NÚMERO CAMBIA: «Cantidad» son las mismas piezas que hoy se llaman
 * «Piezas» y «Total» la misma venta que hoy se llama «Venta». Es el rótulo, no
 * el dato.
 */
export const COLUMNAS_PRODUCTOS = [
  { clave: "descripcion", rotulo: "Descripción" },
  { clave: "precioProm", rotulo: "Precio prom." },
  { clave: "margen", rotulo: "Margen" },
  { clave: "cantidad", rotulo: "Cantidad" },
  { clave: "total", rotulo: "Total" },
] as const;

export type ClaveColumnaProductos = (typeof COLUMNAS_PRODUCTOS)[number]["clave"];

/** «10,012 u · $20.00 prom. · margen 32 %» — la segunda línea de la tarjeta. */
export function subtituloDelProducto(
  cantidad: number,
  precioProm: number | null,
  margen: number | null,
): string {
  const partes = [`${Math.round(cantidad).toLocaleString("en-US")} u`];
  if (precioProm != null && Number.isFinite(precioProm)) {
    partes.push(`$${precioProm.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} prom.`);
  }
  if (margen != null && Number.isFinite(margen)) {
    partes.push(`margen ${Math.round(margen * 100)} %`);
  }
  return partes.join(" · ");
}

// ─────────────────────────────────────────────────────────────────────────────
// 6a · «Descargar» es UN solo botón
// ─────────────────────────────────────────────────────────────────────────────

/** Qué se baja cuando se toca «Descargar». */
export type QueSeDescarga = "pestana" | "las-tres";

/** El rótulo del único botón de descarga del módulo, en las tres pestañas. */
export const ROTULO_DESCARGAR = "Descargar";

/** El título de la hoja que pregunta qué bajar. */
export const TITULO_HOJA_DESCARGA = "Descargar";

/** «Resumen · año 2026» — el subtítulo de la primera opción de la hoja. */
export function subtituloDeLaPestana(pestana: string, periodo: string): string {
  return `${pestana} · ${periodo}`;
}
