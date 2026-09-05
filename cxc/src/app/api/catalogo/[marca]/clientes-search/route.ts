// ─────────────────────────────────────────────────────────────────────────────
// SUGERENCIAS DE CLIENTE al escribir el nombre en un pedido de catálogo.
//
// 🩸 Hasta el 5-sep-2026 leía `directorio_clientes`: la libreta de 33 contactos
// que se escribió A MANO antes de que el directorio viniera de Switch. Sin una
// entrada nueva desde el 28-may, 8 sin código, y con correos distintos a los
// reales (DE MODA tenía uno en cada lado). De los 10 clientes que más deben, 3
// no existían ahí — City Moda Chorrera, Internacional Belén, Grup M.E.L.— así
// que al armarles un pedido había que escribir el nombre a mano. Era la ÚLTIMA
// pantalla que la leía. Daniel: *«si ningún módulo toca esa lista, bórralo»*.
//
// Ahora lee `clientes_master`: los 150 del grupo, por CÓDIGO, los mismos que
// usan Guías, el CXC, Recordatorios y la ficha. Los ausentes de Switch no se
// ofrecen (misma regla que `leerClientesDelGrupo`). La forma de la respuesta
// no cambia: `PedidoDetalleClient` sigue leyendo `nombre`.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getMarcaConfig } from "@/lib/catalogo/marcas";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const auth = requireRole(req, ["admin", "secretaria", "vendedor"]);
  if (auth instanceof NextResponse) return auth;
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.length < 2) return NextResponse.json([]);

  const supabaseServer = await cfg.mainDb();

  const { data, error } = await supabaseServer
    .from("clientes_master")
    .select("codigo, nombre, email, telefono, celular")
    .eq("deleted", false)
    .is("ausente_desde", null)
    .or(`nombre.ilike.%${q}%,codigo.ilike.%${q}%`)
    .order("nombre")
    .limit(5);

  if (error) {
    console.error("[clientes-search]", error.message);
    return NextResponse.json({ error: "No se pudieron buscar los clientes. Intenta de nuevo en unos segundos." }, { status: 500 });
  }

  return NextResponse.json(
    (data || []).map((r) => ({
      codigo: r.codigo,
      nombre: r.nombre,
      empresa: "",
      correo: r.email ?? "",
      telefono: r.telefono ?? "",
      celular: r.celular ?? "",
      whatsapp: r.celular || r.telefono || "",
    })),
  );
}
