// ─────────────────────────────────────────────────────────────────────────────
// Estado de cuenta CXC — envío real por correo (Resend) + preview.
//
//   GET  ?codigo=D-XXX&nombre=...&nombreNormalizado=...
//        → datos para el modal: destinatario sugerido, asunto/cuerpo default,
//          firma, tabla HTML (la que se envía), sharedCount y mes.
//   POST { codigo, nombre, nombreNormalizado, destinatario, asunto, cuerpo }
//          → genera N PDFs (uno por empresa, incluyendo saldo a favor) y envía
//          el correo. Registra en cxc_emails_enviados (best-effort).
//
// 🔴 Lo que sale son SIEMPRE las 6 empresas del grupo: el parámetro `empresa`
// se dejó de leer el 5-sep-2026. Ver `empresasDelEnvio` más abajo.
//
// Los números cuadran AL CENTAVO con la pantalla/PDF porque el signo + la
// agrupación salen del helper compartido fetchEstadoCuentaData.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { CARTERA_GRUPO } from "@/lib/cxc/cartera";
import { leerCorreoDeOverride } from "@/lib/cxc/anotaciones";
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
import type { EstadoCuenta } from "@/app/cxc/components/EstadoCuentaDrawer";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const CXC_ROLES = ["admin", "secretaria", "vendedor"];

interface CurrentUser {
  name: string;
  nombreCompleto: string;
  email: string | null;
  associatedCompany: string | null;
}

// Lee el usuario que envía: de acá salen la FIRMA del correo, el `cc` y el
// `reply_to`.
//
// Histórico: el DDL (nombre_completo, email) podía NO estar aplicado cuando
// corría el build/deploy, así que ante un 42703 ("column ... does not exist") se
// releía solo `name` y se mandaba sin reply_to/cc.
// Tolerancia retirada el 3-sep-2026: las dos columnas existen desde la migración
// 20260709120000_cxc_email_estado_cuenta.sql. Ahora el error de PostgREST se
// PROPAGA: un permiso denegado o un timeout leídos como "falta la columna"
// mandarían el estado de cuenta firmado por nadie y sin copia al remitente, y
// nadie se enteraría.
async function getCurrentUser(userId: string | undefined): Promise<CurrentUser | null> {
  if (!userId) return null;
  const { data, error } = await supabaseServer
    .from("fg_users")
    .select("name, associated_company, nombre_completo, email")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(`fg_users: ${error.message}`);
  // Sin fila NO es un error: es un userId que ya no está. Firma genérica.
  if (!data) return null;
  return {
    name: data.name,
    nombreCompleto: (data.nombre_completo as string | null)?.trim() || data.name,
    email: (data.email as string | null)?.trim() || null,
    associatedCompany: data.associated_company ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LO QUE SE MANDA ES SIEMPRE EL ESTADO DE CUENTA COMPLETO — LAS 6 EMPRESAS.
// Daniel (5-sep-2026), textual, preguntado si el filtro de empresa tenía que
// recortar el correo: *«todo»*.
//
// 🩸 QUÉ PASABA. `EnviarEmailModal` le pasaba a esta ruta el filtro de la
// pantalla como `empresa`, así que con «Vistana» seleccionado el CLIENTE
// recibía un estado de cuenta de Vistana solamente —creyendo que ése es todo
// lo que debe— y el resto quedaba sin cobrar. Peor: un vendedor con empresa
// asociada (Edwin tiene Vistana fija por `fg_empresa_filter`) NO PODÍA mandar
// el completo ni queriendo, porque la ruta le forzaba su empresa.
//
// El filtro de empresa es una herramienta para MIRAR la pantalla. Lo que sale
// hacia afuera —el correo, el WhatsApp, el PDF adjunto— es la deuda entera, que
// es la única cifra que el cliente puede reconocer.
//
// ⚠️ Esto NO afecta a `/api/cxc/estado-cuenta/[codigo]`, que es lo que se MIRA
// en el cajón de documentos: ahí el filtro sigue mandando y el vendedor sigue
// viendo solo su empresa. Lo que cambia es lo que se ENVÍA.
//
// ⚠️ Boston no entra por ningún lado: `CXC_GRUPO_EMPRESA_KEYS` son las 6.
// Candado: `cxc-cobrar-manda-las-seis.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────
function empresasDelEnvio(): string[] {
  return [...CXC_GRUPO_EMPRESA_KEYS];
}

// Destinatario sugerido: override de contacto (por nombre) > email del directorio
// Switch (por código) > email de clientes_master (por código, último fallback).
async function resolveDestinatario(nombreNormalizado: string, codigo: string): Promise<string> {
  if (nombreNormalizado) {
    // 🔴 Esta ruta manda el estado de cuenta del GRUPO (acota por
    // CXC_GRUPO_EMPRESA_KEYS, ver `empresasDelEnvio` arriba), así que el
    // correo que puede pisar el del directorio es el de la cartera del GRUPO.
    // Sin la cartera, un correo cargado en Boston para un nombre que existe en
    // las dos —`CITY MALL PASO CANOA`— desviaría el estado de cuenta del grupo.
    const correo = await leerCorreoDeOverride(CARTERA_GRUPO, nombreNormalizado);
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

/**
 * El NOMBRE DE CONTACTO del cliente (la casilla nueva de la ficha), para el
 * saludo del correo. Falla abierto: sin la columna —la migración
 * `20260926120000` la corre Daniel a mano— o sin valor, se saluda como siempre.
 */
async function leerContacto(codigo: string): Promise<string> {
  const { data, error } = await supabaseServer
    .from("clientes_master")
    .select("contacto")
    .eq("codigo", codigo)
    .eq("deleted", false)
    .limit(1);
  if (error) return "";
  return ((data?.[0] as { contacto?: string | null } | undefined)?.contacto ?? "").trim();
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

  let user: CurrentUser | null;
  try {
    user = await getCurrentUser(auth.userId);
  } catch (e) {
    console.error(`[cxc/enviar-email] preview: ${(e as Error).message}`);
    return NextResponse.json(
      { error: "No se pudo cargar. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
  const empresas = empresasDelEnvio();

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
  const contacto = await leerContacto(codigo);
  const firma = buildFirma(user?.nombreCompleto ?? "Fashion Group");
  const totalDocs = result.empresas.reduce((n, e) => n + e.documentos.length, 0);

  return NextResponse.json({
    destinatario,
    asunto: defaultAsunto(empresasNombres, mes),
    cuerpo: defaultCuerpo(mes, contacto),
    firma,
    resumenHtml,
    empresasNombres,
    sharedCount: compartidoPor,
    mes,
    totalDocs,
    remitenteEmail: user?.email ?? null,
    // El estado de cuenta COMPLETO, tal cual va a salir. Viaja para que la hoja
    // «Cobrar» pueda escribir su encabezado ("al <fecha> · N empresas · $total")
    // y armar el PDF SIN una segunda consulta: es exactamente el mismo `result`
    // que esta ruta ya calculó para el resumen y los adjuntos, así que no puede
    // discrepar de lo que se manda ni por un centavo.
    estadoCuenta: result,
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
  const destinatario = str(body.destinatario);
  const asunto = str(body.asunto);
  const cuerpo = typeof body.cuerpo === "string" ? body.cuerpo : "";

  if (!codigo) return NextResponse.json({ error: "codigo requerido" }, { status: 400 });
  if (!destinatario || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destinatario)) {
    return NextResponse.json({ error: "Destinatario inválido" }, { status: 400 });
  }
  if (!asunto) return NextResponse.json({ error: "Asunto requerido" }, { status: 400 });

  // Antes del envío a propósito: si esta lectura falla, todavía no salió nada.
  let user: CurrentUser | null;
  try {
    user = await getCurrentUser(auth.userId);
  } catch (e) {
    console.error(`[cxc/enviar-email] ${(e as Error).message}`);
    return NextResponse.json(
      { error: "No se pudo enviar el correo. Intenta de nuevo." },
      { status: 500 },
    );
  }
  const empresas = empresasDelEnvio();

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
    const fila = {
      cliente_codigo: codigo,
      empresas: result.empresas.map((e) => e.empresa_key),
      destinatario,
      cc: cc ?? null,
      asunto,
      enviado_por: user?.name ?? auth.userName ?? auth.userId ?? "desconocido",
      resultado,
    };
    // `canal` distingue el correo del WhatsApp y del copiar, que desde el
    // 5-sep-2026 también dejan rastro (ver `/api/cxc/envios`). Si la DDL
    // 20260927120000 todavía no corrió, se guarda igual SIN canal: perder la
    // anotación de un correo que ya salió sería peor que perder la marca gris.
    let logErr = (await supabaseServer.from("cxc_emails_enviados").insert({ ...fila, canal: "correo" })).error;
    if (logErr && /\bcanal\b/i.test(logErr.message ?? "")) {
      logErr = (await supabaseServer.from("cxc_emails_enviados").insert(fila)).error;
    }
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
