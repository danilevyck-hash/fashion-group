// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/despachos-correo — lee del buzón los correos de despacho del
// proveedor (ASW) de los últimos 3 días y guarda las tallas de sus adjuntos
// «<factura>_TXT» en `despacho_tallas` (Plantilla Switch › Tallas por bulto).
//
// 🔴 APAGADO (`DESPACHOS_CORREO_AUTOMATICO = false`) hasta que Daniel autorice la
// app en Microsoft Entra. Apagado contesta 200 sin hacer nada y sin sembrar
// latido: es seed-tolerante, así que el vigía no lo reclama.
// Una entrada de cron, una ocurrencia (23:45 UTC = 6:45 p. m. de Panamá). No
// toca Switch. Un correo ya cargado no se vuelve a bajar.
// Avisa por 🔧 SISTEMA solo lo que pide hacer algo: la llave de Microsoft dejó de
// servir, o un adjunto de despacho llegó con un formato que no se reconoce.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import XLSX from "xlsx-js-style";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { verifySession } from "@/lib/session-cookie";
import { enviarSistema } from "@/lib/alertas/canal";
import { BUZON_DESPACHOS, DESPACHOS_CORREO_AUTOMATICO } from "@/lib/tallas-pedido/interruptores";
import {
  adjuntosDeDespacho, filasDeTxt, leerAdjuntoDeDespacho, proveedorDelCorreo, type Celda,
} from "@/lib/tallas-pedido/despacho-archivo";
import { adjuntosDe, bytesDeAdjunto, correosDesde, credencialesGraph, tokenGraph } from "@/lib/tallas-pedido/graph";
import { correoYaCargado, guardarTallasDeDespacho } from "@/lib/tallas-pedido/server";

const CRON_NAME = "despachos-correo";
const DIAS_ATRAS = 3;

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function autorizado(req: NextRequest): boolean {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "") || req.nextUrl.searchParams.get("secret");
  if (secret && secret === process.env.CRON_SECRET) return true;
  try {
    return verifySession(req.cookies.get("cxc_session")?.value)?.role === "admin";
  } catch {
    return false;
  }
}

function filasDelArchivo(nombre: string, bytes: Uint8Array): Celda[][] {
  if (/\.txt$/i.test(nombre)) return filasDeTxt(new TextDecoder("latin1").decode(bytes));
  const wb = XLSX.read(bytes, { type: "array" });
  // La primera hoja con datos (los de Reebok traen hojas vacías de más).
  const hoja = wb.SheetNames.map((n) => wb.Sheets[n]).find((h) => h?.["!ref"]) ?? wb.Sheets[wb.SheetNames[0]];
  // raw: el código de barra sigue siendo número entero (sin «1.2E+12»); `eanTexto` lo vuelve texto.
  return XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: null }) as Celda[][];
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!DESPACHOS_CORREO_AUTOMATICO) return NextResponse.json({ ok: true, apagado: true });

  const cred = credencialesGraph();
  if (!cred) {
    await logCronError("despachos_correo_sin_credenciales", "Faltan GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET", null, { telegram: false });
    return NextResponse.json({ error: "Sin credenciales de Microsoft" }, { status: 500 });
  }

  let token: string;
  try {
    token = await tokenGraph(cred);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logCronError("despachos_correo_token", msg, null, { telegram: false });
    await enviarSistema(
      "Las tallas de los despachos de ASW dejaron de cargarse solas.\n" +
        "Qué significa: Microsoft no aceptó la llave del sistema para leer el correo (puede haber vencido).\n" +
        "Qué hacer: en Microsoft Entra, crea un secreto nuevo para la app «Fashion Group – despachos» y cámbialo en Vercel (GRAPH_CLIENT_SECRET).",
    );
    return NextResponse.json({ error: "token" }, { status: 500 });
  }

  const desde = new Date(Date.now() - DIAS_ATRAS * 86_400_000).toISOString();
  const resultado = { correos: 0, adjuntos: 0, filas: 0, yaCargados: 0, formatoRaro: [] as string[] };
  try {
    const correos = await correosDesde(token, BUZON_DESPACHOS, desde);
    for (const c of correos) {
      const proveedor = c.hasAttachments ? proveedorDelCorreo(c.from?.emailAddress?.address ?? "", c.subject ?? "") : null;
      if (!proveedor) continue;
      if (await correoYaCargado(c.id)) {
        resultado.yaCargados++;
        continue;
      }
      resultado.correos++;
      const adjuntos = adjuntosDeDespacho(await adjuntosDe(token, BUZON_DESPACHOS, c.id), proveedor);
      for (const a of adjuntos) {
        const filas = filasDelArchivo(a.name, await bytesDeAdjunto(token, BUZON_DESPACHOS, c.id, a.id));
        resultado.adjuntos++;
        const leido = leerAdjuntoDeDespacho(filas, { correo_id: c.id, proveedor });
        if (!leido) {
          resultado.formatoRaro.push(`${a.name} (${c.subject})`);
          continue;
        }
        resultado.filas += await guardarTallasDeDespacho(leido);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${CRON_NAME}]`, msg);
    // Sin latido: si se repite, el vigía de crons lo dice (no hace falta otro aviso).
    await logCronError("despachos_correo_fallo", msg, null, { telegram: false });
    return NextResponse.json({ error: msg, ...resultado }, { status: 500 });
  }

  if (resultado.formatoRaro.length > 0) {
    await enviarSistema(
      `Llegó un Excel de despacho del proveedor que el sistema no reconoce: ${resultado.formatoRaro.join(" · ")}.\n` +
        "Qué significa: las tallas de esas referencias no van a salir en el Excel de tallas del pedido.\n" +
        "Qué hacer: revisa si el proveedor cambió las columnas del archivo.",
    );
  }
  await recordCronHeartbeat(CRON_NAME);
  return NextResponse.json({ ok: true, ...resultado });
}
