// ─────────────────────────────────────────────────────────────────────────────
// LA CARTERA DE BOSTON CON LA FORMA DE LA DEL GRUPO — módulo PURO (23-sep-2026).
//
// Daniel: David ve «Cuentas por Cobrar» —la MISMA pantalla del grupo— con la
// cartera de Confecciones Boston y nada más. La pantalla del grupo entiende
// UNA forma (`ConsolidatedClient`: un cliente con sus empresas adentro), así
// que acá se le da esa forma a lo que ya devuelve `/api/cxc/boston`.
//
// 🔴 MISMO FORMATO, APARTE. Esto NO toca `useAdminData` ni `fetchEstadoCuentaData`
// ni ninguna lectura del grupo: entra la respuesta de la ruta de Boston y sale
// una lista con UNA sola empresa adentro (`confecciones_boston`). Sumar acá
// una fila del grupo exige escribirla a mano.
//
// 🔴 NINGÚN NÚMERO SE RECALCULA. `d0_90`, `d91_120`, `d121_plus` y `total` son
// los de la vista `switch_estadocuenta_aging_boston`; los tramos finos, cuando
// vienen, son los de la misma vista. Sin finos (la DDL 20260928120000 sin
// correr) se reparte cada tramo grueso ENTERO en su primer corte fino, así las
// sumas que la pantalla dibuja (0-90 · 91-120 · 121+) siguen siendo exactas.
//
// Medido contra producción el 23-sep-2026 (410 clientes): neto $193.347,32;
// 289 deben $214.574,35; 121 a favor −$21.227,03; 146 sin pagar +90 d por
// $123.887,92. Esos números salen de acá y hay script que los remide.
// ─────────────────────────────────────────────────────────────────────────────

import type { Company } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";
import { EMPRESA_BOSTON } from "@/lib/boston/rol";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { ultimoPagoPorCodigo } from "./sin-pagar";
import type { ClienteCobrarBoston } from "@/components/cxc/BostonHojaCobrar";

/** Lo que devuelve `/api/cxc/boston` por cliente. Es la forma de `BostonTab`. */
export interface ClienteBostonApi {
  codigo: string;
  cliente_switch_id: number | null;
  nombre: string;
  nombre_normalized: string;
  d0_90: number;
  d91_120: number;
  d121_plus: number;
  total: number;
  finos: {
    d0_30: number; d31_60: number; d61_90: number;
    d121_180: number; d181_270: number; d271_365: number; mas_365: number;
  } | null;
  telefono: string;
  celular: string;
  correo: string;
  ultimo_pago_fecha: string | null;
  ultimo_pago_monto: number | null;
  tambien_en_grupo: boolean;
}

export interface RespuestaCarteraBoston {
  clientes: ClienteBostonApi[];
  totales: { total: number; d0_90: number; d91_120: number; d121_plus: number; clientes: number };
  avisoMontos?: string | null;
}

/** Boston como «compañía» de la pantalla del grupo: UNA sola, con su nombre. */
export const COMPANIA_BOSTON: Company = Object.freeze({
  key: EMPRESA_BOSTON,
  name: EMPRESA_KEY_TO_NAME[EMPRESA_BOSTON] ?? "Confecciones Boston",
  brand: "Confecciones Boston",
});

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/** Los siete cortes finos: los de la vista si vienen, o el tramo grueso entero en su primer corte. */
function finosDe(c: ClienteBostonApi) {
  if (c.finos) {
    return {
      d0_30: n(c.finos.d0_30), d31_60: n(c.finos.d31_60), d61_90: n(c.finos.d61_90),
      d121_180: n(c.finos.d121_180), d181_270: n(c.finos.d181_270),
      d271_365: n(c.finos.d271_365), mas_365: n(c.finos.mas_365),
    };
  }
  return {
    d0_30: n(c.d0_90), d31_60: 0, d61_90: 0,
    d121_180: n(c.d121_plus), d181_270: 0, d271_365: 0, mas_365: 0,
  };
}

/**
 * Un cliente de Boston con la forma que la pantalla del grupo entiende.
 * `companies` tiene UNA sola llave: `confecciones_boston`.
 */
export function consolidarClienteBoston(c: ClienteBostonApi): ConsolidatedClient {
  const f = finosDe(c);
  const current = n(c.d0_90);
  const watch = n(c.d91_120);
  const overdue = n(c.d121_plus);
  return {
    nombre_normalized: c.nombre_normalized || c.codigo,
    companies: {
      [EMPRESA_BOSTON]: {
        nombre: c.nombre || c.codigo,
        codigo: c.codigo,
        ...f,
        d91_120: watch,
        total: n(c.total),
        ultimoPagoFecha: c.ultimo_pago_fecha ?? null,
        ultimoPagoMonto: c.ultimo_pago_monto ?? null,
        ultimaCompraFecha: null,
        ultimaCompraMonto: null,
      },
    },
    correo: (c.correo ?? "").trim(),
    telefono: (c.telefono ?? "").trim(),
    celular: (c.celular ?? "").trim(),
    contacto: "",
    resultado_contacto: "",
    total: n(c.total),
    current,
    watch,
    overdue,
    d0_30: f.d0_30, d31_60: f.d31_60, d61_90: f.d61_90,
    d91_120: watch,
    d121_plus: overdue,
    hasOverride: false,
  };
}

/** La cartera entera. Igual que el grupo, el cliente en CERO no se dibuja. */
export function consolidarCarteraBoston(clientes: readonly ClienteBostonApi[]): ConsolidatedClient[] {
  return clientes.map(consolidarClienteBoston).filter((c) => c.total !== 0);
}

/**
 * Código → fecha del último PAGO REAL, para «sin pagar hace +90 d».
 *
 * La fecha ya viene limpia de la ruta de Boston (sin retenciones ni recibos
 * en cero: es la vista `switch_ultimo_pago_cliente_v2` acotada a Boston). Se
 * cruza por CÓDIGO, como en el grupo, con la MISMA función.
 */
export function ultimoPagoBoston(clientes: readonly ClienteBostonApi[]): Record<string, string> {
  return Object.fromEntries(
    ultimoPagoPorCodigo(clientes.map((c) => ({ codigo: c.codigo, fecha: c.ultimo_pago_fecha }))),
  );
}

/** Código → id de Switch: el cajón de documentos de Boston pide los pagos por id. */
export function idsDeSwitchBoston(clientes: readonly ClienteBostonApi[]): Map<string, number | null> {
  return new Map(clientes.map((c) => [c.codigo, c.cliente_switch_id ?? null]));
}

/** El código de un cliente ya consolidado (la única empresa que tiene). */
export function codigoDeClienteBoston(c: ConsolidatedClient): string {
  return c.companies[EMPRESA_BOSTON]?.codigo ?? c.nombre_normalized;
}

/** Lo que la hoja «Cobrar» de Boston necesita, sacado del cliente consolidado. */
export function clienteParaCobrarBoston(c: ConsolidatedClient): ClienteCobrarBoston {
  const b = c.companies[EMPRESA_BOSTON];
  return {
    codigo: codigoDeClienteBoston(c),
    nombre: b?.nombre ?? c.nombre_normalized,
    telefono: c.telefono,
    celular: c.celular,
    correo: c.correo,
    d0_90: c.current,
    d91_120: c.watch,
    d121_plus: c.overdue,
    total: c.total,
  };
}

/** Los cuatro totales que la tira dibuja, sumados de la lista: para cuadrar contra `totales` de la ruta. */
export function totalesDe(clientes: readonly ConsolidatedClient[]) {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    total: r2(clientes.reduce((s, c) => s + c.total, 0)),
    d0_90: r2(clientes.reduce((s, c) => s + c.current, 0)),
    d91_120: r2(clientes.reduce((s, c) => s + c.watch, 0)),
    d121_plus: r2(clientes.reduce((s, c) => s + c.overdue, 0)),
    clientes: clientes.length,
    deben: clientes.filter((c) => c.total > 0).length,
    montoDeben: r2(clientes.filter((c) => c.total > 0).reduce((s, c) => s + c.total, 0)),
    aFavor: clientes.filter((c) => c.total < 0).length,
    montoAFavor: r2(clientes.filter((c) => c.total < 0).reduce((s, c) => s + c.total, 0)),
  };
}
