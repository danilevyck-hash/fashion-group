// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cxc/cobrar-lote — mandarle el estado de cuenta a VARIOS clientes.
//
//   { codigos: ["D-25", "D-29", …] } → agrupa por DIRECCIÓN y manda un correo
//   por cada una, con UN PDF que trae una hoja por cliente y el total al final.
//
// 🔴 UN CORREO POR DIRECCIÓN, NO POR CLIENTE. Medido el 5-sep-2026 sobre los
// 100 clientes con saldo: 79 tienen correo, y 31 de ellos comparten 9
// direcciones → salen **57 correos, no 79**. `oficina@citymoda.store` lo
// comparten **13 clientes** que deben $402.376,67 entre todos, y
// `contabilidad@citymall.com.pa` los dos City Mall ($480.784,72). Mandar uno
// por cliente le pone trece mensajes en la bandeja a la misma persona el mismo
// minuto, cada uno con un pedazo del saldo.
//
// 🔴 LOS QUE NO TIENEN CORREO NO ABORTAN EL LOTE: se manda a los que se puede y
// se devuelven POR NOMBRE los que quedaron fuera, para decirlo en pantalla.
// Cancelar 57 correos porque 21 clientes no tienen dirección es castigar al que
// sí la tiene.
//
// 🔴 LO QUE SALE SON SIEMPRE LAS 6 EMPRESAS DEL GRUPO, sin importar el filtro
// de la pantalla — la misma regla que el envío de a uno. Daniel: *«todo»*.
// Boston no entra por ningún lado.
//
// ⚠️ La agrupación por dirección se hace ACÁ, en el servidor, no en el
// navegador: el navegador la calcula para MOSTRARLA en la barra, pero quien
// decide a quién se le escribe es esta ruta.
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
} from "@/lib/cxc/estado-cuenta-email";
import { buildEstadoCuentaLotePDF, type ClienteDelLote } from "@/lib/pdf-estado-cuenta";
import { agruparPorCorreo, normalizarCorreo, type DestinoCliente } from "@/lib/cxc/correos-lote";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const CXC_ROLES = ["admin", "secretaria", "vendedor"];

/** Tope de clientes por lote. No es una regla de negocio: es el techo de la
 *  función serverless. Con más, se pide dividir en dos tandas. */
const MAX_POR_LOTE = 40;

interface ClienteResuelto {
  codigo: string;
  nombre: string;
  nombreNormalizado: string;
  correo: string;
  total: number;
}

/** El correo del cliente: nota de la cartera del GRUPO > directorio Switch >
 *  maestro. Mismo orden que el envío de a uno. */
async function correoDe(codigo: string, nombreNormalizado: string): Promise<string> {
  if (nombreNormalizado) {
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
  const { data: cm } = await supabaseServer
    .from("clientes_master")
    .select("email")
    .eq("codigo", codigo)
    .eq("deleted", false)
    .not("email", "is", null)
    .limit(1);
  return ((cm?.[0]?.email as string | null) ?? "").trim();
}

/** El nombre de contacto del cliente, para el saludo. Falla abierto. */
async function contactoDe(codigo: string): Promise<string> {
  const { data, error } = await supabaseServer
    .from("clientes_master")
    .select("contacto")
    .eq("codigo", codigo)
    .eq("deleted", false)
    .limit(1);
  if (error) return "";
  return ((data?.[0] as { contacto?: string | null } | undefined)?.contacto ?? "").trim();
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

  const entrada = Array.isArray(body.clientes) ? (body.clientes as unknown[]) : [];
  if (entrada.length === 0) return NextResponse.json({ error: "No hay clientes seleccionados" }, { status: 400 });
  if (entrada.length > MAX_POR_LOTE) {
    return NextResponse.json(
      { error: `Son demasiados de una vez. Manda hasta ${MAX_POR_LOTE} clientes por tanda.` },
      { status: 400 },
    );
  }

  const { data: usuario } = await supabaseServer
    .from("fg_users")
    .select("name, nombre_completo, email")
    .eq("id", auth.userId ?? "")
    .maybeSingle();
  const firma = buildFirma(((usuario?.nombre_completo as string | null) ?? usuario?.name ?? "Fashion Group").trim());
  const cc = ((usuario?.email as string | null) ?? "").trim() || undefined;
  const mes = mesLabel();
  const empresas = [...CXC_GRUPO_EMPRESA_KEYS];

  // 1. Resolver correo y saldo de cada cliente.
  const resueltos: ClienteResuelto[] = [];
  for (const raw of entrada) {
    const c = raw as Record<string, unknown>;
    const codigo = typeof c.codigo === "string" ? c.codigo.trim() : "";
    if (!codigo) continue;
    const nombre = (typeof c.nombre === "string" ? c.nombre.trim() : "") || codigo;
    const nombreNormalizado = typeof c.nombreNormalizado === "string" ? c.nombreNormalizado.trim() : "";
    resueltos.push({
      codigo,
      nombre,
      nombreNormalizado,
      correo: normalizarCorreo(await correoDe(codigo, nombreNormalizado)),
      total: 0,
    });
  }

  const destinos: DestinoCliente[] = resueltos.map((r) => ({
    codigo: r.codigo,
    nombre: r.nombre,
    correo: r.correo,
    total: r.total,
  }));
  const lote = agruparPorCorreo(destinos);

  // 2. Un correo por DIRECCIÓN.
  const enviados: string[] = [];
  const fallaron: string[] = [];
  for (const envio of lote.envios) {
    const cuentas: { data: EstadoCuentaResult; nombre: string }[] = [];
    const empresasNombres = new Set<string>();
    for (const c of envio.clientes) {
      if (!c.codigo) continue;
      const info = resueltos.find((r) => r.codigo === c.codigo);
      const data = await fetchEstadoCuentaData(c.codigo, empresas);
      if (data.empresas.length === 0) continue; // sin saldo: no se le escribe
      cuentas.push({ data, nombre: info?.nombre ?? c.nombre });
      for (const e of data.empresas) empresasNombres.add(e.empresa_nombre);
    }
    if (cuentas.length === 0) continue;

    const clientesPdf: ClienteDelLote[] = cuentas.map((c) => ({ data: c.data, nombre: c.nombre }));
    const resumenHtml = cuentas
      .map((c) => buildResumenHtml(c.data.empresas, c.nombre))
      .join("");
    // El saludo lleva el nombre del contacto SOLO cuando el correo va a UN
    // cliente: en una dirección compartida por trece no hay una persona a quien
    // saludar, y elegir a uno de los trece sería peor que no saludar a nadie.
    const contactoDelEnvio = cuentas.length === 1 ? await contactoDe(cuentas[0].data.codigo) : "";
    const html = composeEmailHtml({ cuerpo: defaultCuerpo(mes, contactoDelEnvio), resumenHtml, firma });
    const { doc, filename } = buildEstadoCuentaLotePDF(clientesPdf);
    const base64 = Buffer.from(doc.output("arraybuffer")).toString("base64");

    const payload: Record<string, unknown> = {
      from: "Fashion Group <cobros@fashiongr.com>",
      to: [envio.correo],
      subject: defaultAsunto([...empresasNombres], mes),
      html,
      attachments: [{ filename, content: base64 }],
    };
    if (cc) { payload.cc = [cc]; payload.reply_to = cc; }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
      enviados.push(envio.correo);
      // Bitácora — best-effort, una fila por cliente. Es lo que después pinta
      // la marca «Le enviaste el estado de cuenta hace N días».
      for (const c of cuentas) {
        const fila = {
          cliente_codigo: c.data.codigo,
          empresas: c.data.empresas.map((e) => e.empresa_key),
          destinatario: envio.correo,
          cc: cc ?? null,
          asunto: String(payload.subject),
          enviado_por: (usuario?.name as string | null) ?? auth.userName ?? auth.userId ?? "desconocido",
          resultado: "ok",
        };
        let err = (await supabaseServer.from("cxc_emails_enviados").insert({ ...fila, canal: "correo" })).error;
        if (err && /\bcanal\b/i.test(err.message ?? "")) {
          err = (await supabaseServer.from("cxc_emails_enviados").insert(fila)).error;
        }
        if (err) console.error(`[cxc/cobrar-lote] bitácora ${c.data.codigo}: ${err.message}`);
      }
    } catch (e) {
      console.error(`[cxc/cobrar-lote] ${envio.correo}: ${(e as Error).message}`);
      fallaron.push(envio.correo);
    }
  }

  return NextResponse.json({
    correosEnviados: enviados.length,
    correosFallidos: fallaron.length,
    // Los que quedaron fuera se dicen POR NOMBRE, no como un número.
    sinCorreo: lote.sinCorreo.map((c) => c.nombre),
  });
}
