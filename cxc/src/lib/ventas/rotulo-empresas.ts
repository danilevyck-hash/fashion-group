// ─────────────────────────────────────────────────────────────────────────────
// CÓMO SE LLAMA LA OPCIÓN «TODAS» DE UN SELECTOR DE EMPRESA.
// (módulo PURO)
//
// 🔴 UN SOLO NOMBRE EN TODO EL SISTEMA: «Todas» (Daniel, 5-oct-2026, al pedir
// que Comisiones dejara de decir «Fashion Group»). Ventas › Clientes, Ventas ›
// Productos, Comisiones, CxC, Préstamos y Asistencia dicen lo mismo. Ningún
// selector mezcla ya grupo y no-grupo (Multifashion se fue a su módulo), así que
// «Fashion Group» como opción ya no hace falta.
//
// La regla vive aquí y no en cada pantalla para que dos selectores del sistema
// no puedan volver a llamar distinto a lo mismo.
// ─────────────────────────────────────────────────────────────────────────────

import { B2B_EMPRESA_KEYS, nombreCortoEmpresa } from "@/lib/empresa-mapping";

export const ROTULO_TODAS = "Todas";
/** Alias de antes: hoy también dice «Todas». */
export const ROTULO_TODAS_LAS_EMPRESAS = ROTULO_TODAS;

/** El valor con el que viaja «todas» en Ventas › Clientes (la ruta ya lo lee). */
export const VALOR_TODAS = "todas";

export interface OpcionEmpresa {
  valor: string;
  etiqueta: string;
}

/**
 * Las opciones del desplegable de Ventas › Clientes: «Todas» y
 * LAS SEIS de Fashion Group, derivadas de `B2B_EMPRESA_KEYS` (nunca escritas a
 * mano — es la cuarta vez que este repo paga una lista copiada) y con el nombre
 * CORTO (diccionario § 0, #4).
 */
export function opcionesEmpresaClientes(): OpcionEmpresa[] {
  return [
    { valor: VALOR_TODAS, etiqueta: ROTULO_TODAS },
    ...B2B_EMPRESA_KEYS.map((k) => ({ valor: k as string, etiqueta: nombreCortoEmpresa(k) })),
  ];
}
