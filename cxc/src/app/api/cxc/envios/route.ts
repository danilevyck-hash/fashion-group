// ─────────────────────────────────────────────────────────────────────────────
// GET/POST /api/cxc/envios — el RASTRO de lo que se le mandó a cada cliente.
//
//   GET  → { porCodigo: { "D-25": { canal, fecha } } }
//          El ÚLTIMO envío de cada cliente dentro de la ventana de 7 días. Es
//          lo que pinta la marca gris «Le enviaste el estado de cuenta hace 3
//          días» / «Copiaste el mensaje hace 3 días».
//   POST { codigo, canal, destinatario? } → deja la anotación.
//
// 🩸 POR QUÉ EXISTE (5-sep-2026). `cxc_emails_enviados` solo guardaba el
// CORREO: **19 filas en toda su historia, todas entre el 9 y el 14 de julio de
// 2026**. WhatsApp y «copiar el mensaje» —que es como se cobra de verdad— no
// dejaban ni una, así que nadie podía saber si a ese cliente ya le habían
// escrito ayer, y dos personas le mandaban el mismo estado de cuenta el mismo
// día.
//
// 🔴 EL CORREO NO SE REGISTRA ACÁ. Lo sigue anotando `/api/cxc/enviar-email`
// después de que Resend confirma, que es el único lugar que sabe si salió de
// verdad. Esta ruta anota lo que el navegador hace y el servidor no ve:
// abrir WhatsApp y copiar al portapapeles.
//
// 🔴 ES SOLO EL CXC DEL GRUPO. Boston no pasa por esta pantalla y no tiene
// códigos D-XXX; nada acá lee ni escribe su cartera.
//
// ⚠️ La columna `canal` puede NO EXISTIR todavía (migración
// 20260927120000_cxc_envios_canal.sql, la corre Daniel a mano). Las dos puntas
// FALLAN ABIERTO: sin la columna, el POST guarda la fila igual (sin canal) y el
// GET devuelve el mapa vacío → la marca gris no se dibuja y nada más cambia.
// Nunca se pierde un envío por una DDL que todavía no corrió.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { esCanalEnvio, VENTANA_MARCA_DIAS, type CanalEnvio } from "@/lib/cxc/envios-registro";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Los MISMOS roles que ven el CXC del grupo. Daniel: cobrar lo puede hacer
// todo el que entra al módulo — no se agrega una restricción nueva.
const CXC_ROLES = ["admin", "secretaria", "vendedor"];

/** ¿El error de PostgREST es «todavía no existe la columna `canal`»? */
function faltaColumnaCanal(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = err.message ?? "";
  if (!/\bcanal\b/i.test(msg)) return false;
  return /does not exist|schema cache|could not find/i.test(msg) ||
    err.code === "42703" || err.code === "PGRST204";
}

interface UltimoEnvio {
  canal: CanalEnvio;
  /** `YYYY-MM-DD` del envío. */
  fecha: string;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, CXC_ROLES);
  if (auth instanceof NextResponse) return auth;

  // Solo la ventana que se dibuja. Sin este corte la lectura crecería con cada
  // cobro y traería años de historia para pintar una marca de 7 días.
  const desde = new Date(Date.now() - (VENTANA_MARCA_DIAS + 1) * 86_400_000).toISOString();

  const { data, error } = await supabaseServer
    .from("cxc_emails_enviados")
    .select("cliente_codigo, canal, created_at")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    // Falla abierto: la marca es una ayuda, no un número de plata.
    if (!faltaColumnaCanal(error)) {
      console.error(`[cxc/envios] ${error.message}`);
    }
    return NextResponse.json({ porCodigo: {} });
  }

  // Primero el más reciente por el `order`, así que el primero que se ve de
  // cada código es el último envío. No se pisa después.
  const porCodigo: Record<string, UltimoEnvio> = {};
  for (const fila of data ?? []) {
    const codigo = ((fila as { cliente_codigo: string | null }).cliente_codigo ?? "").trim();
    if (!codigo || porCodigo[codigo]) continue;
    const canal = (fila as { canal?: unknown }).canal;
    if (!esCanalEnvio(canal)) continue;
    const creado = (fila as { created_at: string }).created_at;
    porCodigo[codigo] = { canal, fecha: String(creado).slice(0, 10) };
  }
  return NextResponse.json({ porCodigo });
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, CXC_ROLES);
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const codigo = str(body.codigo);
  const canal = body.canal;
  if (!codigo) return NextResponse.json({ error: "codigo requerido" }, { status: 400 });
  if (!esCanalEnvio(canal)) return NextResponse.json({ error: "canal inválido" }, { status: 400 });
  // 🔴 El correo NO entra por acá: lo anota `/api/cxc/enviar-email` cuando
  // Resend confirma. Aceptarlo acá sería anotar un envío que puede no haber
  // salido.
  if (canal === "correo") {
    return NextResponse.json({ error: "el correo se registra al enviarlo" }, { status: 400 });
  }

  const empresas = Array.isArray(body.empresas)
    ? (body.empresas as unknown[]).filter((e): e is string => typeof e === "string")
    : [];

  // `destinatario` es NOT NULL en la tabla y un «copiar» no tiene a quién: va
  // cadena vacía. No se relaja la restricción por un caso nuevo.
  const fila = {
    cliente_codigo: codigo,
    empresas,
    destinatario: str(body.destinatario),
    cc: null,
    asunto: str(body.asunto) || "Estado de cuenta",
    enviado_por: auth.userName ?? auth.userId ?? "desconocido",
    resultado: "ok",
  };

  let { error } = await supabaseServer
    .from("cxc_emails_enviados")
    .insert({ ...fila, canal });

  // La DDL todavía no corrió: se guarda igual, sin canal. Perder la anotación
  // sería peor que perder la marca gris.
  if (faltaColumnaCanal(error)) {
    ({ error } = await supabaseServer.from("cxc_emails_enviados").insert(fila));
    if (!error) return NextResponse.json({ ok: true, canalGuardado: false });
  }

  if (error) {
    console.error(`[cxc/envios] insert: ${error.message}`);
    return NextResponse.json({ error: "No se pudo registrar el envío" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, canalGuardado: true });
}
