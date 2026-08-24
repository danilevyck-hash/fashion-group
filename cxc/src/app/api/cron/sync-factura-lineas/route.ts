/**
 * Cron + trigger manual del DETALLE DE LÍNEA de facturas y notas de crédito.
 *
 * Mantiene `switch_factura_lineas` al día: baja el `detalle[]` de los
 * documentos que todavía no lo tienen. Ver `sync-factura-lineas.ts`.
 *
 * ── Por qué es barato en régimen normal ────────────────────────────────────
 * Solo mira los documentos con `lineas_synced_at IS NULL`. Después de la carga
 * histórica eso son los del día: unas decenas entre las 6 empresas. Un día sin
 * facturación es un no-op que ni siquiera abre sesión en Switch.
 *
 * 🔴 EL TOPE POR CORRIDA NO ES DECORATIVO. La carga histórica son ~12.300
 * documentos y NO se hace por acá: se hace con
 * `scripts/_backfill-factura-lineas.ts`, que se corre a mano, fuera de las
 * ventanas de cron y por empresa. Sin tope, la primera corrida del cron
 * intentaría bajarlos todos, se comería los 800 s de la función y moriría a
 * mitad de camino — y un proceso que Vercel mata no ejecuta su `finally`, así
 * que dejaría la fila 'running' trabada y el candado puesto (ya pasó con
 * catalogo_tommy el 27-jul-2026). El tope hace que la corrida siempre termine.
 *
 * ── Horario ────────────────────────────────────────────────────────────────
 * 03:30 UTC = 10:30 p.m. de Panamá. NO se eligió a ojo: el primer intento fue
 * 02:30 y el candado de `cleanup-sessions` lo rechazó — ahí ya corre él, y esa
 * franja exige 30 min de margen entre crons. Medido contra `vercel.json`,
 * **03:30 es el ÚNICO hueco de toda la banda 00:00-05:00 que cumple**: queda a
 * 30 min de `cleanup-packing-lists` (03:00) y del backup de Storage (04:00), y
 * a 60 min del primer `sync-articulo-info` (04:30), que sí toca Switch.
 *
 * Ninguna sesión de Switch de estas 6 empresas está abierta a esa hora
 * (`facturas-0015` es de american_classic sola y el bloque `all-05xx` arranca
 * 2 h después), así que la separación mínima de 15 min de sesión única sobra.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}.
 * Query params (opcionales, todos convierten la corrida en 'manual'):
 *   empresas=a,b,c   subconjunto de las 6 (default: todas)
 *   limite=N         tope de documentos por empresa (default: TOPE_POR_CORRIDA)
 */

import { NextRequest, NextResponse } from "next/server";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import { sincronizarLineas } from "@/lib/switch-api/sync-factura-lineas";
import { empresasConDetalleDeLinea } from "@/lib/switch-api/factura-lineas-parse";
import { isEmpresaKey } from "@/lib/switch-api/empresas";
import type { EmpresaKey } from "@/lib/empresa-mapping";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";
import { alertSwitchCronErrors } from "@/lib/switch-api/alert-policy";

export const dynamic = "force-dynamic";
export const maxDuration = 800; // techo del plan (Pro + Fluid)

const CRON_NAME = "sync-factura-lineas";

/**
 * Cuántos documentos baja UNA corrida del cron, por empresa.
 *
 * 300 × 6 empresas = 1.800 documentos, que a los ~2,5 documentos/segundo
 * medidos contra producción son ~12 min: cómodo dentro de los 800 s por
 * empresa y con margen de sobra para el peor día. En régimen normal nunca se
 * alcanza (son decenas de documentos por día).
 */
const TOPE_POR_CORRIDA = 300;

async function handleCron(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const hasParams = [...sp.keys()].length > 0;

  const todas = empresasConDetalleDeLinea();
  let empresas: EmpresaKey[] = todas;
  const empresasParam = sp.get("empresas");
  if (empresasParam !== null) {
    const raw = empresasParam.split(",").map((s) => s.trim()).filter(Boolean);
    const invalidas = raw.filter(
      (e) => !isEmpresaKey(e) || !todas.includes(e as EmpresaKey),
    );
    if (invalidas.length > 0) {
      return NextResponse.json(
        { ok: false, error: `empresa(s) sin detalle de línea: ${invalidas.join(", ")}` },
        { status: 400 },
      );
    }
    empresas = [...new Set(raw)] as EmpresaKey[];
  }

  let limite = TOPE_POR_CORRIDA;
  const limiteParam = sp.get("limite");
  if (limiteParam !== null) {
    const n = parseInt(limiteParam, 10);
    // El techo duro se conserva incluso a mano: pedir 50.000 desde la barra de
    // direcciones sería la misma corrida infinita que el tope existe para evitar.
    if (!Number.isInteger(n) || n < 1 || n > TOPE_POR_CORRIDA * 10) {
      return NextResponse.json(
        { ok: false, error: `limite inválido (1..${TOPE_POR_CORRIDA * 10})` },
        { status: 400 },
      );
    }
    limite = n;
  }

  const resultados = await sincronizarLineas({
    empresas,
    limitePorEmpresa: limite,
    triggeredBy: hasParams ? "manual" : "cron",
  });

  const errores = resultados.filter((r) => !r.ok);
  // Heartbeat de éxito SOLO si TODAS corrieron bien. Si alguna falló, no se
  // registra y la política anti-ruido decide si despertar a alguien: un fallo
  // suelto se calla (la corrida de mañana lo reintenta, es reanudable), dos
  // seguidas del mismo par avisan.
  if (errores.length === 0) {
    await recordCronHeartbeat(CRON_NAME);
  } else {
    await alertSwitchCronErrors(
      CRON_NAME,
      errores.map((e) => ({
        empresaKey: e.empresaKey,
        syncType: "factura_lineas",
        error: e.error ?? "error",
      })),
    );
  }

  return NextResponse.json(
    {
      ok: errores.length === 0,
      tope: limite,
      resultados,
      // Si esto viene en true, la carga histórica todavía no terminó y el cron
      // la está comiendo de a `tope` por día. Se acelera con el script.
      quedaronPendientes: resultados.some(
        (r) => r.ok && r.pendientesAlEmpezar >= limite,
      ),
    },
    { status: errores.length === 0 ? 200 : 207 },
  );
}

// Higiene de sesión única: al terminar —éxito o fallo— se cierran las sesiones
// de Switch que este proceso abrió. Sin esto el token queda vivo ~60 min y mata
// el login del próximo cron que toque la misma empresa (code 0006).
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    return await handleCron(req);
  } finally {
    await logoutAllSwitchSessions();
  }
}
