// ─────────────────────────────────────────────────────────────────────────────
// /api/cxc/whatsapp — los estados de cuenta por WhatsApp de la semana
// (27-nov-2026). Ver `lib/cxc/estado-cuenta-whatsapp.ts`.
//
//   GET                                   → { semana, clientes: [...] } la última semana con PDF guardados.
//   GET ?semana=&codigo=&empresa=         → el PDF de Switch (bucket privado), solo de esa fila.
//   POST { semana, codigo }               → anota «enviado por WhatsApp» (quién y cuándo).
//                                           El «Deshacer» de 5 s es del navegador: el POST sale al vencer.
//
// 🔴 Solo admin y secretaria. Boston no tiene filas aquí (el envío es de las 6).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { fmtDate } from "@/lib/format";
import {
  BUCKET_ESTADOS_CUENTA,
  ESTADO_CUENTA_WHATSAPP_2026_11,
  ROLES_WHATSAPP,
  textoWhatsApp,
  type PdfGuardado,
} from "@/lib/cxc/estado-cuenta-whatsapp";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const TABLA = "cxc_estado_cuenta_automatico";
const roles = () => [...ROLES_WHATSAPP];

interface Fila {
  cliente_codigo: string;
  cliente_nombre: string | null;
  semana: string;
  saldo: number | string | null;
  pdfs: PdfGuardado[] | null;
  whatsapp_por: string | null;
  whatsapp_en: string | null;
}

async function filaDe(semana: string, codigo: string): Promise<Fila | null> {
  const { data, error } = await supabaseServer
    .from(TABLA)
    .select("cliente_codigo, cliente_nombre, semana, saldo, pdfs, whatsapp_por, whatsapp_en")
    .eq("semana", semana)
    .eq("cliente_codigo", codigo)
    .eq("estado", "sin_correo")
    .not("pdfs", "is", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Fila | null) ?? null;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, roles());
  if (auth instanceof NextResponse) return auth;
  if (!ESTADO_CUENTA_WHATSAPP_2026_11) return NextResponse.json({ semana: null, clientes: [] });

  const sp = req.nextUrl.searchParams;
  const empresa = sp.get("empresa");
  try {
    if (empresa) {
      const fila = await filaDe(sp.get("semana") ?? "", sp.get("codigo") ?? "");
      const pdf = fila?.pdfs?.find((p) => p.empresa === empresa);
      if (!pdf) return NextResponse.json({ error: "No existe ese PDF" }, { status: 404 });
      const { data, error } = await supabaseServer.storage.from(BUCKET_ESTADOS_CUENTA).download(pdf.path);
      if (error || !data) return NextResponse.json({ error: "No se pudo leer el PDF" }, { status: 500 });
      return new NextResponse(await data.arrayBuffer(), {
        headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store" },
      });
    }

    const ultima = await supabaseServer
      .from(TABLA)
      .select("semana")
      .eq("estado", "sin_correo")
      .not("pdfs", "is", null)
      .order("semana", { ascending: false })
      .limit(1);
    if (ultima.error) throw new Error(ultima.error.message);
    const semana = (ultima.data?.[0]?.semana as string | undefined) ?? null;
    if (!semana) return NextResponse.json({ semana: null, clientes: [] });

    const { data, error } = await supabaseServer
      .from(TABLA)
      .select("cliente_codigo, cliente_nombre, semana, saldo, pdfs, whatsapp_por, whatsapp_en")
      .eq("semana", semana)
      .eq("estado", "sin_correo")
      .not("pdfs", "is", null)
      .order("saldo", { ascending: false });
    if (error) throw new Error(error.message);

    const fecha = fmtDate(semana);
    const clientes = ((data ?? []) as Fila[]).map((f) => {
      const pdfs = f.pdfs ?? [];
      return {
        codigo: f.cliente_codigo,
        nombre: f.cliente_nombre || f.cliente_codigo,
        saldo: Number(f.saldo) || 0,
        pdfs: pdfs.map((p) => ({ empresa: p.empresa, nombreEmpresa: p.nombreEmpresa, total: p.total, archivo: p.archivo })),
        texto: textoWhatsApp(pdfs, fecha),
        enviado: f.whatsapp_en ? { por: f.whatsapp_por ?? "", en: f.whatsapp_en } : null,
      };
    });
    return NextResponse.json({ semana, clientes });
  } catch (e) {
    console.error(`[cxc/whatsapp] ${(e as Error).message}`);
    return NextResponse.json({ error: "No se pudo leer los estados de cuenta de la semana" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, roles());
  if (auth instanceof NextResponse) return auth;
  if (!ESTADO_CUENTA_WHATSAPP_2026_11) return NextResponse.json({ error: "Apagado" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { semana?: unknown; codigo?: unknown };
  const semana = typeof body.semana === "string" ? body.semana : "";
  const codigo = typeof body.codigo === "string" ? body.codigo.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semana) || !codigo) {
    return NextResponse.json({ error: "semana y codigo requeridos" }, { status: 400 });
  }
  try {
    const fila = await filaDe(semana, codigo);
    if (!fila) return NextResponse.json({ error: "Ese cliente no está en la lista de la semana" }, { status: 404 });
    const por = auth.userName ?? auth.userId ?? "desconocido";
    const en = new Date().toISOString();
    const { error } = await supabaseServer
      .from(TABLA)
      .update({ whatsapp_por: por, whatsapp_en: en, updated_at: en })
      .eq("semana", semana)
      .eq("cliente_codigo", codigo);
    if (error) throw new Error(error.message);
    // La misma bitácora del cobro: pinta «Le enviaste el estado de cuenta hace N días».
    const bit = await supabaseServer.from("cxc_emails_enviados").insert({
      cliente_codigo: codigo,
      empresas: (fila.pdfs ?? []).map((p) => p.empresa),
      destinatario: "WhatsApp",
      cc: null,
      asunto: "Estado de cuenta de la semana (PDF de Switch)",
      enviado_por: por,
      resultado: "ok",
      canal: "whatsapp",
    });
    if (bit.error) console.error(`[cxc/whatsapp] bitácora ${codigo}: ${bit.error.message}`);
    return NextResponse.json({ ok: true, enviado: { por, en } });
  } catch (e) {
    console.error(`[cxc/whatsapp] POST ${(e as Error).message}`);
    return NextResponse.json({ error: "No se pudo anotar el envío" }, { status: 500 });
  }
}
