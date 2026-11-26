// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/estado-cuenta-semanal — PASO 2 del estado de cuenta de los
// lunes: el correo a cada cliente con saldo, 13:00 UTC = 8:00 a. m. de Panamá
// (26-nov-2026, Daniel).
//
// 🔴 EL PDF ES EL DE SWITCH, INTACTO («no uno regenerado por ti»). El paso 1
// (`/api/cron/estado-cuenta-switch`, 10:50 y 11:20 UTC) le pide a Switch que
// mande cada PDF al buzón intermedio (info@); aquí se leen de ese buzón por
// Microsoft Graph y salen UN correo por cliente desde info@ por Resend, con UN
// PDF por empresa donde debe, sin copia. Este paso NO toca Switch.
// 🔴 Antes de mandar, el «Código:» impreso en cada PDF tiene que ser el del
// cliente (`mandarCorreoDelCliente`). Si falta el PDF de alguna empresa, o no es
// suyo, el cliente NO se manda incompleto: queda 'error' y se reintenta.
// 🔴 A lo sumo una vez por (cliente, semana): la fila se RESERVA antes de mandar
// (UNIQUE en `cxc_estado_cuenta_automatico`) + `Idempotency-Key` de Resend.
//
// Parámetros (solo con CRON_SECRET):
//   ?test=true[&codigos=D-24,D-25]  no manda ni escribe: dice qué saldría y
//                                    qué PDF faltan en el buzón.
// La PRUEBA con un cliente vive en el paso 1: `estado-cuenta-switch?prueba=<código>`.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { enviarNegocioPrivado, enviarSistema } from "@/lib/alertas/canal";
import { hoyPanama } from "@/lib/fecha-panama";
import { fmtDate } from "@/lib/format";
import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import {
  ESTADO_CUENTA_AUTOMATICO_2026_11,
  lunesDeLaSemana,
  mensajeDelLunes,
  type ResumenCorrida,
} from "@/lib/cxc/estado-cuenta-automatico";
import { inicioDeLaSemanaUtc } from "@/lib/cxc/estado-cuenta-pdf-switch";
import {
  clientesDelLunes,
  idsDeSwitch,
  indicePdfsSwitch,
  limpiarCarpetaSwitch,
  llavePar,
  olvidarPermisoDelBuzon,
  puedeOrdenarElBuzon,
  tokenDelBuzon,
  type ClienteConCorreo,
} from "@/lib/cxc/estado-cuenta-pdf-switch-io";
import { fechaDelArchivo, mandarCorreoDelCliente } from "@/lib/cxc/estado-cuenta-correo-switch";

const CRON_NAME = "estado-cuenta-semanal";
const TABLA = "cxc_estado_cuenta_automatico";

export const dynamic = "force-dynamic";
export const maxDuration = 800; // techo del plan (Pro + Fluid)

/** Deja de tomar clientes nuevos pasado esto; los que falten se dicen. */
const PRESUPUESTO_MS = 650_000;
/** Resend admite 10 por segundo en esta cuenta (medido 26-nov-2026): 4 por segundo. */
const PAUSA_ENTRE_CORREOS_MS = 250;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reserva (cliente, semana). `true` = este proceso manda; `false` = ya lo tomó
 * otro o ya salió. Un 'error' anterior se vuelve a tomar.
 */
async function reservar(c: ClienteConCorreo, semana: string): Promise<boolean> {
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

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const test = sp.get("test") === "true";
  const soloCodigos = (sp.get("codigos") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (soloCodigos.length && !test) {
    return NextResponse.json({ error: "codigos solo con test" }, { status: 400 });
  }
  const real = !test;
  if (real && !ESTADO_CUENTA_AUTOMATICO_2026_11) return NextResponse.json({ ok: true, apagado: true });

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (real && !RESEND_KEY) {
    await enviarSistema("Los estados de cuenta del lunes NO salieron: falta la llave de Resend en Vercel. Qué hacer: revisar RESEND_API_KEY y volver a correr el cron.");
    return NextResponse.json({ error: "RESEND_API_KEY no configurada" }, { status: 500 });
  }

  const inicio = Date.now();
  const hoy = hoyPanama();
  const semana = lunesDeLaSemana(hoy);
  const fecha = fmtDate(hoy);

  try {
    const clientes = await clientesDelLunes(soloCodigos);
    const token = await tokenDelBuzon();
    olvidarPermisoDelBuzon();
    const ids = await idsDeSwitch(
      clientes.map((c) => c.codigo),
      CXC_GRUPO_EMPRESA_KEYS,
    );
    const indice = await indicePdfsSwitch(token, inicioDeLaSemanaUtc(semana), CXC_GRUPO_EMPRESA_KEYS);

    const r: ResumenCorrida = { enviados: 0, pdfs: 0, sinCorreo: [], fallaron: [], yaEnviados: 0, pendientes: 0 };
    const detalle: Record<string, unknown>[] = [];

    for (let i = 0; i < clientes.length; i += 1) {
      const c = clientes[i];
      if (Date.now() - inicio > PRESUPUESTO_MS) {
        r.pendientes = clientes.length - i;
        break;
      }

      if (test) {
        const faltan = c.empresas.filter((e) => {
          const id = ids.get(`${e}:${c.codigo}`);
          return id == null || !indice.has(llavePar(e, id));
        });
        detalle.push({ codigo: c.codigo, nombre: c.nombre, empresas: c.empresas, saldo: c.saldo, correo: c.correos.join(", ") || null, faltanPdf: faltan });
        if (c.correos.length) {
          r.enviados += 1;
          r.pdfs += c.empresas.length;
        } else r.sinCorreo.push({ nombre: c.nombre, saldo: c.saldo });
        continue;
      }

      if (!(await reservar(c, semana))) {
        r.yaEnviados += 1;
        continue;
      }
      if (!c.correos.length) {
        r.sinCorreo.push({ nombre: c.nombre, saldo: c.saldo });
        await anotar(c.codigo, semana, { estado: "sin_correo" });
        continue;
      }

      try {
        await mandarUno(c);
      } catch (e) {
        // Antes de que Resend acepte: no salió nada → queda 'error' y se reintenta.
        const motivo = e instanceof Error ? e.message : String(e);
        r.fallaron.push({ nombre: c.nombre, motivo });
        await anotar(c.codigo, semana, { estado: "error", destinatario: c.correos.join(", "), detalle: motivo });
      }
      await dormir(PAUSA_ENTRE_CORREOS_MS);
    }

    async function mandarUno(c: ClienteConCorreo): Promise<void> {
      const e = await mandarCorreoDelCliente({
        resendKey: RESEND_KEY!,
        token,
        cliente: c,
        ids,
        indice,
        fecha,
        fechaArchivo: fechaDelArchivo(hoy),
        prueba: false,
        idempotencia: `estado-cuenta-semanal/${semana}/${c.codigo}`,
      });
      r.enviados += 1;
      r.pdfs += e.pdfs;
      detalle.push({ codigo: c.codigo, nombre: c.nombre, empresas: e.empresas, saldo: e.saldo, a: e.a, resendId: e.resendId });
      await anotar(c.codigo, semana, {
        estado: "enviado",
        destinatario: c.correos.join(", "),
        empresas: e.empresas,
        saldo: e.saldo,
        resend_id: e.resendId,
        detalle: null,
      });
      // La misma bitácora del envío manual: pinta «Le enviaste el estado de cuenta hace N días».
      const { error } = await supabaseServer.from("cxc_emails_enviados").insert({
        cliente_codigo: c.codigo,
        empresas: e.empresas,
        destinatario: c.correos.join(", "),
        cc: null,
        asunto: e.asunto,
        enviado_por: "Envío automático",
        resultado: "ok",
        canal: "correo",
      });
      if (error) console.error(`[${CRON_NAME}] bitácora ${c.codigo}: ${error.message}`);
    }

    const viejosAEliminados = real ? await limpiarCarpetaSwitch(token) : 0;
    if (real) {
      await enviarNegocioPrivado(mensajeDelLunes(r));
      if (r.fallaron.length) {
        await enviarSistema(
          `${r.fallaron.length} estados de cuenta del lunes no salieron (${r.fallaron
            .slice(0, 5)
            .map((f) => `${f.nombre}: ${f.motivo}`)
            .join("; ")}). Qué hacer: correr /api/cron/estado-cuenta-switch (pide a Switch solo los PDF que faltan) y después este cron; no repite los que ya salieron.`,
        );
      }
      await recordCronHeartbeat(CRON_NAME);
    }

    return NextResponse.json({
      ok: true,
      modo: test ? "test" : "real",
      semana,
      clientes: clientes.length,
      ...r,
      deudaSinCorreo: Math.round(r.sinCorreo.reduce((s, x) => s + x.saldo, 0) * 100) / 100,
      mensaje: mensajeDelLunes(r),
      buzon: { ordena: puedeOrdenarElBuzon(), viejosAEliminados },
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
