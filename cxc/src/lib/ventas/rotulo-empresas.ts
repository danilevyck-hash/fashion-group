// ─────────────────────────────────────────────────────────────────────────────
// CÓMO SE LLAMA LA OPCIÓN «TODAS» DE UN SELECTOR DE EMPRESA (11-sep-2026).
// (módulo PURO)
//
// 🔴 DEPENDE DE LO QUE HAYA EN LA LISTA, no de la pantalla:
//
//   · Si la lista son SOLO empresas de Fashion Group (las 6 de
//     `B2B_EMPRESA_KEYS`), la primera opción dice **«Todas las empresas»**:
//     todas las que están son del grupo y no hay nada que aclarar. Es el caso
//     de Ventas › Clientes.
//   · Si la lista MEZCLA grupo y no-grupo (Comisiones, que ofrece las 6 y
//     además Multifashion), la primera opción dice **«Fashion Group»**: ahí
//     «Todas» se leería como «todas incluyendo Multifashion», y no lo es.
//     Daniel, 6-sep-2026: *«en todas pon fashion group para no confundir»*.
//
// La regla vive acá y no en cada pantalla para que dos selectores del sistema
// no puedan volver a llamar distinto a lo mismo. Candado:
// `ventas-selector-periodo-y-empresa.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { B2B_EMPRESA_KEYS, nombreCortoEmpresa } from "@/lib/empresa-mapping";

export const ROTULO_TODAS_LAS_EMPRESAS = "Todas las empresas";
export const ROTULO_FASHION_GROUP = "Fashion Group";

/** El valor con el que viaja «todas» en Ventas › Clientes (la ruta ya lo lee). */
export const VALOR_TODAS = "todas";

function esDelGrupo(key: string): boolean {
  return (B2B_EMPRESA_KEYS as readonly string[]).includes(key);
}

/**
 * «Todas las empresas» cuando todas las de la lista son del grupo; «Fashion
 * Group» cuando la lista mezcla grupo y no-grupo. Una lista vacía o sin nada
 * del grupo dice «Todas las empresas»: no hay grupo que nombrar.
 */
export function rotuloDeTodas(empresas: readonly string[]): string {
  const delGrupo = empresas.filter(esDelGrupo).length;
  const fuera = empresas.length - delGrupo;
  return delGrupo > 0 && fuera > 0 ? ROTULO_FASHION_GROUP : ROTULO_TODAS_LAS_EMPRESAS;
}

export interface OpcionEmpresa {
  valor: string;
  etiqueta: string;
}

/**
 * Las opciones del desplegable de Ventas › Clientes: «Todas las empresas» y
 * LAS SEIS de Fashion Group, derivadas de `B2B_EMPRESA_KEYS` (nunca escritas a
 * mano — es la cuarta vez que este repo paga una lista copiada) y con el nombre
 * CORTO (diccionario § 0, #4).
 */
export function opcionesEmpresaClientes(): OpcionEmpresa[] {
  return [
    { valor: VALOR_TODAS, etiqueta: rotuloDeTodas(B2B_EMPRESA_KEYS) },
    ...B2B_EMPRESA_KEYS.map((k) => ({ valor: k as string, etiqueta: nombreCortoEmpresa(k) })),
  ];
}
