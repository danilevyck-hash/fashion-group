import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { mismoNumeroDeFactura, numeroClave } from "@/lib/marketing/duplicado";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// GET /api/marketing/facturas/check-duplicate
//   ?numero_factura=FE-0001&proveedor=Pintor%20XYZ&proyecto_id_actual=<uuid>
//
// Respuesta: { existe: boolean, facturas: [...] }
// Solo facturas vigentes (anulado_en IS NULL). Compara con
// `mismoNumeroDeFactura` (duplicado.ts), la misma regla del freno al guardar:
// número SIN ceros de relleno y proveedor normalizado con sus alias.
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const numeroFactura = (url.searchParams.get("numero_factura") ?? "").trim();
  const proveedor = (url.searchParams.get("proveedor") ?? "").trim();
  const proyectoIdActual = url.searchParams.get("proyecto_id_actual");

  // Prefiltro en la base por el último tramo del número sin ceros: aparece
  // tal cual dentro de cualquier grafía con ceros («7766» ⊂ «11-000007766»).
  // Solo letras y dígitos, así que no trae comodines de LIKE.
  const ultimoTramo = numeroClave(numeroFactura).split("-").pop() ?? "";

  if (!ultimoTramo || !proveedor) {
    return NextResponse.json({ existe: false, facturas: [] });
  }

  try {
    const { data, error } = await supabaseServer
      .from("mk_facturas")
      .select(
        "id, numero_factura, proveedor, total, proyecto_id, created_at, fecha_factura, proyecto:mk_proyectos(id, nombre, tienda)",
      )
      .ilike("numero_factura", `%${ultimoTramo}%`)
      .is("anulado_en", null);
    if (error) throw new Error(error.message);

    type Row = {
      id: string;
      numero_factura: string;
      proveedor: string;
      total: number;
      proyecto_id: string;
      created_at: string | null;
      fecha_factura: string | null;
      proyecto:
        | { id: string; nombre: string | null; tienda: string | null }
        | Array<{ id: string; nombre: string | null; tienda: string | null }>
        | null;
    };

    const rows = ((data ?? []) as unknown as Row[]).filter((r) =>
      mismoNumeroDeFactura(
        { numero: numeroFactura, proveedor },
        { numero: r.numero_factura, proveedor: r.proveedor },
      ),
    );
    const facturas = rows.map((r) => {
      const proy = Array.isArray(r.proyecto) ? r.proyecto[0] : r.proyecto;
      const proyectoNombre =
        proy?.nombre || proy?.tienda || "Proyecto sin nombre";
      return {
        id: String(r.id),
        numero_factura: String(r.numero_factura),
        proveedor: String(r.proveedor),
        total: Number(r.total ?? 0),
        proyecto_id: String(r.proyecto_id),
        proyecto_nombre: proyectoNombre,
        created_at: r.created_at ? String(r.created_at) : null,
        fecha_factura: r.fecha_factura ? String(r.fecha_factura) : null,
        es_mismo_proyecto: proyectoIdActual
          ? String(r.proyecto_id) === proyectoIdActual
          : false,
      };
    });

    const res = NextResponse.json({
      existe: facturas.length > 0,
      facturas,
    });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/facturas/check-duplicate:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
