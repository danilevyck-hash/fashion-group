// ─────────────────────────────────────────────────────────────────────────────
// EL CORREO DE COBRO DE CONFECCIONES BOSTON — SU PROPIA RUTA (9-sep-2026).
//
//   GET  ?codigo=<codigo>  → lo que la hoja «Cobrar» necesita para mandar de un
//                            clic: a quién, con qué asunto y cuerpo, cuántos
//                            documentos van y la marca del último envío.
//   POST { codigo, destinatario, asunto, cuerpo } → manda el correo con su PDF
//                            adjunto y ANOTA el envío cuando Resend confirma.
//
// 🔴 ES UNA RUTA APARTE, NO UN PARÁMETRO EN LA DEL GRUPO. `/api/cxc/enviar-email`
// manda SIEMPRE las 6 empresas del grupo (`empresasDelEnvio()`); agregarle una
// puerta para Boston es exactamente la mezcla que esta casa tiene prohibida.
// Regla de Daniel: *«debe de ser cxc de fashion group y otro aparte de boston,
// no deben de ni convivir juntos»*.
//
// 🔴 LO FIRMA CONFECCIONES BOSTON — Daniel, textual: *«Firma Confecciones
// Boston»*. El remitente, el membrete, la firma y el papel adjunto salen de
// `casa-del-papel.ts`; en ninguna parte de lo que recibe el cliente dice Fashion
// Group. Candado: `boston-correo-lo-firma-boston.test.ts`.
//
// 🔴 EL ENVÍO SE ANOTA DESPUÉS DE QUE RESEND CONFIRMA, nunca antes: anotar antes
// dejaría la marca gris puesta por un correo que no salió.
//
// 🔴 LA ANOTACIÓN DICE DE QUÉ CARTERA ES (`empresas: ["confecciones_boston"]`).
// Medido el 9-sep-2026: hay UN código que existe en las dos carteras (`TCKCTA`,
// el mostrador). Sin ese dato, un envío de Boston pintaría su marca en el CXC
// del grupo — que es «un badge», y los badges también están prohibidos.
//
// ⚠️ Quién entra: `ROLES_BOSTON` = admin + gerente_boston (David). Secretaria y
// vendedor no ven esta cartera y esta ruta les contesta 403.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { rolesBoston } from "@/lib/cxc/boston-roles";
import { CASA_BOSTON } from "@/lib/cxc/casa-del-papel";
import {
  EMPRESA_BOSTON,
  fetchEstadoCuentaBoston,
  leerContactoBoston,
} from "@/lib/cxc/boston-estado-cuenta";
import {
  asuntoBoston,
  composeCorreoBoston,
  cuerpoBoston,
  firmaBoston,
  mesLabel,
  resumenBoston,
} from "@/lib/cxc/boston-correo";
import { sanitizeFilenamePart } from "@/lib/cxc/estado-cuenta-email";
import { diasDesdeEnvio, esCanalEnvio, textoUltimoEnvio, VENTANA_MARCA_DIAS } from "@/lib/cxc/envios-registro";
import { buildEstadoCuentaPDF } from "@/lib/pdf-estado-cuenta";
import type { EstadoCuenta } from "@/lib/cxc/estado-cuenta-tipos";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

interface Remitente {
  name: string;
  nombreCompleto: string;
  email: string | null;
}

/** Quién manda: de acá salen la FIRMA, el `cc` y el `reply_to`. */
async function leerRemitente(userId: string | undefined): Promise<Remitente | null> {
  if (!userId) return null;
  const { data, error } = await supabaseServer
    .from("fg_users")
    .select("name, nombre_completo, email")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`fg_users: ${error.message}`);
  if (!data) return null;
  return {
    name: data.name as string,
    nombreCompleto: ((data.nombre_completo as string | null)?.trim() || (data.name as string)),
    email: (data.email as string | null)?.trim() || null,
  };
}

/**
 * El correo del cliente. 🔴 SALE DE `switch_clientes` ACOTADO A BOSTON — nunca
 * de `clientes_master`, que es el directorio del GRUPO. Medido el 9-sep-2026:
 * de los 398 clientes con saldo, 119 tienen correo y 284 teléfono.
 */
async function correoDelCliente(codigo: string): Promise<string> {
  const { data, error } = await supabaseServer
    .from("switch_clientes")
    .select("email")
    .eq("empresa_key", EMPRESA_BOSTON)
    .eq("codigo", codigo)
    .not("email", "is", null)
    .limit(1);
  if (error) return "";
  return ((data?.[0]?.email as string | null) ?? "").trim();
}

/** «Le enviaste el estado de cuenta hace 3 días» — SOLO envíos de esta cartera. */
async function marcaDelUltimoEnvio(codigo: string): Promise<string | null> {
  const desde = new Date(Date.now() - (VENTANA_MARCA_DIAS + 1) * 86_400_000).toISOString();
  const { data, error } = await supabaseServer
    .from("cxc_emails_enviados")
    .select("canal, created_at, empresas")
    .eq("cliente_codigo", codigo)
    .contains("empresas", [EMPRESA_BOSTON])
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(1);
  // Falla abierto: la marca es una ayuda, no un número de plata.
  if (error || !data?.length) return null;
  const fila = data[0] as { canal?: unknown; created_at: string };
  if (!esCanalEnvio(fila.canal)) return null;
  const hoy = new Date().toISOString().slice(0, 10);
  return textoUltimoEnvio(fila.canal, diasDesdeEnvio(String(fila.created_at).slice(0, 10), hoy));
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, rolesBoston());
  if (auth instanceof NextResponse) return auth;

  const codigo = (req.nextUrl.searchParams.get("codigo") ?? "").trim();
  if (!codigo) return NextResponse.json({ error: "codigo requerido" }, { status: 400 });

  let estadoCuenta: EstadoCuenta;
  try {
    estadoCuenta = await fetchEstadoCuentaBoston(codigo);
  } catch (e) {
    console.error(`[cxc/boston/enviar-email] preview: ${(e as Error).message}`);
    return NextResponse.json(
      { error: "No se pudo preparar el estado de cuenta. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }

  const mes = mesLabel();
  const [destinatario, contacto, marcaEnvio] = await Promise.all([
    correoDelCliente(codigo),
    leerContactoBoston(codigo),
    marcaDelUltimoEnvio(codigo),
  ]);
  const totalDocs = estadoCuenta.empresas.reduce((n, e) => n + e.documentos.length, 0);

  // ⚠️ El estado de cuenta NO viaja al navegador: la hoja de Boston no dibuja
  // el PDF —lo arma el POST, del lado del servidor— así que mandarle los
  // documentos sería sacar la cartera de Boston a la pantalla sin que nadie la
  // mire.
  return NextResponse.json({
    destinatario,
    asunto: asuntoBoston(mes),
    cuerpo: cuerpoBoston(mes, contacto),
    totalDocs,
    mes,
    marcaEnvio,
  });
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, rolesBoston());
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
  const destinatario = str(body.destinatario);
  const asunto = str(body.asunto);
  const cuerpo = typeof body.cuerpo === "string" ? body.cuerpo : "";

  if (!codigo) return NextResponse.json({ error: "codigo requerido" }, { status: 400 });
  if (!destinatario || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destinatario)) {
    return NextResponse.json({ error: "Destinatario inválido" }, { status: 400 });
  }
  if (!asunto) return NextResponse.json({ error: "Asunto requerido" }, { status: 400 });

  // Antes del envío a propósito: si esta lectura falla, todavía no salió nada.
  let remitente: Remitente | null;
  try {
    remitente = await leerRemitente(auth.userId);
  } catch (e) {
    console.error(`[cxc/boston/enviar-email] ${(e as Error).message}`);
    return NextResponse.json({ error: "No se pudo enviar el correo. Intenta de nuevo." }, { status: 500 });
  }

  let estadoCuenta: EstadoCuenta;
  try {
    estadoCuenta = await fetchEstadoCuentaBoston(codigo);
  } catch (e) {
    console.error(`[cxc/boston/enviar-email] ${(e as Error).message}`);
    return NextResponse.json({ error: "Error al leer el estado de cuenta" }, { status: 500 });
  }

  const empresa = estadoCuenta.empresas[0];
  if (!empresa || empresa.documentos.length === 0) {
    return NextResponse.json({ error: "Este cliente no tiene documentos con saldo." }, { status: 400 });
  }

  const mes = mesLabel();
  const nombre = estadoCuenta.clienteNombre || codigo;
  const html = composeCorreoBoston({
    cuerpo,
    resumenHtml: resumenBoston(empresa.documentos, nombre),
    firma: firmaBoston(remitente?.nombreCompleto ?? ""),
  });

  // 🔴 UN SOLO PDF: Boston es UNA compañía, así que no hay desglose por empresa.
  // Es el MISMO papel del grupo (`buildEstadoCuentaPDF`, la forma de Switch) y
  // sale firmado por Boston porque la casa se deriva de su `empresa_key`.
  const { doc } = buildEstadoCuentaPDF(estadoCuenta, nombre);
  const adjunto = {
    filename: `${sanitizeFilenamePart(`Estado de cuenta — ${CASA_BOSTON.nombre} — ${nombre} — ${mes}`)}.pdf`,
    content: Buffer.from(doc.output("arraybuffer")).toString("base64"),
  };

  const cc = remitente?.email || undefined;
  const payload: Record<string, unknown> = {
    from: CASA_BOSTON.remitente,
    to: [destinatario],
    subject: asunto,
    html,
    attachments: [adjunto],
  };
  if (cc) {
    payload.cc = [cc];
    payload.reply_to = cc;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[cxc/boston/enviar-email] Resend: ${err?.message ?? res.status}`);
      return NextResponse.json({ error: "No se pudo enviar el correo. Intenta de nuevo." }, { status: 500 });
    }
  } catch (e) {
    console.error(`[cxc/boston/enviar-email] ${(e as Error).message}`);
    return NextResponse.json({ error: "No se pudo enviar el correo. Intenta de nuevo." }, { status: 500 });
  }

  // ── El rastro. Recién ACÁ, con el correo ya confirmado por Resend. ──────────
  // Best-effort: el correo YA salió, así que un insert que falla se loguea y no
  // devuelve 500.
  let logged = true;
  try {
    const fila = {
      cliente_codigo: codigo,
      // 🔴 De qué CARTERA es este envío. Es lo que impide que la marca aparezca
      // en el CXC del grupo para un código que existe en las dos.
      empresas: [EMPRESA_BOSTON],
      destinatario,
      cc: cc ?? null,
      asunto,
      enviado_por: remitente?.name ?? auth.userName ?? auth.userId ?? "desconocido",
      resultado: "ok",
    };
    let logErr = (await supabaseServer.from("cxc_emails_enviados").insert({ ...fila, canal: "correo" })).error;
    // Mientras la DDL 20260927120000 no corra se guarda igual, sin canal:
    // perder la anotación de un correo que ya salió es peor que perder la marca.
    if (logErr && /\bcanal\b/i.test(logErr.message ?? "")) {
      logErr = (await supabaseServer.from("cxc_emails_enviados").insert(fila)).error;
    }
    if (logErr) {
      logged = false;
      console.error(`[cxc/boston/enviar-email] bitácora: ${logErr.message}`);
    }
  } catch (e) {
    logged = false;
    console.error(`[cxc/boston/enviar-email] bitácora: ${(e as Error).message}`);
  }

  return NextResponse.json({ ok: true, logged });
}
