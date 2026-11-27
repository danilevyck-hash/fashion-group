// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/estado-cuenta-semanal — el estado de cuenta de los lunes a cada
// cliente con saldo en las 6 empresas (26/27-nov-2026, Daniel). Lunes 10:50 UTC
// (5:50 a. m. de Panamá) y un reintento a las 11:20 que solo toma lo que falló.
//
// 🔴 EL PDF ES EL DE SWITCH («no uno regenerado por ti»): en el panel, la ficha
// del cliente → Pendientes → «Imprimir», guardado a PDF con Chromium
// (`imprimirEstadosDeCuenta`). UN correo por cliente desde info@ por Resend,
// con UN PDF por empresa donde debe, sin copia.
// 🔴 EL CANDADO: cada papel tiene que ser del cliente y cuadrar AL CENTAVO (y en
// documentos) con lo que Switch dice en ese momento por su API. Si una empresa
// no cuadra, el cliente NO se manda: queda 'error' y va en el Telegram privado.
// 🔴 A lo sumo una vez por (cliente, semana): la fila se RESERVA antes de mandar
// (UNIQUE en `cxc_estado_cuenta_automatico`) + `Idempotency-Key` de Resend.
// 🔴 Abre el login WEB de Switch (saca a Daniel del panel): por eso corre de
// madrugada, a ≥ 15 min de otros crons de las mismas empresas.
//
// Parámetros (solo con CRON_SECRET):
//   ?test=true[&codigos=D-24,D-25]  no toca Switch, no manda ni escribe: dice qué saldría.
//   ?prueba=<código>                imprime los papeles de ESE cliente y manda el
//                                   correo SOLO a daniel@ con «[PRUEBA]» (con el
//                                   interruptor apagado también). No escribe nada.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { enviarNegocioPrivado, enviarSistema } from "@/lib/alertas/canal";
import { respuestaSiSwitchEnPausa } from "@/lib/switch-api/pausa-cron";
import { hoyPanama } from "@/lib/fecha-panama";
import { fmtDate } from "@/lib/format";
import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import {
  ESTADO_CUENTA_AUTOMATICO_2026_11,
  lunesDeLaSemana,
  mensajeDelLunes,
  type ResumenCorrida,
} from "@/lib/cxc/estado-cuenta-automatico";
import {
  clientesDelLunes,
  idsDeSwitch,
  imprimirEstadosDeCuenta,
  llave,
  type ClienteConCorreo,
  type Papel,
  type Par,
} from "@/lib/cxc/estado-cuenta-pdf-switch-io";
import { fechaDelArchivo, mandarCorreoDelCliente, pdfsDelCliente } from "@/lib/cxc/estado-cuenta-correo-switch";
import { nombreDelPdf } from "@/lib/cxc/estado-cuenta-pdf-switch";
import {
  BUCKET_ESTADOS_CUENTA,
  ESTADO_CUENTA_WHATSAPP_2026_11,
  rutaDelPdf,
  type PdfGuardado,
} from "@/lib/cxc/estado-cuenta-whatsapp";

const CRON_NAME = "estado-cuenta-semanal";
const TABLA = "cxc_estado_cuenta_automatico";

export const dynamic = "force-dynamic";
export const maxDuration = 800; // techo del plan (Pro + Fluid)

/** Hasta aquí se imprime (las 6 empresas a la vez); lo que falte queda 'error' para las 11:20. */
const PRESUPUESTO_IMPRIMIR_MS = 540_000;
/** Deja de tomar clientes nuevos pasado esto; los que falten se dicen. */
const PRESUPUESTO_MS = 720_000;
/** Resend admite 10 por segundo en esta cuenta (medido 26-nov-2026): 4 por segundo. */
const PAUSA_ENTRE_CORREOS_MS = 250;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Los pares (empresa, cliente) a imprimir. Sin id único de Switch → falla dicha. */
function paresDe(clientes: readonly ClienteConCorreo[], ids: Map<string, number>, papeles: Map<string, Papel>): Par[] {
  const pares: Par[] = [];
  for (const c of clientes) {
    for (const e of c.empresas) {
      const id = ids.get(llave(e, c.codigo));
      if (id == null) papeles.set(llave(e, c.codigo), { ok: false, motivo: "sin id único de Switch" });
      else pares.push({ empresa: e, codigo: c.codigo, id });
    }
  }
  return pares;
}

/** Los que ya quedaron resueltos esta semana (enviado o sin correo): no se reimprimen. */
async function yaResueltos(semana: string): Promise<Set<string>> {
  const { data, error } = await supabaseServer.from(TABLA).select("cliente_codigo").eq("semana", semana).neq("estado", "error");
  if (error) throw new Error(`${TABLA}: ${error.message}`);
  return new Set((data ?? []).map((f) => f.cliente_codigo as string));
}

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

/** Sube los PDF comprobados de un cliente sin correo al bucket privado. Lanza si falta uno. */
async function guardarParaWhatsApp(
  c: ClienteConCorreo,
  papeles: Map<string, Papel>,
  semana: string,
  fechaArchivo: string,
): Promise<PdfGuardado[]> {
  const out: PdfGuardado[] = [];
  for (const p of pdfsDelCliente(c, papeles)) {
    const path = rutaDelPdf(semana, c.codigo, p.empresa);
    const { error } = await supabaseServer.storage
      .from(BUCKET_ESTADOS_CUENTA)
      .upload(path, p.bytes, { contentType: "application/pdf", upsert: true });
    if (error) throw new Error(`no se pudo guardar el PDF de ${p.nombreEmpresa}: ${error.message}`);
    out.push({ empresa: p.empresa, nombreEmpresa: p.nombreEmpresa, total: p.total, path, archivo: nombreDelPdf(p.nombreEmpresa, c.nombre, fechaArchivo) });
  }
  return out;
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
  const prueba = (sp.get("prueba") ?? "").trim().toUpperCase();
  const soloCodigos = (sp.get("codigos") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (soloCodigos.length && !test) {
    return NextResponse.json({ error: "codigos solo con test" }, { status: 400 });
  }
  const real = !test && !prueba;
  if (real && !ESTADO_CUENTA_AUTOMATICO_2026_11) return NextResponse.json({ ok: true, apagado: true });
  if (!test) {
    const enPausa = await respuestaSiSwitchEnPausa("estado-cuenta-semanal");
    if (enPausa) return enPausa;
  }

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!test && !RESEND_KEY) {
    if (real) await enviarSistema("Los estados de cuenta del lunes NO salieron: falta la llave de Resend en Vercel. Qué hacer: revisar RESEND_API_KEY y volver a correr el cron.");
    return NextResponse.json({ error: "RESEND_API_KEY no configurada" }, { status: 500 });
  }

  const inicio = Date.now();
  const hoy = hoyPanama();
  const semana = lunesDeLaSemana(hoy);
  const fecha = fmtDate(hoy);
  const correo = (c: ClienteConCorreo, papeles: Map<string, Papel>, esPrueba: boolean) =>
    mandarCorreoDelCliente({
      resendKey: RESEND_KEY!,
      cliente: c,
      papeles,
      fecha,
      fechaArchivo: fechaDelArchivo(hoy),
      prueba: esPrueba,
      idempotencia: esPrueba ? null : `estado-cuenta-semanal/${semana}/${c.codigo}`,
    });

  try {
    if (prueba) {
      const [c] = await clientesDelLunes([prueba]);
      if (!c) return NextResponse.json({ error: `${prueba} no debe nada en las 6 empresas (o está fuera del envío)` }, { status: 400 });
      const papeles = new Map<string, Papel>();
      const pares = paresDe([c], await idsDeSwitch([c.codigo], CXC_GRUPO_EMPRESA_KEYS), papeles);
      for (const [k, v] of await imprimirEstadosDeCuenta(pares, inicio + PRESUPUESTO_IMPRIMIR_MS)) papeles.set(k, v);
      const papelesDichos = c.empresas.map((e) => {
        const p = papeles.get(llave(e, c.codigo));
        return { empresa: e, ...(p ? (p.ok ? { ok: true, total: p.total, bytes: p.pdf.length } : p) : { ok: false, motivo: "sin papel" }) };
      });
      try {
        const e = await correo(c, papeles, true);
        return NextResponse.json({ ok: true, modo: "prueba", codigo: prueba, iriaA: c.correos, ...e, papeles: papelesDichos });
      } catch (err) {
        return NextResponse.json({ ok: false, modo: "prueba", codigo: prueba, noSalio: (err as Error).message, papeles: papelesDichos });
      }
    }

    const clientes = await clientesDelLunes(soloCodigos);
    const r: ResumenCorrida = { enviados: 0, pdfs: 0, sinCorreo: [], fallaron: [], yaEnviados: 0, pendientes: 0 };
    const detalle: Record<string, unknown>[] = [];

    if (test) {
      for (const c of clientes) {
        detalle.push({ codigo: c.codigo, nombre: c.nombre, empresas: c.empresas, saldo: c.saldo, correo: c.correos.join(", ") || null });
        if (c.correos.length) {
          r.enviados += 1;
          r.pdfs += c.empresas.length;
        } else r.sinCorreo.push({ nombre: c.nombre, saldo: c.saldo });
      }
    } else {
      const resueltos = await yaResueltos(semana);
      const porHacer = clientes.filter((c) => !resueltos.has(c.codigo));
      r.yaEnviados = clientes.length - porHacer.length;

      const conCorreo = porHacer.filter((c) => c.correos.length);
      const sinCorreo = porHacer.filter((c) => !c.correos.length);
      // 🔴 Los sin correo también se imprimen (WhatsApp, 27-nov-2026), DESPUÉS de
      // los que tienen correo: si el tiempo no alcanza, cae lo de WhatsApp y no el correo.
      const aImprimir = ESTADO_CUENTA_WHATSAPP_2026_11 ? [...conCorreo, ...sinCorreo] : conCorreo;
      const papeles = new Map<string, Papel>();
      const ids = await idsDeSwitch(aImprimir.map((c) => c.codigo), CXC_GRUPO_EMPRESA_KEYS);
      const pares = paresDe(aImprimir, ids, papeles);
      for (const [k, v] of await imprimirEstadosDeCuenta(pares, inicio + PRESUPUESTO_IMPRIMIR_MS)) papeles.set(k, v);

      for (const c of sinCorreo) {
        if (!(await reservar(c, semana))) continue;
        if (!ESTADO_CUENTA_WHATSAPP_2026_11) {
          r.sinCorreo.push({ nombre: c.nombre, saldo: c.saldo });
          await anotar(c.codigo, semana, { estado: "sin_correo" });
          continue;
        }
        try {
          const pdfs = await guardarParaWhatsApp(c, papeles, semana, fechaDelArchivo(hoy));
          const saldo = Math.round(pdfs.reduce((s, p) => s + p.total, 0) * 100) / 100;
          r.sinCorreo.push({ nombre: c.nombre, saldo });
          await anotar(c.codigo, semana, { estado: "sin_correo", pdfs, empresas: pdfs.map((p) => p.empresa), saldo, detalle: null });
        } catch (err) {
          // No cuadró o no se imprimió: queda 'error', no se ofrece y las 11:20 lo reintentan.
          const motivo = err instanceof Error ? err.message : String(err);
          r.fallaron.push({ nombre: c.nombre, motivo: `WhatsApp: ${motivo}` });
          await anotar(c.codigo, semana, { estado: "error", pdfs: null, detalle: motivo });
        }
      }

      for (let i = 0; i < conCorreo.length; i += 1) {
        const c = conCorreo[i];
        if (Date.now() - inicio > PRESUPUESTO_MS) {
          r.pendientes = conCorreo.length - i;
          break;
        }
        if (!(await reservar(c, semana))) {
          r.yaEnviados += 1;
          continue;
        }
        try {
          const e = await correo(c, papeles, false);
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
        } catch (err) {
          // Antes de que Resend acepte: no salió nada → queda 'error' y se reintenta.
          const motivo = err instanceof Error ? err.message : String(err);
          r.fallaron.push({ nombre: c.nombre, motivo });
          detalle.push({ codigo: c.codigo, nombre: c.nombre, noSalio: motivo });
          await anotar(c.codigo, semana, { estado: "error", destinatario: c.correos.join(", "), detalle: motivo });
        }
        await dormir(PAUSA_ENTRE_CORREOS_MS);
      }

      await enviarNegocioPrivado(mensajeDelLunes(r));
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
      detalle,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!prueba) await logCronError("estado_cuenta_semanal_failed", msg, null, { telegram: false });
    if (real) {
      await enviarSistema(
        `Los estados de cuenta del lunes se cortaron: ${msg}. Qué hacer: volver a correr el cron; los que ya salieron esta semana no se repiten.`,
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
