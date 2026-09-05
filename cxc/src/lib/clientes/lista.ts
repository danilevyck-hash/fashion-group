// ─────────────────────────────────────────────────────────────────────────────
// LA LISTA DE CLIENTES — chips, orden y «cómo contactarlo». Módulo PURO.
//
// 🔴 EL TRABAJO DE ESTA LISTA ES BUSCAR A ALGUIEN Y ARREGLAR SUS DATOS
// (5-sep-2026). No es cobrar (eso es Cuentas por Cobrar) ni analizar la venta
// (eso es Ventas › Clientes). Por eso sus columnas son Cliente · Compró · Debe ·
// Cómo contactarlo, y por eso los chips son de datos que FALTAN.
//
// 🩸 SE RETIRÓ EL FILTRO POR PROVINCIA. **99 de los 150 clientes no tienen
// provincia** (medido contra producción el 5-sep-2026), así que el desplegable
// no alcanzaba ni a un tercio del directorio: elegir una provincia escondía a
// dos de cada tres clientes vivos. Daniel: *«si, no sirve»*. La columna tampoco
// se queda — el lugar donde sí sirve es la ficha, que la muestra con el resto de
// lo fiscal.
//
// 🔴 SE MUESTRAN LOS 150 EN UNA SOLA LISTA CON SCROLL, sin páginas y sin
// recortar por «activos». La razón está medida: **Outlet Duty Free S.A.
// (D-119) facturó $21.826,00 este año** —4 facturas, la última el 27 de
// agosto— y su neto es $0,00 porque el 1-sep le entraron cuatro notas de
// crédito por los mismos montos. Con un corte por actividad ese cliente
// desaparecería estando vivísimo. 150 filas caben; un cliente escondido no se
// recupera.
//
// PURO: sin `new Date()` adentro y sin Supabase.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo mínimo que la lista necesita saber de un cliente para contar y ordenar. */
export interface ClienteDeLista {
  codigo: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  celular: string | null;
  /** Compras del año, netas de notas de crédito. `undefined` = todavía no llegó. */
  compras?: number;
  /** Saldo de hoy. `undefined` = todavía no llegó. */
  debe?: number;
  /** Switch ya no lo manda en ninguna de las 6. `null` = vivo. */
  ausente_desde?: string | null;
}

const vacio = (s: string | null | undefined): boolean => !s || s.trim() === "";

export function tieneCorreo(c: ClienteDeLista): boolean {
  return !vacio(c.email);
}

/** El teléfono del cliente es CUALQUIERA de los dos: uno alcanza para llamar. */
export function tieneTelefono(c: ClienteDeLista): boolean {
  return !vacio(c.telefono) || !vacio(c.celular);
}

export function seLePuedeContactar(c: ClienteDeLista): boolean {
  return tieneCorreo(c) || tieneTelefono(c);
}

/**
 * 🔴 «DEBE» ES TENER SALDO, no tener saldo POSITIVO.
 *
 * Medido el 5-sep-2026: de los 150 clientes, **100 tienen saldo** y de esos
 * **94 lo tienen a favor de la empresa y 6 en contra** (saldo a favor del
 * cliente). Los 6 se cuentan igual porque el chip existe para llevar a la
 * gente a los clientes con plata en juego, y un saldo a favor también hay que
 * mirarlo. La ficha y la tabla ya distinguen el signo.
 */
export function tieneSaldo(c: ClienteDeLista): boolean {
  return (c.debe ?? 0) !== 0;
}

export type ChipId = "todos" | "sin-contacto" | "sin-correo" | "sin-telefono" | "deben";

export interface Chip {
  id: ChipId;
  etiqueta: string;
  cuantos: number;
}

/** Qué mira cada chip. UNA sola definición: la usan el conteo y el filtro, así
 *  que el número del chip no puede mentir sobre la lista que abre. */
const PRUEBA: Record<ChipId, (c: ClienteDeLista) => boolean> = {
  todos: () => true,
  "sin-contacto": (c) => !seLePuedeContactar(c),
  "sin-correo": (c) => !tieneCorreo(c),
  "sin-telefono": (c) => !tieneTelefono(c),
  deben: tieneSaldo,
};

const ETIQUETA: Record<ChipId, string> = {
  todos: "Todos",
  "sin-contacto": "Sin cómo contactarlos",
  "sin-correo": "Sin correo",
  "sin-telefono": "Sin teléfono",
  deben: "Deben",
};

export const CHIPS_EN_ORDEN: ChipId[] = ["todos", "sin-contacto", "sin-correo", "sin-telefono", "deben"];

/**
 * 🔴 LOS CONTEOS SE CALCULAN, NUNCA SE ESCRIBEN A MANO. Un número escrito a
 * mano en un chip es el que un día dice 31 mientras la lista abre 40 — y nadie
 * lo nota, porque nadie cuenta a mano 150 filas.
 */
export function contarChips(clientes: readonly ClienteDeLista[]): Chip[] {
  return CHIPS_EN_ORDEN.map((id) => ({
    id,
    etiqueta: ETIQUETA[id],
    cuantos: clientes.filter(PRUEBA[id]).length,
  }));
}

export function filtrarPorChip<T extends ClienteDeLista>(clientes: readonly T[], chip: ChipId): T[] {
  return clientes.filter(PRUEBA[chip]);
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDEN
// ─────────────────────────────────────────────────────────────────────────────

export type ColumnaOrden = "cliente" | "compras" | "debe";
export type SentidoOrden = "asc" | "desc";

export interface Orden {
  columna: ColumnaOrden;
  sentido: SentidoOrden;
}

/** El orden de arranque: por nombre, de la A a la Z. Es una libreta. */
export const ORDEN_INICIAL: Orden = { columna: "cliente", sentido: "asc" };

/**
 * 🔴 TOCAR UN ENCABEZADO ORDENA DE MAYOR A MENOR PRIMERO; otro toque invierte.
 * Es el mismo patrón que Cuentas por Cobrar, y es el que la gente espera de una
 * columna de plata: lo primero que se quiere ver es quién más compró y quién
 * más debe, no quién menos.
 *
 * ⚠️ «Cliente» es la excepción y no es un descuido: un nombre de mayor a menor
 * (de la Z a la A) no es lo que nadie quiere primero. Arranca A→Z.
 */
export function ordenAlTocar(actual: Orden, columna: ColumnaOrden): Orden {
  if (actual.columna === columna) {
    return { columna, sentido: actual.sentido === "desc" ? "asc" : "desc" };
  }
  return { columna, sentido: columna === "cliente" ? "asc" : "desc" };
}

/** La flecha del encabezado. `↕` en las columnas que no mandan hoy. */
export function flechaOrden(orden: Orden, columna: ColumnaOrden): string {
  if (orden.columna !== columna) return "↕";
  return orden.sentido === "desc" ? "↓" : "↑";
}

/**
 * Ordena SIN MUTAR (devuelve un array nuevo) y con desempate ESTABLE por
 * código: dos clientes con el mismo monto salen siempre en el mismo orden, así
 * que la lista no baila entre dos renders con los mismos datos.
 *
 * Un cliente cuyo monto todavía no llegó (`undefined`) cuenta como 0 para
 * ordenar, pero la pantalla sigue mostrando «…»: ordenar no puede inventar un
 * dato que no está.
 */
export function ordenar<T extends ClienteDeLista>(clientes: readonly T[], orden: Orden): T[] {
  const dir = orden.sentido === "desc" ? -1 : 1;
  return [...clientes].sort((a, b) => {
    let cmp = 0;
    if (orden.columna === "cliente") {
      cmp = (a.nombre ?? "").localeCompare(b.nombre ?? "", "es");
    } else if (orden.columna === "compras") {
      cmp = (a.compras ?? 0) - (b.compras ?? 0);
    } else {
      cmp = (a.debe ?? 0) - (b.debe ?? 0);
    }
    if (cmp !== 0) return cmp * dir;
    return (a.codigo ?? "").localeCompare(b.codigo ?? "", "es");
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// «CÓMO CONTACTARLO»
// ─────────────────────────────────────────────────────────────────────────────

export interface ComoContactarlo {
  correo: string | null;
  telefono: string | null;
  /** Lo que FALTA, dicho en rojo. `null` cuando no falta nada. */
  falta: string | null;
}

/**
 * La última columna de la lista: el correo y el teléfono, y **si falta, se dice
 * en rojo**. Es el trabajo entero de esta pantalla — medido el 5-sep-2026, de
 * 150 clientes **50 no tienen correo, 48 no tienen teléfono y 31 no tienen
 * ninguno de los dos**, y hasta hoy la lista mostraba un «—» gris que no
 * invitaba a arreglar nada.
 */
export function comoContactarlo(c: ClienteDeLista): ComoContactarlo {
  const correo = vacio(c.email) ? null : (c.email as string).trim();
  const telefono = !vacio(c.telefono)
    ? (c.telefono as string).trim()
    : !vacio(c.celular)
      ? (c.celular as string).trim()
      : null;
  const falta =
    !correo && !telefono
      ? "Sin correo ni teléfono"
      : !correo
        ? "Falta el correo"
        : !telefono
          ? "Falta el teléfono"
          : null;
  return { correo, telefono, falta };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUSENTES DE SWITCH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 EL QUE YA NO ESTÁ EN SWITCH NO SALE EN LA LISTA NI EN LA BÚSQUEDA GLOBAL.
 * Daniel, textual: *«si en switch no esta, aqui no debe de aparecer»*. Hoy son
 * dos: D-30 (City Moda Chorrera) y D-135 (Rey Store).
 *
 * ⚠️ SU FICHA SIGUE ABRIENDO por enlace directo, y dice «Ya no está en Switch»
 * con la fecha: las guías y las facturas viejas apuntan a ellos por código y no
 * pueden quedar con un enlace roto. Esconderlo de la lista y borrarlo son dos
 * cosas distintas.
 */
export function sinLosQueYaNoEstan<T extends { ausente_desde?: string | null }>(filas: T[]): T[] {
  return filas.filter((f) => !f.ausente_desde);
}

export function textoYaNoEstaEnSwitch(fechaLegible: string): string {
  return `Ya no está en Switch desde el ${fechaLegible} — se conserva por sus guías y facturas viejas.`;
}

export function contarClientes(n: number): string {
  return `${n.toLocaleString("es")} ${n === 1 ? "cliente" : "clientes"}`;
}
