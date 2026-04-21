import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import type { AnuladoItem } from "@/lib/marketing/types";

// Blindaje anti-cache: este endpoint SIEMPRE ejecuta runtime, nunca estático.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

// Handler inline (antes pasaba por getAnulados del lib). Consultas directas
// contra Supabase con service role para descartar cualquier capa intermedia.
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  console.log(`[papelera] GET ${new Date().toISOString()}`);

  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) {
    console.log("[papelera] requireRole bloqueó la solicitud");
    return auth;
  }
  console.log(`[papelera] auth OK role=${auth.role} user=${auth.userName ?? "-"}`);

  try {
    const [proyRes, factRes] = await Promise.all([
      supabaseServer
        .from("mk_proyectos")
        .select("id, nombre, tienda, anulado_en, anulado_motivo")
        .not("anulado_en", "is", null)
        .order("anulado_en", { ascending: false }),
      supabaseServer
        .from("mk_facturas")
        .select("id, numero_factura, proveedor, anulado_en, anulado_motivo")
        .not("anulado_en", "is", null)
        .order("anulado_en", { ascending: false }),
    ]);

    if (proyRes.error) throw new Error(`mk_proyectos: ${proyRes.error.message}`);
    if (factRes.error) throw new Error(`mk_facturas: ${factRes.error.message}`);

    console.log(
      `[papelera] raw counts proyectos=${proyRes.data?.length ?? 0} facturas=${factRes.data?.length ?? 0}`,
    );

    const items: AnuladoItem[] = [];
    for (const row of proyRes.data ?? []) {
      const r = row as Record<string, unknown>;
      items.push({
        tipo: "proyecto",
        id: String(r.id),
        nombre: String(r.nombre ?? "") || String(r.tienda ?? ""),
        anulado_en: String(r.anulado_en ?? ""),
        anulado_motivo: (r.anulado_motivo as string | null) ?? null,
      });
    }
    for (const row of factRes.data ?? []) {
      const r = row as Record<string, unknown>;
      items.push({
        tipo: "factura",
        id: String(r.id),
        nombre: `${String(r.numero_factura ?? "")} — ${String(r.proveedor ?? "")}`.trim(),
        anulado_en: String(r.anulado_en ?? ""),
        anulado_motivo: (r.anulado_motivo as string | null) ?? null,
      });
    }

    items.sort((a, b) => b.anulado_en.localeCompare(a.anulado_en));
    console.log(`[papelera] retornando ${items.length} items (${Date.now() - t0}ms)`);

    const res = NextResponse.json(items);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.headers.set("x-papelera-count", String(items.length));
    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("[papelera] ERROR:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
