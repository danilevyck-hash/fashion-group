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

async function tableMaxFecha(table: "cxc_rows" | "ventas_raw"): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from(table)
    .select("fecha")
    .not("fecha", "is", null)
    .order("fecha", { ascending: false })
    .limit(1);
  if (error) {
    console.error(`[integrity] tableMaxFecha ${table}:`, error.message);
    return null;
  }
  return data?.[0]?.fecha ?? null;
}

// ── Checks ───────────────────────────────────────────────────────────────────

// CHECK 1a: cxc_rows con fecha de emisión NULL. Solo "Saldo Anterior" es
// legítimamente sin fecha — el resto (Facturas, NDs, NCs, Recibos) siempre
// trae fecha en Switch.
async function checkCxcFechaEmisionNull(): Promise<CheckResult> {
  const { data, error } = await supabaseServer
    .from("cxc_rows")
    .select("comprobante, n_sistema, n_fiscal, fecha")
    .is("fecha", null)
    .not("comprobante", "in", '("Saldo Anterior")')
    .limit(100);

  if (error) {
    return checkError("cxc_fecha_emision_null", "cxc_rows", error.message);
  }

  const count = data?.length ?? 0;
  const severity: Severity = count === 0 ? "ok" : count <= 5 ? "warning" : "critical";
  const top = (data ?? []).slice(0, 10).map(r => ({
    comprobante: r.comprobante, n_sistema: r.n_sistema, n_fiscal: r.n_fiscal,
  }));

  return {
    check_name: "cxc_fecha_emision_null",
    table_name: "cxc_rows",
    severity,
    rows_affected: count,
    threshold_exceeded: count > 5,
    details: { sample: top, threshold: { warning: "1-5", critical: ">5" }, excluded: ["Saldo Anterior"] },
  };
}

// CHECK 1b: cxc_rows con fecha_vencimiento NULL. NCs y Recibos no tienen
// vencimiento por naturaleza (NC compensa, Recibo es pago). Saldo Anterior
// también queda sin vencimiento. Cualquier otro comprobante sin vencimiento
// es anómalo.
async function checkCxcFechaVencimientoNull(): Promise<CheckResult> {
  const { data, error } = await supabaseServer
    .from("cxc_rows")
    .select("comprobante, n_sistema, n_fiscal, fecha_vencimiento")
    .is("fecha_vencimiento", null)
    .not("comprobante", "in", '("Saldo Anterior","Nota de Crédito","Recibo")')
    .limit(100);

  if (error) {
    return checkError("cxc_fecha_vencimiento_null", "cxc_rows", error.message);
  }

  const count = data?.length ?? 0;
  const severity: Severity = count === 0 ? "ok" : count <= 5 ? "warning" : "critical";
  const top = (data ?? []).slice(0, 10).map(r => ({
    comprobante: r.comprobante, n_sistema: r.n_sistema, n_fiscal: r.n_fiscal,
  }));

  return {
    check_name: "cxc_fecha_vencimiento_null",
    table_name: "cxc_rows",
    severity,
    rows_affected: count,
    threshold_exceeded: count > 5,
    details: {
      sample: top,
      threshold: { warning: "1-5", critical: ">5" },
      excluded: ["Saldo Anterior", "Nota de Crédito", "Recibo"],
    },
  };
}

// CHECK 2: dias_vencidos > 0 con fecha NULL — anomalía lógica imposible
// (Switch no debería calcular vencimiento sin fecha base).
async function checkCxcDiasVencidosSinFecha(): Promise<CheckResult> {
  const { count, error } = await supabaseServer
    .from("cxc_rows")
    .select("id", { count: "exact", head: true })
    .gt("dias_vencidos", 0)
    .is("fecha", null);

  if (error) {
    return checkError("cxc_dias_vencidos_sin_fecha", "cxc_rows", error.message);
  }

  const c = count ?? 0;
  return {
    check_name: "cxc_dias_vencidos_sin_fecha",
    table_name: "cxc_rows",
    severity: c === 0 ? "ok" : "warning",
    rows_affected: c,
    threshold_exceeded: c > 0,
    details: { threshold: { warning: ">0" } },
  };
}

// CHECK 3: Desync entre la última fecha de upload de CXC vs Ventas. Si los
// uploads se desincronizaron mucho, los reportes cruzados quedan stale.
async function checkUploadDesync(): Promise<CheckResult> {
  const [cxcRes, ventasRes] = await Promise.all([
    supabaseServer.from("cxc_uploads").select("uploaded_at").order("uploaded_at", { ascending: false }).limit(1),
    supabaseServer.from("ventas_raw").select("uploaded_at").order("uploaded_at", { ascending: false }).limit(1),
  ]);

  const cxcLast = cxcRes.data?.[0]?.uploaded_at ?? null;
  const ventasLast = ventasRes.data?.[0]?.uploaded_at ?? null;

  if (!cxcLast || !ventasLast) {
    return {
      check_name: "upload_desync_cxc_ventas",
      table_name: "cxc_uploads,ventas_raw",
      severity: "warning",
      rows_affected: 0,
      threshold_exceeded: true,
      details: { cxc_last: cxcLast, ventas_last: ventasLast, reason: "missing one of the two uploads" },
    };
  }

  const gapDays = daysBetween(cxcLast, ventasLast);
  const severity: Severity = gapDays < 7 ? "ok" : gapDays <= 14 ? "warning" : "critical";

  return {
    check_name: "upload_desync_cxc_ventas",
    table_name: "cxc_uploads,ventas_raw",
    severity,
    rows_affected: gapDays,
    threshold_exceeded: gapDays >= 7,
    details: {
      cxc_last: cxcLast, ventas_last: ventasLast, gap_days: gapDays,
      threshold: { warning: ">=7d", critical: ">14d" },
    },
  };
}

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

// CHECK 6: ventas_raw con cliente vacío.
async function checkVentasClienteVacio(): Promise<CheckResult> {
  const { count, error } = await supabaseServer
    .from("ventas_raw")
    .select("id", { count: "exact", head: true })
    .or("cliente.is.null,cliente.eq.");

  if (error) {
    return checkError("ventas_cliente_vacio", "ventas_raw", error.message);
  }

  const c = count ?? 0;
  return {
    check_name: "ventas_cliente_vacio",
    table_name: "ventas_raw",
    severity: c === 0 ? "ok" : "warning",
    rows_affected: c,
    threshold_exceeded: c > 0,
    details: { threshold: { warning: ">0" } },
  };
}

// CHECK 7: Edad del último upload (uno por módulo). Devuelve 2 results.
async function checkLastUploadAge(): Promise<CheckResult[]> {
  const now = new Date();
  const results: CheckResult[] = [];

  for (const [name, table] of [
    ["last_upload_age_cxc", "cxc_rows"],
    ["last_upload_age_ventas", "ventas_raw"],
  ] as const) {
    const maxFecha = await tableMaxFecha(table);
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

// CHECK 8: Facturas en CXC sin venta correspondiente (caso Quality Shoes).
// Cliente con MAX(fecha) en cxc_rows mucho más nuevo que MAX(fecha) en
// ventas_raw → la factura está en cobranza pero no en el reporte de ventas.
async function checkCxcSinVentaCorrespondiente(): Promise<CheckResult> {
  // No hay RPC dedicada — corremos como SQL via supabaseServer.rpc no aplica;
  // hacemos las dos agregaciones cliente por cliente y comparamos en JS.
  // Para volumen razonable (~ pocos miles de cliente_codigo) es manejable.
  const [cxcRes, ventasRes] = await Promise.all([
    supabaseServer
      .from("cxc_rows")
      .select("cliente_codigo, fecha")
      .gt("saldo", 0)
      .not("fecha", "is", null)
      .not("cliente_codigo", "is", null),
    supabaseServer
      .from("ventas_raw")
      .select("cliente_codigo, fecha")
      .not("cliente_codigo", "is", null),
  ]);

  if (cxcRes.error || ventasRes.error) {
    return checkError(
      "cxc_sin_venta_correspondiente",
      "cxc_rows,ventas_raw",
      cxcRes.error?.message || ventasRes.error?.message || "unknown",
    );
  }

  const cxcMaxByCliente = new Map<string, string>();
  for (const r of cxcRes.data ?? []) {
    const k = r.cliente_codigo as string;
    const f = r.fecha as string;
    const prev = cxcMaxByCliente.get(k);
    if (!prev || f > prev) cxcMaxByCliente.set(k, f);
  }

  const ventasMaxByCliente = new Map<string, string>();
  for (const r of ventasRes.data ?? []) {
    const k = r.cliente_codigo as string;
    const f = (r.fecha as string).slice(0, 10);
    const prev = ventasMaxByCliente.get(k);
    if (!prev || f > prev) ventasMaxByCliente.set(k, f);
  }

  const gaps: { cliente_codigo: string; cxc_max: string; ventas_max: string | null; gap_days: number }[] = [];
  for (const [cliente, cxcMax] of cxcMaxByCliente) {
    const ventasMax = ventasMaxByCliente.get(cliente) ?? null;
    const baseline = ventasMax ?? "1900-01-01";
    if (cxcMax > baseline) {
      const gap = daysBetween(cxcMax, baseline);
      if (gap > 30) gaps.push({ cliente_codigo: cliente, cxc_max: cxcMax, ventas_max: ventasMax, gap_days: gap });
    }
  }

  gaps.sort((a, b) => b.gap_days - a.gap_days);
  const count = gaps.length;
  // Recalibrado: en una operación con 6 B2B y ~100 clientes activos, 50-100 NDs/
  // intereses/refacturación sin contraparte en ventas es esperado. Solo volumen
  // muy alto (>150) sugiere problema real de pipeline.
  const severity: Severity =
    count === 0 ? "ok" :
    count <= 20 ? "ok" :
    count <= 50 ? "info" :
    count <= 150 ? "warning" :
    "critical";

  return {
    check_name: "cxc_sin_venta_correspondiente",
    table_name: "cxc_rows,ventas_raw",
    severity,
    rows_affected: count,
    threshold_exceeded: count > 20,
    details: {
      top_10: gaps.slice(0, 10),
      threshold: { ok: "0-20", info: "21-50", warning: "51-150", critical: ">150", filter: "gap > 30 días" },
    },
  };
}

// CHECK 9: Headers zombie en cxc_uploads (sin filas asociadas).
async function checkCxcUploadsZombie(): Promise<CheckResult> {
  const { data: uploads, error: upErr } = await supabaseServer
    .from("cxc_uploads")
    .select("id, company_key, uploaded_at, row_count");
  if (upErr) {
    return checkError("cxc_uploads_zombie", "cxc_uploads", upErr.message);
  }

  // Para cada upload, contar cxc_rows. Usamos head:true para no traer data.
  const zombies: { id: string; company_key: string; uploaded_at: string; row_count: number }[] = [];
  await Promise.all((uploads ?? []).map(async u => {
    const { count, error } = await supabaseServer
      .from("cxc_rows")
      .select("id", { count: "exact", head: true })
      .eq("upload_id", u.id);
    if (error) return;
    if ((count ?? 0) === 0) zombies.push(u as typeof zombies[number]);
  }));

  const c = zombies.length;
  return {
    check_name: "cxc_uploads_zombie",
    table_name: "cxc_uploads",
    severity: c === 0 ? "ok" : "warning",
    rows_affected: c,
    threshold_exceeded: c > 0,
    details: { sample: zombies.slice(0, 10), threshold: { warning: ">0" } },
  };
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

// CHECK 11: continuidad mensual de switch_facturas (🟡-6). Las vistas de ventas
// asumen cobertura completa; un empresa-mes faltante se muestra como $0 legítimo,
// indistinguible de "mes futuro". Marca los huecos INTERIORES por empresa: meses
// sin filas entre el PRIMER mes con data de esa empresa y el último mes cerrado.
// Usar el primer mes real como piso (en vez de 2025-05 fijo) evita falsos
// positivos por empresas que arrancaron después (ej. joystep desde 2025-07).
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
      if (!meses.has(mes)) gaps.push({ empresa_key: empresa, mes });
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
      hasta,
      hint: "empresa-mes interior sin filas en switch_facturas → el dashboard lo cuenta como $0. Backfill: scripts/switch-backfill.ts --tipo=facturas --empresa=X --... Un mes con cero ventas reales sería falso positivo (raro en B2B). Piso por empresa = su primer mes con data.",
      threshold: { warning: ">0 huecos interiores" },
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

export async function runAllChecks(): Promise<CheckResult[]> {
  const grouped = await Promise.all([
    checkCxcFechaEmisionNull(),
    checkCxcFechaVencimientoNull(),
    checkCxcDiasVencidosSinFecha(),
    checkUploadDesync(),
    checkChequesCriticosNull(),
    checkPrestamosSaldoAnomalo(),
    checkVentasClienteVacio(),
    checkLastUploadAge(),
    checkCxcSinVentaCorrespondiente(),
    checkCxcUploadsZombie(),
    checkAgingTiposSinClasificar(),
    checkSwitchFacturasContinuidad(),
  ]);

  // checkLastUploadAge devuelve un array de 2 — el resto devuelve uno solo.
  return grouped.flatMap(r => Array.isArray(r) ? r : [r]);
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
