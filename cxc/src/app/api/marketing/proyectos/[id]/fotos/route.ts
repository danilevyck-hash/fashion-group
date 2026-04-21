import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getAdjuntosByProyecto } from "@/lib/marketing/queries";
import { firmarAdjuntos } from "@/lib/marketing/storage";

// Blindaje anti-cache: endpoint siempre runtime, nunca estático.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const t0 = Date.now();
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    const adjuntos = await getAdjuntosByProyecto(params.id);
    const firmados = await firmarAdjuntos(adjuntos);
    console.log(
      `[fotos] proyecto=${params.id} rows=${adjuntos.length} firmados=${firmados.length} (${Date.now() - t0}ms)`,
    );
    const res = NextResponse.json(firmados);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.headers.set("x-fotos-count", String(firmados.length));
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[fotos] ERROR:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
