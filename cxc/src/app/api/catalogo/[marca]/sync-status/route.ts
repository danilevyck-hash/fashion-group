import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getMarcaConfig } from "@/lib/catalogo/marcas";

export const dynamic = "force-dynamic";

// Última corrida exitosa del cron de catálogo de la marca (cron_heartbeats),
// para el indicador "Sincronizado con Switch hace X" del catálogo (admin y
// vista de vendedores — botón "Actualizar ahora"). Read-only.
export async function GET(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const auth = requireRole(req, ["admin", "secretaria", "vendedor"]);
  if (auth instanceof NextResponse) return auth;

  const supabaseServer = await cfg.mainDb();
  const { data } = await supabaseServer
    .from("cron_heartbeats")
    .select("last_success_at")
    .eq("cron_name", cfg.cronName)
    .maybeSingle();

  return NextResponse.json({ lastSync: data?.last_success_at ?? null });
}
