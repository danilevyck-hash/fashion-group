// ─────────────────────────────────────────────────────────────────────────────
// Sistema de monitoreo automático de data integrity.
//
// Se ejecuta vía cron diario (/api/cron/integrity-check) y también puede
// dispararse manualmente desde el dashboard (/admin/data-health). Cada check
// devuelve un CheckResult que se persiste en data_integrity_checks (append
// only — el dashboard lee el último por check_name + el historial 30d).
//
// Para agregar un check nuevo: ver .claude/skills/data-integrity/SKILL.md.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { empresasConFacturas } from "@/lib/switch-api/empresas";
import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";

export type Severity = "ok" | "info" | "warning" | "critical";

export interface CheckResult {
  check_name: string;
  table_name: string;
  severity: Severity;
  rows_affected: number;
  threshold_exceeded: boolean;
  details: Record<string, unknown> | null;
}

const SEVERITY_RANK: Record<Severity, number> = { ok: 0, info: 1, warning: 2, critical: 3 };

export function worstSeverity(severities: Severity[]): Severity {
  return severities.reduce<Severity>((acc, s) => (SEVERITY_RANK[s] > SEVERITY_RANK[acc] ? s : acc), "ok");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(a: string | Date, b: string | Date): number {
  const ta = typeof a === "string" ? new Date(a).getTime() : a.getTime();
  const tb = typeof b === "string" ? new Date(b).getTime() : b.getTime();
  return Math.abs(Math.floor((ta - tb) / (1000 * 60 * 60 * 24)));
}

// ── Checks ───────────────────────────────────────────────────────────────────

// CHECK 4: Cheques con campos críticos NULL (monto o fecha_deposito).
async function checkChequesCriticosNull(): Promise<CheckResult> {
  const { count, error } = await supabaseServer
    .from("cheques")
    .select("id", { count: "exact", head: true })
    .or("monto.is.null,fecha_deposito.is.null")
    .eq("deleted", false);

  if (error) {
    return checkError("cheques_criticos_null", "cheques", error.message);
  }

  const c = count ?? 0;
  return {
    check_name: "cheques_criticos_null",
    table_name: "cheques",
    severity: c === 0 ? "ok" : "warning",
    rows_affected: c,
    threshold_exceeded: c > 0,
    details: { threshold: { warning: ">0" } },
  };
}

// CHECK 5: Préstamos con saldo anómalo (más de $100 negativo). prestamos_empleados
// no tiene columna saldo — se deriva de prestamos_movimientos aprobados.
// Préstamo/Responsabilidad suman al saldo, Pago/Abono/Pago_responsabilidad restan.
// Saldo < -100 = el empleado pagó más de lo prestado (margen $100 para redondeo).
const PRESTAMO_CONCEPTOS = new Set(["Préstamo", "Responsabilidad por daño"]);
const PAGO_CONCEPTOS = new Set(["Pago", "Abono extra", "Pago de responsabilidad"]);

async function checkPrestamosSaldoAnomalo(): Promise<CheckResult> {
  const { data, error } = await supabaseServer
    .from("prestamos_movimientos")
    .select("empleado_id, concepto, monto, estado, deleted")
    .eq("estado", "aprobado");

  if (error) {
    return checkError("prestamos_saldo_anomalo", "prestamos_movimientos", error.message);
  }

  const saldoPorEmpleado = new Map<string, number>();
  for (const m of data ?? []) {
    if (m.deleted === true) continue;
    const empId = m.empleado_id as string | null;
    if (!empId) continue;
    const monto = Number(m.monto) || 0;
    const prev = saldoPorEmpleado.get(empId) ?? 0;
    if (PRESTAMO_CONCEPTOS.has(m.concepto)) {
      saldoPorEmpleado.set(empId, prev + monto);
    } else if (PAGO_CONCEPTOS.has(m.concepto)) {
      saldoPorEmpleado.set(empId, prev - monto);
    }
  }

  const anomalos: { empleado_id: string; saldo: number }[] = [];
  for (const [empId, saldo] of saldoPorEmpleado) {
    if (saldo < -100) anomalos.push({ empleado_id: empId, saldo: Math.round(saldo * 100) / 100 });
  }

  const c = anomalos.length;
  return {
    check_name: "prestamos_saldo_anomalo",
    table_name: "prestamos_movimientos",
    severity: c === 0 ? "ok" : "info",
    rows_affected: c,
    threshold_exceeded: c > 0,
    details: {
      sample: anomalos.slice(0, 10),
      threshold: { info: ">0", margin: "saldo < -100 (pagaron más de lo prestado)" },
    },
  };
}

// CHECK 7: Edad del último upload (uno por módulo). Devuelve 2 results.
async function checkLastUploadAge(): Promise<CheckResult[]> {
  const now = new Date();
  const results: CheckResult[] = [];

  for (const [name, table] of [
    ["last_upload_age_cxc", "switch_estadocuenta"],
  ] as const) {
    // SOLO EL GRUPO. En `switch_estadocuenta` conviven las 6 del grupo y
    // `confecciones_boston`, que lleva cartera aparte y se sincroniza por su
    // propio camino (`/api/cron/boston-cartera`). Sin el filtro, este check
    // pregunta "¿hace cuánto se actualizó el CXC?" y le contesta la fila más
    // nueva de CUALQUIERA: un sync de Boston taparía un atraso real del grupo,
    // y el check quedaría en verde justo cuando hay que mirarlo. Hoy no se nota
    // porque Boston va 13 h más atrasada que el grupo (medido 12-ago-2026), o
    // sea que el defecto es LATENTE — el peor tipo de defecto para un vigía.
    const maxFecha = (await supabaseServer
      .from("switch_estadocuenta")
      .select("synced_at")
      .in("empresa_key", CXC_GRUPO_EMPRESA_KEYS)
      .order("synced_at", { ascending: false })
      .limit(1)).data?.[0]?.synced_at ?? null;
    if (!maxFecha) {
      results.push({
        check_name: name, table_name: table,
        severity: "critical", rows_affected: 0, threshold_exceeded: true,
        details: { reason: "tabla vacía o MAX(fecha) IS NULL" },
      });
      continue;
    }
    const ageDays = daysBetween(maxFecha, now);
    const severity: Severity = ageDays < 7 ? "ok" : ageDays <= 14 ? "warning" : "critical";
    results.push({
      check_name: name, table_name: table,
      severity, rows_affected: ageDays, threshold_exceeded: ageDays >= 7,
      details: {
        max_fecha: maxFecha, age_days: ageDays,
        threshold: { warning: ">=7d", critical: ">14d" },
      },
    });
  }
  return results;
}

// CHECK 10: tipos de comprobante fuera de las whitelists de signo del aging
// (🔴-4). switch_estadocuenta_aging trata desconocido/NULL como neutral (0) para
// no inflar CXC; esta vista de vigilancia expone cualquier tipo nuevo. Si tiene
// saldo<>0 está distorsionando CXC (subcuenta un débito o ignora un crédito) →
// critical para clasificarlo ya. Sin saldo = warning (apareció pero aún no pesa).
async function checkAgingTiposSinClasificar(): Promise<CheckResult> {
  const { data, error } = await supabaseServer
    .from("switch_estadocuenta_tipos_sin_clasificar")
    .select("empresa_key, tipo_comprobante, filas, filas_con_saldo, suma_saldo");

  if (error) {
    return checkError("aging_tipos_sin_clasificar", "switch_estadocuenta", error.message);
  }

  const rows = data ?? [];
  const conSaldo = rows.filter(r => Number(r.filas_con_saldo) > 0);
  const count = rows.length;
  const severity: Severity = conSaldo.length > 0 ? "critical" : count > 0 ? "warning" : "ok";

  return {
    check_name: "aging_tipos_sin_clasificar",
    table_name: "switch_estadocuenta",
    severity,
    rows_affected: count,
    threshold_exceeded: count > 0,
    details: {
      sample: rows.slice(0, 20),
      con_saldo: conSaldo.slice(0, 20),
      hint: "tipo_comprobante fuera de las whitelists de signo de switch_estadocuenta_aging. Clasificarlo (crédito vs débito) en una migration nueva. saldo<>0 = ya distorsiona CXC.",
      threshold: { warning: "tipo nuevo sin saldo", critical: "tipo nuevo con saldo<>0" },
    },
  };
}

// CHECK 13: EL MISMO GUARD, PARA VENTAS (26-ago-2026).
//
// 🩸 En mayo-2025 Switch estrenó el tipo «Transacción» (reemplazó a «Tiquete»).
// Alguien lo agregó a tiempo y no se perdió una venta — POR SUERTE. Un tipo
// nuevo cae al `ELSE 0` de las 19 copias del CASE de ventas y esa plata
// DESAPARECE del tablero sin un solo error. La cartera tenía este guard desde
// mayo-2026 (CHECK 10); ventas no tenía equivalente.
//
// Mira las DOS vistas porque los riesgos son OPUESTOS: en ventas un tipo nuevo
// vale 0 (la plata se pierde) y en el diario de artículos SUMA sin permiso
// (infla costo y utilidad).
//
// ⚠️ Este check es el tablero; el AVISO va por otro lado y a propósito: el
// centinela de `switch-sync` lo manda por `alertSwitchCronErrors` (regla 2, la
// de los 2 fallos seguidos) apenas aterrizan las facturas, sin esperar a la
// corrida diaria de integridad.
async function checkVentasTiposSinClasificar(): Promise<CheckResult> {
  const ventas = await supabaseServer
    .from("switch_facturas_tipos_sin_clasificar")
    .select("empresa_key, tipo_comprobante, filas, filas_con_plata, suma_base");
  if (ventas.error) {
    return checkError("ventas_tipos_sin_clasificar", "switch_facturas", ventas.error.message);
  }
  const arts = await supabaseServer
    .from("switch_articulo_diario_tipos_sin_clasificar")
    .select("empresa_key, tipo, filas, filas_con_plata, suma_venta");
  if (arts.error) {
    return checkError("ventas_tipos_sin_clasificar", "switch_facturas", arts.error.message);
  }

  const rows = [
    ...(ventas.data ?? []).map((r) => ({ fuente: "ventas", ...r })),
    ...(arts.data ?? []).map((r) => ({ fuente: "articulo_diario", ...r })),
  ];
  const conPlata = rows.filter((r) => Number((r as { filas_con_plata?: unknown }).filas_con_plata) > 0);
  const count = rows.length;
  const severity: Severity = conPlata.length > 0 ? "critical" : count > 0 ? "warning" : "ok";

  return {
    check_name: "ventas_tipos_sin_clasificar",
    table_name: "switch_facturas",
    severity,
    rows_affected: count,
    threshold_exceeded: count > 0,
    details: {
      sample: rows.slice(0, 20),
      con_plata: conPlata.slice(0, 20),
      hint: "tipo_comprobante (o `tipo` en switch_articulo_diario) que ninguna vista de ventas sabe contar. En ventas cae al ELSE 0 → la plata desaparece del tablero; en artículos suma sin clasificar → infla costo. Clasificarlo en src/lib/ventas/tipos-comprobante.ts + las vistas, en una migration nueva.",
      threshold: { warning: "tipo nuevo sin plata", critical: "tipo nuevo con plata" },
    },
  };
}

// CHECK 11: continuidad mensual de switch_facturas (🟡-6). Las vistas de ventas
// asumen cobertura completa; un empresa-mes faltante se muestra como $0 legítimo,
// indistinguible de "mes futuro". Marca los huecos INTERIORES por empresa: meses
// sin filas entre el PRIMER mes con data de esa empresa y el último mes cerrado.
// Usar el primer mes real como piso (en vez de 2025-05 fijo) evita falsos
// positivos por empresas que arrancaron después (ej. joystep desde 2025-07).
//
// Allowlist de meses CERO-legítimo: empresa-mes sin ventas reales en Switch
// (verificado contra API + panel), NO huecos de sync. Excluidos del conteo para
// no alertar a diario. Un hueco NUEVO (fuera de esta lista) sí alerta.
const CONTINUIDAD_CEROS_CONOCIDOS = new Set<string>([
  // active_wear y joystep: meses sin ventas wholesale (0 docs en API,
  // verificado 2026-05-30; las ventas que parecían faltar eran de dic-2025).
  "active_wear|2025-11",
  "active_wear|2026-01",
  "joystep|2025-11",
  "joystep|2026-01",
]);
function lastClosedMonth(now: Date): string {
  const firstOfCurrent = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lc = new Date(firstOfCurrent);
  lc.setUTCMonth(lc.getUTCMonth() - 1); // mes en curso está a medias → se exige hasta el anterior
  return `${lc.getUTCFullYear()}-${String(lc.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Enumera "YYYY-MM" de desde a hasta inclusive (ambos "YYYY-MM"). */
function monthRange(desde: string, hasta: string): string[] {
  const out: string[] = [];
  let y = Number(desde.slice(0, 4));
  let m = Number(desde.slice(5, 7));
  while (`${y}-${String(m).padStart(2, "0")}` <= hasta) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

async function checkSwitchFacturasContinuidad(): Promise<CheckResult> {
  const { data, error } = await supabaseServer
    .from("switch_facturas_cobertura_mensual")
    .select("empresa_key, mes, filas");
  if (error) {
    return checkError("switch_facturas_continuidad", "switch_facturas", error.message);
  }

  const mesesPorEmpresa = new Map<string, Set<string>>();
  for (const r of data ?? []) {
    const set = mesesPorEmpresa.get(r.empresa_key) ?? new Set<string>();
    set.add(r.mes as string);
    mesesPorEmpresa.set(r.empresa_key, set);
  }

  const hasta = lastClosedMonth(new Date());
  const gaps: { empresa_key: string; mes: string }[] = [];
  const cerosConocidos: { empresa_key: string; mes: string }[] = [];
  const sinDatos: string[] = [];
  for (const empresa of empresasConFacturas()) {
    const meses = mesesPorEmpresa.get(empresa);
    if (!meses || meses.size === 0) {
      sinDatos.push(empresa);
      continue;
    }
    const primerMes = [...meses].sort()[0];
    if (primerMes > hasta) continue; // recién arrancó este mes en curso
    for (const mes of monthRange(primerMes, hasta)) {
      if (meses.has(mes)) continue;
      if (CONTINUIDAD_CEROS_CONOCIDOS.has(`${empresa}|${mes}`)) {
        cerosConocidos.push({ empresa_key: empresa, mes }); // cero legítimo, no alerta
      } else {
        gaps.push({ empresa_key: empresa, mes });
      }
    }
  }

  const count = gaps.length + sinDatos.length;
  return {
    check_name: "switch_facturas_continuidad",
    table_name: "switch_facturas",
    severity: count === 0 ? "ok" : "warning",
    rows_affected: count,
    threshold_exceeded: count > 0,
    details: {
      huecos: gaps.slice(0, 40),
      empresas_sin_datos: sinDatos,
      ceros_conocidos: cerosConocidos, // excluidos del conteo (allowlist)
      hasta,
      hint: "empresa-mes interior sin filas en switch_facturas → el dashboard lo cuenta como $0. Backfill: scripts/switch-backfill.ts --tipo=facturas --empresa=X --... Un mes con cero ventas reales va a CONTINUIDAD_CEROS_CONOCIDOS (no alerta). Piso por empresa = su primer mes con data.",
      threshold: { warning: ">0 huecos interiores (excluye ceros conocidos)" },
    },
  };
}

// CHECK 12: filas de estado de cuenta con dias NULL/negativo y saldo<>0 (🟡-7).
// El aging bucketea por `dias`; un null/negativo suma a `total` pero a ningún
// bucket → cxcVencida subestima. Hoy 0 casos; vigilancia preventiva.
async function checkAgingDiasAnomalo(): Promise<CheckResult> {
  const { data, error } = await supabaseServer
    .from("switch_estadocuenta_dias_anomalo")
    .select("empresa_key, dias_null, dias_negativo, suma_saldo");

  if (error) {
    return checkError("aging_dias_anomalo", "switch_estadocuenta", error.message);
  }

  const rows = data ?? [];
  const count = rows.reduce((s, r) => s + Number(r.dias_null ?? 0) + Number(r.dias_negativo ?? 0), 0);
  return {
    check_name: "aging_dias_anomalo",
    table_name: "switch_estadocuenta",
    severity: count === 0 ? "ok" : "warning",
    rows_affected: count,
    threshold_exceeded: count > 0,
    details: {
      por_empresa: rows,
      hint: "dias NULL/negativo con saldo → no entra en ningún bucket del aging, cxcVencida lo subestima. Revisar fechaCreacion/dias en switch_estadocuenta para esas filas.",
      threshold: { warning: ">0 filas" },
    },
  };
}

// ── Error wrapper ────────────────────────────────────────────────────────────

// Un check que no puede correr (query falló, schema cambió) NO debe alertar
// como critical — eso confunde "data corrupta" con "monitor roto". Queda como
// warning en el dashboard para que se arregle, pero no dispara email.
function checkError(name: string, table: string, message: string): CheckResult {
  return {
    check_name: name,
    table_name: table,
    severity: "warning",
    rows_affected: 0,
    threshold_exceeded: true,
    details: { error: message, hint: "el check no pudo correr — revisar query o schema" },
  };
}

// ── Runner ───────────────────────────────────────────────────────────────────

// Allowlist de checks VIVOS = exactamente los check_name que produce runAllChecks.
// ÚNICA FUENTE DE VERDAD para el dashboard (/api/admin/data-health la usa para
// filtrar el historial stale de los checks legacy del CSV ya retirados —
// cxc_rows/ventas_raw/cxc_uploads — sin borrar nada de data_integrity_checks).
// MANTENER en sync con runAllChecks: el guard de abajo avisa en logs si se
// desincroniza (un check emite un nombre fuera de esta lista).
export const LIVE_CHECK_NAMES = new Set<string>([
  "cheques_criticos_null",
  "prestamos_saldo_anomalo",
  "last_upload_age_cxc",
  "aging_tipos_sin_clasificar",
  "ventas_tipos_sin_clasificar",
  "switch_facturas_continuidad",
  "aging_dias_anomalo",
]);

export async function runAllChecks(): Promise<CheckResult[]> {
  // CXC ahora vive en switch_estadocuenta (sync API). Los checks de esquema del
  // CSV legacy (cxc_rows fecha/vencimiento/dias, zombie uploads, sin-venta) se
  // retiraron; la integridad de CXC la cubren aging_tipos/aging_dias + frescura.
  const grouped = await Promise.all([
    checkChequesCriticosNull(),
    checkPrestamosSaldoAnomalo(),
    checkLastUploadAge(),
    checkAgingTiposSinClasificar(),
    checkVentasTiposSinClasificar(),
    checkSwitchFacturasContinuidad(),
    checkAgingDiasAnomalo(),
  ]);

  // checkLastUploadAge devuelve un array (ahora solo CXC) — el resto, uno solo.
  const flat = grouped.flatMap(r => Array.isArray(r) ? r : [r]);

  // Guard de sincronía: si un check emite un check_name fuera de LIVE_CHECK_NAMES,
  // el dashboard lo ocultaría. Avisar en logs (no rompe la corrida).
  for (const r of flat) {
    if (!LIVE_CHECK_NAMES.has(r.check_name)) {
      console.warn(`[integrity] check_name "${r.check_name}" no está en LIVE_CHECK_NAMES — el dashboard lo ocultará. Actualizar la allowlist.`);
    }
  }

  return flat;
}

export async function persistCheckResults(results: CheckResult[]): Promise<void> {
  if (results.length === 0) return;
  const rows = results.map(r => ({
    check_name: r.check_name,
    table_name: r.table_name,
    severity: r.severity,
    rows_affected: r.rows_affected,
    threshold_exceeded: r.threshold_exceeded,
    details: r.details,
  }));
  const { error } = await supabaseServer.from("data_integrity_checks").insert(rows);
  if (error) console.error("[integrity] persistCheckResults:", error.message);
}

export function summarize(results: CheckResult[]): { total: number; critical: number; warning: number; info: number; ok: number } {
  const sum = { total: results.length, critical: 0, warning: 0, info: 0, ok: 0 };
  for (const r of results) sum[r.severity]++;
  return sum;
}
