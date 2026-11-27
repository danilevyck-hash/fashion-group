// Arma los mensajes del resumen del día (🧾 · 🚚 · 💰, uno por sección) leyendo
// la base y Switch. Lo usan el cron `cobros-del-dia` y la vista previa.
import { supabaseServer } from "@/lib/supabase-server";
import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { cobroCuenta, llaveMas90, mensajeCobrosDelDia, type CobroDelDia } from "@/lib/cxc/cobros-del-dia";
import { leerMas90DeSwitch } from "@/lib/cxc/cobros-del-dia-io";
import {
  RESUMEN_DEL_DIA_2026_11,
  bloqueDespachos,
  bloqueFacturas,
  partirParaTelegram,
  resumenDelDia,
} from "./resumen-del-dia";
import { leerDespachosDelDia, leerFacturasDelDia } from "./resumen-del-dia-io";

export async function armarResumenDelDia(fecha: string): Promise<{ cobros: number; mensajes: string[] }> {
  // Mismo filtro que «Últimos pagos»: sin retenciones ni recibos en cero.
  const rec = await supabaseServer
    .from("switch_recibos")
    .select("empresa_key, cliente_codigo, cliente_nombre, total, fecha_creacion")
    .eq("fecha", fecha)
    .in("empresa_key", CXC_GRUPO_EMPRESA_KEYS)
    .eq("es_retencion", false)
    .neq("total", 0)
    .not("cliente_codigo", "is", null)
    .limit(1000);
  if (rec.error) throw new Error(rec.error.message);
  const cobros: CobroDelDia[] = (rec.data ?? []).map((r) => ({
    empresa: r.empresa_key,
    codigo: r.cliente_codigo,
    cliente: r.cliente_nombre ?? r.cliente_codigo,
    monto: Number(r.total) || 0,
  }));

  // 🔴 El +90 es el de Switch AL MOMENTO (24-nov-2026), solo de quien pagó hoy.
  const pares = [...new Map(cobros.filter(cobroCuenta).map((c) => [llaveMas90(c.empresa, c.codigo), c])).values()];
  const mas90 = pares.length ? await leerMas90DeSwitch(pares) : new Map<string, number | null>();

  const cobrosTexto = mensajeCobrosDelDia(cobros, mas90);
  const secciones = RESUMEN_DEL_DIA_2026_11
    ? resumenDelDia([
        bloqueFacturas(await leerFacturasDelDia(fecha), fecha),
        bloqueDespachos(await leerDespachosDelDia(fecha), fecha),
        cobrosTexto,
      ])
    : cobrosTexto
      ? [cobrosTexto]
      : [];
  // Cada sección es SU mensaje; si una no cabe en 4096, se parte sin cortar nada.
  return { cobros: cobros.length, mensajes: secciones.flatMap((s) => partirParaTelegram(s)) };
}
