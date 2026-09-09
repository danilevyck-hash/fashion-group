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
 * El nombre que se LEE: el de Switch (capitalizado), nunca la llave en
 * mayúsculas. Sin nombre de Switch cae a la llave — no se inventa un texto.
 */
export function nombreDeCliente(c: ConsolidatedClient): string {
  const nombre = Object.values(c.companies).find((x) => x?.nombre)?.nombre;
  return (nombre ?? "").trim() || c.nombre_normalized;
}

/**
 * 🔴 LO QUE SE DESCARGA ES LO QUE SE ESTÁ VIENDO, MENOS EL SALDO A FAVOR.
 *
 * Entra la lista ya filtrada por la pantalla (empresa, tramo, búsqueda, «sin
 * pagar»); acá solo se cae el que tiene saldo a favor, que no se cobra.
 */
export function clientesDeLaDescarga(clientes: ConsolidatedClient[]): ConsolidatedClient[] {
  return clientes.filter((c) => seLeCobra(c.total));
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

/** Un renglón por cliente: código, nombre y los tres tramos. */
export function filasTotalPorCliente(clientes: ConsolidatedClient[]): FilaCliente[] {
  return clientesDeLaDescarga(clientes).map((c) => ({
    codigo: codigoDeCliente(c),
    nombre: nombreDeCliente(c),
    t0: c.current,
    t1: c.watch,
    t2: c.overdue,
    total: c.total,
  }));
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
  return clientesDeLaDescarga(clientes).map((c) => {
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
