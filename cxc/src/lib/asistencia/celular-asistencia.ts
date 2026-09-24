/* ─────────────────────────────────────────────────────────────────────────────
 * ASISTENCIA Y PLANILLA EN EL CELULAR — la portada y las tarjetas. PURO.
 *
 * Sin base, sin red, sin `new Date()`. Decide QUÉ dice cada renglón; los datos
 * llegan medidos desde arriba.
 *
 * ── 🩸 LO QUE SE MIDIÓ EN EL TELÉFONO DE DANIEL (24-sep-2026, 9:07–9:12) ─────
 *
 *   · La tabla de Asistencia mide **888 px dentro de una ventana de 356**: once
 *     columnas de las que se ven tres y media, y el detalle de un día abierto
 *     también se va para la derecha.
 *   · **Nueve bloques y 1.085 px** antes del primer nombre: dos tarjetas de
 *     reloj, período, buscar, «Solo a revisar», Excel, PDF, cuatro atajos de
 *     quincena y tres cajas de aviso.
 *   · Las casillas de «justificar a varios» miden **16 × 16 px**; iOS pide 44.
 *
 * ── 🔴 LA REGLA ─────────────────────────────────────────────────────────────
 *
 *   1. **Al entrar al módulo, una portada**: las cinco pestañas como filas de
 *      una lista iOS, con su conteo real al lado. Tocar una fila ABRE esa
 *      pantalla (`?tab=`, que en el celular empuja historial: el Atrás vuelve a
 *      la portada).
 *   2. **Asistencia es una tarjeta por colaborador**, sin nada que se deslice de
 *      lado. Tocarla abre EL MISMO detalle de días de siempre.
 *   3. 🔴 **Ningún número cambia**: los conteos salen de las mismas lecturas que
 *      ya hacía cada pestaña.
 * ────────────────────────────────────────────────────────────────────────── */

/** El tono de un dato de la tarjeta. Los mismos tres de todo el sistema. */
export type Tono = "rojo" | "ambar" | "gris" | "verde";

export interface DatoDeTarjeta {
  clave: string;
  texto: string;
  tono: Tono;
}

/** Lo que la tarjeta dice cuando no hay nada que mirar. */
export const SIN_NADA_QUE_REVISAR = "sin nada que revisar";

/** Los minutos, con el mismo formato de la tabla (dos decimales). */
function min(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/**
 * La segunda línea de la tarjeta: «6 días · sale 18:30».
 * Sin hora de salida configurada, solo los días — nunca se inventa una hora.
 */
export function lineaDeDias(diasTrabajados: number, salida: string | null | undefined): string {
  const d = Math.max(0, Math.trunc(diasTrabajados || 0));
  const dias = `${d} ${d === 1 ? "día" : "días"}`;
  const s = String(salida ?? "").trim();
  return s ? `${dias} · sale ${s}` : dias;
}

/**
 * La tercera línea: lo que le falló, en el orden en que se mira. Vacía nunca:
 * sin nada, devuelve el chip verde de «sin nada que revisar».
 *
 * 🔑 Son los MISMOS números de las columnas de la tabla, uno por uno. La tarjeta
 * no suma ni promedia nada.
 */
export function datosDeLaTarjeta(r: {
  ausenciasSinJustificar: number;
  vecesTarde: number;
  minutosTarde: number;
  extraMin: number;
  diasARevisar: number;
}, opts?: { cuentaHorasExtra?: boolean }): DatoDeTarjeta[] {
  const out: DatoDeTarjeta[] = [];
  const aus = Math.max(0, Math.trunc(r.ausenciasSinJustificar || 0));
  if (aus > 0) {
    out.push({ clave: "ausencias", tono: "rojo", texto: `${aus} ${aus === 1 ? "ausencia" : "ausencias"}` });
  }
  const veces = Math.max(0, Math.trunc(r.vecesTarde || 0));
  if (veces > 0 || (r.minutosTarde || 0) > 0) {
    const t = veces > 0 ? `${veces} ${veces === 1 ? "tardanza" : "tardanzas"}` : "tardanza";
    out.push({
      clave: "tarde",
      tono: "ambar",
      texto: (r.minutosTarde || 0) > 0 ? `${t} de ${min(r.minutosTarde)} min` : t,
    });
  }
  if ((opts?.cuentaHorasExtra ?? true) && (r.extraMin || 0) > 0) {
    out.push({ clave: "extras", tono: "gris", texto: `${min(r.extraMin)} min extra` });
  }
  const rev = Math.max(0, Math.trunc(r.diasARevisar || 0));
  if (rev > 0) {
    out.push({ clave: "revisar", tono: "ambar", texto: `${rev} a revisar` });
  }
  if (out.length === 0) out.push({ clave: "nada", tono: "verde", texto: SIN_NADA_QUE_REVISAR });
  return out;
}

/** El pie del celular: «8 colaboradores · 11 ausencias · 34.17 min». */
export function pieDelCelular(opts: {
  colaboradores: number;
  ausencias: number;
  minutosTarde: number;
}): string {
  const n = Math.max(0, Math.trunc(opts.colaboradores || 0));
  const partes = [`${n} ${n === 1 ? "colaborador" : "colaboradores"}`];
  if (opts.ausencias > 0) partes.push(`${Math.trunc(opts.ausencias)} ${opts.ausencias === 1 ? "ausencia" : "ausencias"}`);
  if (opts.minutosTarde > 0) partes.push(`${min(opts.minutosTarde)} min tarde`);
  return partes.join(" · ");
}

// ─────────────────────────────────────────────────────────────────────────────
// 1b — LA PORTADA DEL MÓDULO
// ─────────────────────────────────────────────────────────────────────────────

/** Una fila de la portada. `cuenta` es el número a la derecha; `null` = todavía no se sabe. */
export interface FilaPortada {
  clave: string;
  rotulo: string;
  detalle: string | null;
  cuenta: string | null;
  /** El número de la derecha pide atención (hay algo que decidir). */
  urgente: boolean;
}

/** Lo que se sabe al armar la portada. Todo puede venir en `null`: se dice «—». */
export interface ConteosPortada {
  colaboradores: number | null;
  sinFicha: number | null;
  personasDelReporte: number | null;
  ausencias: number | null;
  porDecidir: number | null;
  horasPorDecidir: string | null;
  quincenaCerrada: boolean | null;
  conDeuda: number | null;
  deudaTotal: string | null;
}

/**
 * Las cinco filas de la portada, en el orden de las pestañas que esta persona ve.
 *
 * 🔴 EL ORDEN ES EL DE LAS PESTAÑAS, no uno nuevo: la portada es la misma barra
 * de siempre puesta en vertical, y no puede contradecir dónde aterriza cada rol.
 */
export function filasDeLaPortada(
  pestanas: readonly (readonly [string, string])[],
  c: ConteosPortada,
): FilaPortada[] {
  const out: FilaPortada[] = [];
  for (const [clave, rotulo] of pestanas) {
    if (clave === "colaboradores" || clave === "configuracion") {
      const falta = c.sinFicha ?? 0;
      out.push({
        clave, rotulo,
        detalle: falta > 0 ? `${falta} sin ficha` : null,
        cuenta: c.colaboradores === null ? null : String(c.colaboradores),
        urgente: falta > 0,
      });
    } else if (clave === "asistencia" || clave === "reporte") {
      const aus = c.ausencias ?? 0;
      out.push({
        clave, rotulo,
        detalle: c.personasDelReporte === null
          ? null
          : `${c.personasDelReporte} ${c.personasDelReporte === 1 ? "colaborador" : "colaboradores"}${aus > 0 ? ` · ${aus} ${aus === 1 ? "ausencia" : "ausencias"}` : ""}`,
        cuenta: null,
        urgente: false,
      });
    } else if (clave === "aprobaciones") {
      const n = c.porDecidir;
      out.push({
        clave, rotulo,
        detalle: n === null ? null : n === 0 ? "nada por decidir" : `${n} por decidir${c.horasPorDecidir ? ` · ${c.horasPorDecidir}` : ""}`,
        cuenta: n ? String(n) : null,
        urgente: !!n,
      });
    } else if (clave === "planilla") {
      out.push({
        clave, rotulo,
        detalle: c.quincenaCerrada === null ? null : c.quincenaCerrada ? "cerrada" : "sin cerrar",
        cuenta: null,
        urgente: c.quincenaCerrada === false,
      });
    } else if (clave === "prestamos") {
      const n = c.conDeuda;
      out.push({
        clave, rotulo,
        detalle: n === null ? null : n === 0 ? "nadie debe" : `${n} ${n === 1 ? "debe" : "deben"}`,
        cuenta: n ? (c.deudaTotal ?? String(n)) : null,
        urgente: false,
      });
    } else {
      out.push({ clave, rotulo, detalle: null, cuenta: null, urgente: false });
    }
  }
  return out;
}

/** El rótulo de la sección de la portada. */
export const PORTADA_PANTALLAS = "Las pantallas";
export const PORTADA_EMPRESA = "Empresa";

// ─────────────────────────────────────────────────────────────────────────────
// 6b — EL TABLERO DE CIERRE EN EL CELULAR: SOLO INFORMA
//
// Daniel: desde el teléfono no se cierra una quincena desde la lista; se entra a
// la empresa. Un toque más a cambio de no cerrar la empresa equivocada.
// 🔴 Y NUNCA UN TOTAL DEL GRUPO, igual que en la computadora.
// ─────────────────────────────────────────────────────────────────────────────

export const TABLERO_SOLO_INFORMA =
  "Desde el teléfono la quincena se cierra entrando a la empresa.";
