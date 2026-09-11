/* ─────────────────────────────────────────────────────────────────────────────
 * El I/O del préstamo de la planilla. La regla vive en `prestamos-planilla.ts`,
 * que es puro; acá solo se junta el dato.
 *
 * Historia (2-sep-2026): IGUAL QUE `planilla-server.ts` Y
 * `aprobaciones-server.ts`, si las migraciones todavía no habían corrido esto
 * NO reventaba: sin la columna del amarre releía SIN ella (nadie atado, la
 * casilla a mano como hoy). En este proyecto los DDL los corre Daniel a mano y
 * varios se quedaron pendientes semanas.
 *
 * 🔴 TOLERANCIA RETIRADA EL 3-SEP-2026: `prestamos_empleados.empleado_codigo`
 * existe desde 20260902120000_prestamos_amarre_codigo.sql (verificado por
 * PostgREST en producción). Degradar hoy sería exactamente cómo se perdieron
 * los $700 de LUIS ADRIAN ARROYO durante 22 días (#651): un permiso o un
 * timeout que devuelva el mismo código se leería como «nadie está atado» y la
 * planilla dejaría de descontar en silencio. El error se propaga.
 *
 * 🔴 LA APROBACIÓN QUINCENAL SE RETIRÓ EL 11-SEP-2026 (Daniel: *«quita lo de
 * aprobación a préstamos, no es necesario»*). Acá vivían
 * `leerAprobacionesPrestamo` y `guardarAprobacionesPrestamo`, sobre
 * `asistencia_prestamo_aprobado`. La tabla NO se dropea (patrón `mayor_lineas`)
 * y este archivo ya no la nombra: hay candado que lo exige.
 * ────────────────────────────────────────────────────────────────────────── */

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { esDescuentoDeQuincena, type FichaPrestamo } from "./prestamos-planilla";
import {
  CUENTA_PRESTAMO,
  CUENTA_TERCEROS,
  calcularSaldoPrestamo,
  cuentaDeMovimiento,
  type MovimientoParaSaldo,
} from "@/lib/prestamos-saldo";

/** La columna del amarre (20260902120000). */
export const COLUMNA_AMARRE = "empleado_codigo";

// 🔑 Las listas de conceptos y la regla de «qué es un descuento de quincena»
// viven en el módulo PURO (`prestamos-planilla`) y se importan de ahí.
// Escribirlas acá las dejaría fuera del alcance de los tests —este archivo
// importa `supabase-server`— y el candado que impide que un abono de bolsillo
// se cuele como descuento de planilla no podría existir.

interface FilaEmpleado {
  id: string;
  nombre: string | null;
  deduccion_quincenal: number | string | null;
  deduccion_dano: number | string | null;
  deduccion_terceros?: number | string | null;
  empleado_codigo?: string | null;
}

interface FilaMovimiento extends MovimientoParaSaldo {
  id: string;
  empleado_id: string | null;
  fecha: string;
  concepto: string;
  monto: number | string;
  origen_pago?: string | null;
}

export interface PrestamosLeidos {
  fichas: FichaPrestamo[];
}

function num(n: unknown): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Las fichas de préstamo con su saldo y lo que YA se descontó en el período.
 *
 * 🔴 EL SALDO SE CALCULA CON LA MISMA CUENTA DEL MÓDULO — la de
 * `prestamos_aplicar_quincena` y la de `PrestamosClient`: `prestado − pagado`
 * sobre los movimientos APROBADOS y NO BORRADOS. No es una segunda cuenta: es
 * la misma, sobre las mismas filas.
 *
 * ⚠️ `desde`/`hasta` acotan SOLO `yaDescontado` (qué se descontó en ESTA
 * quincena). El saldo es histórico y no se recorta por fecha: recortarlo daría
 * un saldo falso y una cuota falsa.
 */
export async function leerPrestamosDeQuincena(
  desde: string,
  hasta: string,
): Promise<PrestamosLeidos> {
  const COLS_CON_AMARRE = `id, nombre, deduccion_quincenal, deduccion_dano, deduccion_terceros, ${COLUMNA_AMARRE}`;

  // Sin reintento «sin amarre» (tolerancia a la DDL retirada el 3-sep-2026):
  // si esto falla, la planilla no sale. Ver el encabezado.
  const empleados = await leerTodoPaginado<FilaEmpleado>(
    "prestamos_empleados (planilla)",
    (pedirCount, from, to) =>
      supabaseServer
        .from("prestamos_empleados")
        // Select EXPLÍCITO, nunca `*`: si mañana la tabla gana una columna,
        // esta consulta sigue trayendo lo mismo.
        .select(COLS_CON_AMARRE, pedirCount ? { count: "exact" } : {})
        // 🔑 `deleted` es NULLABLE en préstamos: un `.eq("deleted", false)`
        // PIERDE las filas que quedaron en NULL, y perderlas acá es una casilla
        // de descuento que no aparece y nadie reclama.
        .or("deleted.is.null,deleted.eq.false")
        .order("id", { ascending: true })
        .range(from, to),
  );

  const movimientos = await leerTodoPaginado<FilaMovimiento>(
    "prestamos_movimientos (planilla)",
    (pedirCount, from, to) =>
      supabaseServer
        .from("prestamos_movimientos")
        // 🔴 `origen_pago` VIAJA (11-sep-2026): sin él no se distingue el
        // descuento de la quincena de un abono de bolsillo. Ver el caso de
        // CRISTIAM BLANCO en `prestamos-planilla.ts`.
        .select("id, empleado_id, fecha, concepto, monto, estado, deleted, cuenta, origen_pago", pedirCount ? { count: "exact" } : {})
        .eq("estado", "aprobado")
        .or("deleted.is.null,deleted.eq.false")
        .order("id", { ascending: true })
        .range(from, to),
  );

  // 🔴 EL SALDO SALE DE `calcularSaldoPrestamo`, LA ÚNICA CUENTA DEL MÓDULO.
  // Acá vivía una copia de la aritmética —uno de los OCHO lugares que la
  // escribían aparte hasta el 5-sep-2026—. Ahora también trae las dos cuentas
  // separadas, que es lo que la casilla necesita para capear cada una a SU
  // saldo antes de sumarlas.
  const movsDe = new Map<string, FilaMovimiento[]>();
  const descontadoDe = new Map<string, number>();
  const descontadoTercerosDe = new Map<string, number>();
  for (const m of movimientos) {
    const emp = String(m.empleado_id ?? "");
    if (!emp) continue;
    const lista = movsDe.get(emp);
    if (lista) lista.push(m);
    else movsDe.set(emp, [m]);

    // ── Lo YA descontado en esta quincena ────────────────────────────────────
    // 🔑 VENTANA EXACTA, sin la tolerancia de ±3 días que usa la RPC para no
    // deducir dos veces. Acá la tolerancia sería un error: los pagos caen en el
    // 15 y en el 30, o sea justo en el borde, y un pago del 15 entraría a la
    // vez en la quincena 1-15 (exacta) y en la 16-31 (15 ≥ 16−3). El mismo
    // descuento contado dos veces.
    // 🔴 LO YA DESCONTADO SE SEPARA POR CUENTA. Con tres cuentas, un pago de
    // terceros contado como «ya descontado» del préstamo dejaría al préstamo
    // sin descontar esa quincena (caso 1 de `montoDeFicha`) — la persona
    // pagaría una cuenta y se le perdonaría la otra en silencio.
    // 🔴 Y SOLO LO QUE SALIÓ DE LA QUINCENA (`esDescuentoDeQuincena`): un abono
    // de liquidación, décimo, vacaciones o efectivo baja el saldo pero NO es
    // plata que se le quitó del sueldo — contarlo acá se la quitaría otra vez.
    if (esDescuentoDeQuincena(m)) {
      const f = String(m.fecha).slice(0, 10);
      if (f >= desde && f <= hasta) {
        const cuenta = cuentaDeMovimiento(m);
        if (cuenta === CUENTA_TERCEROS) {
          descontadoTercerosDe.set(emp, (descontadoTercerosDe.get(emp) ?? 0) + num(m.monto));
        } else if (cuenta === CUENTA_PRESTAMO) {
          descontadoDe.set(emp, (descontadoDe.get(emp) ?? 0) + num(m.monto));
        }
        // ⚠️ El DAÑO no lleva «ya descontado»: no propone cuota, así que no hay
        // ninguna estimación a la que un hecho consumado le pueda ganar.
      }
    }
  }

  const fichas: FichaPrestamo[] = empleados.map((e) => {
    const s = calcularSaldoPrestamo(movsDe.get(String(e.id)) ?? []);
    return {
      id: String(e.id),
      codigo: e.empleado_codigo ?? null,
      nombre: String(e.nombre ?? "").trim(),
      cuota: num(e.deduccion_quincenal),
      cuotaDano: num(e.deduccion_dano),
      saldo: s.saldo,
      saldoPrestamo: s.cuentas.prestamo.saldo,
      saldoDano: s.cuentas.dano.saldo,
      yaDescontado: descontadoDe.get(String(e.id)) ?? 0,
      // 🔴 La tercera cuenta, con su cuota de la ficha y su propio saldo.
      cuotaTerceros: num(e.deduccion_terceros),
      saldoTerceros: s.cuentas.terceros.saldo,
      yaDescontadoTerceros: descontadoTercerosDe.get(String(e.id)) ?? 0,
    };
  });

  return { fichas };
}
