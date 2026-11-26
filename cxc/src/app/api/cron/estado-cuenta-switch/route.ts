// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/estado-cuenta-switch — PASO 1 del estado de cuenta de los lunes
// (26-nov-2026, Daniel: el PDF tiene que ser el de Switch, intacto).
//
// Le pide a Switch, empresa por empresa, que mande su estado de cuenta PENDIENTE
// de cada cliente con saldo y correo al buzón intermedio (info@fashiongr.com).
// El correo al cliente sale después, a las 13:00 UTC, desde
// `/api/cron/estado-cuenta-semanal` (paso 2), que lee esos PDF del buzón.
//
// Dos entradas los LUNES: 10:50 y 11:20 UTC (5:50 y 6:20 a. m. de Panamá). La
// segunda solo pide lo que NO llegó a la primera. Cada empresa en UNA sesión
// del panel (usuario `daniel`, changesession=SI), en serie; las seis a la vez
// porque son sesiones distintas. ≥15 min de todo otro cron de estas empresas.
//
// Solo con CRON_SECRET. Respeta «Pausar Switch» y el interruptor.
//   ?prueba=<código>  pide a Switch los PDF de ESE cliente en el acto, espera a
//                     que lleguen y manda el correo SOLO a daniel@fashiongr.com
//                     («[PRUEBA]»), sin reservar, sin bitácora y sin Telegram.
//                     Corre aunque el interruptor esté apagado.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { respuestaSiSwitchEnPausa } from "@/lib/switch-api/pausa-cron";
import { hoyPanama } from "@/lib/fecha-panama";
import { fmtDate } from "@/lib/format";
import { ESTADO_CUENTA_AUTOMATICO_2026_11, lunesDeLaSemana } from "@/lib/cxc/estado-cuenta-automatico";
import { inicioDeLaSemanaUtc } from "@/lib/cxc/estado-cuenta-pdf-switch";
import {
  asegurarPdfs,
  clientesDelLunes,
  idsDeSwitch,
  olvidarPermisoDelBuzon,
  tokenDelBuzon,
  type ClienteConCorreo,
  type Par,
} from "@/lib/cxc/estado-cuenta-pdf-switch-io";
import { fechaDelArchivo, mandarCorreoDelCliente } from "@/lib/cxc/estado-cuenta-correo-switch";
import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";

const CRON_NAME = "estado-cuenta-switch";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/** Deja de pedir a Switch pasado esto (y le quedan ~90 s de espera + aire). */
const PIDE_HASTA_MS = 480_000;
const ESPERA_MS = 90_000;

function paresDe(clientes: readonly ClienteConCorreo[], ids: Map<string, number>): { pares: Par[]; sinId: string[] } {
  const pares: Par[] = [];
  const sinId: string[] = [];
  for (const c of clientes) {
    for (const e of c.empresas) {
      const id = ids.get(`${e}:${c.codigo}`);
      if (id == null) sinId.push(`${c.codigo}@${e}`);
      else pares.push({ empresa: e, id });
    }
  }
  return { pares, sinId };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const prueba = (req.nextUrl.searchParams.get("prueba") ?? "").trim().toUpperCase();
  if (!prueba && !ESTADO_CUENTA_AUTOMATICO_2026_11) return NextResponse.json({ ok: true, apagado: true });
  const enPausa = await respuestaSiSwitchEnPausa("estado-cuenta-switch");
  if (enPausa) return enPausa;

  const inicio = Date.now();
  const hoy = hoyPanama();
  const semana = lunesDeLaSemana(hoy);
  try {
    const todos = await clientesDelLunes(prueba ? [prueba] : []);
    if (prueba && !todos.length) {
      return NextResponse.json({ error: `${prueba} no debe nada en las 6 empresas (o está fuera del envío)` }, { status: 400 });
    }
    // Sin correo no se pide nada a Switch (no va a salir); la prueba sí lo pide.
    const clientes = prueba ? todos : todos.filter((c) => c.correos.length > 0);
    const ids = await idsDeSwitch(
      clientes.map((c) => c.codigo),
      CXC_GRUPO_EMPRESA_KEYS,
    );
    const { pares, sinId } = paresDe(clientes, ids);
    const token = await tokenDelBuzon();
    const r = await asegurarPdfs({
      token,
      pares,
      // La prueba pide PDF frescos; el lunes vale todo lo llegado desde las 00:00 de Panamá.
      desde: prueba ? new Date(Date.now() - 10_000).toISOString().replace(/\.\d+Z$/, "Z") : inicioDeLaSemanaUtc(semana),
      hasta: inicio + PIDE_HASTA_MS,
      esperaMs: ESPERA_MS,
    });

    if (prueba) {
      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) return NextResponse.json({ error: "RESEND_API_KEY no configurada" }, { status: 500 });
      olvidarPermisoDelBuzon();
      const e = await mandarCorreoDelCliente({
        resendKey,
        token,
        cliente: clientes[0],
        ids,
        indice: r.indice,
        fecha: fmtDate(hoy),
        fechaArchivo: fechaDelArchivo(hoy),
        prueba: true,
        idempotencia: null,
      });
      return NextResponse.json({ ok: true, modo: "prueba", codigo: prueba, iriaA: clientes[0].correos, ...e, faltan: r.faltan, fallos: r.fallos });
    }

    await recordCronHeartbeat(CRON_NAME);
    return NextResponse.json({
      ok: true,
      semana,
      clientes: clientes.length,
      pdfs: pares.length,
      enBuzon: pares.length - r.faltan.length,
      pedidos: r.pedidos,
      faltan: r.faltan,
      sinId,
      fallos: r.fallos.slice(0, 30),
      segundos: Math.round((Date.now() - inicio) / 1000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Sin Telegram aquí: el paso 2 (13:00 UTC) dice qué clientes no salieron.
    if (!prueba) await logCronError("estado_cuenta_switch_failed", msg, null, { telegram: false });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
