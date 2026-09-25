// ─────────────────────────────────────────────────────────────────────────────
// 🔴 «CLIENTES QUE NO COMISIONAN», EN PALABRAS Y SIN CASILLAS (25-sep-2026).
//
// 🩸 LA PREGUNTA DE DANIEL, textual: *«¿la casilla llena significa que comisiona
// o no?»*. Hoy la casilla **marcada quiere decir excluido** —o sea que **NO**
// comisiona—, y por eso se lee al revés: la columna se llama «VENTA» y estar
// marcada significa lo contrario de vender. Se van las casillas: cada regla
// dice **en palabras** lo que hace.
//
// 🩸 Y SE JUNTAN LAS FILAS. Medido el 25-sep-2026 en `comision_exclusion`: hay
// **18 filas activas que son 12 reglas**, porque «Multi Fashion Holding D-108 ·
// Todos los vendedores» ocupa **SEIS** de ellas —una por empresa— y «Millenium
// Sports D-104» dos. En el celular eso eran 18 renglones en SEIS tablas, con el
// encabezado «CLIENTE · VENDEDOR · VENTA · COBRO · QUITAR» repetido seis veces
// y la columna QUITAR fuera de la pantalla en las seis. Agrupadas por cliente
// son 12 renglones, el encabezado sale una vez y D-108 se dice **una sola vez**
// («las 6 empresas»).
//
// 🔴 LA REGLA DE LA BASE NO CAMBIA. `comision_exclusion` sigue igual: una fila
// por (empresa, cliente, vendedor), `excluye_venta` / `excluye_cobro` con su
// CHECK de «al menos una», soft delete firmado, única entre activas y RLS de
// service_role. Este módulo solo decide **cómo se muestra y cómo se pregunta**.
//
// 🔑 SE AGRUPA POR (CLIENTE, VENDEDOR, QUÉ EXCLUYE) Y NADA MÁS. Dos filas del
// mismo cliente y el mismo vendedor que excluyen cosas DISTINTAS son dos reglas
// distintas y se dicen por separado: juntarlas escondería que en una empresa no
// comisiona nada y en otra solo el cobro.
// ─────────────────────────────────────────────────────────────────────────────

import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { EMPRESAS_COMISIONAN } from "./empresas";
import type { ExclusionActiva } from "./exclusiones";
import { ROTULO_VENDEDOR_TODOS, esVendedorTodos } from "./vendedor-todos";
import { nombreVendedorEnPantalla } from "./alias";

/** Qué es lo que NO comisiona una regla. */
export type QueNoComisiona = "venta-ni-cobro" | "solo-la-venta" | "solo-el-cobro";

/**
 * La frase de la fila. Empieza siempre igual para que la lista se lea de un
 * vistazo y la diferencia caiga en las últimas palabras.
 *
 * 🔑 «venta ni cobro» y no «nada»: «nada» se lee como «no hay regla».
 */
export function queNoComisiona(fila: {
  excluye_venta: boolean;
  excluye_cobro: boolean;
}): QueNoComisiona {
  if (fila.excluye_venta && fila.excluye_cobro) return "venta-ni-cobro";
  if (fila.excluye_venta) return "solo-la-venta";
  return "solo-el-cobro";
}

/** «No comisiona venta ni cobro» · «No comisiona solo el cobro». */
export function fraseDeLaRegla(que: QueNoComisiona): string {
  if (que === "venta-ni-cobro") return "No comisiona venta ni cobro";
  if (que === "solo-la-venta") return "No comisiona solo la venta";
  return "No comisiona solo el cobro";
}

/** Solo la parte que cambia, para dibujarla en negrita. */
export function loQueNoComisiona(que: QueNoComisiona): string {
  if (que === "venta-ni-cobro") return "venta ni cobro";
  if (que === "solo-la-venta") return "solo la venta";
  return "solo el cobro";
}

/** Una regla ya agrupada: lo que se dibuja como UN renglón. */
export interface ReglaEnPalabras {
  /** La llave de la lista: cliente + vendedor + qué excluye. */
  llave: string;
  clienteCodigo: string;
  /** El nombre del cliente; sin él, el código pelado. */
  clienteNombre: string;
  /** El vendedor, ya capitalizado, o «Todos los vendedores». */
  vendedor: string;
  /** `true` = el comodín `*`. */
  vendedorEsTodos: boolean;
  que: QueNoComisiona;
  /** Los nombres CORTOS de las empresas, en el orden del sistema. */
  empresas: string[];
  /** Las claves, para filtrar. */
  empresaKeys: string[];
  /**
   * 🔴 «Las 6 empresas» en vez de las seis escritas: D-108 ocupa 6 de las 18
   * filas y decirlas una por una es repetir la misma regla seis veces.
   */
  chipsEmpresas: string[];
  /** Los ids de la base que esta regla junta. Quitar la regla las quita TODAS. */
  ids: number[];
}

/** El rótulo de las chips de empresa cuando la regla cubre todas. */
export function rotuloTodasLasEmpresas(n: number): string {
  return `Las ${n} empresas`;
}

/**
 * Las 18 filas de la base, juntas en 12 reglas.
 *
 * ⚠️ El orden es el de la lista: primero la que cubre más empresas, después por
 * nombre de cliente. Así D-108 —la que vale para todos y en todas— encabeza, y
 * el resto se lee alfabético.
 */
export function reglasEnPalabras(filas: readonly ExclusionActiva[]): ReglaEnPalabras[] {
  const porLlave = new Map<string, ReglaEnPalabras>();

  for (const f of filas) {
    const que = queNoComisiona(f);
    const llave = `${f.cliente_codigo}|${f.vendedor}|${que}`;
    const ya = porLlave.get(llave);
    if (ya) {
      if (!ya.empresaKeys.includes(f.empresa_key)) ya.empresaKeys.push(f.empresa_key);
      ya.ids.push(f.id);
      // El nombre puede venir NULL en una fila y con texto en otra: se queda el
      // que exista, nunca el código si hay nombre.
      if (!ya.clienteNombre.startsWith(f.cliente_codigo) && f.cliente_nombre) {
        ya.clienteNombre = f.cliente_nombre;
      }
      continue;
    }
    porLlave.set(llave, {
      llave,
      clienteCodigo: f.cliente_codigo,
      clienteNombre: f.cliente_nombre || f.cliente_codigo,
      vendedor: esVendedorTodos(f.vendedor)
        ? ROTULO_VENDEDOR_TODOS
        : nombreVendedorEnPantalla(f.vendedor),
      vendedorEsTodos: esVendedorTodos(f.vendedor),
      que,
      empresas: [],
      empresaKeys: [f.empresa_key],
      chipsEmpresas: [],
      ids: [f.id],
    });
  }

  const total = EMPRESAS_COMISIONAN.length;
  const reglas = [...porLlave.values()].map((r) => {
    // El orden de las empresas es el del sistema, no el de llegada de las filas.
    const ordenadas = (EMPRESAS_COMISIONAN as unknown as string[]).filter((k) =>
      r.empresaKeys.includes(k),
    );
    const sobrantes = r.empresaKeys.filter((k) => !ordenadas.includes(k)).sort();
    const keys = [...ordenadas, ...sobrantes];
    const nombres = keys.map((k) => nombreCortoEmpresa(k));
    return {
      ...r,
      empresaKeys: keys,
      empresas: nombres,
      chipsEmpresas: keys.length >= total ? [rotuloTodasLasEmpresas(total)] : nombres,
    };
  });

  reglas.sort(
    (a, b) =>
      b.empresaKeys.length - a.empresaKeys.length ||
      a.clienteNombre.localeCompare(b.clienteNombre, "es"),
  );
  return reglas;
}

/** Cuántas reglas quedan tras los dos filtros de arriba. */
export function filtrarReglas(
  reglas: readonly ReglaEnPalabras[],
  filtro: { empresa: string; vendedor: string },
): ReglaEnPalabras[] {
  return reglas.filter((r) => {
    if (filtro.empresa !== TODAS && !r.empresaKeys.includes(filtro.empresa)) return false;
    // 🔴 El comodín entra SIEMPRE: una regla que vale para todos los vendedores
    // también vale para el que se está filtrando. Esconderla diría que ese
    // cliente sí le comisiona, que es lo contrario de lo que pasa.
    if (filtro.vendedor !== TODOS && !r.vendedorEsTodos && r.vendedor !== filtro.vendedor) {
      return false;
    }
    return true;
  });
}

/** Los valores «sin filtro» de los dos desplegables. */
export const TODAS = "todas";
export const TODOS = "todos";

export const ROTULO_FILTRO_EMPRESA = "Empresa: todas";
export const ROTULO_FILTRO_VENDEDOR = "Vendedor: todos";

/** El título de la hoja de alta. Va al derecho: lo que se prende es lo que NO comisiona. */
export const PREGUNTA_DEL_ALTA = "¿Qué no comisiona?";
export const ROTULO_LA_VENTA = "La venta";
export const ROTULO_EL_COBRO = "El cobro";
export const AVISO_AL_MENOS_UNO = "Tiene que quedar prendido al menos uno.";

/**
 * La explicación de abajo del alta. Dice la consecuencia, no la mecánica.
 */
export const EXPLICACION_DEL_ALTA =
  "Con los dos prendidos, ese cliente no le comisiona nada a ese vendedor.";
