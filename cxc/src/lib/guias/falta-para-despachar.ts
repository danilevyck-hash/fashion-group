// ─────────────────────────────────────────────────────────────────────────────
// QUÉ LE FALTA A UNA GUÍA PARA PODERSE DESPACHAR — dicho en español simple.
//
// 🩸 POR QUÉ ES UN MÓDULO PURO Y NO UN `if` adentro del botón.
//
// Antes el formulario dejaba tocar "Confirmar despacho" siempre y contestaba
// con un toast por vez: *"Ingresa la placa del vehiculo"*. Faltando tres cosas
// había que tocar tres veces para enterarse de las tres, y cada aviso se iba
// solo a los 3 segundos. Daniel pidió lo contrario: el botón **apagado** y,
// justo debajo, **qué falta**, todo junto y quieto.
//
// Vive aparte porque las MISMAS reglas las aplica el servidor
// (`PUT /api/guias/[id]`). Si la pantalla y el servidor no coincidieran, el
// botón se pondría verde y la guía se rechazaría igual — que es peor que el
// botón apagado. Acá está el listado de faltantes; el candado de que el
// servidor pide lo mismo vive en `guias-placa-entrega-directa.test.ts`.
//
// ⚠️ LA PLACA NO ES OBLIGATORIA EN ENTREGA DIRECTA, y eso no se toca: pedirle
// placa a una entrega que hace la gente de la casa dejaba el 78% de esas guías
// en "Pendiente Bodega" para siempre (medido el 3-ago-2026). Ver la cabecera de
// `guias-placa-entrega-directa.test.ts`.
//
// ⚠️ EL N° DE GUÍA DEL TRANSPORTISTA ES POR LÍNEA. El transportista arma varias
// guías suyas por cada guía nuestra, así que cada renglón lleva el suyo. Lo que
// el servidor exige es que **al menos una** línea lo traiga (era el campo único
// de la guía y ese requisito no se aflojó); que TODAS lo tengan no se pide,
// porque hay envíos que se van sin número propio.
// ─────────────────────────────────────────────────────────────────────────────

export type TipoDespacho = "externo" | "directo";

export interface EstadoDespacho {
  tipoDespacho: TipoDespacho;
  placa: string;
  receptor: string;
  cedula: string;
  chofer: string;
  /** El N° de guía del transportista de CADA línea, en el orden de la guía. */
  numerosTransp: readonly string[];
  tieneFirma1: boolean;
  tieneFirma2: boolean;
}

const vacio = (s: string | undefined | null) => !String(s ?? "").trim();

/**
 * Devuelve los faltantes, en el orden en que se leen en la pantalla. Lista
 * vacía = se puede despachar.
 */
export function faltaParaDespachar(e: EstadoDespacho): string[] {
  const falta: string[] = [];
  const externo = e.tipoDespacho === "externo";

  if (externo) {
    if (vacio(e.placa)) falta.push("placa");
    // Al menos una línea con el número del transportista.
    if (!e.numerosTransp.some((n) => !vacio(n))) falta.push("N° de guía del transportista");
  } else {
    if (vacio(e.chofer)) falta.push("chofer");
  }

  if (vacio(e.receptor)) falta.push("recibido por");
  if (vacio(e.cedula)) falta.push("cédula");

  if (!e.tieneFirma1) falta.push(externo ? "la firma del transportista" : "la firma del chofer");
  if (!e.tieneFirma2) falta.push(externo ? "la firma del entregador" : "la firma del cliente");

  return falta;
}

/**
 * "Falta: placa, recibido por y cédula" — con "y" antes del último, como se
 * habla. Sin faltantes devuelve "".
 */
export function textoFalta(faltantes: readonly string[]): string {
  if (faltantes.length === 0) return "";
  if (faltantes.length === 1) return `Falta: ${faltantes[0]}`;
  const previos = faltantes.slice(0, -1).join(", ");
  return `Falta: ${previos} y ${faltantes[faltantes.length - 1]}`;
}

/**
 * El número que se guarda a NIVEL GUÍA. La columna `guia_transporte.
 * numero_guia_transp` no se retira: la usan el buscador de la lista, el Excel y
 * el encabezado del papel. Se llena con el primer número de línea que haya, así
 * nada de lo que ya funcionaba se queda sin dato.
 */
export function numeroGuiaDeCabecera(numerosTransp: readonly string[]): string {
  for (const n of numerosTransp) {
    const t = String(n ?? "").trim();
    if (t) return t;
  }
  return "";
}

/**
 * El número que IMPRIME una línea. Las guías viejas no tienen número por línea
 * —se guardaba uno solo para toda la guía— así que el papel de una guía
 * histórica tiene que seguir saliendo igual que siempre: si la línea no trae el
 * suyo, se usa el de la cabecera.
 */
export function numeroTranspDeLinea(
  numeroLinea: string | null | undefined,
  numeroGuia: string | null | undefined
): string {
  const linea = String(numeroLinea ?? "").trim();
  if (linea) return linea;
  return String(numeroGuia ?? "").trim();
}

/**
 * ¿Hay UN solo número en toda la guía? Cuando lo hay, el encabezado del papel
 * lo sigue anunciando como antes. Cuando hay varios, anunciarlo arriba sería
 * mentir: el papel diría "N GUIA TRANSP.: TR-4471" y abajo tres números
 * distintos.
 */
export function numeroTranspUnico(
  items: ReadonlyArray<{ numero_guia_transp?: string | null }>,
  numeroGuia: string | null | undefined
): string {
  const distintos = new Set(
    items.map((i) => numeroTranspDeLinea(i.numero_guia_transp, numeroGuia)).filter(Boolean)
  );
  if (distintos.size === 1) return [...distintos][0];
  if (distintos.size === 0) return String(numeroGuia ?? "").trim();
  return "";
}
