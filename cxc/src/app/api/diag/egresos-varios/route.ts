/**
 * CERTIFICACIÓN de EGRESOS VARIOS — baja el reporte de Switch, lo parsea y
 * cuenta. **NO ESCRIBE NI UNA FILA.**
 *
 * ── Para qué existe ─────────────────────────────────────────────────────────
 *
 * El número contra el que hay que cuadrar es el archivo que Daniel bajó a mano
 * del panel: **Vistana, 1-ene → 13-ago-2026 = 378 renglones por $243.342,48**,
 * repartidos 46/35/77/65/63/45/47 y en 42 cuentas contables distintas. El
 * parser ya da ese número al centavo contra el archivo guardado
 * (`egresos-parser.test.ts`), pero eso certifica el PARSEO, no la DESCARGA.
 * Esta ruta cierra el último eslabón: pide el mismo rango a Switch y dice qué
 * trajo, para poder compararlo renglón por renglón y centavo por centavo.
 *
 * Y hace falta que sea una ruta aparte porque el cron NO sirve para esto: sin
 * la DDL corrida se omite limpio (503) y no toca Switch — que es exactamente lo
 * que tiene que hacer. Esta ruta no necesita tablas: solo baja, parsea y cuenta.
 *
 * ── ⚠️ ABRE UNA SESIÓN WEB EN SWITCH ────────────────────────────────────────
 *
 * El login usa `changesession="SI"`: **EXPULSA del panel a quien esté adentro**
 * de esa empresa. Correr SOLO en la madrugada de Panamá y mirando antes el
 * calendario de crons (`SWITCH_CRON_ENTRADAS`): la separación mínima con
 * cualquier entrada que toque la misma empresa es de 15 minutos, y acá la tiene
 * que respetar una persona, porque no hay cron que la haga cumplir.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` — la misma llave de los crons.
 * No lleva sesión de usuario a propósito: se corre con `curl`, no desde la app.
 *
 * Params: `empresas=vistana` (obligatorio, y de a una por vez),
 *         `desde=2026-01-01&hasta=2026-08-13`.
 */

import { NextRequest, NextResponse } from "next/server";
import { loginSwitchWeb, fetchEgresosVarios, cerrarSesionWeb } from "@/lib/switch-api/web-client";
import { parsearEgresosCsv } from "@/lib/egresos/parser";
import { duplicadosExactos, esGasto } from "@/lib/egresos/reglas";
import { EGRESOS_EMPRESA_KEYS } from "@/lib/switch-api/sync-egresos-varios";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const usd = (cent: number) => (cent / 100).toFixed(2);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const desde = sp.get("desde") ?? "";
  const hasta = sp.get("hasta") ?? "";
  if (!FECHA_RE.test(desde) || !FECHA_RE.test(hasta) || desde > hasta) {
    return NextResponse.json(
      { ok: false, error: "Faltan desde/hasta en formato AAAA-MM-DD." },
      { status: 400 },
    );
  }

  const pedidas = (sp.get("empresas") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((e) => EGRESOS_EMPRESA_KEYS.includes(e));
  if (pedidas.length === 0) {
    return NextResponse.json(
      { ok: false, error: `empresas= es obligatorio. Válidas: ${EGRESOS_EMPRESA_KEYS.join(", ")}` },
      { status: 400 },
    );
  }

  const salida: unknown[] = [];
  // SECUENCIAL: dos empresas en paralelo son dos sesiones abiertas a la vez.
  for (const empresaKey of pedidas) {
    let session: Awaited<ReturnType<typeof loginSwitchWeb>> | null = null;
    try {
      session = await loginSwitchWeb(empresaKey);
      const { csv, rondas, archivo } = await fetchEgresosVarios(session, desde, hasta);
      const { lineas, errores, meses, rangoObservado } = parsearEgresosCsv(csv);

      const porMes: Record<string, { renglones: number; total: string }> = {};
      const porGrupo: Record<string, { renglones: number; total: string }> = {};
      for (const l of lineas) {
        const m = (porMes[l.mes] ??= { renglones: 0, total: "0" });
        m.renglones += 1;
        m.total = usd(Number(m.total) * 100 + l.totalCent);
        const g = l.cuenta.split(".")[0];
        const gr = (porGrupo[g] ??= { renglones: 0, total: "0" });
        gr.renglones += 1;
        gr.total = usd(Number(gr.total) * 100 + l.totalCent);
      }

      const gasto = lineas.filter((l) => esGasto(l.cuenta));
      salida.push({
        empresaKey,
        ok: true,
        archivo,
        rondas,
        bytes: csv.length,
        // Los números del cuadre.
        renglones: lineas.length,
        total: usd(lineas.reduce((a, l) => a + l.totalCent, 0)),
        renglonesGasto: gasto.length,
        totalGasto: usd(gasto.reduce((a, l) => a + l.totalCent, 0)),
        cuentasDistintas: new Set(lineas.map((l) => l.cuenta)).size,
        documentosDistintos: new Set(lineas.map((l) => l.nInterno)).size,
        montoMaximo: lineas.length ? usd(Math.max(...lineas.map((l) => l.totalCent))) : null,
        duplicadosExactos: duplicadosExactos(lineas).length,
        meses,
        rangoObservado,
        porMes,
        porGrupo,
        erroresParseo: errores.length,
        // Las primeras filas ilegibles, para poder arreglar el parser sin
        // adivinar. Nunca todas: el volcado completo sería el archivo entero.
        primerosErrores: errores.slice(0, 5),
      });
    } catch (e) {
      salida.push({ empresaKey, ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      // Dejar la sesión abierta alarga el despojo a quien esté trabajando.
      if (session) await cerrarSesionWeb(session);
    }
  }

  return NextResponse.json({ ok: true, desde, hasta, resultados: salida });
}
