// ─────────────────────────────────────────────────────────────────────────────
// EL ESTADO DE CUENTA DE UN CLIENTE DE CONFECCIONES BOSTON — SU PROPIA LECTURA.
//
// 🔴 NO REUSA `fetchEstadoCuentaData`, EL HELPER DEL GRUPO, Y ES A PROPÓSITO.
// Ese helper recibe una LISTA de empresas: bastaría con pasarle
// `["confecciones_boston"]` —o con agregar Boston a la lista del grupo— para
// mezclar las dos carteras sin darse cuenta. Mientras sean dos caminos, mezclar
// la plata de Boston con la del grupo hay que proponérselo. Regla de Daniel:
// *«debe de ser cxc de fashion group y otro aparte de boston, no deben de ni
// convivir juntos»*.
//
// 🔴 `.eq("empresa_key", EMPRESA_BOSTON)` VA EN LA MISMA CADENA de cada
// consulta — es lo que exige el barrido de
// `cxc-boston-fuera-de-toda-superficie.test.ts` de toda lectura de
// `switch_estadocuenta`.
//
// 🔴 SUS TELÉFONOS Y CORREOS SALEN DE `switch_clientes` ACOTADO A BOSTON,
// NUNCA de `clientes_master`: ese es el directorio del GRUPO y Boston no está
// ahí a propósito (meterlo costó $2,55 millones de venta publicada que no
// existió).
//
// La FORMA que devuelve es la misma `EstadoCuenta` del grupo, para que el papel
// de Switch —`buildEstadoCuentaPDF`— la dibuje igual. Compartir la FORMA no es
// compartir la CONSULTA: el papel se ve idéntico y las carteras siguen sin
// tocarse.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import {
  FICHA_CLIENTE_VACIA,
  type EstadoCuenta,
  type FichaCliente,
} from "@/lib/cxc/estado-cuenta-tipos";
import { CREDITO, DEBITO } from "@/lib/cxc/estado-cuenta-data";
import { nombreDelPapel } from "@/lib/cxc/estado-cuenta-switch";

/** La ÚNICA empresa de esta cartera. Constante del servidor, nunca de la URL. */
export const EMPRESA_BOSTON = "confecciones_boston";

const round = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const numOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** El MISMO signo que la vista `switch_estadocuenta_aging_boston`: débito suma,
 *  crédito resta, desconocido vale 0. Así el papel cuadra al centavo con la
 *  lista de la pestaña. */
function signo(tipo: string): number {
  if (CREDITO.has(tipo)) return -1;
  if (DEBITO.has(tipo)) return 1;
  return 0;
}

/**
 * La ficha que el papel de Switch pone arriba, del lado del cliente. Sale de
 * `switch_clientes` ACOTADO A BOSTON. Lo que falte va en blanco — nunca
 * inventado, y nunca traído de la ficha que ese mismo código tiene en el grupo.
 */
async function leerFichaBoston(codigo: string): Promise<FichaCliente> {
  const { data, error } = await supabaseServer
    .from("switch_clientes")
    .select("nombre, email, telefono, celular, identificacion, raw_data")
    .eq("empresa_key", EMPRESA_BOSTON)
    .eq("codigo", codigo)
    .limit(1);
  if (error || !data?.length) return { ...FICHA_CLIENTE_VACIA };

  const fila = data[0] as Record<string, unknown>;
  const raw = (fila.raw_data ?? {}) as Record<string, unknown>;
  const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  return {
    nombre: texto(fila.nombre),
    identificacion: texto(fila.identificacion) || texto(raw.identificacion),
    telefono: texto(fila.telefono) || texto(fila.celular) || texto(raw.telefono),
    email: texto(fila.email) || texto(raw.email),
    direccion: texto(raw.direccion),
    limiteCredito: numOrNull(raw.limiteCredito),
    tiempoMorosidad: numOrNull(raw.limiteMorosidad),
  };
}

/**
 * El NOMBRE DE CONTACTO del cliente —la persona con la que se habla—, para el
 * saludo del correo. Sale de `switch_clientes` ACOTADO A BOSTON (Switch lo manda
 * en `raw_data.nombreContacto`; medido el 9-sep-2026: lo traen 1.373 de las
 * 5.069 filas de Boston). Falla ABIERTO: sin contacto se saluda como siempre.
 */
export async function leerContactoBoston(codigo: string): Promise<string> {
  const { data, error } = await supabaseServer
    .from("switch_clientes")
    .select("raw_data")
    .eq("empresa_key", EMPRESA_BOSTON)
    .eq("codigo", codigo)
    .limit(1);
  if (error || !data?.length) return "";
  const raw = ((data[0] as Record<string, unknown>).raw_data ?? {}) as Record<string, unknown>;
  const v = raw.nombreContacto;
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Los documentos con saldo de UN cliente de Boston, con la forma del papel.
 *
 * 🔴 EL ORDEN ES (fecha, ccte_id) Y NO SE PUEDE MOVER: el papel lleva SALDO
 * CORRIDO, así que si el orden cambia los números intermedios dejan de ser los
 * de Switch aunque el total siga igual.
 *
 * ⚠️ `saldoSwitch` va SIEMPRE en `null`, y no es un olvido: la cartera de Boston
 * NO baja por `/apicliente/estadocuenta` (viene del reporte web, cron
 * `boston-cartera`), así que Switch nunca nos manda su `saldoTotal`. Sin dato
 * de Switch no se afirma nada — ante la duda, callar.
 */
export async function fetchEstadoCuentaBoston(codigo: string): Promise<EstadoCuenta> {
  const { data, error } = await supabaseServer
    .from("switch_estadocuenta")
    .select(
      "ccte_id, cliente_nombre, secuencial, numero_fiscal, tipo_comprobante, fecha_creacion, total, saldo, debito, credito, dias, plazo_credito",
    )
    .eq("empresa_key", EMPRESA_BOSTON)
    .eq("cliente_codigo", codigo)
    .neq("saldo", 0)
    .order("fecha_creacion", { ascending: true })
    .order("ccte_id", { ascending: true });

  if (error) throw new Error(error.message);

  let total = 0;
  let nombreSwitch = "";
  const documentos = (data ?? []).map((r) => {
    const fila = r as Record<string, unknown>;
    const tipo = (fila.tipo_comprobante as string | null) ?? "";
    const saldo = round(signo(tipo) * num(fila.saldo));
    total += saldo;
    const nombre = (fila.cliente_nombre as string | null)?.trim() ?? "";
    if (!nombreSwitch && nombre) nombreSwitch = nombre;
    return {
      numero: (fila.secuencial as string | null) || (fila.numero_fiscal as string | null) || "—",
      fecha: (fila.fecha_creacion as string | null) ?? null,
      tipo,
      monto: round(num(fila.total)),
      saldo,
      debito: round(num(fila.debito)),
      credito: round(num(fila.credito)),
      dias: (fila.dias as number | null) ?? null,
      plazoCredito: fila.plazo_credito != null ? num(fila.plazo_credito) : null,
      numeroFiscal: ((fila.numero_fiscal as string | null) ?? "").trim() || null,
    };
  });

  const ficha = await leerFichaBoston(codigo);

  return {
    codigo,
    clienteNombre: nombreDelPapel(nombreSwitch || ficha.nombre, codigo),
    cliente: ficha,
    empresas: [
      {
        empresa_key: EMPRESA_BOSTON,
        empresa_nombre: EMPRESA_KEY_TO_NAME[EMPRESA_BOSTON] ?? "Confecciones Boston",
        documentos,
        subtotal: round(total),
        saldoSwitch: null,
      },
    ],
    total: round(total),
    generadoEn: new Date().toISOString(),
  };
}
