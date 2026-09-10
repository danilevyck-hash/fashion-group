/* ─────────────────────────────────────────────────────────────────────────────
 * EL I/O DEL PAGO DE PRÉSTAMO QUE ESCRIBE EL CIERRE.
 *
 * La regla vive en `cierre-prestamo.ts`, que es PURO. Acá solo se junta el dato
 * y se escribe.
 *
 * 🔴 EL SALDO NO SE CALCULA ACÁ. Sale de `calcularSaldoPrestamo`
 * (`lib/prestamos-saldo.ts`), la ÚNICA cuenta del módulo — la misma que usan la
 * lista, la ficha y la casilla de la planilla. Había OCHO copias de esta
 * aritmética hasta el 5-sep-2026 y la única que no la usaba era la ficha, con
 * un `console.warn` admitiendo que podía no cuadrar.
 *
 * 🔴 NADA DE FIRE-AND-FORGET. Esto mueve plata: todo va con `await` y un fallo
 * se propaga. Un `.then().catch()` acá sería una deuda que baja a veces.
 * ────────────────────────────────────────────────────────────────────────── */

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import {
  CUENTA_DANO,
  CUENTA_TERCEROS,
  calcularSaldoPrestamo,
  cuentaDeMovimiento,
  type MovimientoParaSaldo,
} from "@/lib/prestamos-saldo";
import { CONCEPTOS_PAGO_DE_CUENTA } from "./prestamos-planilla";
import {
  planDeCierre,
  type DeudaDePersona,
  type PagoAEscribir,
  type PlanDeCierre,
} from "./cierre-prestamo";
import type { LineaPlanilla } from "./planilla";

export const TABLA_AMARRE = "asistencia_planilla_prestamo";

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
}

const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * La deuda de cada persona, POR CÓDIGO.
 *
 * 🔴 EL AMARRE ES EL CÓDIGO, NUNCA EL NOMBRE. Una ficha sin código no entra al
 * mapa, y su persona sale en las omisiones como «no está atado a ninguna ficha»
 * — se DICE, no se adivina por parecido.
 */
export async function leerDeudas(
  desde: string,
  hasta: string,
): Promise<Map<string, DeudaDePersona>> {
  const empleados = await leerTodoPaginado<FilaEmpleado>(
    "prestamos_empleados (cierre)",
    (pedirCount, from, to) =>
      supabaseServer
        .from("prestamos_empleados")
        .select("id, nombre, deduccion_quincenal, deduccion_dano, deduccion_terceros, empleado_codigo",
          pedirCount ? { count: "exact" } : {})
        // 🔑 `deleted` es NULLABLE en préstamos: un `.eq("deleted", false)`
        // PIERDE filas, y perderlas acá es una deuda que no baja.
        .or("deleted.is.null,deleted.eq.false")
        .order("id", { ascending: true })
        .range(from, to),
  );

  const movimientos = await leerTodoPaginado<FilaMovimiento>(
    "prestamos_movimientos (cierre)",
    (pedirCount, from, to) =>
      supabaseServer
        .from("prestamos_movimientos")
        .select("id, empleado_id, fecha, concepto, monto, estado, deleted, cuenta",
          pedirCount ? { count: "exact" } : {})
        .eq("estado", "aprobado")
        .or("deleted.is.null,deleted.eq.false")
        .order("id", { ascending: true })
        .range(from, to),
  );

  const movsDe = new Map<string, FilaMovimiento[]>();
  // 🔴 LO YA DESCONTADO, POR CUENTA. Con tres cuentas, contarlo todo junto
  // dejaría sin anotar la cuenta que todavía no se pagó (regla 2 disparada por
  // el pago de OTRA cuenta).
  const descontadoDe = new Map<string, number>();
  const descontadoTercerosDe = new Map<string, number>();
  const descontadoDanoDe = new Map<string, number>();
  for (const m of movimientos) {
    const emp = String(m.empleado_id ?? "");
    if (!emp) continue;
    const lista = movsDe.get(emp);
    if (lista) lista.push(m);
    else movsDe.set(emp, [m]);
    // Ventana EXACTA, sin tolerancia de días: los pagos caen justo en el borde
    // (el 15 y el 30) y ±3 días haría que el mismo pago entre en dos quincenas.
    if ((CONCEPTOS_PAGO_DE_CUENTA as readonly string[]).includes(String(m.concepto))) {
      const f = String(m.fecha).slice(0, 10);
      if (f >= desde && f <= hasta) {
        const destino =
          cuentaDeMovimiento(m) === CUENTA_TERCEROS ? descontadoTercerosDe
            : cuentaDeMovimiento(m) === CUENTA_DANO ? descontadoDanoDe
              : descontadoDe;
        destino.set(emp, (destino.get(emp) ?? 0) + num(m.monto));
      }
    }
  }

  const out = new Map<string, DeudaDePersona>();
  for (const e of empleados) {
    const codigo = String(e.empleado_codigo ?? "").trim();
    if (!codigo) continue; // sin amarre no hay a quién descontarle
    const s = calcularSaldoPrestamo(movsDe.get(String(e.id)) ?? []);
    out.set(codigo, {
      fichaId: String(e.id),
      codigo,
      nombrePrestamos: String(e.nombre ?? "").trim(),
      saldoPrestamo: s.cuentas.prestamo.saldo,
      saldoDano: s.cuentas.dano.saldo,
      saldoTerceros: s.cuentas.terceros.saldo,
      cuotaPrestamo: num(e.deduccion_quincenal),
      cuotaTerceros: num(e.deduccion_terceros),
      yaDescontado: descontadoDe.get(String(e.id)) ?? 0,
      yaDescontadoTerceros: descontadoTercerosDe.get(String(e.id)) ?? 0,
      yaDescontadoDano: descontadoDanoDe.get(String(e.id)) ?? 0,
    });
  }
  return out;
}

/** El plan, sin escribir nada. Es lo que la pantalla muestra antes de cerrar. */
export async function planearCierre(opts: {
  lineas: readonly LineaPlanilla[];
  desde: string;
  hasta: string;
}): Promise<PlanDeCierre> {
  const deudas = await leerDeudas(opts.desde, opts.hasta);
  // La fecha del pago es el último día del período: el día que la plata se le
  // quitó del sueldo.
  return planDeCierre({ lineas: opts.lineas, deudas, fecha: opts.hasta });
}

export interface ResultadoEscritura {
  escritos: number;
  total: number;
  /** `true` = ya estaban escritos (se cerró dos veces). No se cobró de nuevo. */
  yaEstaban: boolean;
}

/**
 * ESCRIBE los pagos de un cuadro que se acaba de cerrar.
 *
 * 🔴 EL ORDEN NO SE PUEDE MOVER: primero el movimiento, después el amarre.
 * Al revés, un fallo entre los dos dejaría un amarre apuntando a un movimiento
 * que no existe — y el próximo cierre lo leería como «ya está pagado» y no
 * volvería a escribirlo. Así, un fallo en el medio deja un movimiento sin
 * amarre: se ve, se puede arreglar, y **nadie deja de cobrar**.
 *
 * 🔴 CERRAR DOS VECES NO COBRA DOS VECES. Antes de escribir se lee qué amarres
 * ya existen para ese cuadro; el índice único `(planilla_id, empleado_codigo,
 * cuenta)` es el freno de verdad si dos cierres corren a la vez.
 */
export async function escribirPagosDelCierre(opts: {
  planillaId: string;
  plan: PlanDeCierre;
}): Promise<ResultadoEscritura> {
  const { planillaId, plan } = opts;
  if (!plan.pagos.length) return { escritos: 0, total: 0, yaEstaban: false };

  const { data: yaHay, error: errLee } = await supabaseServer
    .from(TABLA_AMARRE)
    .select("empleado_codigo, cuenta")
    .eq("planilla_id", planillaId);
  if (errLee) throw new Error(`No se pudo leer ${TABLA_AMARRE}: ${errLee.message}`);

  const hechos = new Set(
    (yaHay ?? []).map((r) => `${String(r.empleado_codigo)}|${String(r.cuenta)}`),
  );
  const faltan = plan.pagos.filter((p) => !hechos.has(`${p.codigo}|${p.cuenta}`));
  if (!faltan.length) {
    return { escritos: 0, total: 0, yaEstaban: hechos.size > 0 };
  }

  let escritos = 0;
  let total = 0;
  for (const p of faltan) {
    await escribirUnPago(planillaId, p);
    escritos += 1;
    total += p.monto;
  }
  return { escritos, total: Math.round(total * 100) / 100, yaEstaban: hechos.size > 0 };
}

async function escribirUnPago(planillaId: string, p: PagoAEscribir): Promise<void> {
  const { data, error } = await supabaseServer
    .from("prestamos_movimientos")
    .insert({
      empleado_id: p.fichaId,
      fecha: p.fecha,
      concepto: p.concepto,
      cuenta: p.cuenta,
      monto: p.monto,
      // 🔴 APROBADO. La contadora calcula y cierra; Daniel solo mira. Cerrar la
      // quincena ES la aprobación de este pago — dejarlo `pendiente_aprobacion`
      // pondría a esperar una firma que nadie pidió, y a los 7 días el cron lo
      // borraría solo.
      estado: "aprobado",
      origen_pago: p.origenPago,
      // ⚠️ La nota NO es el freno de duplicados (ese es el amarre). Es lo que
      // una persona lee en la ficha para saber de dónde salió este renglón.
      notas: `Descuento de la planilla cerrada del ${p.fecha}`,
    })
    .select("id")
    .single();
  if (error) throw new Error(`No se pudo anotar el pago de ${p.nombrePrestamos}: ${error.message}`);

  const movimientoId = String((data as { id: string }).id);
  const { error: errAmarre } = await supabaseServer.from(TABLA_AMARRE).insert({
    planilla_id: planillaId,
    empleado_codigo: p.codigo,
    cuenta: p.cuenta,
    movimiento_id: movimientoId,
  });
  if (errAmarre) {
    throw new Error(`No se pudo amarrar el pago de ${p.nombrePrestamos}: ${errAmarre.message}`);
  }
}

/**
 * REVIERTE los pagos de un cuadro que se reabre.
 *
 * 🔴 SOFT DELETE, NUNCA UN `DELETE`. El movimiento queda con `deleted = true` y
 * el amarre se firma con quién y cuándo. Lo que se pagó una vez se tiene que
 * poder leer después: es la misma regla que «reabrir no borra ni un renglón».
 *
 * 🔑 SI NO SE REVIERTE, REABRIR DEJA LA DEUDA BAJADA POR UN CUADRO QUE YA NO
 * VALE. Y al volver a cerrar, `yaDescontado` vería ese pago viejo y la casilla
 * caería en el «caso 1» — la deuda bajaría una vez y el sueldo se descontaría
 * dos. Es exactamente el descuadre que este cambio vino a terminar.
 */
export async function revertirPagosDelCierre(opts: {
  planillaId: string;
  usuario: string;
}): Promise<{ revertidos: number }> {
  const { data, error } = await supabaseServer
    .from(TABLA_AMARRE)
    .select("id, movimiento_id")
    .eq("planilla_id", opts.planillaId)
    .is("revertido_en", null);
  if (error) throw new Error(`No se pudo leer ${TABLA_AMARRE}: ${error.message}`);

  const filas = data ?? [];
  if (!filas.length) return { revertidos: 0 };

  const ahora = new Date().toISOString();
  for (const f of filas) {
    const { error: errMov } = await supabaseServer
      .from("prestamos_movimientos")
      .update({ deleted: true })
      .eq("id", String(f.movimiento_id));
    if (errMov) throw new Error(`No se pudo revertir el pago: ${errMov.message}`);

    const { error: errAm } = await supabaseServer
      .from(TABLA_AMARRE)
      .update({ revertido_en: ahora, revertido_por: opts.usuario })
      .eq("id", f.id);
    if (errAm) throw new Error(`No se pudo firmar la reversión: ${errAm.message}`);
  }
  return { revertidos: filas.length };
}
