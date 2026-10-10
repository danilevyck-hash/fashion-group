// ─────────────────────────────────────────────────────────────────────────────
// EL ALTA DE UN COLABORADOR, EN UNA SOLA PASADA (9-oct-2026).
//
// Daniel: «hoy agregué una, pero mañana puedo necesitar eliminarla y crear
// otra» (las impulsadoras rotan). El procedimiento, con los nombres de los
// botones, está en `docs/postmortems/asistencia-planilla.md` › «Alta y baja de
// un colaborador que marca».
//
// Acá viven las piezas PURAS: los textos, el horario con el que nace una ficha
// y el siguiente código de la serie de una empresa.
// ─────────────────────────────────────────────────────────────────────────────

import { almuerzoDeEmpresa, etiquetaEmpresa } from "@/lib/asistencia/config";
import { diasLaborablesDeEmpresa } from "@/lib/asistencia/horario-configurable";
import { SALIDA_DEFAULT } from "@/lib/asistencia/reporte";

/** El interruptor del alta: crea el usuario y lo vincula a la ficha. */
export const ROTULO_ACCESO_MARCACION = "Marcación desde el teléfono";
export const ROTULO_CONTRASENA_INICIAL = "Contraseña inicial";
export const AYUDA_ACCESO_MARCACION =
  "Crea su usuario con el permiso de Marcación, vinculado a esta ficha. Entra con la contraseña inicial.";

/** El rótulo de la casilla de la baja. */
/** El nombre va como se escribe («Siney»): la mayúscula es de pantalla, el dato no se toca. */
export const rotuloDesactivarUsuario = (usuario: string): string =>
  `Desactivación del usuario ${usuario.charAt(0).toUpperCase()}${usuario.slice(1)}`;
export const AYUDA_DESACTIVAR_USUARIO = "Sin usuario activo no entra al sistema ni marca. No se elimina nada.";

/** Código repetido: el alta se frena y no pisa la ficha de nadie. */
export function avisoCodigoRepetido(codigo: string, nombre: string | null | undefined, sugerido?: string | null): string {
  const de = String(nombre ?? "").trim();
  const base = `El código ${codigo} ya es de ${de || "otro colaborador"}. No se guardó nada.`;
  return sugerido ? `${base} El siguiente código libre es ${sugerido}.` : `${base} Usa otro código.`;
}

/** Lo que contesta la ruta de marcar a una ficha dada de baja. */
export const avisoFichaDeBaja = (fechaLegible: string): string =>
  `Tu ficha de colaborador está inactiva desde el ${fechaLegible}. No se pueden registrar marcas.`;

/** ¿La ficha ya está de baja ese día? El día de la salida todavía se trabaja. */
export function deBajaElDia(fechaSalida: string | null | undefined, dia: string): boolean {
  const f = String(fechaSalida ?? "").slice(0, 10);
  return f !== "" && dia > f;
}

export interface HorarioDeAlta {
  codigo: string;
  nombre: string | null;
  entrada: string;
  salida: string;
  almuerzoMinutos: number;
  diasLaborables: number[];
  entradaAfuera: string | null;
  salidaAfuera: string | null;
}

/** El horario con el que nace una ficha: el de siempre de la sección Horarios
 *  para quien no ha marcado (08:00 → 17:00, días y almuerzo de su empresa). */
export function horarioDeAlta(empresa: string | null | undefined): HorarioDeAlta {
  return {
    codigo: "",
    nombre: null,
    entrada: "08:00",
    salida: SALIDA_DEFAULT,
    almuerzoMinutos: almuerzoDeEmpresa(empresa),
    diasLaborables: [...diasLaborablesDeEmpresa(empresa)],
    entradaAfuera: null,
    salidaAfuera: null,
  };
}

/**
 * El siguiente código de la serie de una empresa: el mayor código numérico de
 * SUS fichas, más uno. `null` si la empresa no tiene códigos numéricos.
 *
 * 🔴 NO ADIVINA. Los códigos del reloj físico se comparten entre empresas
 * (el 53 es de Boston, el 52 de Vistana): quien llama comprueba que el
 * candidato esté libre EN TODO EL SISTEMA —sin ficha y sin marcaciones— y, si
 * no lo está, no propone nada. Hoy la serie limpia es la de Multifashion
 * (301…307 → 308).
 */
export function siguienteDeLaSerie(codigosDeLaEmpresa: readonly string[]): string | null {
  const nums = codigosDeLaEmpresa.map((c) => String(c).trim()).filter((c) => /^\d+$/.test(c)).map(Number);
  return nums.length ? String(Math.max(...nums) + 1) : null;
}

export const textoSugerencia = (empresa: string, codigo: string): string =>
  `Siguiente código libre de ${etiquetaEmpresa(empresa)}: ${codigo}`;

/** El cuerpo del `PUT /api/asistencia/horarios`, el mismo que manda la lista.
 *  `completo` = la base ya tiene los días y el horario del teléfono. */
export function cuerpoDelHorario(codigo: string, nombre: string | null, h: HorarioDeAlta, completo: boolean) {
  const base = { codigo, nombre, entrada: h.entrada, salida: h.salida };
  return completo
    ? { ...base, diasLaborables: h.diasLaborables, entradaAfuera: h.entradaAfuera, salidaAfuera: h.salidaAfuera }
    : base;
}
