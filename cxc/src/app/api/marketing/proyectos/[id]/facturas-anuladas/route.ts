import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getFacturasAnuladasByProyecto } from "@/lib/marketing/queries";
import { firmarAdjuntos } from "@/lib/marketing/storage";

export const dynamic = "force-dynamic";

// GET /api/marketing/proyectos/[id]/facturas-anuladas
//
// 🩸 Las facturas anuladas de ESE proyecto, y NADA más. Existe porque la
// pantalla de "Anulados" se retiró: era la única puerta para verlas y
// restaurarlas, y sin esto las 14 anuladas que viven dentro de proyectos vivos
// ($12.004,20 medidos el 11-ago-2026) quedaban inalcanzables para siempre.
//
// 🔴 VA APARTE del endpoint de facturas vigentes a propósito: todo lo que suma
// plata en el módulo lee ESE otro, y una anulada no es gasto de nadie.

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    const facturas = await getFacturasAnuladasByProyecto(params.id);
    const firmadas = await Promise.all(
      facturas.map(async (f) => ({
        ...f,
        adjuntos: await firmarAdjuntos(f.adjuntos),
      })),
    );
    const res = NextResponse.json(firmadas);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("marketing/proyectos/[id]/facturas-anuladas GET:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
