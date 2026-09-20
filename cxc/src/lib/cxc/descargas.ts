// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LAS DOS DESCARGAS DE CUENTAS POR COBRAR — LAS DECISIONES, SIN I/O
// (8-sep-2026).
//
// El botón dice **«Descargar»** y ofrece DOS cosas, cada una en PDF y en Excel:
//
//     TODOS LOS CLIENTES
//       Total por cliente          PDF · EXCEL
//       Detallado por compañía     PDF · EXCEL
//
// 🩸 ERAN TRES OPCIONES CON SUBTÍTULO EN LA COMPUTADORA Y OTRA COSA EN EL
// CELULAR. El menú de escritorio bajaba `CSV (Excel)` · `PDF Resumen` · `PDF
// Detallado`; el «···» del celular bajaba un CSV **distinto**. Ahora las dos
// pantallas ofrecen LO MISMO, porque las dos llaman a este módulo.
//
// 🔴 SE FUERON LOS DOS CSV. Daniel, textual: *«en ningún lado quiero exportar
// CSV, solo Excel»*.
//
// 🩸 Y EL «PDF DETALLADO» SE CONTRADECÍA A SÍ MISMO. Con una empresa puesta en
// el filtro, el encabezado de cada cliente traía el total de ESA empresa pero
// debajo listaba LAS SEIS: la pantalla recorta `total` pero **no recorta
// `c.companies`**, y la lista de empresas del papel salía de `cxcCompanies`, que
// no mira el filtro. Medido con Vistana puesto: encabezados **$843.742,90**
// contra filas **$3.141.567,95** en el mismo papel. Por eso las empresas que se
// dibujan salen de `companiasDeLaVista()` y NO de la lista del rol.
//
// 🔴 EL NOMBRE DEL CLIENTE VA CAPITALIZADO. `nombre_normalized` está en
// MAYÚSCULAS (es la llave con la que se consolidan las 6 empresas, no un texto
// para leer); el nombre que Switch manda —`nombre`, el mismo que ya usa el papel
// que se le envía al cliente— viene capitalizado. Medido: **211 de las 213
// filas** de la cartera difieren entre uno y otro. No se transforma nada: se
// muestra la grafía de Switch tal cual (las 3 que él manda en mayúsculas son
// siglas —`ACTIVE SHOES, S.A.`, `R.J.A.S.A.`, `VENTAS LOCAL`— y capitalizarlas
// a la fuerza daría `R.j.a.s.a.`).
//
// 🔴 LOS TRAMOS SON LOS TRES DE LA PANTALLA (0-90 · 91-120 · 121+), no los ocho
// finos, y sus rótulos salen de `tramoLabel()` como en todas las superficies.
// ─────────────────────────────────────────────────────────────────────────────
import type { Company } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";
import { seLeCobra } from "./cobrable";
import { nombreDeCliente } from "./nombre-cliente";

/** Un renglón de «Total por cliente». */
export interface FilaCliente {
  codigo: string;
  nombre: string;
  /** 0 a 90 días. */
  t0: number;
  /** 91 a 120 días. */
  t1: number;
  /** 121 y más. */
  t2: number;
  total: number;
}

/** Un renglón de «Detallado por compañía»: el cliente, partido por empresa. */
export interface FilaEmpresa {
  empresa: string;
  t0: number;
  t1: number;
  t2: number;
  total: number;
}

/** Un cliente con sus empresas adentro — la forma que pidió Daniel. */
export interface BloqueCliente extends FilaCliente {
  empresas: FilaEmpresa[];
}

/** El código del cliente: la identidad, nunca el nombre. */
export function codigoDeCliente(c: ConsolidatedClient): string {
  return Object.values(c.companies).find((x) => x?.codigo)?.codigo ?? "";
}

/**
 * El nombre que se LEE: el de Switch, nunca la llave en mayúsculas.
 *
 * 🔄 20-sep-2026: la regla salió de acá a `lib/cxc/nombre-cliente.ts`, que la
 * comparte con las pantallas y con el papel. Único cambio de conducta: sin
 * nombre de Switch el respaldo sale CAPITALIZADO en vez de a los gritos, que es
 * lo que el papel ya hacía (`nombreDelPapel`).
 */
export { nombreDeCliente };

/**
 * 🔴 LO QUE SE DESCARGA ES LO QUE SE ESTÁ VIENDO.
 *
 * Entra la lista ya filtrada por la pantalla (empresa, tramo, búsqueda, «sin
 * pagar»); acá se parte en dos, igual que la pantalla: los que SE COBRAN arriba
 * y los de SALDO A FAVOR en su propio bloque al pie.
 */
export function clientesDeLaDescarga(clientes: ConsolidatedClient[]): ConsolidatedClient[] {
  return clientes.filter((c) => seLeCobra(c.total));
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL PAPEL Y EL EXCEL CIERRAN CON EL MISMO TOTAL QUE LA PANTALLA
// (20-sep-2026, pedido de Daniel).
//
// 🩸 QUÉ PASABA. El papel decía **$4.244.028,67** y la pantalla
// **$4.242.821,12**. La diferencia, **$1.207,55**, son los **5 clientes con
// saldo a favor**: la pantalla los muestra en su bloque «SALDO A FAVOR (5)» y
// del papel y del Excel DESAPARECÍAN sin que nada lo dijera. Dos números para
// la misma cartera, el mismo día, y ninguno de los dos decía por qué.
//
// ⚠️ NO CAMBIA A QUIÉN SE LE COBRA (`lib/cxc/cobrable.ts`): el saldo a favor
// sigue sin botón «Cobrar», sin casilla de lote y fuera de la lista de cobro.
// Lo que cambia es que ahora SE VE en el archivo, aparte, como en la pantalla.
// ─────────────────────────────────────────────────────────────────────────────

/** Los del bloque aparte: a quien le debemos plata. */
export function clientesConSaldoAFavor(clientes: ConsolidatedClient[]): ConsolidatedClient[] {
  return clientes.filter((c) => !seLeCobra(c.total));
}

/**
 * 🔴 LAS EMPRESAS QUE SE DIBUJAN SALEN DEL FILTRO, NO DEL ROL.
 *
 * Con una empresa puesta, es esa y nada más: así el total del cliente y la suma
 * de sus renglones dicen el mismo número (ver el 🩸 del encabezado).
 */
export function companiasDeLaVista(companias: Company[], companyFilter: string): Company[] {
  if (companyFilter === "all") return companias;
  return companias.filter((co) => co.key === companyFilter);
}

function filaDe(c: ConsolidatedClient): FilaCliente {
  return {
    codigo: codigoDeCliente(c),
    nombre: nombreDeCliente(c),
    t0: c.current,
    t1: c.watch,
    t2: c.overdue,
    total: c.total,
  };
}

/** Un renglón por cliente: código, nombre y los tres tramos. */
export function filasTotalPorCliente(clientes: ConsolidatedClient[]): FilaCliente[] {
  return clientesDeLaDescarga(clientes).map(filaDe);
}

/** Los mismos renglones, para los del bloque «Saldo a favor». */
export function filasSaldoAFavor(clientes: ConsolidatedClient[]): FilaCliente[] {
  return clientesConSaldoAFavor(clientes).map(filaDe);
}

/**
 * Un bloque por cliente, con sus empresas adentro.
 *
 * Daniel, textual: *«las compañías deberían estar adentro del cliente, no como
 * separado»* y *«se tiene que sumar el total del cliente y ponerlo ABAJO del
 * cliente, las sumas, no arriba»*.
 */
export function bloquesPorCompania(
  clientes: ConsolidatedClient[],
  companias: Company[],
): BloqueCliente[] {
  return bloquesDe(clientesDeLaDescarga(clientes), companias);
}

/** Los mismos bloques, para los del «Saldo a favor». */
export function bloquesSaldoAFavor(
  clientes: ConsolidatedClient[],
  companias: Company[],
): BloqueCliente[] {
  return bloquesDe(clientesConSaldoAFavor(clientes), companias);
}

function bloquesDe(clientes: ConsolidatedClient[], companias: Company[]): BloqueCliente[] {
  return clientes.map((c) => {
    const empresas: FilaEmpresa[] = [];
    for (const co of companias) {
      const d = c.companies[co.key];
      if (!d || d.total === 0) continue;
      empresas.push({
        empresa: co.name,
        t0: d.d0_30 + d.d31_60 + d.d61_90,
        t1: d.d91_120,
        t2: d.d121_180 + d.d181_270 + d.d271_365 + d.mas_365,
        total: d.total,
      });
    }
    // El total del bloque es la SUMA DE SUS EMPRESAS, no el `total` que trae el
    // cliente: son el mismo número cuando la vista y el filtro coinciden, y
    // derivarlo es lo único que impide que vuelvan a separarse.
    return {
      codigo: codigoDeCliente(c),
      nombre: nombreDeCliente(c),
      t0: empresas.reduce((s, e) => s + e.t0, 0),
      t1: empresas.reduce((s, e) => s + e.t1, 0),
      t2: empresas.reduce((s, e) => s + e.t2, 0),
      total: empresas.reduce((s, e) => s + e.total, 0),
      empresas,
    };
  });
}

/**
 * 🔴 EL NÚMERO CON EL QUE CIERRA EL ARCHIVO ES EL DE LA PANTALLA: lo que se
 * cobra MÁS el saldo a favor (que es negativo y por eso resta).
 */
export function totalGeneral(
  porCobrar: { t0: number; t1: number; t2: number; total: number }[],
  aFavor: { t0: number; t1: number; t2: number; total: number }[],
) {
  return totalDeLasFilas([...porCobrar, ...aFavor]);
}

/** Los tres rótulos del pie, en los DOS formatos. No se escriben dos veces. */
export const ROTULO_TOTAL_POR_COBRAR = "Total por cobrar";
export const ROTULO_TOTAL_GENERAL = "Total general";

/** «Saldo a favor (5)» — el MISMO rótulo que la pantalla pone al pie de la lista. */
export function rotuloSaldoAFavor(cuantos: number): string {
  return `Saldo a favor (${cuantos})`;
}

/** La fila de Total al pie: la suma de lo que se está mostrando. */
export function totalDeLasFilas(filas: { t0: number; t1: number; t2: number; total: number }[]) {
  return {
    t0: filas.reduce((s, f) => s + f.t0, 0),
    t1: filas.reduce((s, f) => s + f.t1, 0),
    t2: filas.reduce((s, f) => s + f.t2, 0),
    total: filas.reduce((s, f) => s + f.total, 0),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cómo se llaman las dos cosas y sus archivos
// ─────────────────────────────────────────────────────────────────────────────

/** Las dos descargas. La `clave` NO se dice en pantalla; el `rotulo`, sí. */
export type ClaveDescarga = "total-por-cliente" | "por-compania";

export const ROTULO_DESCARGA: Record<ClaveDescarga, string> = {
  "total-por-cliente": "Total por cliente",
  "por-compania": "Detallado por compañía",
};

/** El encabezado del menú, arriba de las dos líneas. */
export const ENCABEZADO_DESCARGAS = "Todos los clientes";

const BASE_ARCHIVO: Record<ClaveDescarga, string> = {
  "total-por-cliente": "CXC-cartera",
  "por-compania": "CXC-cartera-por-compania",
};

/**
 * Qué es · de quién · de cuándo, con guiones y sin espacios:
 *   `CXC-cartera-2026-09-08.pdf` · `CXC-cartera-por-compania-2026-09-08.xlsx`
 *
 * ⚠️ La fecha va SIEMPRE. 🩸 Hay un caso conocido (Caja) donde el servidor arma
 * el nombre con fecha y el navegador lo guarda sin ella; acá el nombre se arma
 * de este lado y viaja entero al `download` del enlace y al `doc.save()`.
 */
export function nombreArchivoDescarga(clave: ClaveDescarga, ext: "pdf" | "xlsx", hoy: string): string {
  return `${BASE_ARCHIVO[clave]}-${hoy}.${ext}`;
}

/**
 * La línea gris de abajo del logo: qué es y de qué empresa.
 * Con «Todas mis empresas» dice las seis por su nombre corto de grupo.
 */
export function subtituloDelPapel(clave: ClaveDescarga, empresa: string | null): string {
  return `${ROTULO_DESCARGA[clave]} — ${empresa ?? "Fashion Group · 6 empresas"}`;
}
