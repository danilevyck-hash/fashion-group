// ─────────────────────────────────────────────────────────────────────────────
// 🔴 «VENTAS BOSTON» — EL INTERRUPTOR Y LAS REGLAS DE LO QUE VE DAVID (23-sep-2026).
//
// Daniel, textual: *«Llámalo Ventas Boston entonces. Y dale acceso a los otros
// módulos»*. Y sobre Asistencia, el mismo día: *«Asistencia que pueda ver todo
// como yo»*.
//
// Medido antes de decidir (auditoría del 23-sep-2026): David entró 6 veces
// desde que nació el módulo (27-ago) y la bitácora no tiene una sola acción
// suya. Seis pestañas en un módulo propio no le sirvieron; lo que se le da es
// LO MISMO que ve todo el mundo, acotado a su empresa:
//
//   1. «Ventas Boston» (`/boston`, la MISMA key `boston`): se queda con Inicio
//      y Ventas. Por cobrar, Clientes, Planilla y Préstamos SALEN DE LA
//      PANTALLA — el código de sus rutas se queda (patrón `mayor_lineas`).
//   2. «Cuentas por Cobrar» (`/cxc`): la MISMA pantalla del grupo, alimentada
//      por la cartera de Boston y por NADA más. 🔴 Boston nunca se mezcla con
//      el grupo, en las DOS direcciones: quién ve qué cartera lo decide el ROL.
//   3. «Asistencia y Planilla» (`/asistencia`): el módulo COMPLETO, con el
//      alcance del SERVIDOR limitado a Boston y sin «Cerrar» — cerrar la
//      quincena sigue siendo de Contabilidad («ella sigue cerrando las cuatro»).
//
// 🔴 TODO CUELGA DE `VENTAS_BOSTON`. En `false` es exactamente lo de antes: las
// seis pestañas, David sin Cuentas por Cobrar (aunque `role_permissions` ya le
// dé la key) y Asistencia con Aprobaciones sola. Nada de lo que se GUARDA
// cambia con el interruptor: es pantalla y permiso, no datos.
//
// 🔴 FALLA ABIERTA MIENTRAS LA MIGRACIÓN NO CORRA. El módulo `cxc` le aparece
// a David SOLO cuando `role_permissions.gerente_boston` lo diga (migración
// `20261217130000_cxc_para_gerente_boston.sql`, la aplica Daniel). Sin ese
// permiso, «Por cobrar» sigue viviendo dentro de `/boston`, como siempre:
// nada se rompe y nada se le abre de más.
//
// 🔑 ACÁ NO HAY `role === "gerente_boston"` suelto: el rol se pregunta por
// `esGerenteBoston` (`lib/boston/rol.ts`), que es la única fuente.
// ─────────────────────────────────────────────────────────────────────────────

import { EMPRESA_BOSTON, PESTANAS_BOSTON, ROL_BOSTON, esGerenteBoston, type TabBoston } from "./rol";
import { ROLES_CXC } from "@/lib/cxc/roles";
import type { Cartera } from "@/lib/cxc/cartera";

/** El interruptor. `true` = David ve Ventas Boston + Cuentas por Cobrar + Asistencia. */
export const VENTAS_BOSTON = true;

/** El rótulo de antes y el de ahora. La `key` y la ruta NO cambian. */
export const ROTULO_MODULO_BOSTON_ANTES = "Confecciones Boston";
export const ROTULO_VENTAS_BOSTON = "Ventas Boston";

/** Cómo se llama el módulo `boston` en el menú, en la ficha y en el encabezado. */
export function rotuloModuloBoston(interruptor: boolean = VENTAS_BOSTON): string {
  return interruptor ? ROTULO_VENTAS_BOSTON : ROTULO_MODULO_BOSTON_ANTES;
}

export interface PestanaBoston {
  key: TabBoston;
  label: string;
}

/** Las pestañas que se quedan con el interruptor prendido, en su orden. */
export const PESTANAS_VENTAS_BOSTON: readonly TabBoston[] = ["inicio", "ventas"];

/**
 * 🔴 LAS PESTAÑAS DE `/boston`, resueltas.
 *
 * · Interruptor apagado → las SEIS de siempre (`PESTANAS_BOSTON`).
 * · Prendido → Inicio y Ventas… **más «Por cobrar» mientras quien mira NO
 *   tenga el módulo `cxc`** (`tieneCxc`): es la red de la migración sin
 *   aplicar. Con el permiso puesto, la cartera vive en `/cxc` y acá se va.
 *
 * Planilla y Préstamos se van SIEMPRE con el interruptor prendido: las dos
 * viven en Asistencia, que David ya tiene.
 */
export function pestanasDeBoston(opts: { tieneCxc: boolean; interruptor?: boolean }): PestanaBoston[] {
  const interruptor = opts.interruptor ?? VENTAS_BOSTON;
  if (!interruptor) return PESTANAS_BOSTON.map((p) => ({ key: p.key, label: p.label }));
  const seQuedan = new Set<TabBoston>(PESTANAS_VENTAS_BOSTON);
  if (!opts.tieneCxc) seQuedan.add("cxc");
  return PESTANAS_BOSTON.filter((p) => seQuedan.has(p.key)).map((p) => ({ key: p.key, label: p.label }));
}

/**
 * La pestaña pedida por la URL, validada contra las que SE VEN. Un `?tab=`
 * viejo (`planilla`, `prestamos`, `clientes`, o `cxc` con el permiso puesto)
 * cae en Inicio — nunca en una pestaña que ya no está en la barra.
 */
export function tabDeBoston(valor: string | null | undefined, pestanas: readonly PestanaBoston[]): TabBoston {
  const v = typeof valor === "string" ? valor.trim() : "";
  return pestanas.some((p) => p.key === v) ? (v as TabBoston) : "inicio";
}

/**
 * A dónde lleva una TARJETA del Inicio cuya pestaña ya no existe acá.
 * `null` = la pestaña sigue en la barra, se cambia de pestaña como siempre.
 *
 * · Por cobrar → Cuentas por Cobrar (`/cxc`), donde ahora vive la cartera.
 * · En planilla → Asistencia › Planilla, con Boston ya elegida.
 * · Con préstamo → Asistencia › Préstamos, con Boston ya elegida: los
 *   préstamos de su gente se ven ahí (la columna «descuenta $X por quincena»
 *   de la planilla ya los suma), no hay pestaña propia.
 */
export function destinoFueraDeBoston(tab: TabBoston, pestanas: readonly PestanaBoston[]): string | null {
  if (pestanas.some((p) => p.key === tab)) return null;
  const empresa = `empresa=${EMPRESA_BOSTON}`;
  switch (tab) {
    case "cxc":
    case "clientes":
      return "/cxc";
    case "planilla":
      return `/asistencia?tab=planilla&${empresa}`;
    case "prestamos":
      return `/asistencia?tab=prestamos&${empresa}`;
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CUENTAS POR COBRAR: QUÉ CARTERA SIRVE LA PANTALLA, POR ROL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 La cartera que `/cxc` le muestra a este rol. `gerente_boston` → SIEMPRE
 * Boston, con o sin interruptor: que David vea una fila del grupo no es algo
 * que un interruptor pueda permitir. El resto → el grupo, como siempre.
 */
export function carteraDelRolEnCxc(rol: string | null | undefined): Cartera {
  return esGerenteBoston(rol) ? "boston" : "grupo";
}

/**
 * ¿Este rol puede quedarse parado en `/cxc`?
 *
 * Con el interruptor APAGADO, David no: aunque `role_permissions` ya le dé la
 * key (la migración puede correr antes o después del deploy), la pantalla lo
 * manda a su casa. Los demás roles se deciden como siempre (`useAuth`).
 */
export function puedeQuedarseEnCxc(rol: string | null | undefined, interruptor: boolean = VENTAS_BOSTON): boolean {
  return !esGerenteBoston(rol) || interruptor;
}

/**
 * ¿El módulo `cxc` se le PINTA a este rol en el menú? La key viene de
 * `role_permissions` (nunca se hardcodea acá); con el interruptor apagado se
 * PODA aunque esté, para que el menú y la pantalla digan lo mismo.
 */
export function moduloCxcSePintaA(rol: string, interruptor: boolean = VENTAS_BOSTON): boolean {
  return puedeQuedarseEnCxc(rol, interruptor);
}

/** Los roles que abren la pantalla `/cxc` por su ROL (no por el módulo). David NO está: entra por la key. */
export const ROLES_PANTALLA_CXC: readonly string[] = ROLES_CXC;

// ─────────────────────────────────────────────────────────────────────────────
// ASISTENCIA Y PRÉSTAMOS: DAVID ENTRA COMO LOS DEMÁS, ACOTADO POR EL SERVIDOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los roles que el interruptor SUMA a `ASISTENCIA_ROLES` y a `PRESTAMOS_ROLES`.
 * Vacío con el interruptor apagado: las dos listas quedan exactamente como eran.
 *
 * 🔴 Lo que David NO gana por entrar acá lo decide `MIRAN_PERO_NO_CIERRAN`
 * (`lib/asistencia/roles.ts`): cerrar la quincena, cargar un día libre, la
 * foto de la cédula y anotar un abono siguen siendo de quien firma pagos.
 */
export function rolesQueSumaVentasBoston(interruptor: boolean = VENTAS_BOSTON): string[] {
  return interruptor ? [ROL_BOSTON] : [];
}
