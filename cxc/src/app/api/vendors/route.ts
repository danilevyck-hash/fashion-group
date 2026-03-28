import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const companyKey = searchParams.get("company");

  let query = supabaseServer.from("vendor_assignments").select("*");
  if (companyKey) query = query.eq("company_key", companyKey);

  const { data, error } = await query;
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { company_key, client_name, vendor_name } = body;

  const { error } = await supabaseServer
    .from("vendor_assignments")
    .upsert(
      { company_key, client_name, vendor_name, updated_at: new Date().toISOString() },
      { onConflict: "company_key,client_name" }
    );

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const companyKey = searchParams.get("company");
  const clientName = searchParams.get("client");

  const { error } = await supabaseServer
    .from("vendor_assignments")
    .delete()
    .eq("company_key", companyKey!)
    .eq("client_name", clientName!);

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
