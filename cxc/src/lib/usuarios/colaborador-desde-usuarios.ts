// ─────────────────────────────────────────────────────────────────────────────
// UNA SOLA PUERTA: USUARIOS (9-oct-2026).
//
// Daniel, al ver el alta en Colaboradores: «debe de ser en Usuarios». Crear a
// una persona —marque o no— se hace en Usuarios › «＋ Nuevo usuario»; con
// «Marca asistencia» prendido se crean ahí mismo su ficha de colaborador, su
// horario y el vínculo. Y al «Desactivar» se ofrece dar de baja su ficha.
//
// 🔑 LA FICHA Y EL HORARIO SE GUARDAN POR LAS MISMAS DOS PUERTAS DE SIEMPRE
// (`PUT /api/asistencia/configuracion` con `alta: true` y `PUT
// /api/asistencia/horarios`): se llaman sus funciones, no se copia su
// validación. Un código repetido se frena igual, con el mismo aviso.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { PUT as guardarFicha } from "@/app/api/asistencia/configuracion/route";
import { PUT as guardarHorario } from "@/app/api/asistencia/horarios/route";
import { supabaseServer } from "@/lib/supabase-server";
import { TABLA_PERSONAS } from "@/lib/asistencia/config-server";
import { TABLA_HORARIOS } from "@/lib/asistencia/horarios-server";
import { cuerpoDelHorario, type HorarioDeAlta } from "@/lib/asistencia/alta-colaborador";
import { validarVigencia } from "@/lib/asistencia/vigencia";
import { leerDeudaPorCodigo } from "@/lib/prestamos-lista-server";
import { avisoSalidaConDeuda } from "@/lib/asistencia/salida-con-deuda";
import type { Fallo } from "@/lib/usuarios/usuario-servidor";

/** Lo que manda «Marca asistencia» cuando la persona todavía no tiene ficha. */
export interface ColaboradorNuevo {
  codigo?: unknown;
  nombre?: unknown;
  empresa?: unknown;
  posicion?: unknown;
  cedula?: unknown;
  salarioMensual?: unknown;
  jornadaSemanal?: unknown;
  fechaIngreso?: unknown;
  horario?: Partial<HorarioDeAlta> | null;
}

/**
 * Crea la ficha y su horario. Si el horario falla, la ficha recién creada se
 * deshace: no queda nada a medias.
 */
export async function crearFichaConHorario(
  req: NextRequest,
  c: ColaboradorNuevo,
  nombrePorOmision: string,
): Promise<{ ok: true; codigo: string } | Fallo> {
  const reenviar = (ruta: string, cuerpo: unknown) =>
    new NextRequest(new URL(ruta, req.url), {
      method: "PUT",
      headers: { cookie: req.headers.get("cookie") ?? "", "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
  const leerError = async (r: Response, porOmision: string) =>
    String(((await r.json().catch(() => ({}))) as { error?: string }).error ?? porOmision);

  const codigo = String(c.codigo ?? "").trim();
  const nombre = String(c.nombre ?? "").trim() || nombrePorOmision.trim();
  const h = c.horario ?? {};
  if (!h.entrada || !h.salida) return { ok: false, error: "Falta el horario: entrada y salida.", status: 400 };

  const rf = await guardarFicha(reenviar("/api/asistencia/configuracion", {
    codigo, nombre, empresa: c.empresa,
    salarioMensual: c.salarioMensual === "" || c.salarioMensual === undefined ? null : c.salarioMensual,
    jornadaSemanal: c.jornadaSemanal ?? 40,
    fechaIngreso: c.fechaIngreso || null,
    posicion: c.posicion ?? "", cedula: c.cedula ?? "",
    alta: true,
  }));
  if (!rf.ok) return { ok: false, error: await leerError(rf, "No se pudo crear la ficha."), status: rf.status };

  const rh = await guardarHorario(reenviar("/api/asistencia/horarios", cuerpoDelHorario(codigo, nombre, {
    codigo, nombre, entrada: String(h.entrada), salida: String(h.salida), almuerzoMinutos: 0,
    diasLaborables: Array.isArray(h.diasLaborables) ? h.diasLaborables : [1, 2, 3, 4, 5],
    entradaAfuera: h.entradaAfuera ?? null, salidaAfuera: h.salidaAfuera ?? null,
  }, true)));
  if (!rh.ok) {
    const error = await leerError(rh, "No se pudo guardar el horario.");
    await deshacerFicha(codigo);
    return { ok: false, error: `${error} No se guardó nada.`, status: rh.status };
  }
  return { ok: true, codigo };
}

/**
 * Deshace una ficha que ESTA MISMA petición acaba de crear (nació con `insert`,
 * así que es nuestra) porque el resto del alta falló. No es un borrado de
 * datos: es no dejar una ficha sin usuario.
 * ponytail: compensación en dos pasos, no una transacción; si hiciera falta
 * atomicidad real, una función de Postgres que inserte las tres filas.
 */
export async function deshacerFicha(codigo: string): Promise<void> {
  await supabaseServer.from(TABLA_HORARIOS).delete().eq("empleado_codigo", codigo);
  await supabaseServer.from(TABLA_PERSONAS).delete().eq("empleado_codigo", codigo);
}

/** Valida la baja (fecha + motivo) contra la ficha, sin escribir nada. */
export async function revisarBaja(
  codigo: string,
  baja: { fechaSalida?: unknown; motivoSalida?: unknown },
): Promise<{ ok: true; fechaSalida: string; motivoSalida: string } | Fallo> {
  const { data } = await supabaseServer
    .from(TABLA_PERSONAS).select("fecha_ingreso").eq("empleado_codigo", codigo).maybeSingle();
  if (!data) return { ok: false, error: "Ese usuario ya no tiene ficha de colaborador.", status: 409 };
  if (!baja.fechaSalida) return { ok: false, error: "Falta la fecha de salida.", status: 400 };
  const v = validarVigencia({
    fechaIngreso: (data as { fecha_ingreso?: string | null }).fecha_ingreso ?? null,
    fechaSalida: baja.fechaSalida, motivoSalida: baja.motivoSalida,
  });
  if (!v.ok) return { ok: false, error: v.error, status: 400 };
  return { ok: true, fechaSalida: String(v.valor.fechaSalida), motivoSalida: String(v.valor.motivoSalida) };
}

/** Escribe la baja: SOLO la fecha y el motivo de salida. Lo demás de la ficha no se toca. */
export async function darDeBaja(
  codigo: string, fechaSalida: string, motivoSalida: string,
): Promise<{ ok: true; aviso: string | null } | Fallo> {
  const { error } = await supabaseServer
    .from(TABLA_PERSONAS)
    .update({ fecha_salida: fechaSalida, motivo_salida: motivoSalida, updated_at: new Date().toISOString() })
    .eq("empleado_codigo", codigo);
  if (error) {
    return {
      ok: false, status: 500,
      error: "El usuario quedó desactivado, pero su ficha no se dio de baja. Dale de baja en Asistencia › Colaboradores.",
    };
  }
  // Quien se va con saldo en Préstamos, se dice aquí también (regla del 5-sep-2026).
  const deuda = (await leerDeudaPorCodigo(codigo).catch(() => new Map<string, number>())).get(codigo) ?? 0;
  return { ok: true, aviso: avisoSalidaConDeuda(deuda) };
}
