// ─────────────────────────────────────────────────────────────────────────────
// Fuente ÚNICA de los datos del estado de cuenta CXC.
//
// Tanto el GET /api/cxc/estado-cuenta/[codigo] (pantalla + PDF) como el envío de
// correo (POST /api/cxc/enviar-email) leen de acá. Así el signo por tipo de
// comprobante y la agrupación por empresa son idénticos y los números cuadran AL
// CENTAVO entre la pantalla, el PDF y el correo. NO duplicar la lógica de signo.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";

// Signo por tipo de comprobante — IDÉNTICO a la vista switch_estadocuenta_aging
// (migración ...signo_defensivo): débito suma, crédito resta, desconocido = 0
// (neutral, no infla CXC). `saldo` en la tabla es siempre positivo; el signo se
// aplica acá. Un SUM(saldo) pelado NO cuadraría con la lista CXC.
export const CREDITO = new Set(["Nota de Crédito", "Recibo", "Recibo Saldo Anterior"]);
export const DEBITO = new Set(["Factura", "Nota de Débito", "Saldo Anterior", "Transacción", "Tiquete"]);

export function signo(tipo: string): number {
  if (CREDITO.has(tipo)) return -1;
  if (DEBITO.has(tipo)) return 1;
  return 0;
}

const round = (n: number) => Math.round(n * 100) / 100;
const num = (v: number | string | null | undefined): number =>
  typeof v === "number" ? v : Number(v ?? 0) || 0;

interface DocRow {
  empresa_key: string;
  secuencial: string | null;
  numero_fiscal: string | null;
  tipo_comprobante: string | null;
  fecha_creacion: string | null;
  total: number | string | null;
  saldo: number | string | null;
  dias: number | null;
  plazo_credito: number | string | null;
}

export interface EstadoCuentaDoc {
  numero: string;
  fecha: string | null; // fecha_creacion (ISO / date)
  tipo: string;
  monto: number; // total del documento (positivo)
  saldo: number; // con signo (crédito negativo)
  dias: number | null; // edad del documento desde su emisión (NO mora)
  plazoCredito: number | null; // días de crédito; para calcular la fecha de vencimiento
}

export interface EstadoCuentaEmpresa {
  empresa_key: string;
  empresa_nombre: string;
  documentos: EstadoCuentaDoc[];
  subtotal: number; // con signo
}

export interface EstadoCuentaResult {
  codigo: string;
  empresas: EstadoCuentaEmpresa[];
  total: number; // con signo
  generadoEn: string;
}

/**
 * Lee switch_estadocuenta (documentos con saldo <> 0) para un cliente D-XXX en
 * las empresas dadas, aplica el signo por tipo y agrupa por empresa con subtotal
 * + total. Empresas con saldo a favor (subtotal negativo) SÍ entran. Ordena las
 * empresas por subtotal descendente (igual que el GET original).
 */
export async function fetchEstadoCuentaData(
  codigo: string,
  empresas: string[],
): Promise<EstadoCuentaResult> {
  const { data, error } = await supabaseServer
    .from("switch_estadocuenta")
    .select(
      "empresa_key, secuencial, numero_fiscal, tipo_comprobante, fecha_creacion, total, saldo, dias, plazo_credito",
    )
    .eq("cliente_codigo", codigo)
    .in("empresa_key", empresas)
    .neq("saldo", 0)
    .order("fecha_creacion", { ascending: true });

  if (error) throw new Error(error.message);

  const grupos = new Map<string, EstadoCuentaEmpresa>();
  let total = 0;
  for (const r of (data ?? []) as DocRow[]) {
    const tipo = r.tipo_comprobante ?? "";
    const s = signo(tipo) * num(r.saldo);
    total += s;
    if (!grupos.has(r.empresa_key)) {
      grupos.set(r.empresa_key, {
        empresa_key: r.empresa_key,
        empresa_nombre: EMPRESA_KEY_TO_NAME[r.empresa_key] ?? r.empresa_key,
        documentos: [],
        subtotal: 0,
      });
    }
    const g = grupos.get(r.empresa_key)!;
    g.documentos.push({
      numero: r.secuencial || r.numero_fiscal || "—",
      fecha: r.fecha_creacion,
      tipo,
      monto: round(num(r.total)),
      saldo: round(s),
      dias: r.dias,
      plazoCredito: r.plazo_credito != null ? num(r.plazo_credito) : null,
    });
    g.subtotal += s;
  }

  const empresasOut = [...grupos.values()]
    .map((g) => ({ ...g, subtotal: round(g.subtotal) }))
    .sort((a, b) => b.subtotal - a.subtotal);

  return {
    codigo,
    empresas: empresasOut,
    total: round(total),
    generadoEn: new Date().toISOString(),
  };
}
