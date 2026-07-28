// ─────────────────────────────────────────────────────────────────────────────
// Estado de cuenta CXC — envío real por correo (Resend) + preview.
//
//   GET  ?codigo=D-XXX&empresa={key|todas}&nombre=...&nombreNormalizado=...
//        → datos para el modal: destinatario sugerido, asunto/cuerpo default,
//          firma, tabla HTML (la que se envía), sharedCount y mes.
//   POST { codigo, nombre, nombreNormalizado, empresa, destinatario, asunto,
//          cuerpo } → genera N PDFs (uno por empresa, incluyendo saldo a favor)
//          y envía el correo. Registra en cxc_emails_enviados (best-effort).
//
// Los números cuadran AL CENTAVO con la pantalla/PDF porque el signo + la
// agrupación salen del helper compartido fetchEstadoCuentaData.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole, type SessionPayload } from "@/lib/requireRole";
import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { fetchEstadoCuentaData, type EstadoCuentaResult } from "@/lib/cxc/estado-cuenta-data";
import {
  buildResumenHtml,
  composeEmailHtml,
  buildFirma,
  defaultAsunto,
  defaultCuerpo,
  mesLabel,
  sanitizeFilenamePart,
} from "@/lib/cxc/estado-cuenta-email";
import { buildEstadoCuentaPDF } from "@/lib/pdf-estado-cuenta";
import type { EstadoCuenta } from "@/app/admin/components/EstadoCuentaDrawer";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const CXC_ROLES = ["admin", "secretaria", "vendedor"];

interface CurrentUser {
  name: string;
  nombreCompleto: string;
  email: string | null;
  associatedCompany: string | null;
}

// Lee el usuario que envía. El DDL (nombre_completo, email) puede NO estar
// aplicado todavía cuando corre el build/deploy → si PostgREST devuelve 42703
// ("column ... does not exist") caemos a leer solo `name` y usamos ese nombre,
// omitiendo reply_to/cc. Fallback temporal hasta aplicar la migración.
async function getCurrentUser(userId: string | undefined): Promise<CurrentUser | null> {
  if (!userId) return null;
  const { data, error } = await supabaseServer
    .from("fg_users")
    .select("name, associated_company, nombre_completo, email")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    const missingCol = error.code === "42703" || /column .* does not exist/i.test(error.message);
    if (!missingCol) {
      console.error(`[cxc/enviar-email] fg_users: ${error.message}`);
      return null;
    }
    // Fallback sin columnas nuevas.
    const { data: d2 } = await supabaseServer
      .from("fg_users")
      .select("name, associated_company")
      .eq("id", userId)
      .maybeSingle();
    if (!d2) return null;
    return { name: d2.name, nombreCompleto: d2.name, email: null, associatedCompany: d2.associated_company ?? null };
  }
  if (!data) return null;
  return {
    name: data.name,
    nombreCompleto: (data.nombre_completo as string | null)?.trim() || data.name,
    email: (data.email as string | null)?.trim() || null,
    associatedCompany: data.associated_company ?? null,
  };
}

// Resolución de empresas idéntica al GET de estado-cuenta: vendedor forzado a su
// empresa asociada (DB, no cookie); "todas" → las 6 B2B; una key válida → esa.
function resolveEmpresas(auth: SessionPayload, user: CurrentUser | null, empresaParam: string): string[] | null {
  const isTodas = !empresaParam || empresaParam === "todas" || empresaParam === "all";
  if (auth.role === "vendedor") {
    const asociada = user?.associatedCompany ?? null;
    return asociada ? [asociada] : [...CXC_GRUPO_EMPRESA_KEYS];
  }
  if (isTodas) return [...CXC_GRUPO_EMPRESA_KEYS];
  if (!(CXC_GRUPO_EMPRESA_KEYS as readonly string[]).includes(empresaParam)) return null;
  return [empresaParam];
}

// Destinatario sugerido: override de contacto (por nombre) > email del directorio
// Switch (por código) > email de clientes_master (por código, último fallback).
async function resolveDestinatario(nombreNormalizado: string, codigo: string): Promise<string> {
  if (nombreNormalizado) {
    const { data } = await supabaseServer
      .from("cxc_client_overrides")
      .select("correo")
      .eq("nombre_normalized", nombreNormalizado)
      .maybeSingle();
    const correo = (data?.correo as string | null)?.trim();
    if (correo) return correo;
  }
  const { data: sc } = await supabaseServer
    .from("switch_clientes")
    .select("email")
    .eq("codigo", codigo)
    .not("email", "is", null);
  for (const row of sc ?? []) {
    const e = (row.email as string | null)?.trim();
    if (e) return e;
  }
  // Último fallback: clientes_master.email (columna renombrada desde `correo`).
  const { data: cm } = await supabaseServer
    .from("clientes_master")
    .select("email")
    .eq("codigo", codigo)
    .eq("deleted", false)
    .not("email", "is", null)
    .limit(1);
  const correo = (cm?.[0]?.email as string | null)?.trim();
  return correo || "";
}

// Cuántos clientes DISTINTOS (cliente_codigo) comparten ese email en el
// directorio Switch. 10+ → advertencia visible en el modal (no bloquea).
async function sharedCount(email: string): Promise<number> {
  if (!email) return 0;
  const { data } = await supabaseServer
    .from("switch_clientes")
    .select("codigo")
    .eq("email", email);
  const codigos = new Set<string>();
  for (const r of data ?? []) {
    const c = (r.codigo as string | null)?.trim();
    if (c) codigos.add(c);
  }
  return codigos.size;
}

// Ensambla el paquete que comparten GET (preview) y POST (envío).
interface Paquete {
  result: EstadoCuentaResult;
  empresasNombres: string[];
  resumenHtml: string;
  mes: string;
}
function armarPaquete(result: EstadoCuentaResult, nombre: string): Paquete {
  const mes = mesLabel();
  const empresasNombres = result.empresas.map((e) => e.empresa_nombre);
  const resumenHtml = buildResumenHtml(result.empresas, nombre);
  return { result, empresasNombres, resumenHtml, mes };
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, CXC_ROLES);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const codigo = sp.get("codigo") ?? "";
  if (!codigo) return NextResponse.json({ error: "codigo requerido" }, { status: 400 });
  const nombre = (sp.get("nombre") ?? "").trim() || codigo;
  const nombreNormalizado = (sp.get("nombreNormalizado") ?? "").trim();
  const empresaParam = sp.get("empresa") ?? "";

  const user = await getCurrentUser(auth.userId);
  const empresas = resolveEmpresas(auth, user, empresaParam);
  if (!empresas) return NextResponse.json({ error: "empresa inválida" }, { status: 400 });

  let result: EstadoCuentaResult;
  try {
    result = await fetchEstadoCuentaData(codigo, empresas);
  } catch (e) {
    console.error(`[cxc/enviar-email] preview: ${(e as Error).message}`);
    return NextResponse.json({ error: "Error al leer estado de cuenta" }, { status: 500 });
  }

  const { empresasNombres, resumenHtml, mes } = armarPaquete(result, nombre);
  const destinatario = await resolveDestinatario(nombreNormalizado, codigo);
  const compartidoPor = await sharedCount(destinatario);
  const firma = buildFirma(user?.nombreCompleto ?? "Fashion Group");
  const totalDocs = result.empresas.reduce((n, e) => n + e.documentos.length, 0);

  return NextResponse.json({
    destinatario,
    asunto: defaultAsunto(empresasNombres, mes),
    cuerpo: defaultCuerpo(mes),
    firma,
    resumenHtml,
    empresasNombres,
    sharedCount: compartidoPor,
    mes,
    totalDocs,
    remitenteEmail: user?.email ?? null,
  });
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, CXC_ROLES);
  if (auth instanceof NextResponse) return auth;

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return NextResponse.json({ error: "RESEND_API_KEY no configurada" }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const codigo = str(body.codigo);
  const nombre = str(body.nombre) || codigo;
  const nombreNormalizado = str(body.nombreNormalizado);
  const empresaParam = str(body.empresa);
  const destinatario = str(body.destinatario);
  const asunto = str(body.asunto);
  const cuerpo = typeof body.cuerpo === "string" ? body.cuerpo : "";

  if (!codigo) return NextResponse.json({ error: "codigo requerido" }, { status: 400 });
  if (!destinatario || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destinatario)) {
    return NextResponse.json({ error: "Destinatario inválido" }, { status: 400 });
  }
  if (!asunto) return NextResponse.json({ error: "Asunto requerido" }, { status: 400 });

  const user = await getCurrentUser(auth.userId);
  const empresas = resolveEmpresas(auth, user, empresaParam);
  if (!empresas) return NextResponse.json({ error: "empresa inválida" }, { status: 400 });

  let result: EstadoCuentaResult;
  try {
    result = await fetchEstadoCuentaData(codigo, empresas);
  } catch (e) {
    console.error(`[cxc/enviar-email] ${(e as Error).message}`);
    return NextResponse.json({ error: "Error al leer estado de cuenta" }, { status: 500 });
  }

  if (result.empresas.length === 0) {
    return NextResponse.json({ error: "Este cliente no tiene documentos con saldo." }, { status: 400 });
  }

  const { resumenHtml, mes } = armarPaquete(result, nombre);
  const firma = buildFirma(user?.nombreCompleto ?? "Fashion Group");
  const html = composeEmailHtml({ cuerpo, resumenHtml, firma });

  // Un PDF por empresa (incluye empresas con saldo a favor).
  const attachments: { filename: string; content: string }[] = [];
  for (const emp of result.empresas) {
    const pdfData: EstadoCuenta = {
      codigo: result.codigo,
      empresas: [
        {
          empresa_key: emp.empresa_key,
          empresa_nombre: emp.empresa_nombre,
          documentos: emp.documentos,
          subtotal: emp.subtotal,
        },
      ],
      total: emp.subtotal,
      generadoEn: result.generadoEn,
    };
    const { doc } = buildEstadoCuentaPDF(pdfData, nombre);
    const base64 = Buffer.from(doc.output("arraybuffer")).toString("base64");
    const filename = `${sanitizeFilenamePart(`Estado de cuenta — ${emp.empresa_nombre} — ${nombre} — ${mes}`)}.pdf`;
    attachments.push({ filename, content: base64 });
  }

  const cc = user?.email || undefined;
  const emailPayload: Record<string, unknown> = {
    from: "Fashion Group <cobros@fashiongr.com>",
    to: [destinatario],
    subject: asunto,
    html,
    attachments,
  };
  if (cc) {
    emailPayload.cc = [cc];
    emailPayload.reply_to = cc;
  }

  let ok = false;
  let resultado = "ok";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify(emailPayload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      resultado = `error: ${err?.message ?? res.status}`;
      console.error(`[cxc/enviar-email] Resend: ${resultado}`);
      return NextResponse.json({ error: "No se pudo enviar el correo. Intenta de nuevo." }, { status: 500 });
    }
    ok = true;
  } catch (e) {
    resultado = `error: ${(e as Error).message}`;
    console.error(`[cxc/enviar-email] ${resultado}`);
    return NextResponse.json({ error: "No se pudo enviar el correo. Intenta de nuevo." }, { status: 500 });
  }

  // Bitácora — best-effort. El correo YA salió; si el insert falla NO devolvemos
  // 500, solo logueamos y avisamos con un flag.
  let logged = true;
  try {
    const { error: logErr } = await supabaseServer.from("cxc_emails_enviados").insert({
      cliente_codigo: codigo,
      empresas: result.empresas.map((e) => e.empresa_key),
      destinatario,
      cc: cc ?? null,
      asunto,
      enviado_por: user?.name ?? auth.userName ?? auth.userId ?? "desconocido",
      resultado,
    });
    if (logErr) {
      logged = false;
      console.error(`[cxc/enviar-email] bitácora: ${logErr.message}`);
    }
  } catch (e) {
    logged = false;
    console.error(`[cxc/enviar-email] bitácora: ${(e as Error).message}`);
  }

  return NextResponse.json({ ok, logged, empresas: result.empresas.length });
}
