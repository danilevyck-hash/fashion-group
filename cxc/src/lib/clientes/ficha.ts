// ─────────────────────────────────────────────────────────────────────────────
// LA FICHA DEL CLIENTE — las cuentas y los textos, en un módulo PURO.
//
// 🔴 UNA SOLA PÁGINA DEL CLIENTE, TRES LISTAS DISTINTAS (5-sep-2026). Cuentas
// por Cobrar y Ventas › Clientes son dos trabajos distintos (cobrar · analizar
// la venta) y se quedan como están. Lo que se unifica es la página a la que se
// llega al tocar el nombre: `/clientes/[codigo]` — la ÚNICA superficie sobre un
// cliente que pueden abrir todos los roles (solo admin ve Ventas; el CXC lo ven
// admin, secretaria y vendedor).
//
// 🔴 UN CERO GRANDE SE LEE COMO DATO ROTO. Cuando un dato no existe, la tarjeta
// lo dice EN PALABRAS («Sin comprar en 2026», «Nunca ha pagado»), nunca
// `$0.00` en letra grande. Es la regla que dio origen a este módulo: todas las
// tarjetas salen de acá para que ninguna se olvide de aplicarla.
//
// 🩸 Y «SIN COMPRAR» NO ES SIEMPRE «NUNCA COMPRÓ» (medido el 5-sep-2026).
// Outlet Duty Free (D-119) facturó **$21.826,00** en 4 facturas de agosto y el
// 1-sep le entraron CUATRO notas de crédito por los MISMOS montos: 8.034 +
// 4.500 + 7.590 + 1.702, una por factura. Neto: **$0,00 exactos**. Lo mismo
// Rey Store (D-135): $140,00 facturados en abril, $140,00 acreditados en junio.
// Las notas de crédito RESTAN —es el invariante de Ventas— así que el cero es
// CORRECTO, no un defecto de la vista. Por eso `estadoDeCompras` distingue
// «nunca compró» de «compró y se le devolvió todo»: son dos verdades distintas
// y decir «Sin comprar en 2026» de un cliente al que se le facturaron $21.826
// y se le acreditaron $21.826 esconde la mitad de la historia.
//
// PURO: nada de `new Date()` adentro, nada de Supabase. Los candados fijan las
// reglas con fechas fijas (Panamá es UTC−5 fijo).
// ─────────────────────────────────────────────────────────────────────────────

import { unAnioAntes } from "@/lib/ventas/clientes-corte-comparativo";

/** Un día-calendario `YYYY-MM-DD` a milisegundos UTC de mediodía (sin zonas). */
function diaAMs(ymd: string): number {
  return Date.parse(`${ymd.slice(0, 10)}T12:00:00Z`);
}

/**
 * Días enteros entre dos días-calendario de Panamá. Positivo si `fecha` es
 * anterior a `hoy`. Se compara al MEDIODÍA para que el resultado no dependa de
 * la hora ni del huso: los dos extremos ya vienen como día de Panamá.
 */
export function diasDesde(fecha: string, hoy: string): number {
  return Math.round((diaAMs(hoy) - diaAMs(fecha)) / 86_400_000);
}

/**
 * «hace 16 días» — lo que se lee GRANDE en las tarjetas de último pago y última
 * compra. La fecha exacta va debajo, chica: cuánto hace es la pregunta, la
 * fecha es el respaldo.
 *
 * Una fecha futura (existen facturas con fecha adelantada) no dice «hace −3
 * días»: dice «hoy». Nunca se muestra un número negativo de días.
 */
export function haceCuanto(fecha: string, hoy: string): string {
  const d = diasDesde(fecha, hoy);
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  return `hace ${d} días`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PLATA Y PORCENTAJES — el diccionario decidido el 5-sep-2026 (§ 0)
// ─────────────────────────────────────────────────────────────────────────────

/** Miles con coma y SIEMPRE dos decimales, como el resto de la casa. */
function conCentavos(n: number): string {
  return Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * 🔴 LA PLATA NEGATIVA VA `−$100.00`, con el signo DELANTE del símbolo y con el
 * menos tipográfico (U+2212), no el guion del teclado. Diccionario § 0, #6.
 */
export function dinero(n: number): string {
  return n < 0 ? `−$${conCentavos(n)}` : `$${conCentavos(n)}`;
}

/**
 * `+$198,749.31` / `−$12,000.00`. El signo SIEMPRE se escribe, también el `+`:
 * es una variación, y una variación sin signo se lee como un total.
 */
export function dineroConSigno(n: number): string {
  return n < 0 ? `−$${conCentavos(n)}` : `+$${conCentavos(n)}`;
}

/**
 * 🔴 LOS PORCENTAJES VAN SIN DECIMAL. Diccionario § 0, #5.
 * Se redondea al entero más cercano; un 0,4% no se muestra como «0%» sino como
 * «menos de 1%», porque «0%» de una deuda que existe es mentira.
 */
export function porcentajeEntero(fraccion: number): string {
  const pct = fraccion * 100;
  if (pct > 0 && pct < 0.5) return "menos de 1%";
  return `${Math.round(pct)}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LAS CUATRO TARJETAS
// ─────────────────────────────────────────────────────────────────────────────

/** Qué le pasó a las compras del año. Ver la 🩸 del encabezado. */
export type EstadoCompras = "compro" | "nunca" | "devuelto";

/**
 * @param neto      compras del año YA netas de notas de crédito
 * @param bruto     lo facturado sin restar las notas de crédito
 */
export function estadoDeCompras(neto: number, bruto: number): EstadoCompras {
  if (neto !== 0) return "compro";
  return bruto > 0 ? "devuelto" : "nunca";
}

export interface TarjetaCompro {
  /** El número grande, o `null` cuando en su lugar va una frase. */
  monto: number | null;
  /** La frase que reemplaza al cero grande. */
  frase: string | null;
  /** «+$198,749.31 vs 2025», o `null` si no hay con qué comparar. */
  delta: string | null;
  /** `"sube"` verde · `"baja"` rojo · `null` sin color. */
  tendencia: "sube" | "baja" | null;
}

/**
 * TARJETA 1 — «Compró <año>», con el delta contra el año pasado debajo.
 *
 * 🔴 EL AÑO PASADO SE CORTA EN LOS MISMOS DÍAS. La regla no se reimplementa
 * acá: `unAnioAntes` viene de `clientes-corte-comparativo`, la definición única
 * del sistema. Quien lee la base le pasa a esta función un `anterior` YA
 * recortado a la misma fecha un año antes.
 *
 * Sin nada el año pasado NO se inventa un «+100%»: el delta no sale. Comparar
 * contra cero no dice nada útil y sí exagera.
 */
export function tarjetaComproDelAnio(
  neto: number,
  bruto: number,
  anterior: number | null,
  anio: number,
): TarjetaCompro {
  const estado = estadoDeCompras(neto, bruto);
  const delta = anterior != null && anterior !== 0 ? neto - anterior : null;
  return {
    monto: estado === "compro" ? neto : null,
    frase:
      estado === "compro"
        ? null
        : estado === "devuelto"
          ? `Compró ${dinero(bruto)} y se le acreditó todo`
          : `Sin comprar en ${anio}`,
    delta: delta != null ? `${dineroConSigno(delta)} vs ${anio - 1}` : null,
    tendencia: delta == null || delta === 0 ? null : delta > 0 ? "sube" : "baja",
  };
}

export interface TarjetaDebe {
  monto: number | null;
  frase: string | null;
  /** «el 38% de lo que te compró», o `null`. */
  proporcion: string | null;
}

/**
 * TARJETA 2 — «Debe», y debajo QUÉ PORCENTAJE ES DE LO QUE TE COMPRÓ.
 *
 * Ese número no existía en ninguna pantalla del sistema: el CXC dice cuánto
 * debe y Ventas dice cuánto compró, y nadie los divide. Deber $100.000 al que
 * te compró un millón y al que te compró $150.000 no es lo mismo.
 *
 * ⚠️ El denominador son las compras del AÑO (sin ITBMS) y el numerador el saldo
 * de HOY (con ITBMS): son dos preguntas distintas, así que la proporción es una
 * señal, no una razón contable. Por eso se muestra en palabras y chica, y por
 * eso no sale cuando no compró nada este año — dividir entre cero sería
 * inventar un infinito.
 *
 * Un saldo A FAVOR (negativo) tampoco lleva proporción: no es deuda.
 */
export function tarjetaDebe(saldo: number, comprasDelAnio: number): TarjetaDebe {
  if (saldo === 0) return { monto: null, frase: "No debe nada", proporcion: null };
  if (saldo < 0) {
    return { monto: null, frase: `Saldo a favor ${dinero(Math.abs(saldo))}`, proporcion: null };
  }
  return {
    monto: saldo,
    frase: null,
    proporcion:
      comprasDelAnio > 0
        ? `el ${porcentajeEntero(saldo / comprasDelAnio)} de lo que te compró`
        : null,
  };
}

export interface TarjetaFecha {
  /** «hace 16 días», o `null` cuando en su lugar va una frase. */
  cuando: string | null;
  frase: string | null;
  /** El renglón chico de abajo: «$234,189.21 · 20 ago 2026» o «20 ago 2026». */
  detalle: string | null;
}

/**
 * TARJETA 3 — «Último pago». `monto` es opcional: la tarjeta de última compra
 * usa la MISMA función sin monto (tarjeta 4).
 *
 * @param fechaLegible  la fecha ya formateada por quien dibuja (`fmtDate`);
 *                      este módulo no formatea fechas para no tener dos
 *                      formateadores de fecha en el sistema.
 */
export function tarjetaDeFecha(
  fecha: string | null,
  hoy: string,
  fechaLegible: string,
  sinDato: string,
  monto?: number | null,
): TarjetaFecha {
  if (!fecha) return { cuando: null, frase: sinDato, detalle: null };
  return {
    cuando: haceCuanto(fecha, hoy),
    frase: null,
    detalle: monto != null ? `${dinero(monto)} · ${fechaLegible}` : fechaLegible,
  };
}

/** Los textos de «no hay dato» de las tarjetas 3 y 4. Uno solo por concepto. */
export const SIN_PAGOS_NUNCA = "Nunca ha pagado";
export const SIN_COMPRAS_NUNCA = "Sin compras registradas";

// ─────────────────────────────────────────────────────────────────────────────
// «EMPRESA POR EMPRESA»
// ─────────────────────────────────────────────────────────────────────────────

export interface FilaEmpresa {
  empresa: string;
  compras: number;
  comprasAnterior: number | null;
  debe: number;
}

export interface TotalEmpresas {
  compras: number;
  comprasAnterior: number | null;
  debe: number;
}

/**
 * El TOTAL de la tabla «Empresa por empresa».
 *
 * ⚠️ Se suman las filas YA redondeadas a centavos, no los crudos: es lo que se
 * ve en pantalla, y un total que no es la suma de lo que está arriba es un
 * error que Daniel lee como plata. `comprasAnterior` es `null` (y no 0) cuando
 * NINGUNA empresa lo tiene — así la columna «vs» dice «—» en vez de un −100%
 * inventado mientras el dato no llega.
 */
export function totalDeEmpresas(filas: FilaEmpresa[]): TotalEmpresas {
  const cent = (n: number) => Math.round(n * 100);
  const conAnterior = filas.filter((f) => f.comprasAnterior != null);
  return {
    compras: filas.reduce((s, f) => s + cent(f.compras), 0) / 100,
    comprasAnterior:
      conAnterior.length > 0
        ? conAnterior.reduce((s, f) => s + cent(f.comprasAnterior as number), 0) / 100
        : null,
    debe: filas.reduce((s, f) => s + cent(f.debe), 0) / 100,
  };
}

/** Una empresa sin NADA (ni compras, ni compras el año pasado, ni saldo) no se
 *  dibuja: seis renglones en cero tapan las dos que importan. */
export function tieneAlgo(f: FilaEmpresa): boolean {
  return f.compras !== 0 || (f.comprasAnterior ?? 0) !== 0 || f.debe !== 0;
}

/**
 * `+12%` / `−8%` / `null`. Sin base el año pasado NO hay porcentaje: un cliente
 * que pasó de $0 a $50.000 no creció «infinito», creció $50.000 — y eso ya lo
 * dice la columna del año.
 */
export function variacionVsAnterior(actual: number, anterior: number | null): string | null {
  if (anterior == null || anterior === 0) return null;
  const f = (actual - anterior) / Math.abs(anterior);
  const pct = f * 100;
  const signo = f < 0 ? "−" : "+";
  if (Math.abs(pct) > 0 && Math.abs(pct) < 0.5) return `${signo}menos de 1%`;
  return `${signo}${Math.abs(Math.round(pct))}%`;
}

/** El corte del año anterior, un año antes del último día del año en curso que
 *  se está mostrando. Re-exportado para que quien lea la base no tenga que
 *  importar dos módulos y para que exista UN solo lugar donde se decide. */
export { unAnioAntes };

// ─────────────────────────────────────────────────────────────────────────────
// LOS ENLACES DEL PIE — quién ve cuál
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 LA FICHA LA VEN TODOS, PERO SUS ENLACES NO.
 *
 * Es la gracia de esta página y también su trampa: la abren admin, secretaria,
 * vendedor y bodega, pero **solo admin ve Ventas** y **bodega no ve Cuentas por
 * Cobrar** — sus tres rutas (`/api/cxc/enviar-email`,
 * `/api/cxc/estado-cuenta/…`, `/api/cxc/envios`) le contestan 403. Un botón que
 * siempre falla es peor que no tener el botón.
 *
 * Función PURA a propósito: el rol y los módulos del usuario los pasa quien
 * dibuja. Mezclar la decisión con la lectura de `sessionStorage` haría que esta
 * regla solo se pudiera probar levantando un navegador.
 *
 * @param rol       el rol de la sesión
 * @param roles     los roles que tienen ese módulo por defecto
 * @param modulos   los módulos extra del usuario (`role_permissions`) — así la
 *                  secretaria, que tiene Cuentas por Cobrar por permiso y no por
 *                  rol, entra igual
 * @param modulo    la key del módulo
 */
export function veElModulo(
  rol: string,
  roles: readonly string[],
  modulos: readonly string[],
  modulo: string,
): boolean {
  if (!rol) return false;
  if (rol === "admin") return true;
  if (roles.includes(rol)) return true;
  return modulos.includes(modulo);
}

/** Quiénes ven Cuentas por Cobrar: los mismos que aceptan sus rutas. */
export const ROLES_CXC_EN_LA_FICHA = ["admin", "secretaria", "vendedor"] as const;
/** Ventas es de admin y de nadie más (`modules.ts`). */
export const ROLES_VENTAS_EN_LA_FICHA = ["admin"] as const;
