// ─────────────────────────────────────────────────────────────────────────────
// POST /api/comisiones/mandar — la «9r» (25-sep-2026).
//
// Dos salidas, una ruta:
//   · `canal: "correo"` → manda el papel ADJUNTO por Resend, desde
//     `notificaciones@fashiongr.com`.
//   · `canal: "link"`   → sube el papel al cajón privado `comisiones-papeles`
//     y devuelve una dirección firmada por **30 días**, el mismo plazo y el
//     mismo mecanismo que los ZIP de Marketing.
//
// 🔴 EL PDF LO ARMA LA PANTALLA Y VIAJA EN BYTES. Es EXACTAMENTE el mismo papel
// que baja «Descargar» (`construirPdfComision`): no hay un segundo generador ni
// una segunda definición de las columnas. Acá no se calcula ni un número.
//
// 🔴 FALLA CERRADA EN LO QUE MANDA Y ABIERTA EN LO QUE NO. Sin llave de Resend
// el correo no sale y se dice; sin el cajón de Storage el link no se arma y se
// dice — nunca se devuelve una dirección rota.
//
// Queda rastro en `activity_logs`, como las descargas del módulo.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { NextResponse as _NR } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { anotarConfigComision } from "@/lib/comisiones/rastro-server";
import {
  CAJON_PAPELES,
  REMITENTE_COMISIONES,
  TTL_LINK_SEGUNDOS,
  asuntoDelCorreo,
  cuerpoDelCorreo,
  pathDelPapel,
} from "@/lib/comisiones/mandar";
import { ACCION_MANDAR_CORREO, ACCION_MANDAR_LINK } from "@/lib/comisiones/rastro";

export const dynamic = "force-dynamic";

/** 🔑 Quien puede ver la comisión puede mandarla: los mismos tres roles. */
const ROLES = ["admin", "contabilidad", "secretaria"];

interface Cuerpo {
  canal: "correo" | "link";
  vendedor: string;
  empresa: string;
  periodo: string;
  year: number;
  mes: number;
  /** El PDF, en base64, tal como lo arma la pantalla. */
  pdf: string;
  nombreArchivo: string;
  /** Solo para el correo. El sistema no guarda el correo de ningún vendedor. */
  destinatario?: string;
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ROLES);
  if (auth instanceof _NR) return auth;

  let cuerpo: Cuerpo;
  try {
    cuerpo = (await req.json()) as Cuerpo;
  } catch {
    return NextResponse.json({ ok: false, error: "No se entendió lo que llegó." }, { status: 400 });
  }

  const { canal, vendedor, empresa, periodo, year, mes, pdf, nombreArchivo, destinatario } = cuerpo ?? {};
  if (!pdf || !vendedor || !periodo || (canal !== "correo" && canal !== "link")) {
    return NextResponse.json({ ok: false, error: "Falta algo para poder mandarlo." }, { status: 400 });
  }


  // ── El link ────────────────────────────────────────────────────────────────
  if (canal === "link") {
    const path = pathDelPapel(year, mes, vendedor, empresa, new Date().toISOString());
    const bytes = Buffer.from(pdf, "base64");
    const { error: subirError } = await supabaseServer.storage
      .from(CAJON_PAPELES)
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (subirError) {
      // 🔴 Sin el cajón no se inventa una dirección: se dice que no se pudo.
      console.error("[comisiones/mandar] storage:", subirError.message);
      return NextResponse.json(
        { ok: false, error: "No se pudo guardar el papel para armar el enlace." },
        { status: 503 },
      );
    }
    const { data, error } = await supabaseServer.storage
      .from(CAJON_PAPELES)
      .createSignedUrl(path, TTL_LINK_SEGUNDOS);
    if (error || !data?.signedUrl) {
      console.error("[comisiones/mandar] firmar:", error?.message);
      return NextResponse.json({ ok: false, error: "No se pudo armar el enlace." }, { status: 503 });
    }
    await anotarConfigComision(auth, ACCION_MANDAR_LINK, { vendedor, empresa, year, mes });
    return NextResponse.json({ ok: true, link: data.signedUrl });
  }

  // ── El correo ──────────────────────────────────────────────────────────────
  const para = (destinatario ?? "").trim();
  if (!para || !para.includes("@")) {
    return NextResponse.json({ ok: false, error: "Falta el correo de esa persona." }, { status: 400 });
  }
  const llave = process.env.RESEND_API_KEY;
  if (!llave) {
    return NextResponse.json({ ok: false, error: "El correo no está configurado." }, { status: 503 });
  }

  const texto = cuerpoDelCorreo(vendedor, periodo);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${llave}` },
    body: JSON.stringify({
      from: REMITENTE_COMISIONES,
      to: [para],
      subject: asuntoDelCorreo(vendedor, periodo),
      html: texto.split("\n").map((l) => (l ? `<p>${l}</p>` : "<br/>")).join(""),
      attachments: [{ filename: `${nombreArchivo || "comision"}.pdf`, content: pdf }],
    }),
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    console.error("[comisiones/mandar] resend:", res.status, detalle);
    return NextResponse.json({ ok: false, error: "No se pudo mandar el correo." }, { status: 502 });
  }

  // 🔴 Se anota DESPUÉS de que el correo salió, nunca antes.
  await anotarConfigComision(auth, ACCION_MANDAR_CORREO, { vendedor, empresa, year, mes, destinatario: para });
  return NextResponse.json({ ok: true });
}
