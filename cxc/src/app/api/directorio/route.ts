import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getSession } from "@/lib/require-auth";
import { requireRole } from "@/lib/requireRole";

const DIRECTORIO_ROLES = ["admin", "secretaria", "director", "contabilidad", "vendedor"];

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session || !DIRECTORIO_ROLES.includes(session.role)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const format = req.nextUrl.searchParams.get("format");
  const search = req.nextUrl.searchParams.get("search") || "";
  const pageParam = parseInt(req.nextUrl.searchParams.get("page") || "0");
  const limitParam = parseInt(req.nextUrl.searchParams.get("limit") || "0");

  // CSV/Excel export or legacy full load — no pagination
  if (format === "csv" || (!pageParam && !limitParam && !search)) {
    const { data, error } = await supabaseServer
      .from("directorio_clientes")
      .select("*")
      .eq("deleted", false)
      .order("nombre");

    if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

    if (format === "csv") {
      const header = "nombre;empresa;telefono;celular;correo;contacto;notas";
      const rows = (data || []).map((r) =>
        [r.nombre, r.empresa, r.telefono, r.celular, r.correo, r.contacto, r.notas]
          .map((v) => (v || "").replace(/;/g, ","))
          .join(";")
      );
      const csv = [header, ...rows].join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="directorio_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json(data);
  }

  // Paginated + server-side search
  const limit = limitParam || 50;
  const offset = ((pageParam || 1) - 1) * limit;

  let query = supabaseServer
    .from("directorio_clientes")
    .select("*", { count: "exact" })
    .eq("deleted", false);

  if (search) {
    query = query.or(`nombre.ilike.%${search}%,empresa.ilike.%${search}%`);
  }

  const empresa = req.nextUrl.searchParams.get("empresa");
  if (empresa) {
    query = query.eq("empresa", empresa);
  }

  const { data, count, error } = await query
    .order("nombre")
    .range(offset, offset + limit - 1);

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  return NextResponse.json({ data: data || [], total: count || 0 });
}

// Check if names already exist (for CSV dedup)
export async function PATCH(req: NextRequest) {
  const auth = requireRole(req, DIRECTORIO_ROLES);
  if (auth instanceof NextResponse) return auth;
  const { names } = await req.json();
  if (!Array.isArray(names)) return NextResponse.json({ error: "names array required" }, { status: 400 });

  const lower = names.map((n: string) => n.toLowerCase().trim());
  const { data } = await supabaseServer
    .from("directorio_clientes")
    .select("nombre")
    .eq("deleted", false);

  const existing = new Set((data || []).map(r => r.nombre.toLowerCase().trim()));
  const duplicates = lower.filter(n => existing.has(n));
  return NextResponse.json({ duplicates });
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, DIRECTORIO_ROLES);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  const { nombre, empresa, telefono, celular, correo, contacto, notas } = body;

  const { data, error } = await supabaseServer
    .from("directorio_clientes")
    .insert({ nombre, empresa, telefono, celular, correo, contacto, notas })
    .select()
    .single();

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}
