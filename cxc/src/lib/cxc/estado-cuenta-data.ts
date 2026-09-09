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
import {
  FICHA_CLIENTE_VACIA,
  type EstadoDocumento,
  type EstadoEmpresa,
  type EstadoCuenta,
  type FichaCliente,
} from "@/lib/cxc/estado-cuenta-tipos";
import { nombreDelPapel } from "@/lib/cxc/estado-cuenta-switch";

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
  ccte_id: number | null;
  cliente_nombre: string | null;
  secuencial: string | null;
  numero_fiscal: string | null;
  tipo_comprobante: string | null;
  fecha_creacion: string | null;
  total: number | string | null;
  saldo: number | string | null;
  debito: number | string | null;
  credito: number | string | null;
  dias: number | null;
  plazo_credito: number | string | null;
}

// La FORMA vive en `estado-cuenta-tipos.ts` (la comparten servidor y pantalla).
// Los alias se conservan porque media docena de archivos los importan por estos
// nombres; son el MISMO tipo, no una copia.
export type EstadoCuentaDoc = EstadoDocumento;
export type EstadoCuentaEmpresa = EstadoEmpresa;
export type EstadoCuentaResult = EstadoCuenta;

const numOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/**
 * La ficha del cliente que el papel de Switch pone arriba: identificación,
 * teléfono, correo, dirección, límite de crédito y tiempo de morosidad. Todo
 * está en `switch_clientes` (los cuatro últimos dentro de `raw_data`) y no se
 * mostraba en ninguna parte. Lo que falte va en blanco — nunca inventado.
 *
 * Se lee de las empresas que el papel está mostrando; el cliente es el MISMO en
 * las seis (identidad = el código), así que gana la primera fila que traiga
 * cada campo.
 */
async function leerFichaCliente(codigo: string, empresas: string[]): Promise<FichaCliente> {
  const { data, error } = await supabaseServer
    .from("switch_clientes")
    .select("nombre, email, telefono, celular, identificacion, raw_data")
    .eq("codigo", codigo)
    .in("empresa_key", empresas);
  if (error || !data?.length) return { ...FICHA_CLIENTE_VACIA };

  const ficha: FichaCliente = { ...FICHA_CLIENTE_VACIA };
  for (const fila of data as Array<Record<string, unknown>>) {
    const raw = (fila.raw_data ?? {}) as Record<string, unknown>;
    const tomar = (campo: keyof FichaCliente, valor: unknown) => {
      if (ficha[campo]) return;
      const v = typeof valor === "string" ? valor.trim() : "";
      if (v) (ficha[campo] as string) = v;
    };
    tomar("nombre", fila.nombre);
    tomar("identificacion", fila.identificacion ?? raw.identificacion);
    tomar("telefono", fila.telefono ?? fila.celular ?? raw.telefono);
    tomar("email", fila.email ?? raw.email);
    tomar("direccion", raw.direccion);
    if (ficha.limiteCredito == null) ficha.limiteCredito = numOrNull(raw.limiteCredito);
    if (ficha.tiempoMorosidad == null) ficha.tiempoMorosidad = numOrNull(raw.limiteMorosidad);
  }
  return ficha;
}

/**
 * 🔴 EL CUADRE CONTRA SWITCH. `switch_estadocuenta_saldo` guarda el `saldoTotal`
 * que Switch calcula para cada cliente — el que el sync tiraba hasta el
 * 9-sep-2026. Sin la tabla (DDL pendiente) o sin fila, se devuelve vacío y NO
 * se afirma nada: ante la duda, callar.
 */
async function leerSaldosDeSwitch(
  codigo: string,
  empresas: string[],
): Promise<Map<string, number>> {
  const fuera = new Map<string, number>();
  const { data, error } = await supabaseServer
    .from("switch_estadocuenta_saldo")
    .select("empresa_key, saldo_total")
    .eq("cliente_codigo", codigo)
    .in("empresa_key", empresas);
  if (error || !data) return fuera;
  for (const r of data as Array<{ empresa_key: string; saldo_total: number | string | null }>) {
    const v = numOrNull(r.saldo_total);
    if (v != null) fuera.set(r.empresa_key, v);
  }
  return fuera;
}

/**
 * Lee switch_estadocuenta (documentos con saldo <> 0) para un cliente D-XXX en
 * las empresas dadas, aplica el signo por tipo y agrupa por empresa con subtotal
 * + total. Empresas con saldo a favor (subtotal negativo) SÍ entran. Ordena las
 * empresas por subtotal descendente (igual que el GET original).
 *
 * 🔴 EL ORDEN DE LOS DOCUMENTOS ES (fecha, ccte_id) Y NO PUEDE CAMBIAR. El papel
 * lleva SALDO CORRIDO: si el orden se mueve, los números intermedios dejan de
 * ser los de Switch aunque el total siga igual. `ccte_id` es el correlativo del
 * documento y desempata los del mismo día — comprobado contra el
 * `saldoConsecutivo` que manda Switch, renglón por renglón, en D-25 · Fashion
 * Wear (1.006,80 → 3.708,15 → 3.716,31 → … → 130.699,36).
 */
export async function fetchEstadoCuentaData(
  codigo: string,
  empresas: string[],
): Promise<EstadoCuentaResult> {
  const { data, error } = await supabaseServer
    .from("switch_estadocuenta")
    .select(
      "empresa_key, ccte_id, cliente_nombre, secuencial, numero_fiscal, tipo_comprobante, fecha_creacion, total, saldo, debito, credito, dias, plazo_credito",
    )
    .eq("cliente_codigo", codigo)
    .in("empresa_key", empresas)
    .neq("saldo", 0)
    .order("fecha_creacion", { ascending: true })
    .order("ccte_id", { ascending: true });

  if (error) throw new Error(error.message);

  const grupos = new Map<string, EstadoCuentaEmpresa>();
  let total = 0;
  let nombreSwitch = "";
  for (const r of (data ?? []) as DocRow[]) {
    const tipo = r.tipo_comprobante ?? "";
    const s = signo(tipo) * num(r.saldo);
    total += s;
    if (!nombreSwitch && r.cliente_nombre) nombreSwitch = r.cliente_nombre.trim();
    if (!grupos.has(r.empresa_key)) {
      grupos.set(r.empresa_key, {
        empresa_key: r.empresa_key,
        empresa_nombre: EMPRESA_KEY_TO_NAME[r.empresa_key] ?? r.empresa_key,
        documentos: [],
        subtotal: 0,
        saldoSwitch: null,
      });
    }
    const g = grupos.get(r.empresa_key)!;
    g.documentos.push({
      numero: r.secuencial || r.numero_fiscal || "—",
      fecha: r.fecha_creacion,
      tipo,
      monto: round(num(r.total)),
      saldo: round(s),
      debito: round(num(r.debito)),
      credito: round(num(r.credito)),
      dias: r.dias,
      plazoCredito: r.plazo_credito != null ? num(r.plazo_credito) : null,
      numeroFiscal: (r.numero_fiscal ?? "").trim() || null,
    });
    g.subtotal += s;
  }

  const [ficha, saldosSwitch] = await Promise.all([
    leerFichaCliente(codigo, empresas),
    leerSaldosDeSwitch(codigo, empresas),
  ]);

  const empresasOut = [...grupos.values()]
    .map((g) => ({
      ...g,
      subtotal: round(g.subtotal),
      saldoSwitch: saldosSwitch.has(g.empresa_key) ? saldosSwitch.get(g.empresa_key)! : null,
    }))
    .sort((a, b) => b.subtotal - a.subtotal);

  return {
    codigo,
    clienteNombre: nombreDelPapel(nombreSwitch || ficha.nombre, codigo),
    cliente: ficha,
    empresas: empresasOut,
    total: round(total),
    generadoEn: new Date().toISOString(),
  };
}
