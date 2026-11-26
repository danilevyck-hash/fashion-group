// A qué correo va el estado de cuenta del GRUPO de un cliente, para el envío
// automático de los lunes: nota de la cartera del GRUPO > directorio Switch >
// maestro. MISMO orden que el envío de a uno (`/api/cxc/enviar-email` ›
// `resolveDestinatario`) y el lote (`/api/cxc/cobrar-lote` › `correoDe`).
import { supabaseServer } from "@/lib/supabase-server";
import { CARTERA_GRUPO } from "@/lib/cxc/cartera";
import { leerCorreoDeOverride } from "@/lib/cxc/anotaciones";

export async function correoDelCliente(codigo: string, nombreNormalizado: string): Promise<string> {
  if (nombreNormalizado) {
    const correo = await leerCorreoDeOverride(CARTERA_GRUPO, nombreNormalizado);
    if (correo) return correo;
  }
  const { data: sc } = await supabaseServer
    .from("switch_clientes")
    .select("email")
    .eq("codigo", codigo)
    .not("email", "is", null);
  for (const row of sc ?? []) {
    const e = (row.email as string | null)?.trim();
    if (e) return e;
  }
  const { data: cm } = await supabaseServer
    .from("clientes_master")
    .select("email")
    .eq("codigo", codigo)
    .eq("deleted", false)
    .not("email", "is", null)
    .limit(1);
  return ((cm?.[0]?.email as string | null) ?? "").trim();
}

/** El nombre de contacto del cliente, para el saludo. Falla abierto. */
export async function contactoDelCliente(codigo: string): Promise<string> {
  const { data, error } = await supabaseServer
    .from("clientes_master")
    .select("contacto")
    .eq("codigo", codigo)
    .eq("deleted", false)
    .limit(1);
  if (error) return "";
  return ((data?.[0] as { contacto?: string | null } | undefined)?.contacto ?? "").trim();
}
