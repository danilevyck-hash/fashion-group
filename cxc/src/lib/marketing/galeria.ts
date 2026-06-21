import { supabaseServer } from "@/lib/supabase-server";
import { firmarAdjuntos } from "./storage";
import type { MkAdjunto } from "./types";

// TTL de las URLs firmadas de las fotos de la galería. La galería re-firma en
// cada carga, pero el default de storage.ts (1 hora) hacía que las fotos
// vencieran ("exp claim timestamp check failed") si la página quedaba abierta o
// cacheada un rato. 1 año = en la práctica no expira (el acceso lo controla el
// token HMAC del cliente, no la duración del link).
const GALERIA_LINK_TTL_SECONDS = 60 * 60 * 24 * 365;

/**
 * Datos de la galería pública de un cliente.
 *
 * SEGURIDAD: expone ÚNICAMENTE el nombre del cliente y las URLs firmadas de sus
 * fotos (foto_proyecto de sus proyectos NO anulados). NUNCA montos, conceptos,
 * proveedores, ni datos de otros clientes.
 */
export interface GaleriaFoto {
  url: string;
  nombre: string;
}

export interface GaleriaCliente {
  nombre: string;
  fotos: GaleriaFoto[];
}

export async function getGaleriaCliente(
  clienteCodigo: string,
): Promise<GaleriaCliente> {
  const { data: cli } = await supabaseServer
    .from("clientes_master")
    .select("nombre")
    .eq("codigo", clienteCodigo)
    .maybeSingle();
  const nombre = ((cli?.nombre as string | undefined) ?? "").trim() || clienteCodigo;

  // Proyectos NO anulados de este cliente.
  const { data: proys } = await supabaseServer
    .from("mk_proyectos")
    .select("id")
    .eq("tienda_codigo", clienteCodigo)
    .is("anulado_en", null);
  const ids = (proys ?? []).map((p) => String((p as { id: string }).id));
  if (ids.length === 0) return { nombre, fotos: [] };

  // Solo fotos de proyecto (no PDFs de factura) de esos proyectos.
  const { data: adjs } = await supabaseServer
    .from("mk_adjuntos")
    .select("id, proyecto_id, factura_id, tipo, url, nombre_original, size_bytes, created_at")
    .in("proyecto_id", ids)
    .eq("tipo", "foto_proyecto")
    .order("created_at", { ascending: false });

  const firmadas = await firmarAdjuntos(
    (adjs ?? []) as MkAdjunto[],
    GALERIA_LINK_TTL_SECONDS,
  );
  const fotos: GaleriaFoto[] = firmadas
    .filter((a) => !!a.url)
    .map((a) => ({ url: a.url, nombre: a.nombre_original ?? "Foto" }));

  return { nombre, fotos };
}
