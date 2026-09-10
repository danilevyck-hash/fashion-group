/* ─────────────────────────────────────────────────────────────────────────────
 * EL I/O DE LOS CÓDIGOS IGNORADOS. La regla vive en `codigos-ignorados.ts`.
 *
 * 🔴 ESCONDE, NO BORRA: volver a mostrar apaga la marca (`activo = false`) y
 * firma quién; NUNCA un DELETE. Es la misma forma que reabrir una quincena o
 * deshacer una corrección de marcación.
 * ────────────────────────────────────────────────────────────────────────── */

import { supabaseServer } from "@/lib/supabase-server";
import {
  TABLA_CODIGOS_IGNORADOS,
  type CodigoIgnorado,
} from "./codigos-ignorados";

interface FilaIgnorado {
  empleado_codigo: string;
  motivo: string | null;
  ignorado_por: string;
  ignorado_en: string;
}

/** Los códigos escondidos HOY. Un `Set` para filtrar sin pensar. */
export async function leerIgnorados(): Promise<{ codigos: Set<string>; lista: CodigoIgnorado[] }> {
  const { data, error } = await supabaseServer
    .from(TABLA_CODIGOS_IGNORADOS)
    .select("empleado_codigo, motivo, ignorado_por, ignorado_en")
    .eq("activo", true)
    .order("ignorado_en", { ascending: false });
  // 🔴 SI NO SE PUEDE LEER, NO SE ESCONDE A NADIE. Fallar cerrado acá sería
  // esconder gente que sí trabaja; fallar abierto solo muestra de más, que es
  // exactamente el estado en el que vivía el módulo antes de esta pantalla.
  if (error) return { codigos: new Set(), lista: [] };
  const filas = (data ?? []) as unknown as FilaIgnorado[];
  return {
    codigos: new Set(filas.map((f) => String(f.empleado_codigo).trim())),
    lista: filas.map((f) => ({
      codigo: String(f.empleado_codigo).trim(),
      motivo: f.motivo ?? null,
      por: String(f.ignorado_por),
      cuando: String(f.ignorado_en),
    })),
  };
}

/** Esconde un código. Repetirlo no es un error: vuelve a dejarlo escondido. */
export async function ignorarCodigo(opts: {
  codigo: string;
  motivo: string | null;
  usuario: string;
}): Promise<void> {
  const { error } = await supabaseServer.from(TABLA_CODIGOS_IGNORADOS).upsert({
    empleado_codigo: opts.codigo,
    activo: true,
    motivo: opts.motivo,
    ignorado_por: opts.usuario,
    ignorado_en: new Date().toISOString(),
    // Al volver a esconderlo se limpia la firma de quien lo había mostrado: la
    // marca vigente es la de ahora.
    mostrado_por: null,
    mostrado_en: null,
  }, { onConflict: "empleado_codigo" });
  if (error) throw new Error(`No se pudo ignorar el código: ${error.message}`);
}

/**
 * Vuelve a mostrarlo. 🔴 NO BORRA LA FILA: la apaga y firma quién la apagó.
 */
export async function volverAMostrar(opts: { codigo: string; usuario: string }): Promise<void> {
  const { error } = await supabaseServer
    .from(TABLA_CODIGOS_IGNORADOS)
    .update({
      activo: false,
      mostrado_por: opts.usuario,
      mostrado_en: new Date().toISOString(),
    })
    .eq("empleado_codigo", opts.codigo)
    .eq("activo", true);
  if (error) throw new Error(`No se pudo volver a mostrar el código: ${error.message}`);
}
