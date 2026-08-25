/**
 * Cron de INGRESO DE MERCANCÍA — trae de Switch las COMPRAS de las 6 empresas
 * de Fashion Group y las deja en `switch_ingresos_mercancia`.
 *
 * Corre 1×/día a las **09:05 UTC = 04:05 a.m. de Panamá**.
 *
 * ── 🩸 POR QUÉ EXISTE ───────────────────────────────────────────────────────
 *
 * La tabla se cargó A MANO una sola vez (11-ago-2026) y nadie la actualizaba: al
 * 24-ago tenía datos hasta el **7-ago**. De ella sale el "Compré · Vendí · Me
 * quedan" de Ventas › Referencia, y de ahí salió la proyección con la que Daniel
 * compró **7.620 pares por $186.614**. Una compra que no está cargada no hace
 * que el número se vea viejo: hace que el **% vendido salga MÁS ALTO de lo
 * real**, o sea que la pantalla diga "se vendió casi todo" con la bodega llena.
 * El detalle está en el encabezado de `ingresos-mercancia-web.ts`.
 *
 * ── Por qué esa hora, y por qué NO entre las 00:20 y las 05:20 UTC ──────────
 *
 * El login web usa `changesession="SI"`, que TOMA la sesión y EXPULSA a quien
 * esté en el panel de esa empresa. El usuario configurado en
 * `SWITCH_<EMPRESA>_WEB_USER` es el de **Daniel**, así que la hora se elige para
 * que no haya nadie adentro.
 *
 * ⚠️ Los crons de Vercel van en **UTC**, y Panamá es **UTC−5 fijo**. La franja
 * 00:20-05:20 UTC —que a primera vista parece de madrugada— es en realidad
 * **19:20 a 00:20 de Panamá**, o sea la tarde-noche. La madrugada de Panamá es
 * **06:00-11:00 UTC**, y ahí ya viven `sync-utilidad` (07:00), `boston-cartera`
 * (08:10) y `sync-egresos-varios` (10:35), los tres con el mismo login web.
 *
 * **09:05 UTC en concreto**, y NO se eligió a ojo. `scripts/_verif-hueco-
 * ingresos-mercancia.ts` recorre la franja minuto a minuto contra
 * `SWITCH_CRON_ENTRADAS` y mide la distancia al vecino más cercano que comparte
 * alguna de las 6 empresas (43 entradas del calendario comparten al menos una).
 * Medido el 25-ago-2026, a 09:05 le queda:
 *   • `switch-articulos` 08:40 (las 8 empresas) → **25 min** por detrás. Es la
 *     vecina crítica: su barrido completo tarda 204 s medidos, o sea que termina
 *     08:43 en el peor caso y quedan **22 min de aire REAL**.
 *   • `sync-proveedores` 09:30 → **25 min** por delante.
 *   • `switch-reconciliacion` 10:00 (puede correr 740 s) → 55 min.
 *   • `sync-recibos` 07:50 → 75 min. `sync-egresos-varios` 10:35 → 90 min.
 *     `sync-utilidad` 07:00 → 125 min.
 *   • `db-salud` 09:55 no toca Switch.
 *
 * ⚠️ **09:05 NO es el minuto más ancho de la franja, y se eligió igual.** El
 * máximo medido es **06:20 UTC, con 40 min** — y se descartó a propósito: cae a
 * **10 minutos de la ventana de deploy** (05:50-06:10 UTC) y a 10 del
 * `switch-sync all` de las 06:30. Diez minutos de margen contra un deploy no son
 * margen. 09:05 es la franja que dejó libre `sync-mayor` al retirarse el
 * 13-ago-2026 —o sea que ya estaba probada por un cron de login web que tocaba
 * las 8 empresas— y sus 25 min por lado son 10 más de lo que exige
 * `SEPARACION_MINIMA_MIN`. Fuera de las dos ventanas de deploy.
 *
 * 🩸 La banda 00:00-05:00 UTC ni se intentó: además de ser la tarde-noche de
 * Panamá, ahí el candado de `cleanup-sessions` exige 30 min entre crons — es lo
 * que rechazó el primer horario de `sync-factura-lineas` el 24-ago-2026.
 *
 * ── Frecuencia: 1×/día ─────────────────────────────────────────────────────
 * Una compra entra por contenedor, no por minuto. Verla a las 4 a.m. del día
 * siguiente es la diferencia entre "17 días de atraso" y "ninguno"; más
 * frecuencia solo multiplicaría las veces que se le toma la sesión a Daniel.
 *
 * ── 🔴 SI EL CUADRE NO DA, ESA EMPRESA NO ESCRIBE NADA ─────────────────────
 * Fail-closed, y queda `error` en `switch_sync_log`. Ver el encabezado de la
 * librería: cargar un detalle truncado deja la pantalla mintiendo hacia el lado
 * que hace comprar de más.
 *
 * ── El aviso es fail-OPEN y NO estrena una alerta nueva ────────────────────
 * Un fallo suelto no despierta a nadie: se reusa `alertSwitchCronErrors`, o sea
 * la política de siempre (dos corridas seguidas del mismo par avisan, canal
 * 🔧 SISTEMA). Daniel tiene 3 alertas de sistema aprobadas y no quiere una 4ª.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`.
 * Query params (opcionales, uso manual):
 *   empresas=a,b     solo esas empresas (siempre dentro de las 6).
 *   desde=&hasta=    rango exacto (backfill acotado o certificación contra un
 *                    archivo bajado a mano). Los dos o ninguno.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  syncAllIngresos,
  INGRESOS_EMPRESA_KEYS,
  type ResultadoIngresosEmpresa,
} from "@/lib/switch-api/ingresos-mercancia-web";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";
import { alertSwitchCronErrors } from "@/lib/switch-api/alert-policy";

export const dynamic = "force-dynamic";
export const maxDuration = 800; // techo del plan (Pro + Fluid).

const CRON_NAME = "sync-ingresos-mercancia";
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const pedidas = sp.get("empresas")?.split(",").map((s) => s.trim()).filter(Boolean);
  // 🔴 Siempre dentro de las 6. Un `?empresas=confecciones_boston` no abre una
  // puerta lateral: se filtra contra el universo, no se confía en el que llama.
  const empresas = pedidas?.length
    ? pedidas.filter((e) => INGRESOS_EMPRESA_KEYS.includes(e))
    : INGRESOS_EMPRESA_KEYS;

  if (empresas.length === 0) {
    return NextResponse.json(
      { ok: false, error: "ninguna de las empresas pedidas está en el universo de Ventas › Referencia" },
      { status: 400 },
    );
  }

  const desde = sp.get("desde");
  const hasta = sp.get("hasta");
  // Los dos o ninguno: un rango a medias pediría un período que nadie eligió.
  const rango =
    desde && hasta && FECHA_RE.test(desde) && FECHA_RE.test(hasta) && desde <= hasta
      ? { desde, hasta }
      : undefined;

  const resultados: ResultadoIngresosEmpresa[] = await syncAllIngresos(empresas, rango);
  const fallidas = resultados.filter((r) => !r.ok);

  // Heartbeat SOLO si TODO salió bien. Si algo falló, el heartbeat no se
  // refresca (el vigía lo ve envejecer) y el error pasa por la política
  // anti-ruido de siempre: un fallo suelto se calla, dos corridas seguidas del
  // mismo par avisan. NO se agrega una alerta de sistema nueva.
  if (fallidas.length === 0) {
    await recordCronHeartbeat(CRON_NAME);
  } else {
    await alertSwitchCronErrors(
      CRON_NAME,
      fallidas.map((r) => ({
        empresaKey: r.empresaKey,
        syncType: "ingresos_mercancia" as const,
        error: r.error ?? "error",
      })),
      {
        nota:
          "Las compras de esa empresa NO se tocaron (fail-closed). " +
          "Ventas › Referencia sigue mostrando lo último que sí cuadró.",
      },
    );
  }

  return NextResponse.json(
    {
      ok: fallidas.length === 0,
      empresas: empresas.length,
      rango: rango ?? null,
      // Si alguna corrida no dejó fila en switch_sync_log es que el CHECK de
      // `sync_type` todavía no tiene 'ingresos_mercancia' (DDL manual
      // pendiente). Los datos SÍ se escriben; lo que falta es la trazabilidad.
      sinLog: resultados.filter((r) => !r.logRegistrado).map((r) => r.empresaKey),
      resultados,
    },
    { status: fallidas.length === 0 ? 200 : 500 },
  );
}
