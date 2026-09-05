/* ─────────────────────────────────────────────────────────────────────────────
 * LO QUE LA PANTALLA DE PRÉSTAMOS NECESITA SABER, JUNTADO UNA SOLA VEZ.
 *
 * La regla vive en los módulos PUROS (`prestamos-saldo`, `prestamos-tope`,
 * `prestamos-conceptos`); acá solo se junta el dato — y se junta acá y no en la
 * página y en la ruta por separado, que es como la lista y su API terminaron
 * mostrando cosas distintas del mismo día.
 *
 * ── 🔴 LA PERSONA SALE DE ASISTENCIA, SIEMPRE ────────────────────────────────
 *
 * Daniel, 5-sep-2026: *«deberías de usar el nombre de asistencia para que todo
 * tenga coherencia»*. De `asistencia_personas` salen las tres cosas que la
 * ficha de préstamo no puede saber sola:
 *
 *   · el NOMBRE            — para que las dos pantallas hablen de la misma persona;
 *   · si TRABAJA           — reemplaza a la bandera `activo` de la ficha, que
 *                            nunca significó eso (ESMER pagó sus $600, le
 *                            archivaron la ficha, y sigue trabajando);
 *   · el SALARIO MENSUAL   — que es el tope de lo que puede deber.
 *
 * ⚠️ Y también sale la LISTA COMPLETA de las 37 personas activas, deban o no:
 * es lo que se busca arriba de la pantalla y de donde se elige a alguien para
 * un préstamo nuevo. Antes solo salían las 15 que ya tenían ficha, así que para
 * prestarle a alguien nuevo había que teclear su nombre a mano — y un nombre
 * tecleado es una ficha que la planilla no puede atar.
 * ────────────────────────────────────────────────────────────────────────── */

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import {
  calcularSaldoPrestamo,
  cuentaMasVieja,
  pendienteDeAprobacion,
  type CuentaPrestamo,
  type MovimientoParaSaldo,
} from "@/lib/prestamos-saldo";
import { getQuincenaRangePanama, hoyPanamaYmd } from "@/lib/prestamos-quincena";
import { CONCEPTO_PAGO, esPagoDeQuincena } from "@/lib/prestamos-conceptos";

export interface MovimientoFicha extends MovimientoParaSaldo {
  id: string;
  empleado_id: string;
  fecha: string;
  notas: string | null;
  origen_pago: string | null;
  created_at: string;
}

/** Una persona de Asistencia. Es la identidad; la ficha es solo su cuenta. */
export interface Colaborador {
  codigo: string;
  nombre: string;
  /** La key (`confecciones_boston`). */
  empresa: string | null;
  /** El nombre («Confecciones Boston»), que es lo que se ve. */
  empresaNombre: string | null;
  salarioMensual: number | null;
  trabaja: boolean;
  /** La ficha de préstamo de esta persona, si ya tiene una. */
  fichaId: string | null;
  /** Lo que debe hoy. 0 si no debe nada. */
  saldo: number;
}

/** Una ficha con deuda (o con algo esperando aprobación). */
export interface FilaPrestamo {
  id: string;
  /** El nombre de Asistencia cuando está atada; el de la ficha si no. */
  nombre: string;
  empresa: string | null;
  empleadoCodigo: string | null;
  cuotaPrestamo: number;
  cuotaDano: number;
  saldoPrestamo: number;
  saldoDano: number;
  saldo: number;
  prestado: number;
  pagado: number;
  pct: number;
  /** 🔴 Lo que espera la aprobación de Daniel. NO suma al saldo, pero se ve. */
  pendiente: number;
  /** `false` = ya no trabaja: aparece con su saldo, pero no se le descuenta. */
  trabaja: boolean;
  /** Cuál cuenta cobra primero. `null` si no debe nada. */
  cuentaMasVieja: CuentaPrestamo | null;
  /** ¿Ya se le registró el descuento de la quincena vigente? */
  deducidaQuincena: boolean;
  /**
   * Las fechas de sus pagos de QUINCENA aprobados. Es lo que el diálogo de
   * «Aplicar quincena» necesita para recalcular el resumen por la fecha ELEGIDA
   * (no por hoy) sin volver a pedir la base.
   */
  fechasPagosQuincena: string[];
}

export interface DatosPrestamos {
  /** Solo quien debe (o tiene algo esperando). Quien llega a cero sale solo. */
  filas: FilaPrestamo[];
  /** Las personas activas de Asistencia, para buscar y para prestar. */
  colaboradores: Colaborador[];
}

interface FilaEmpleadoDb {
  id: string;
  nombre: string | null;
  empresa: string | null;
  deduccion_quincenal: number | string | null;
  deduccion_dano: number | string | null;
  empleado_codigo: string | null;
  prestamos_movimientos: MovimientoFicha[] | null;
}

interface FilaPersonaDb {
  empleado_codigo: string;
  nombre: string | null;
  empresa: string | null;
  salario_mensual: number | string | null;
  activo: boolean | null;
  fecha_salida: string | null;
}

function num(n: unknown): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

const COLS_EMPLEADO =
  "id, nombre, empresa, deduccion_quincenal, deduccion_dano, empleado_codigo, "
  + "prestamos_movimientos(id, empleado_id, fecha, concepto, monto, notas, estado, deleted, cuenta, origen_pago, created_at)";

/**
 * ¿Esta persona TRABAJA hoy? Misma regla que la ficha de Asistencia: la bandera
 * `activo` **y** que no se haya ido antes de hoy. Se piden las dos porque en
 * producción no siempre coinciden (JENNIFER ARMAS tiene fecha de salida y la
 * bandera en `true`), y para decidir si se le descuenta el sueldo la respuesta
 * conservadora es «si cualquiera de las dos dice que se fue, se fue».
 */
export function personaTrabaja(p: { activo?: boolean | null; fecha_salida?: string | null }, hoy: string): boolean {
  if (p.activo === false) return false;
  const salida = String(p.fecha_salida ?? "").slice(0, 10);
  if (salida && salida < hoy) return false;
  return true;
}

export async function leerDatosPrestamos(hoy: string = hoyPanamaYmd()): Promise<DatosPrestamos> {
  // La quincena vigente, para el chip «✓ Deducida / ⚠ Pendiente» de la lista.
  const q = getQuincenaRangePanama(new Date(`${hoy}T12:00:00Z`));
  const empleados = await leerTodoPaginado<FilaEmpleadoDb>(
    "prestamos_empleados (lista)",
    (pedirCount, from, to) =>
      supabaseServer
        .from("prestamos_empleados")
        .select(COLS_EMPLEADO, pedirCount ? { count: "exact" } : {})
        // `deleted` es NULLABLE en préstamos: un `.eq("deleted", false)` pierde filas.
        .or("deleted.is.null,deleted.eq.false")
        .order("id", { ascending: true })
        .range(from, to),
  );

  const personas = await leerTodoPaginado<FilaPersonaDb>(
    "asistencia_personas (préstamos)",
    (pedirCount, from, to) =>
      supabaseServer
        .from("asistencia_personas")
        .select("empleado_codigo, nombre, empresa, salario_mensual, activo, fecha_salida", pedirCount ? { count: "exact" } : {})
        .order("empleado_codigo", { ascending: true })
        .range(from, to),
  );

  const porCodigo = new Map<string, FilaPersonaDb>();
  for (const p of personas) porCodigo.set(String(p.empleado_codigo).trim(), p);

  const fichaDe = new Map<string, { id: string; saldo: number }>();
  const filas: FilaPrestamo[] = [];

  for (const e of empleados) {
    const movs = (e.prestamos_movimientos ?? []).filter((m) => m.deleted !== true);
    const s = calcularSaldoPrestamo(movs);
    const pend = pendienteDeAprobacion(movs);
    const cod = String(e.empleado_codigo ?? "").trim();
    const persona = cod ? porCodigo.get(cod) : undefined;
    const nombre = String(persona?.nombre ?? e.nombre ?? "").trim() || "Sin nombre";
    // Sin persona en Asistencia no hay sueldo del que descontar: no trabaja.
    const trabaja = persona ? personaTrabaja(persona, hoy) : false;

    if (cod) {
      const prev = fichaDe.get(cod);
      if (!prev || s.saldo > prev.saldo) fichaDe.set(cod, { id: e.id, saldo: s.saldo });
    }

    // 🔴 Solo quien debe. Quien llega a cero sale solo — y lo que espera
    // aprobación también entra, porque esconderlo es el error que ya costó $700.
    if (s.saldo <= 0 && pend.total <= 0) continue;

    // Los pagos de QUINCENA (nunca «Abono extra»: es plata del bolsillo, no del
    // sueldo, y descontarla otra vez sería cobrarle dos veces).
    const fechasPagos = movs
      .filter((m) => m.estado === "aprobado" && m.concepto === CONCEPTO_PAGO && esPagoDeQuincena(m))
      .map((m) => String(m.fecha).slice(0, 10));

    filas.push({
      id: e.id,
      nombre,
      empresa: persona?.empresa ? (EMPRESA_KEY_TO_NAME[persona.empresa] ?? persona.empresa) : e.empresa,
      empleadoCodigo: cod || null,
      cuotaPrestamo: num(e.deduccion_quincenal),
      cuotaDano: num(e.deduccion_dano),
      saldoPrestamo: s.cuentas.prestamo.saldo,
      saldoDano: s.cuentas.dano.saldo,
      saldo: s.saldo,
      prestado: s.prestado,
      pagado: s.pagado,
      pct: s.pct,
      pendiente: pend.total,
      trabaja,
      cuentaMasVieja: cuentaMasVieja(s),
      deducidaQuincena: fechasPagos.some((f) => f >= q.start && f <= q.end),
      fechasPagosQuincena: fechasPagos,
    });
  }

  filas.sort((a, b) => {
    const ea = a.empresa ?? "";
    const eb = b.empresa ?? "";
    if (ea !== eb) return ea.localeCompare(eb, "es");
    if (a.saldo !== b.saldo) return b.saldo - a.saldo;
    return a.nombre.localeCompare(b.nombre, "es");
  });

  const colaboradores: Colaborador[] = personas
    .filter((p) => personaTrabaja(p, hoy))
    .map((p) => {
      const cod = String(p.empleado_codigo).trim();
      const f = fichaDe.get(cod);
      return {
        codigo: cod,
        nombre: String(p.nombre ?? "").trim() || `Código ${cod}`,
        empresa: p.empresa ?? null,
        empresaNombre: p.empresa ? (EMPRESA_KEY_TO_NAME[p.empresa] ?? p.empresa) : null,
        salarioMensual: p.salario_mensual === null || p.salario_mensual === undefined ? null : num(p.salario_mensual),
        trabaja: true,
        fichaId: f?.id ?? null,
        saldo: f?.saldo ?? 0,
      };
    })
    .sort((a, b) => {
      const ea = a.empresaNombre ?? "";
      const eb = b.empresaNombre ?? "";
      if (ea !== eb) return ea.localeCompare(eb, "es");
      return a.nombre.localeCompare(b.nombre, "es");
    });

  return { filas, colaboradores };
}

/**
 * El salario mensual de una persona, para el tope. `null` = no está cargado, y
 * eso NO es cero: el tope cae a $500 (ver `prestamos-tope.ts`).
 */
export async function leerSalarioMensual(codigo: string | null): Promise<number | null> {
  const cod = String(codigo ?? "").trim();
  if (!cod) return null;
  const { data, error } = await supabaseServer
    .from("asistencia_personas")
    .select("salario_mensual")
    .eq("empleado_codigo", cod)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el sueldo de la persona: ${error.message}`);
  const s = data?.salario_mensual;
  return s === null || s === undefined ? null : num(s);
}

/**
 * 🔴 CUÁNTO DEBE CADA PERSONA, POR CÓDIGO — para Asistencia.
 *
 * Daniel, 5-sep-2026: al marcar la fecha de salida de alguien con deuda hay que
 * avisar **ahí mismo**, «Debe $100 — descuéntalo de la liquidación». Es el
 * momento en que se decide la liquidación, y el único en que ese dato sirve:
 * después la persona ya cobró y la plata se fue.
 *
 * Hoy: BRICEIDA MONTERO debe $100 desde marzo.
 *
 * ⚠️ Devuelve el mapa VACÍO si la lectura falla. Es deliberado: este dato es un
 * AVISO al lado de un formulario de otro módulo, y tumbar la pantalla de
 * Asistencia porque Préstamos no contestó sería cambiar un aviso que falta por
 * una planilla que no sale.
 */
export async function leerDeudaPorCodigo(): Promise<Map<string, number>> {
  const deuda = new Map<string, number>();
  try {
    const filas = await leerTodoPaginado<{ empleado_codigo: string | null; prestamos_movimientos: MovimientoParaSaldo[] | null }>(
      "prestamos_empleados (deuda por código)",
      (pedirCount, from, to) =>
        supabaseServer
          .from("prestamos_empleados")
          .select("empleado_codigo, prestamos_movimientos(concepto, monto, estado, deleted, cuenta)", pedirCount ? { count: "exact" } : {})
          // `deleted` es NULLABLE en préstamos: un `.eq("deleted", false)` pierde filas.
          .or("deleted.is.null,deleted.eq.false")
          .order("id", { ascending: true })
          .range(from, to),
    );
    for (const f of filas) {
      const cod = String(f.empleado_codigo ?? "").trim();
      if (!cod) continue;
      const saldo = calcularSaldoPrestamo(f.prestamos_movimientos).saldo;
      if (saldo <= 0) continue;
      deuda.set(cod, (deuda.get(cod) ?? 0) + saldo);
    }
  } catch (e) {
    console.error("[prestamos] no se pudo leer la deuda por código:", e);
  }
  return deuda;
}
