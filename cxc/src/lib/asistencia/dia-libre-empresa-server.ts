/* ─────────────────────────────────────────────────────────────────────────────
 * EL DÍA LIBRE DE LA EMPRESA — la parte que toca la base.
 *
 * La REGLA vive en `dia-libre-empresa.ts` (módulo puro). Acá solo se lee y se
 * escribe, con la tolerancia de siempre: sin las tablas de la migración
 * `20261203120000`, todo se comporta EXACTAMENTE como el día anterior —nadie
 * debe nada, nadie paga nada, el neto no se mueve— y quien llama recibe
 * `faltaTabla: true` para decirlo en pantalla.
 *
 * 🔴 FALLA ABIERTA A PROPÓSITO, y solo en esta dirección: no poder LEER la
 * deuda hace que no se cobre (la persona cobra su extra completo, como ayer).
 * No poder ESCRIBIRLA, en cambio, se dice y se corta: un día libre que se
 * guarda como justificación y no deja deuda regalaría el día dos veces.
 * ────────────────────────────────────────────────────────────────────────── */

import { supabaseServer } from "@/lib/supabase-server";
import {
  esTablaDiaLibreFaltante,
  saldosDiaLibre,
  type DeudaDiaLibre,
  type PagoDiaLibre,
  type SaldoDiaLibre,
} from "./dia-libre-empresa";
import { deudaDelDiaLibre, diasHabilesDelRango, MAX_DIAS_DE_UNA_CARGA } from "./dia-libre-empresa";
import { leerPersonas, leerReglas } from "./config-server";
import { trabajaEseDia } from "./vigencia";
import { vigenciasDeFilas } from "./config-server";
import { rataPorHoraCalculo } from "./rata";

export const TABLA_DEUDA = "asistencia_dia_libre_deuda";
export const TABLA_PAGO = "asistencia_dia_libre_pago";

export interface SaldosLeidos {
  /** Por código. Vacío cuando no hay deudas o cuando falta la migración. */
  saldos: Map<string, SaldoDiaLibre>;
  /** Las deudas vivas, tal cual, para poder mostrarlas día por día. */
  deudas: DeudaDiaLibre[];
  faltaTabla: boolean;
}

const VACIO: SaldosLeidos = { saldos: new Map(), deudas: [], faltaTabla: true };

/**
 * El saldo de TODOS, sin filtrar por fecha.
 *
 * ⚠️ La deuda arrastra sin límite, así que acá NO se acota por quincena: un
 * filtro de fechas haría que la deuda de mayo desapareciera sola en junio.
 */
export async function leerSaldosDiaLibre(): Promise<SaldosLeidos> {
  const [d, p] = await Promise.all([
    // ⚠️ `.eq("deleted", false)` y NO el `.or(deleted.is.null…)` de Préstamos:
    // acá la columna es `NOT NULL DEFAULT false` por migración, así que un
    // `null` no existe. En Préstamos sí, y por eso allá hace falta el `.or`.
    supabaseServer.from(TABLA_DEUDA)
      .select("empleado_codigo, fecha, monto")
      .eq("deleted", false)
      .order("fecha", { ascending: true }),
    supabaseServer.from(TABLA_PAGO)
      .select("empleado_codigo, quincena, monto")
      .eq("deleted", false),
  ]);
  if (esTablaDiaLibreFaltante(d.error) || esTablaDiaLibreFaltante(p.error)) return { ...VACIO };
  if (d.error) throw new Error(`No se pudo leer ${TABLA_DEUDA}: ${d.error.message}`);
  if (p.error) throw new Error(`No se pudo leer ${TABLA_PAGO}: ${p.error.message}`);

  const deudas: DeudaDiaLibre[] = (d.data ?? []).map((r) => ({
    empleado_codigo: String(r.empleado_codigo),
    fecha: String(r.fecha),
    monto: Number(r.monto),
  }));
  const pagos: PagoDiaLibre[] = (p.data ?? []).map((r) => ({
    empleado_codigo: String(r.empleado_codigo),
    quincena: String(r.quincena),
    monto: Number(r.monto),
  }));
  return { saldos: saldosDiaLibre(deudas, pagos), deudas, faltaTabla: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// CARGAR UN DÍA LIBRE
// ─────────────────────────────────────────────────────────────────────────────

/** Una deuda a crear: una persona, un día, un monto ya calculado. */
export interface DeudaACrear {
  codigo: string;
  empresaKey: string | null;
  fecha: string;
  monto: number;
  rataHora: number;
}

export interface ResultadoCarga {
  creadas: number;
  /** Las que ya existían (misma persona, mismo día): no se cobran dos veces. */
  repetidas: number;
  faltaTabla: boolean;
}

/**
 * Anota las deudas de un día libre.
 *
 * 🔴 UNA SOLA PUERTA. La usan el alta por empresa y el alta de una persona
 * suelta desde Justificaciones: dos caminos que escriban esta tabla por su
 * cuenta son dos reglas que se separan, y la que se quede vieja regala horas.
 *
 * 🔑 El repetido NO es un error: el índice único `(empleado_codigo, fecha)`
 * entre vivas lo rechaza y acá se cuenta aparte. Cargar dos veces el mismo día
 * libre tiene que ser inofensivo — si tirara error, quien recarga la pantalla
 * creería que no se guardó nada.
 */
export async function registrarDeudasDiaLibre(
  deudas: readonly DeudaACrear[],
  usuario: string,
  nota: string | null = null,
): Promise<ResultadoCarga> {
  if (deudas.length === 0) return { creadas: 0, repetidas: 0, faltaTabla: false };

  const { data: yaHay, error: errLee } = await supabaseServer
    .from(TABLA_DEUDA)
    .select("empleado_codigo, fecha")
    .eq("deleted", false)
    .in("empleado_codigo", [...new Set(deudas.map((d) => d.codigo))]);
  if (esTablaDiaLibreFaltante(errLee)) return { creadas: 0, repetidas: 0, faltaTabla: true };
  if (errLee) throw new Error(`No se pudo leer ${TABLA_DEUDA}: ${errLee.message}`);

  const hechas = new Set((yaHay ?? []).map((r) => `${String(r.empleado_codigo)}|${String(r.fecha)}`));
  const faltan = deudas.filter((d) => !hechas.has(`${d.codigo}|${d.fecha}`));
  if (faltan.length === 0) {
    return { creadas: 0, repetidas: deudas.length, faltaTabla: false };
  }

  const { error } = await supabaseServer.from(TABLA_DEUDA).insert(
    faltan.map((d) => ({
      empleado_codigo: d.codigo,
      empresa_key: d.empresaKey,
      fecha: d.fecha,
      monto: d.monto,
      rata_hora: d.rataHora,
      nota,
      creado_por: usuario,
    })),
  );
  if (esTablaDiaLibreFaltante(error)) return { creadas: 0, repetidas: 0, faltaTabla: true };
  if (error) throw new Error(`No se pudo anotar el día libre: ${error.message}`);
  return { creadas: faltan.length, repetidas: deudas.length - faltan.length, faltaTabla: false };
}

/**
 * Quita un día libre cargado por error. 🔴 Soft delete firmado, NUNCA un DELETE.
 */
export async function quitarDeudaDiaLibre(
  id: string,
  usuario: string,
): Promise<{ ok: boolean; faltaTabla: boolean }> {
  const { error } = await supabaseServer
    .from(TABLA_DEUDA)
    .update({ deleted: true, deleted_por: usuario, deleted_en: new Date().toISOString() })
    .eq("id", id);
  if (esTablaDiaLibreFaltante(error)) return { ok: false, faltaTabla: true };
  if (error) throw new Error(`No se pudo quitar el día libre: ${error.message}`);
  return { ok: true, faltaTabla: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// EL CIERRE — anotar lo que las horas extra pagaron
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que una línea del cuadro le pagó a su deuda. */
export interface PagoACerrar {
  codigo: string;
  monto: number;
}

/**
 * Anota los pagos de un cuadro cerrado.
 *
 * 🔴 CERRAR DOS VECES NO COBRA DOS VECES: el índice único
 * `(empleado_codigo, quincena)` entre vivas es el freno de verdad, y acá se lee
 * antes para no intentar lo que ya está. Mismo trato que el pago del préstamo.
 *
 * 🔑 Solo montos > 0: una quincena que no cobró nada no deja fila.
 */
export async function escribirPagosDiaLibre(opts: {
  planillaId: string;
  quincena: string;
  pagos: readonly PagoACerrar[];
  usuario: string;
}): Promise<{ escritos: number; total: number; faltaTabla: boolean }> {
  const pagos = opts.pagos.filter((p) => p.monto > 0);
  if (pagos.length === 0) return { escritos: 0, total: 0, faltaTabla: false };

  const { data: yaHay, error: errLee } = await supabaseServer
    .from(TABLA_PAGO)
    .select("empleado_codigo")
    .eq("quincena", opts.quincena)
    .eq("deleted", false)
    .in("empleado_codigo", pagos.map((p) => p.codigo));
  if (esTablaDiaLibreFaltante(errLee)) return { escritos: 0, total: 0, faltaTabla: true };
  if (errLee) throw new Error(`No se pudo leer ${TABLA_PAGO}: ${errLee.message}`);

  const hechos = new Set((yaHay ?? []).map((r) => String(r.empleado_codigo)));
  const faltan = pagos.filter((p) => !hechos.has(p.codigo));
  if (faltan.length === 0) return { escritos: 0, total: 0, faltaTabla: false };

  const { error } = await supabaseServer.from(TABLA_PAGO).insert(
    faltan.map((p) => ({
      empleado_codigo: p.codigo,
      quincena: opts.quincena,
      planilla_id: opts.planillaId,
      monto: p.monto,
      creado_por: opts.usuario,
    })),
  );
  if (esTablaDiaLibreFaltante(error)) return { escritos: 0, total: 0, faltaTabla: true };
  if (error) throw new Error(`No se pudo anotar el pago del día libre: ${error.message}`);
  const total = Math.round(faltan.reduce((s, p) => s + p.monto, 0) * 100) / 100;
  return { escritos: faltan.length, total, faltaTabla: false };
}

/**
 * Reabrir devuelve la deuda.
 *
 * 🩸 Sin esto, reabrir dejaría la deuda bajada por un cuadro que ya no vale, y
 * al volver a cerrar la persona pagaría dos veces las mismas horas extra. Es la
 * misma razón por la que se revierte el pago del préstamo.
 *
 * 🔴 Soft delete firmado, NUNCA un DELETE.
 */
export async function revertirPagosDiaLibre(opts: {
  planillaId: string;
  usuario: string;
}): Promise<{ revertidos: number; faltaTabla: boolean }> {
  const { data, error } = await supabaseServer
    .from(TABLA_PAGO)
    .select("id")
    .eq("planilla_id", opts.planillaId)
    .eq("deleted", false);
  if (esTablaDiaLibreFaltante(error)) return { revertidos: 0, faltaTabla: true };
  if (error) throw new Error(`No se pudo leer ${TABLA_PAGO}: ${error.message}`);
  const ids = (data ?? []).map((r) => r.id);
  if (ids.length === 0) return { revertidos: 0, faltaTabla: false };

  const { error: errUp } = await supabaseServer
    .from(TABLA_PAGO)
    .update({ deleted: true, deleted_por: opts.usuario, deleted_en: new Date().toISOString() })
    .in("id", ids);
  if (errUp) throw new Error(`No se pudo revertir el pago del día libre: ${errUp.message}`);
  return { revertidos: ids.length, faltaTabla: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA ÚNICA PUERTA PARA CARGAR UN DÍA LIBRE
//
// La usan los DOS caminos: el alta por empresa (`/api/asistencia/dia-libre`) y
// el alta de una persona suelta desde Justificaciones. Dos caminos que armen la
// deuda por su cuenta son dos reglas que se separan, y la que se quede vieja
// regala horas sin que nadie lo vea.
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanDeCargaDiaLibre {
  /** Las deudas a crear, con su monto ya congelado. */
  deudas: DeudaACrear[];
  /** A quién hay que justificarle el día (trabajaba alguno de esos días). */
  codigos: string[];
  /** A quién NO se le pudo calcular la deuda, por NOMBRE. 🔴 Se dice. */
  sinRata: string[];
  /** Los días hábiles del rango. */
  dias: string[];
  /** Por qué no se puede cargar. `null` = se puede. */
  error: string | null;
}

/**
 * Arma —sin escribir nada— todo lo que una carga tendría que guardar.
 *
 * 🔑 Separado de la escritura a propósito: así la ruta puede rechazar con un
 * mensaje en español ANTES de tocar la base, y el candado puede probar la regla
 * sin una base.
 */
export async function planearCargaDiaLibre(opts: {
  empresa?: string | null;
  codigo?: string | null;
  desde: string;
  hasta: string;
}): Promise<PlanDeCargaDiaLibre> {
  const vacio = { deudas: [], codigos: [], sinRata: [], dias: [] };
  const dias = diasHabilesDelRango(opts.desde, opts.hasta);
  if (dias.length === 0) {
    return {
      ...vacio,
      error: "Ese rango no tiene ningún día hábil: un día libre se carga sobre un día de trabajo.",
    };
  }
  if (dias.length > MAX_DIAS_DE_UNA_CARGA) {
    return {
      ...vacio,
      error: "Son demasiados días para un día libre de la empresa. Carga un rango más corto.",
    };
  }

  const [{ reglas }, personasDb] = await Promise.all([leerReglas(), leerPersonas()]);
  const vigencias = vigenciasDeFilas(personasDb.filas);
  const codigo = (opts.codigo ?? "").trim();
  const empresa = (opts.empresa ?? "").trim();
  const elegidas = personasDb.filas.filter((f) => {
    const cod = String(f.empleado_codigo);
    if (codigo) return cod === codigo;
    return String(f.empresa ?? "") === empresa;
  });
  if (elegidas.length === 0) {
    return {
      ...vacio, dias,
      error: codigo ? "Ese colaborador no tiene ficha." : "No hay colaboradores en esa empresa.",
    };
  }

  // 🔴 LO QUE SE SALTA SE DICE, CON NOMBRE. Un día libre que se carga «para
  // todos» y deja gente afuera en silencio es la forma de que la contadora
  // descubra el hueco en el cuadro, dos semanas después.
  const deudas: DeudaACrear[] = [];
  const sinRata: string[] = [];
  const codigos: string[] = [];
  for (const f of elegidas) {
    const cod = String(f.empleado_codigo);
    const salario = f.salario_mensual === null ? null : Number(f.salario_mensual);
    const rata = rataPorHoraCalculo(salario, Number(f.jornada_semanal ?? 0), reglas);
    const monto = deudaDelDiaLibre(rata);
    let tuvoAlgunDia = false;
    for (const fecha of dias) {
      // Quien todavía no había entrado —o ya se había ido— no recibió ningún día
      // libre: no se le justifica ni se le cobra nada.
      if (!trabajaEseDia(vigencias.get(cod), fecha)) continue;
      tuvoAlgunDia = true;
      if (monto === null || rata === null) continue;
      deudas.push({ codigo: cod, empresaKey: f.empresa ?? null, fecha, monto, rataHora: rata });
    }
    if (!tuvoAlgunDia) continue;
    codigos.push(cod);
    if (monto === null) sinRata.push(f.nombre ?? cod);
  }

  if (codigos.length === 0) {
    return { ...vacio, dias, error: "Nadie estaba trabajando en esos días." };
  }
  return { deudas, codigos, sinRata, dias, error: null };
}

export interface CargaHecha extends ResultadoCarga {
  codigos: string[];
  sinRata: string[];
  dias: number;
  error: string | null;
}

/**
 * Planea y anota la DEUDA de un día libre. NO escribe la justificación: eso lo
 * hace quien llama, y siempre DESPUÉS — si falta la migración no se guarda nada.
 */
export async function cargarDeudasDiaLibre(opts: {
  empresa?: string | null;
  codigo?: string | null;
  desde: string;
  hasta: string;
  nota: string | null;
  usuario: string;
}): Promise<CargaHecha> {
  const plan = await planearCargaDiaLibre(opts);
  if (plan.error) {
    return {
      creadas: 0, repetidas: 0, faltaTabla: false,
      codigos: [], sinRata: [], dias: plan.dias.length, error: plan.error,
    };
  }
  const r = await registrarDeudasDiaLibre(plan.deudas, opts.usuario, opts.nota);
  return {
    ...r,
    codigos: plan.codigos,
    sinRata: plan.sinRata,
    dias: plan.dias.length,
    error: null,
  };
}
