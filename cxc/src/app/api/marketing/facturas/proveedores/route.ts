import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// GET /api/marketing/facturas/proveedores — el HISTÓRICO de proveedores, para
// sugerirlos mientras la persona escribe (22-sep-2026, pieza A). Daniel: *«al
// escribirlo se sugieren los ya usados»*, y NUNCA una lista cerrada: lo que se
// teclea se guarda aunque no esté acá.
//
// Devuelve los nombres TAL COMO SE GUARDARON, con repeticiones (una por
// factura viva): `sugerirProveedores` (`lib/marketing/proveedor.ts`, puro) los
// agrupa por el normalizado y ofrece UNA grafía por proveedor, la más usada.
// Medido el 22-sep-2026: 94 facturas vivas, 13 proveedores distintos.
// Solo lee; si la lectura se cae contesta lista vacía y la pantalla sigue.
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const { data, error } = await supabaseServer
      .from("mk_facturas")
      .select("proveedor")
      .is("anulado_en", null)
      .is("impulsadora_id", null)
      .limit(1000);
    if (error) throw new Error(error.message);
    const proveedores = ((data ?? []) as Array<{ proveedor: string | null }>)
      .map((r) => String(r.proveedor ?? "").trim())
      .filter((p) => p.length > 0);
    return NextResponse.json({ proveedores });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    console.error("marketing/facturas/proveedores GET:", message);
    return NextResponse.json({ proveedores: [] });
  }
}
