// Las lecturas y escrituras de los recordatorios de Marcación (16-nov-2026).
// Tablas: `marcacion_recordatorios`, `marcacion_push_suscripciones` y
// `marcacion_avisos_enviados` (migración `20270119120000`). RLS prendido sin
// políticas: solo el servidor (`service_role`).

import { supabaseServer } from "@/lib/supabase-server";
import { horarioDelDia, limpiaHora } from "@/lib/asistencia/horario-configurable";
import { DISPOSITIVO_TELEFONO } from "./marcacion";
import type { Recordatorio } from "./recordatorios";

export const TABLA_RECORDATORIOS = "marcacion_recordatorios";
export const TABLA_SUSCRIPCIONES = "marcacion_push_suscripciones";
export const TABLA_AVISOS = "marcacion_avisos_enviados";

type FilaHorario = { entrada: unknown; salida: unknown; entrada_afuera: unknown; salida_afuera: unknown };

function horarioDeLaFila(f: FilaHorario): { entrada: string; salida: string } | null {
  const entrada = limpiaHora(f.entrada);
  const salida = limpiaHora(f.salida);
  if (!entrada || !salida) return null;
  const h = horarioDelDia(
    { entrada, salida, entrada_afuera: limpiaHora(f.entrada_afuera), salida_afuera: limpiaHora(f.salida_afuera) },
    DISPOSITIVO_TELEFONO,
  );
  return { entrada: h.entrada, salida: h.salida };
}

/** Entrada y salida con las que se marca POR EL TELÉFONO (el horario de afuera si lo tiene). */
export async function leerHorarioDeMarcacion(codigo: string): Promise<{ entrada: string; salida: string } | null> {
  const { data, error } = await supabaseServer
    .from("asistencia_horarios")
    .select("entrada, salida, entrada_afuera, salida_afuera")
    .eq("empleado_codigo", codigo)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? horarioDeLaFila(data as FilaHorario) : null;
}

/** Lo mismo para varios a la vez (el cron): código → horario. */
export async function leerHorariosDeMarcacion(codigos: readonly string[]): Promise<Map<string, { entrada: string; salida: string }>> {
  const out = new Map<string, { entrada: string; salida: string }>();
  if (codigos.length === 0) return out;
  const { data, error } = await supabaseServer
    .from("asistencia_horarios")
    .select("empleado_codigo, entrada, salida, entrada_afuera, salida_afuera")
    .in("empleado_codigo", codigos);
  if (error) throw new Error(error.message);
  for (const f of (data ?? []) as (FilaHorario & { empleado_codigo: string })[]) {
    const h = horarioDeLaFila(f);
    if (h) out.set(String(f.empleado_codigo).trim(), h);
  }
  return out;
}

export async function leerRecordatoriosGuardados(codigo: string) {
  const { data, error } = await supabaseServer
    .from(TABLA_RECORDATORIOS)
    .select("marca, activo, hora")
    .eq("empleado_codigo", codigo);
  if (error) throw new Error(error.message);
  return (data ?? []) as { marca: number; activo: boolean; hora: string | null }[];
}

export async function guardarRecordatorios(codigo: string, recordatorios: readonly Recordatorio[]) {
  const ahora = new Date().toISOString();
  const { error } = await supabaseServer.from(TABLA_RECORDATORIOS).upsert(
    recordatorios.map((r) => ({ empleado_codigo: codigo, marca: r.marca, activo: r.activo, hora: r.hora, actualizado_en: ahora })),
    { onConflict: "empleado_codigo,marca" },
  );
  if (error) throw new Error(error.message);
}

export interface SuscripcionPush {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Lo que manda el navegador (`PushSubscription.toJSON()`). `null` = no vale. */
export function validarSuscripcion(v: unknown): SuscripcionPush | null {
  const s = v as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = typeof s?.endpoint === "string" ? s.endpoint.trim() : "";
  const p256dh = typeof s?.keys?.p256dh === "string" ? s.keys.p256dh.trim() : "";
  const auth = typeof s?.keys?.auth === "string" ? s.keys.auth.trim() : "";
  if (!/^https:\/\/\S+$/.test(endpoint) || endpoint.length > 1000) return null;
  if (!p256dh || !auth || p256dh.length > 200 || auth.length > 100) return null;
  return { endpoint, keys: { p256dh, auth } };
}

/** Un aparato = una fila por `endpoint`; si cambia de dueño, queda con el último. */
export async function guardarSuscripcion(codigo: string, s: SuscripcionPush) {
  const { error } = await supabaseServer.from(TABLA_SUSCRIPCIONES).upsert(
    {
      empleado_codigo: codigo,
      endpoint: s.endpoint,
      p256dh: s.keys.p256dh,
      auth: s.keys.auth,
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) throw new Error(error.message);
}
