/* ─────────────────────────────────────────────────────────────────────────────
 * El I/O del préstamo de la planilla. La regla vive en `prestamos-planilla.ts`,
 * que es puro; acá solo se junta el dato.
 *
 * 🩸 IGUAL QUE `planilla-server.ts` Y `aprobaciones-server.ts`: si las
 * migraciones todavía no corrieron, esto NO revienta. Devuelve cero préstamos y
 * avisa; la casilla sigue siendo el número tecleado a mano de hoy y la planilla
 * da EXACTAMENTE lo mismo hasta el centavo. En este proyecto los DDL los corre
 * Daniel a mano y varios se quedaron pendientes semanas; que la planilla entera
 * se caiga por eso sería cambiar un aviso por un "Asistencia está rota".
 * ────────────────────────────────────────────────────────────────────────── */

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { esTablaFaltante } from "./config";
import {
  CONCEPTOS_DESCUENTO,
  CONCEPTOS_DEUDA,
  CONCEPTOS_PAGO,
  TABLA_PRESTAMO_APROBADO,
  type AprobacionPrestamo,
  type FichaPrestamo,
} from "./prestamos-planilla";

/** La columna del amarre. Sale de acá para que el `select` y la detección del
 *  error no se puedan separar. */
export const COLUMNA_AMARRE = "empleado_codigo";

// 🔑 Las tres listas de conceptos viven en el módulo PURO (`prestamos-planilla`)
// y se importan de ahí. Escribirlas acá las dejaría fuera del alcance de los
// tests —este archivo importa `supabase-server`— y el candado que impide que
// «Abono extra» se cuele como descuento de planilla no podría existir.

interface FilaEmpleado {
  id: string;
  nombre: string | null;
  activo: boolean | null;
  deduccion_quincenal: number | string | null;
  empleado_codigo?: string | null;
}

interface FilaMovimiento {
  id: string;
  empleado_id: string | null;
  fecha: string;
  concepto: string;
  monto: number | string | null;
}

export interface PrestamosLeidos {
  fichas: FichaPrestamo[];
  /** `true` = la columna del amarre todavía no existe → nadie está atado. */
  faltaColumnaAmarre: boolean;
}

function num(n: unknown): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

/** ¿El error de PostgREST se queja de ESTA columna? */
function esColumnaFaltante(err: unknown, columna: string): boolean {
  if (!err) return false;
  const e = err as { message?: string; details?: string; hint?: string; code?: string };
  const texto = `${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`;
  // 🔑 El error tiene que NOMBRAR la columna. El código solo no alcanza.
  if (!texto.includes(columna)) return false;
  return String(e.code ?? "") === "42703"
    || /does not exist|no existe|could not find/i.test(texto);
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
  const COLS_CON_AMARRE = `id, nombre, activo, deduccion_quincenal, ${COLUMNA_AMARRE}`;
  const COLS_SIN_AMARRE = "id, nombre, activo, deduccion_quincenal";

  let faltaColumnaAmarre = false;
  let empleados: FilaEmpleado[] = [];

  const pedir = (cols: string) =>
    leerTodoPaginado<FilaEmpleado>("prestamos_empleados (planilla)", (pedirCount, from, to) =>
      supabaseServer
        .from("prestamos_empleados")
        // Select EXPLÍCITO, nunca `*`: si mañana la tabla gana una columna,
        // esta consulta sigue trayendo lo mismo.
        .select(cols, pedirCount ? { count: "exact" } : {})
        .eq("deleted", false)
        .order("id", { ascending: true })
        .range(from, to),
    );

  try {
    empleados = await pedir(COLS_CON_AMARRE);
  } catch (e) {
    // 🩸 Sin la columna del amarre NADIE queda atado —o sea, la casilla se
    // sigue escribiendo a mano, como hoy— pero se dice en pantalla.
    if (!esColumnaFaltante({ message: e instanceof Error ? e.message : String(e) }, COLUMNA_AMARRE)) {
      throw e;
    }
    faltaColumnaAmarre = true;
    empleados = await pedir(COLS_SIN_AMARRE);
  }

  const movimientos = await leerTodoPaginado<FilaMovimiento>(
    "prestamos_movimientos (planilla)",
    (pedirCount, from, to) =>
      supabaseServer
        .from("prestamos_movimientos")
        .select("id, empleado_id, fecha, concepto, monto", pedirCount ? { count: "exact" } : {})
        .eq("estado", "aprobado")
        .eq("deleted", false)
        .order("id", { ascending: true })
        .range(from, to),
  );

  const saldoDe = new Map<string, number>();
  const descontadoDe = new Map<string, number>();
  for (const m of movimientos) {
    const emp = String(m.empleado_id ?? "");
    if (!emp) continue;
    const monto = num(m.monto);
    const c = String(m.concepto);
    if ((CONCEPTOS_DEUDA as readonly string[]).includes(c)) {
      saldoDe.set(emp, (saldoDe.get(emp) ?? 0) + monto);
    } else if ((CONCEPTOS_PAGO as readonly string[]).includes(c)) {
      saldoDe.set(emp, (saldoDe.get(emp) ?? 0) - monto);
    }
    // ── Lo YA descontado en esta quincena ────────────────────────────────────
    // 🔑 VENTANA EXACTA, sin la tolerancia de ±3 días que usa la RPC para no
    // deducir dos veces. Acá la tolerancia sería un error: los pagos caen en el
    // 15 y en el 30, o sea justo en el borde, y un pago del 15 entraría a la
    // vez en la quincena 1-15 (exacta) y en la 16-31 (15 ≥ 16−3). El mismo
    // descuento contado dos veces.
    if ((CONCEPTOS_DESCUENTO as readonly string[]).includes(c)) {
      const f = String(m.fecha).slice(0, 10);
      if (f >= desde && f <= hasta) {
        descontadoDe.set(emp, (descontadoDe.get(emp) ?? 0) + monto);
      }
    }
  }

  const fichas: FichaPrestamo[] = empleados.map((e) => ({
    id: String(e.id),
    codigo: faltaColumnaAmarre ? null : (e.empleado_codigo ?? null),
    nombre: String(e.nombre ?? "").trim(),
    // La ficha sin bandera se lee como activa, igual que hace la RPC
    // (`coalesce(activo, true) = true`).
    activo: e.activo !== false,
    cuota: num(e.deduccion_quincenal),
    saldo: saldoDe.get(String(e.id)) ?? 0,
    yaDescontado: descontadoDe.get(String(e.id)) ?? 0,
  }));

  return { fichas, faltaColumnaAmarre };
}

// ─────────────────────────────────────────────────────────────────────────────
// LAS APROBACIONES
// ─────────────────────────────────────────────────────────────────────────────

interface FilaAprobacionDb {
  empleado_codigo: string;
  aprobado: boolean | null;
  monto_visto: number | string | null;
  marcado_por: string | null;
  marcado_en: string | null;
}

export interface AprobacionesPrestamoLeidas {
  /** código → decisión. */
  porCodigo: Map<string, AprobacionPrestamo>;
  /** `true` = la tabla todavía no existe → no se puede aprobar nada. */
  faltaTabla: boolean;
}

export async function leerAprobacionesPrestamo(
  quincenaClave: string,
): Promise<AprobacionesPrestamoLeidas> {
  const { data, error } = await supabaseServer
    .from(TABLA_PRESTAMO_APROBADO)
    .select("empleado_codigo, aprobado, monto_visto, marcado_por, marcado_en")
    .eq("quincena", quincenaClave);

  if (error) {
    if (esTablaFaltante(error, TABLA_PRESTAMO_APROBADO)) {
      return { porCodigo: new Map(), faltaTabla: true };
    }
    throw new Error(error.message);
  }

  const porCodigo = new Map<string, AprobacionPrestamo>();
  for (const f of (data ?? []) as FilaAprobacionDb[]) {
    const codigo = String(f.empleado_codigo).trim();
    porCodigo.set(codigo, {
      codigo,
      aprobado: f.aprobado === true,
      montoVisto: num(f.monto_visto),
      por: f.marcado_por ?? null,
      cuando: f.marcado_en ?? null,
    });
  }
  return { porCodigo, faltaTabla: false };
}

export interface PrestamoAAprobar {
  codigo: string;
  /** Lo que el módulo sugiere AHORA. Es el testigo y lo que va a la casilla. */
  monto: number;
}

/**
 * Guarda (o retira) la aprobación del descuento de una o varias personas.
 *
 * 🔴 QUEDA REGISTRO DE QUIÉN Y CUÁNDO. La fila NUNCA se borra al desaprobar: se
 * pone `aprobado = false`. Un DELETE dejaría el mismo estado que «nadie lo miró
 * nunca», y son dos cosas distintas.
 *
 * ⚠️ Acá NO se toca la casilla. Escribir el monto en
 * `asistencia_planilla_manual` es un paso APARTE y explícito de la ruta, para
 * que se vea que son dos escrituras y en qué orden van.
 */
export async function guardarAprobacionesPrestamo(opts: {
  quincena: string;
  items: readonly PrestamoAAprobar[];
  aprobado: boolean;
  por: string;
  /** Momento en ISO. Entra por parámetro: nada de `new Date()` escondido. */
  cuando: string;
}): Promise<boolean> {
  const filas = opts.items.map((i) => ({
    quincena: opts.quincena,
    empleado_codigo: String(i.codigo).trim(),
    aprobado: opts.aprobado,
    monto_visto: Math.max(0, Math.round(num(i.monto) * 100) / 100),
    marcado_por: opts.por,
    marcado_en: opts.cuando,
  }));
  if (filas.length === 0) return true;

  const { error } = await supabaseServer
    .from(TABLA_PRESTAMO_APROBADO)
    .upsert(filas, { onConflict: "quincena,empleado_codigo" });

  if (error) {
    if (esTablaFaltante(error, TABLA_PRESTAMO_APROBADO)) return false;
    throw new Error(error.message);
  }
  return true;
}
