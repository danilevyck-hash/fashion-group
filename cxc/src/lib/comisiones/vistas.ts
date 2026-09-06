// ─────────────────────────────────────────────────────────────────────────────
// QUÉ SE ESTÁ MIRANDO EN COMISIONES — un solo selector, sin pestañas.
// (módulo PURO: sin React, sin fetch, sin reloj)
//
// 🩸 ERAN CUATRO PESTAÑAS (6-sep-2026): «Todas las empresas · Por empresa ·
// Multifashion · Configuración», y encima de ellas un SEGUNDO selector de
// empresa dentro de «Por empresa». Dos controles para una sola pregunta: *¿de
// quién estoy mirando la comisión?* En el iPhone la cuarta pestaña **nace
// cortada contra el borde**.
//
// Daniel, textual: *«opino eliminar los tabs y dejar configuración como el
// depurador, estilo engranaje y ya. Todas las empresas solo se agrega en una
// opción con las empresas. Y multifashion es una empresa más. Así convive con el
// módulo, cambio mi opinión de que sea un espejo.»* Y: *«el merge de los tabs no
// es solo en el cel, sino también en desktop»*.
//
// 🔴 LA PRIMERA OPCIÓN SE LLAMA «FASHION GROUP», NO «TODAS». Daniel: *«entonces
// a, pero en todas pon fashion group para no confundir»*. Con Multifashion en la
// misma lista, «Todas» se leería como «todas incluyendo Multifashion» — y no lo
// es.
//
// 🔴 «FASHION GROUP» NO INCLUYE A MULTIFASHION, Y NUNCA SE SUMAN. Son dos
// comisiones que se calculan DISTINTO: el grupo paga 0,5 % solo sobre las
// facturas con más de 20 % de utilidad; Multifashion paga 0,5 % sobre TODA la
// venta, sin ese filtro. Medido en agosto 2026: Fashion Group **$5.978,55**,
// Multifashion **$255,27** (Sheynee 92,67 · Jailine 68,83 · Milagros 67,62 ·
// Jennifer 26,28 · Cindy −0,13). Un total que las sume no se puede explicar con
// una frase, así que no existe: Multifashion es otra OPCIÓN del selector, no una
// columna más de la matriz. El candado sigue siendo que el consolidado no nombre
// `american_classic`.
// ─────────────────────────────────────────────────────────────────────────────

import { EMPRESAS_COMISIONAN } from "./empresas";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";

/** La matriz vendedor × empresa de las 6 del grupo. */
export const VISTA_GRUPO = "grupo";
/** La empresa de Multifashion, que en el selector es una opción más. */
export const VISTA_MULTIFASHION = "american_classic";
/** La pestaña que se fue al engranaje. No es una empresa. */
export const VISTA_CONFIG = "config";

/** Cómo se llama la primera opción. NUNCA «Todas» — ver el encabezado. */
export const ROTULO_GRUPO = "Fashion Group";

export interface OpcionVista {
  valor: string;
  etiqueta: string;
  /** Va debajo de una línea: Multifashion no es del grupo y se ve. */
  separadorAntes?: boolean;
}

/**
 * Las opciones del único selector, en orden: el grupo, sus 6 empresas y, tras
 * un separador, Multifashion. Los nombres van CORTOS (diccionario § 0).
 */
export const OPCIONES_VISTA: OpcionVista[] = [
  { valor: VISTA_GRUPO, etiqueta: ROTULO_GRUPO },
  ...EMPRESAS_COMISIONAN.map((k) => ({ valor: k as string, etiqueta: nombreCortoEmpresa(k) })),
  { valor: VISTA_MULTIFASHION, etiqueta: nombreCortoEmpresa(VISTA_MULTIFASHION), separadorAntes: true },
];

export const esVistaGrupo = (v: string): boolean => v === VISTA_GRUPO;
export const esVistaMultifashion = (v: string): boolean => v === VISTA_MULTIFASHION;
export const esVistaDeEmpresa = (v: string): boolean =>
  (EMPRESAS_COMISIONAN as readonly string[]).includes(v);

/**
 * Lo que se guardaba antes (`fg_comisiones_mode`) y lo que puede venir en un
 * `?tab=` guardado → la vista nueva. `empresa` no dice CUÁL, así que cae a la
 * última empresa usada.
 */
export const VIEJO_A_VISTA: Record<string, string> = {
  todas: VISTA_GRUPO,
  consolidado: VISTA_GRUPO,
  multifashion: VISTA_MULTIFASHION,
  config: VISTA_CONFIG,
};

/** Lo que se está mirando: una empresa (o el grupo) y si el ⚙ está abierto. */
export interface VistaResuelta {
  vista: string;
  /** El ⚙ de Configuración. Es del MÓDULO, no de una empresa: por eso va aparte. */
  config: boolean;
}

/**
 * Resuelve a una vista válida lo que venga (URL, memoria o nada).
 *
 * · una vista nueva válida → tal cual;
 * · un modo viejo → su equivalente (`empresa` → la última empresa usada);
 * · «config» → el ⚙ abierto sobre la última empresa usada, y solo si es admin;
 * · cualquier otra cosa → Fashion Group.
 */
export function resolverVista(
  pedida: string | null | undefined,
  ultimaEmpresa: string | null | undefined,
  esAdmin: boolean,
): VistaResuelta {
  const v = (pedida ?? "").trim();
  const ultima = (ultimaEmpresa ?? "").trim();
  const laUltima = esVistaDeEmpresa(ultima) ? ultima : EMPRESAS_COMISIONAN[0];

  if (v === "empresa") return { vista: laUltima, config: false };

  const mapeada = VIEJO_A_VISTA[v] ?? v;
  if (mapeada === VISTA_CONFIG) {
    // El ⚙ no cambia de qué empresa estás mirando: se abre ENCIMA de ella.
    return { vista: VISTA_GRUPO, config: esAdmin };
  }
  if (esVistaGrupo(mapeada) || esVistaMultifashion(mapeada) || esVistaDeEmpresa(mapeada)) {
    return { vista: mapeada, config: false };
  }
  return { vista: VISTA_GRUPO, config: false };
}
