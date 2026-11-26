// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/estado-cuenta-semanal — el estado de cuenta a cada cliente con
// saldo, CADA LUNES a las 13:00 UTC = 8:00 a. m. de Panamá (26-nov-2026, Daniel).
//
// Lo puro (quién entra, la semana, textos): `lib/cxc/estado-cuenta-automatico.ts`.
// El papel es el MISMO del botón «Estado de cuenta» (`fetchEstadoCuentaData` +
// `buildEstadoCuentaPDF`, un PDF por empresa) y el correo, el mismo armado
// (`composeEmailHtml`). Sale de info@fashiongr.com, responde a info@, sin copia.
//
// 🔴 No toca Switch: lee la cartera ya cargada (`switch_estadocuenta_aging_mv`).
// 🔴 A lo sumo una vez por (cliente, semana): la fila se RESERVA antes de mandar
// (UNIQUE en `cxc_estado_cuenta_automatico`) y Resend recibe además una
// `Idempotency-Key` con la misma llave. Un 'error' (Resend dijo que no) se
// reintenta si el cron se vuelve a correr la misma semana.
//
// Parámetros (solo con CRON_SECRET):
//   ?test=true            no manda nada ni escribe: dice qué saldría.
//   ?prueba=<correo>      manda TODO a ese único correo (asunto «[PRUEBA]»),
//                         sin reservar, sin bitácora y sin Telegram.
//   ?codigos=D-24,D-25    solo esos clientes (con test o prueba).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { enviarNegocioPrivado, enviarSistema } from "@/lib/alertas/canal";
import { hoyPanama } from "@/lib/fecha-panama";
import { fmtDate } from "@/lib/format";
import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { fetchEstadoCuentaData, type EstadoCuentaResult } from "@/lib/cxc/estado-cuenta-data";
import {
  buildCuentasHtml,
  buildFirma,
  buildResumenHtml,
  composeEmailHtml,
  escapeHtml,
  mesLabel,
  sanitizeFilenamePart,
} from "@/lib/cxc/estado-cuenta-email";
import { buildEstadoCuentaPDF } from "@/lib/pdf-estado-cuenta";
import { CXC_PDF_UN_SOLO_NOMBRE } from "@/lib/ui/revision-110-cxc";
import { contactoDelCliente, correoDelCliente } from "@/lib/cxc/correo-del-cliente";
import {
  ESTADO_CUENTA_AUTOMATICO_2026_11,
  FIRMA_AUTOMATICO,
  REMITENTE_AUTOMATICO,
  RESPONDER_A_AUTOMATICO,
  asuntoAutomatico,
  cuerpoAutomatico,
  direccionesValidas,
  lunesDeLaSemana,
  mensajeDelLunes,
  seleccionarClientes,
  type ClienteDelLunes,
  type FilaCartera,
  type ResumenCorrida,
} from "@/lib/cxc/estado-cuenta-automatico";

const CRON_NAME = "estado-cuenta-semanal";
const TABLA = "cxc_estado_cuenta_automatico";

export const dynamic = "force-dynamic";
export const maxDuration = 800; // techo del plan (Pro + Fluid)

/** Deja de tomar clientes nuevos pasado esto; los que falten se dicen. */
const PRESUPUESTO_MS = 650_000;
/** Resend admite 10 por segundo en esta cuenta (medido 26-nov-2026): 4 por segundo. */
const PAUSA_ENTRE_CORREOS_MS = 250;
/** Tope del correo YA codificado de Resend (40 MB), con aire. */
const TOPE_ADJUNTOS_BASE64 = 38 * 1024 * 1024;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Adjunto {
  filename: string;
  content: string;
}

/** Un PDF por empresa — el mismo armado que `/api/cxc/enviar-email`. */
function adjuntosDe(result: EstadoCuentaResult, nombre: string, mes: string): Adjunto[] {
  const varias = result.empresas.length > 1;
  return result.empresas.map((emp) => {
    const { doc, filename: nombreDescarga } = buildEstadoCuentaPDF(
      { ...result, empresas: [emp], total: emp.subtotal },
      nombre,
      { unaEmpresaElegida: varias },
    );
    const filename = CXC_PDF_UN_SOLO_NOMBRE
      ? nombreDescarga
      : `${sanitizeFilenamePart(`Estado de cuenta - ${nombre} - ${emp.empresa_nombre} - ${mes}`)}.pdf`;
    return { filename, content: Buffer.from(doc.output("arraybuffer")).toString("base64") };
  });
}

async function leerCartera(): Promise<FilaCartera[]> {
  const filas = await leerTodoPaginado<{
    codigo: string | null;
    company_key: string;
    total: number | string | null;
    nombre: string | null;
    nombre_normalized: string | null;
  }>("switch_estadocuenta_aging_mv (estado de cuenta semanal)", (pedirCount, desde, hasta) =>
    supabaseServer
      .from("switch_estadocuenta_aging_mv")
      .select("id, codigo, company_key, total, nombre, nombre_normalized", pedirCount ? { count: "exact" } : {})
      .in("company_key", [...CXC_GRUPO_EMPRESA_KEYS])
      .gt("total", 0)
      .order("company_key", { ascending: true })
      .order("codigo", { ascending: true })
      .order("id", { ascending: true })
      .range(desde, hasta),
  );
  return filas.map((f) => ({
    codigo: f.codigo,
    empresa: f.company_key,
    total: f.total,
    nombre: f.nombre,
    nombreNormalizado: f.nombre_normalized,
  }));
}

/**
 * Reserva (cliente, semana). `true` = este proceso manda; `false` = ya lo tomó
 * otro o ya salió. Un 'error' anterior se vuelve a tomar.
 */
async function reservar(c: ClienteDelLunes, semana: string): Promise<boolean> {
  const ins = await supabaseServer
    .from(TABLA)
    .insert({ cliente_codigo: c.codigo, semana, estado: "enviando", cliente_nombre: c.nombre, empresas: c.empresas, saldo: c.saldo });
  if (!ins.error) return true;
  if (ins.error.code !== "23505") throw new Error(`${TABLA}: ${ins.error.message}`);
  const upd = await supabaseServer
    .from(TABLA)
    .update({ estado: "enviando", updated_at: new Date().toISOString() })
    .eq("cliente_codigo", c.codigo)
    .eq("semana", semana)
    .eq("estado", "error")
    .select("id");
  if (upd.error) throw new Error(`${TABLA}: ${upd.error.message}`);
  return (upd.data ?? []).length > 0;
}

async function anotar(codigo: string, semana: string, campos: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseServer
    .from(TABLA)
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("cliente_codigo", codigo)
    .eq("semana", semana);
  if (error) console.error(`[${CRON_NAME}] anotar ${codigo}: ${error.message}`);
}

async function mandarPorResend(
  key: string,
  payload: Record<string, unknown>,
  idempotencia: string | null,
): Promise<{ ok: true; id: string } | { ok: false; motivo: string }> {
  for (let intento = 0; intento < 3; intento += 1) {
    const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
    if (idempotencia) headers["Idempotency-Key"] = idempotencia;
    try {
      const res = await fetch("https://api.resend.com/emails", { method: "POST", headers, body: JSON.stringify(payload) });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (res.ok && body.id) return { ok: true, id: body.id };
      if (res.status === 429 && intento < 2) {
        await dormir(1500);
        continue;
      }
      return { ok: false, motivo: `${res.status} ${body.message ?? ""}`.trim() };
    } catch (e) {
      if (intento < 2) {
        await dormir(1500);
        continue;
      }
      return { ok: false, motivo: (e as Error).message };
    }
  }
  return { ok: false, motivo: "sin respuesta" };
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const test = sp.get("test") === "true";
  const pruebaCrudo = (sp.get("prueba") ?? "").trim();
  const prueba = pruebaCrudo ? direccionesValidas(pruebaCrudo) : [];
  if (pruebaCrudo && prueba.length !== 1) {
    return NextResponse.json({ error: "prueba: un solo correo válido" }, { status: 400 });
  }
  const soloCodigos = (sp.get("codigos") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (soloCodigos.length && !test && !prueba.length) {
    return NextResponse.json({ error: "codigos solo con test o prueba" }, { status: 400 });
  }
  const real = !test && !prueba.length;
  if (real && !ESTADO_CUENTA_AUTOMATICO_2026_11) return NextResponse.json({ ok: true, apagado: true });

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!test && !RESEND_KEY) {
    if (real) await enviarSistema("Los estados de cuenta del lunes NO salieron: falta la llave de Resend en Vercel. Qué hacer: revisar RESEND_API_KEY y volver a correr el cron.");
    return NextResponse.json({ error: "RESEND_API_KEY no configurada" }, { status: 500 });
  }

  const inicio = Date.now();
  const hoy = hoyPanama();
  const semana = lunesDeLaSemana(hoy);
  const fecha = fmtDate(hoy);
  const mes = mesLabel();

  try {
    let clientes = seleccionarClientes(await leerCartera());
    if (soloCodigos.length) clientes = clientes.filter((c) => soloCodigos.includes(c.codigo));

    const r: ResumenCorrida = { enviados: 0, pdfs: 0, sinCorreo: [], fallaron: [], yaEnviados: 0, pendientes: 0 };
    const detalle: Record<string, unknown>[] = [];

    for (let i = 0; i < clientes.length; i += 1) {
      const c = clientes[i];
      if (Date.now() - inicio > PRESUPUESTO_MS) {
        r.pendientes = clientes.length - i;
        break;
      }
      const correos = direccionesValidas(await correoDelCliente(c.codigo, c.nombreNormalizado));

      if (test) {
        detalle.push({ codigo: c.codigo, nombre: c.nombre, empresas: c.empresas, saldo: c.saldo, correo: correos.join(", ") || null });
        if (correos.length) {
          r.enviados += 1;
          r.pdfs += c.empresas.length;
        } else r.sinCorreo.push({ nombre: c.nombre, saldo: c.saldo });
        continue;
      }

      if (real && !(await reservar(c, semana))) {
        r.yaEnviados += 1;
        continue;
      }
      if (!correos.length) {
        r.sinCorreo.push({ nombre: c.nombre, saldo: c.saldo });
        if (real) await anotar(c.codigo, semana, { estado: "sin_correo" });
        continue;
      }

      try {
        await mandarUno(c, correos);
      } catch (e) {
        // Antes de que Resend acepte: no salió nada → queda 'error' y se reintenta.
        const motivo = e instanceof Error ? e.message : String(e);
        r.fallaron.push({ nombre: c.nombre, motivo });
        if (real) await anotar(c.codigo, semana, { estado: "error", detalle: motivo });
      }
    }

    async function mandarUno(c: ClienteDelLunes, correos: string[]): Promise<void> {
      // El papel: solo las empresas con saldo > 0, con los números del botón.
      const completo = await fetchEstadoCuentaData(c.codigo, c.empresas);
      const empresas = completo.empresas.filter((e) => e.subtotal > 0);
      if (!empresas.length) {
        if (real) await anotar(c.codigo, semana, { estado: "error", detalle: "sin saldo al armar el papel" });
        return;
      }
      const result: EstadoCuentaResult = {
        ...completo,
        empresas,
        total: Math.round(empresas.reduce((s, e) => s + e.subtotal, 0) * 100) / 100,
      };
      const nombre = result.clienteNombre || c.nombre;
      const adjuntos = adjuntosDe(result, nombre, mes);
      const contacto = await contactoDelCliente(c.codigo);
      const destino = prueba.length ? prueba : correos;
      const avisoPrueba = prueba.length
        ? `<p style="background:#fef3c7;padding:8px 12px;font-size:12px;margin:0 0 12px">PRUEBA — este correo iría a: ${escapeHtml(correos.join(", "))}</p>`
        : "";
      const html =
        avisoPrueba +
        composeEmailHtml({
          cuerpo: cuerpoAutomatico(fecha, contacto),
          resumenHtml: buildResumenHtml(empresas, nombre),
          firma: buildFirma(FIRMA_AUTOMATICO),
          cuentasHtml: buildCuentasHtml(empresas),
        });
      const asunto = `${prueba.length ? "[PRUEBA] " : ""}${asuntoAutomatico(empresas.map((e) => e.empresa_nombre), fecha)}`;

      let envio: { ok: true; id: string } | { ok: false; motivo: string };
      if (adjuntos.reduce((s, a) => s + a.content.length, 0) > TOPE_ADJUNTOS_BASE64) {
        envio = { ok: false, motivo: "los PDF pasan el tope de 40 MB del correo" };
      } else {
        envio = await mandarPorResend(
          RESEND_KEY!,
          { from: REMITENTE_AUTOMATICO, to: destino, reply_to: RESPONDER_A_AUTOMATICO, subject: asunto, html, attachments: adjuntos },
          real ? `estado-cuenta-semanal/${semana}/${c.codigo}` : null,
        );
      }
      await dormir(PAUSA_ENTRE_CORREOS_MS);

      if (!envio.ok) {
        r.fallaron.push({ nombre, motivo: envio.motivo });
        if (real) await anotar(c.codigo, semana, { estado: "error", destinatario: correos.join(", "), detalle: envio.motivo });
        return;
      }
      r.enviados += 1;
      r.pdfs += adjuntos.length;
      detalle.push({ codigo: c.codigo, nombre, empresas: empresas.map((e) => e.empresa_key), saldo: result.total, a: destino, resendId: envio.id });
      if (real) {
        await anotar(c.codigo, semana, {
          estado: "enviado",
          destinatario: correos.join(", "),
          empresas: empresas.map((e) => e.empresa_key),
          saldo: result.total,
          resend_id: envio.id,
          detalle: null,
        });
        // La misma bitácora del envío manual: pinta «Le enviaste el estado de cuenta hace N días».
        const { error } = await supabaseServer.from("cxc_emails_enviados").insert({
          cliente_codigo: c.codigo,
          empresas: empresas.map((e) => e.empresa_key),
          destinatario: correos.join(", "),
          cc: null,
          asunto,
          enviado_por: "Envío automático",
          resultado: "ok",
          canal: "correo",
        });
        if (error) console.error(`[${CRON_NAME}] bitácora ${c.codigo}: ${error.message}`);
      }
    }

    if (real) {
      await enviarNegocioPrivado(mensajeDelLunes(r));
      if (r.fallaron.length) {
        await enviarSistema(
          `${r.fallaron.length} estados de cuenta del lunes no salieron (${r.fallaron
            .slice(0, 5)
            .map((f) => `${f.nombre}: ${f.motivo}`)
            .join("; ")}). Qué hacer: volver a correr el cron hoy; solo reintenta los que fallaron, no repite los que ya salieron.`,
        );
      }
      await recordCronHeartbeat(CRON_NAME);
    }

    return NextResponse.json({
      ok: true,
      modo: test ? "test" : prueba.length ? "prueba" : "real",
      semana,
      clientes: clientes.length,
      ...r,
      deudaSinCorreo: Math.round(r.sinCorreo.reduce((s, x) => s + x.saldo, 0) * 100) / 100,
      mensaje: mensajeDelLunes(r),
      detalle,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logCronError("estado_cuenta_semanal_failed", msg, null, { telegram: false });
    if (real) {
      await enviarSistema(
        `Los estados de cuenta del lunes se cortaron: ${msg}. Qué hacer: volver a correr el cron; los que ya salieron esta semana no se repiten.`,
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
