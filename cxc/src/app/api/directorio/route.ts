import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format");

  const { data, error } = await supabaseServer
    .from("directorio_clientes")
    .select("*")
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

export async function POST(req: NextRequest) {
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
