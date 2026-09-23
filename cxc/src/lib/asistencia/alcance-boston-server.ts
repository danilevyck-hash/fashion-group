// ─────────────────────────────────────────────────────────────────────────────
// EL I/O DEL ALCANCE DE DAVID. La regla vive en `alcance-boston.ts` (puro); acá
// solo se lee la lista de fichas y se contesta con `NextResponse`.
//
// Cómo se usa en una ruta, en dos líneas:
//
//   const fuera = await rechazarFueraDeAlcance(auth.role, [codigo]);
//   if (fuera) return fuera;
//
// y para una lista:
//
//   const permitidos = await codigosDelAlcance(auth.role);
//   const filas = soloPermitidos(todas, (f) => f.codigo, permitidos);
//
// 🔑 Para un rol SIN recorte no se lee nada: `codigosDelAlcance` devuelve
// `null` sin tocar la base. Solo David paga la lectura (49 fichas).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import {
  MENSAJE_ES_DEL_GRUPO,
  MENSAJE_FUERA_DE_ALCANCE,
  alcanceDelRol,
  codigosFuera,
  codigosPermitidos,
  empresaEnAlcance,
  type AlcanceEmpresas,
} from "./alcance-boston";

export { alcanceDelRol, empresaForzada, soloPermitidos, empresaEnAlcance } from "./alcance-boston";

/** Los códigos que este rol puede tocar. `null` = sin recorte (no se lee nada). */
export async function codigosDelAlcance(rol: string | null | undefined): Promise<Set<string> | null> {
  const alcance = alcanceDelRol(rol);
  if (alcance === null) return null;
  // 🔑 Import PEREZOSO a propósito: para un rol sin recorte esta función no
  // toca la base, y tampoco tiene por qué CARGAR el cliente de Supabase — las
  // rutas que no lo importaban siguen sin importarlo (y sus tests, sin mockearlo).
  const { leerPersonas } = await import("./config-server");
  const { filas } = await leerPersonas();
  return codigosPermitidos(filas, alcance);
}

/** 403 si alguno de los códigos no es de su empresa. `null` = todo bien. */
export async function rechazarFueraDeAlcance(
  rol: string | null | undefined,
  codigos: readonly (string | null | undefined)[],
): Promise<NextResponse | null> {
  const permitidos = await codigosDelAlcance(rol);
  const fuera = codigosFuera(permitidos, codigos);
  if (fuera.length === 0) return null;
  return NextResponse.json({ error: MENSAJE_FUERA_DE_ALCANCE, fuera }, { status: 403 });
}

/** 403 si la empresa (de un cuerpo o de una ficha nueva) no está en el alcance. */
export function rechazarEmpresaFueraDeAlcance(
  rol: string | null | undefined,
  empresa: string | null | undefined,
): NextResponse | null {
  const alcance: AlcanceEmpresas = alcanceDelRol(rol);
  if (empresaEnAlcance(alcance, empresa)) return null;
  return NextResponse.json({ error: MENSAJE_FUERA_DE_ALCANCE }, { status: 403 });
}

/** 403 para lo que es de TODO el sistema (feriados, reglas) cuando el rol está acotado. */
export function rechazarLoDelGrupo(rol: string | null | undefined): NextResponse | null {
  if (alcanceDelRol(rol) === null) return null;
  return NextResponse.json({ error: MENSAJE_ES_DEL_GRUPO }, { status: 403 });
}

/** ¿Este rol está acotado? Para decidir si una lista global se devuelve vacía. */
export function estaAcotado(rol: string | null | undefined): boolean {
  return alcanceDelRol(rol) !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRÉSTAMOS: la ficha de préstamo se ata a la persona por `empleado_codigo`.
// ─────────────────────────────────────────────────────────────────────────────

/** 403 si la ficha de préstamo (`prestamos_empleados.id`) no es de su gente. Sin ficha, 403 también. */
export async function rechazarFichaPrestamoFueraDeAlcance(
  rol: string | null | undefined,
  fichaId: string | null | undefined,
): Promise<NextResponse | null> {
  if (alcanceDelRol(rol) === null) return null;
  const { supabaseServer } = await import("@/lib/supabase-server");
  const { data } = await supabaseServer
    .from("prestamos_empleados")
    .select("empleado_codigo")
    .eq("id", String(fichaId ?? ""))
    .maybeSingle();
  const codigo = (data as { empleado_codigo?: string | null } | null)?.empleado_codigo ?? null;
  return rechazarFueraDeAlcance(rol, [codigo]);
}
