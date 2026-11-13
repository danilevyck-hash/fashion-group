/**
 * 🔴 EL N.° DE PEDIDO DE UNA FACTURA, LEÍDO DEL PANEL DE SWITCH (12-nov-2026).
 *
 * El API no trae el pedido; la vista de la factura en el panel web
 * (`/reportes/facturamostrar/<switch_factura_id>`) sí: «Referencia Pedido:
 * 16-000002889». Medido el 12-nov-2026 en las 6 del grupo: Fashion Wear,
 * Vistana y Active Wear contestan HTML; Fashion Shoes, Active Shoes y Joystep
 * contestan un PDF (DOMPDF) con el mismo texto. Una factura sin pedido no trae
 * la línea → `null`.
 *
 * Del panel solo LEE; lo leído se GUARDA con la factura
 * (`switch_facturas.pedido_referencia` + `pedido_leido_en`). Lo llena el sync de
 * facturas (`llenarPedidosGuardados`) y la pantalla lo recibe con la lista;
 * leer en el momento queda de respaldo. El login usa `changesession=SI` y saca
 * a Daniel del panel de esa empresa (lo acepta). UN login por empresa, con las
 * facturas una tras otra; se cierra la sesión al terminar.
 */
import { inflateSync } from "zlib";
import { supabaseServer } from "@/lib/supabase-server";
import { RUNNING_STALE_MIN } from "@/lib/switch-api/sync-log";
import { cerrarSesionWeb, leerFacturaMostrar, loginSwitchWeb } from "@/lib/switch-api/web-client";
import { normalizarPedido } from "./etiquetas-por-envio";
import { TIPO_FACTURA } from "./atajos-facturas";

/** Tope de la búsqueda entera (login + facturas). Medido: login 2–12 s, cada factura 0,5–3,5 s. */
export const TOPE_BUSQUEDA_PEDIDO_MS = 12_000;
export { MAX_FACTURAS_PEDIDO } from "./etiquetas-por-envio";

// Estricto: solo espacios entre «Pedido:» y el número; el número, NN-NNNNNN….
const RE_PEDIDO = /Referencia\s+Pedido:\s*(\d{2}-\d{6,12})(?![\d-])/;

/** El texto de un PDF de DOMPDF: las cadenas de cada `Tj`/`TJ`, una por línea. */
function textoDePdf(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  const crudo = buf.toString("latin1");
  const lineas: string[] = [];
  const reStream = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = reStream.exec(crudo))) {
    const ini = m.index + m[0].length;
    const fin = crudo.indexOf("endstream", ini);
    if (fin < 0) break;
    let s: string;
    try {
      s = inflateSync(buf.subarray(ini, fin), { finishFlush: 2 /* Z_SYNC_FLUSH */ }).toString("latin1");
    } catch {
      s = crudo.slice(ini, fin); // stream sin comprimir
    }
    for (const op of s.matchAll(/\[((?:\\.|[^\]\\])*)\]\s*TJ|\(((?:\\.|[^)\\])*)\)\s*Tj/g)) {
      const dentro = op[1] ?? `(${op[2]})`;
      const partes = [...dentro.matchAll(/\(((?:\\.|[^)\\])*)\)/g)].map((p) => p[1].replace(/\\(.)/g, "$1"));
      lineas.push(partes.join(""));
    }
  }
  return lineas.join("\n");
}

/**
 * Lo que dice la vista de una factura (HTML o PDF): si de verdad ES una factura
 * —trae su CUFE de la DGI, o Vendedor y Cliente; la página del login no— y su «Referencia Pedido».
 * Solo una vista que es factura se guarda: lo demás se vuelve a intentar.
 */
export function leerVistaFactura(pagina: Uint8Array | string): { esFactura: boolean; pedido: string | null } {
  let texto: string;
  if (typeof pagina === "string") texto = pagina;
  else if (Buffer.from(pagina.subarray(0, 5)).toString("latin1") === "%PDF-") texto = textoDePdf(pagina);
  else texto = new TextDecoder().decode(pagina);
  const plano = texto.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ");
  const hallado = RE_PEDIDO.exec(plano)?.[1];
  const n = hallado ? normalizarPedido(hallado) : null;
  // La electrónica trae CUFE; la vieja (Vistana 11-000003143, sin CUFE) trae Vendedor y Cliente. El login, nada de eso.
  const esFactura = /\bCUFE\b/.test(plano) || (/\bVendedor\b/.test(plano) && /\bCliente\b/.test(plano));
  return { esFactura, pedido: n?.ok ? n.valor : null };
}

/**
 * La «Referencia Pedido» de la vista de una factura (HTML o PDF), o `null`.
 * Pasa por `normalizarPedido`: lo que no cabe en la etiqueta no se devuelve.
 */
export function extraerReferenciaPedido(pagina: Uint8Array | string): string | null {
  return leerVistaFactura(pagina).pedido;
}

/** ¿Hay una corrida de Switch de esa empresa en curso? Entonces no se entra al panel. */
async function hayCorridaEnCurso(empresaKey: string): Promise<boolean> {
  const desde = new Date(Date.now() - RUNNING_STALE_MIN * 60_000).toISOString();
  const { data, error } = await supabaseServer
    .from("switch_sync_log")
    .select("started_at")
    .eq("empresa_key", empresaKey)
    .eq("status", "running")
    .gte("started_at", desde)
    .limit(1);
  if (error) return false; // ante la duda se busca: solo lee
  return (data ?? []).length > 0;
}

/** Guarda lo leído con la factura. Nunca lanza: si no se guarda, se vuelve a leer. */
async function guardarPedido(empresaKey: string, id: number, pedido: string | null): Promise<void> {
  const { error } = await supabaseServer
    .from("switch_facturas")
    .update({ pedido_referencia: pedido, pedido_leido_en: new Date().toISOString() })
    .eq("empresa_key", empresaKey)
    .eq("switch_factura_id", id);
  if (error) console.error(`[guias/pedido] guardar ${empresaKey} ${id}:`, error.message);
}

export type PedidosPorFactura = Record<string, string | null>;
export type MotivoPedido = "ocupado" | "error" | "tiempo";

/**
 * El pedido de cada factura (`switch_factura_id`), o `null`, y lo GUARDA con la
 * factura. UN login para todas, una tras otra. NUNCA lanza: un login caído, una
 * corrida en curso o el tope de tiempo dejan `null` en lo que falte.
 */
export async function buscarPedidosDeFacturas(
  empresaKey: string,
  ids: readonly number[],
  topeMs: number = TOPE_BUSQUEDA_PEDIDO_MS,
): Promise<{ pedidos: PedidosPorFactura; leidas: number; motivo?: MotivoPedido }> {
  const pedidos: PedidosPorFactura = Object.fromEntries(ids.map((id) => [String(id), null]));
  if (ids.length === 0) return { pedidos, leidas: 0 };
  const limite = Date.now() + topeMs;
  let motivo: MotivoPedido | undefined;
  let leidas = 0;

  const trabajo = (async () => {
    if (await hayCorridaEnCurso(empresaKey)) { motivo = "ocupado"; return; }
    const sesion = await loginSwitchWeb(empresaKey);
    try {
      for (const id of ids) {
        if (Date.now() >= limite) { motivo = "tiempo"; break; }
        try {
          const vista = leerVistaFactura(await leerFacturaMostrar(sesion, id));
          if (!vista.esFactura) { motivo = "error"; continue; }
          pedidos[String(id)] = vista.pedido;
          leidas++;
          await guardarPedido(empresaKey, id, vista.pedido);
        } catch {
          motivo = "error";
        }
      }
    } finally {
      await cerrarSesionWeb(sesion);
    }
  })().catch((e: unknown) => {
    motivo = "error";
    console.error(`[guias/pedido] ${empresaKey}:`, e instanceof Error ? e.message : String(e));
  });

  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tiempo = new Promise<"tiempo">((r) => { reloj = setTimeout(() => r("tiempo"), topeMs); });
  const gano = await Promise.race([trabajo.then(() => "listo" as const), tiempo]);
  clearTimeout(reloj);
  if (gano === "tiempo") motivo = "tiempo";
  // Copia: lo que llegue después del tope no cambia lo que ya se contestó.
  return { pedidos: { ...pedidos }, leidas, ...(motivo ? { motivo } : {}) };
}

/** Lo que el sync de facturas mira en cada corrida: los últimos 7 días… */
export const DIAS_LLENAR_PEDIDO = 7;
/** …como mucho 20 facturas por empresa… */
export const MAX_LLENAR_PEDIDO = 20;
/** …y como mucho 45 s por empresa, login incluido. Medido: login 1,4–8 s, cada factura 0,3–4 s. */
export const TOPE_LLENAR_PEDIDO_MS = 45_000;

export interface LlenadoPedidos {
  empresaKey: string;
  pendientes: number;
  leidas: number;
  motivo?: MotivoPedido;
}

/**
 * 🔴 EL PEDIDO SE GUARDA CON LA FACTURA (12-nov-2026). Lo llama el sync de
 * facturas (`/api/cron/switch-sync`) al terminar: las facturas de esta empresa
 * de los últimos `dias` que todavía no se leyeron (`pedido_leido_en IS NULL`),
 * las más nuevas primero, con UN login y como mucho `max` y `topeMs`. Sin
 * pendientes NO abre sesión. NUNCA lanza: un fallo se anota y el sync sigue.
 */
export async function llenarPedidosGuardados(
  empresaKey: string,
  { dias = DIAS_LLENAR_PEDIDO, max = MAX_LLENAR_PEDIDO, topeMs = TOPE_LLENAR_PEDIDO_MS } = {},
): Promise<LlenadoPedidos> {
  try {
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await supabaseServer
      .from("switch_facturas")
      .select("switch_factura_id")
      .eq("empresa_key", empresaKey)
      .eq("tipo_comprobante", TIPO_FACTURA)
      .is("pedido_leido_en", null)
      .gte("fecha", desde)
      .order("fecha", { ascending: false })
      .order("switch_factura_id", { ascending: false })
      .limit(max);
    if (error) throw new Error(error.message);
    const ids = ((data ?? []) as Array<{ switch_factura_id: number | string }>).map((r) => Number(r.switch_factura_id));
    if (ids.length === 0) return { empresaKey, pendientes: 0, leidas: 0 };
    const r = await buscarPedidosDeFacturas(empresaKey, ids, topeMs);
    return { empresaKey, pendientes: ids.length, leidas: r.leidas, ...(r.motivo ? { motivo: r.motivo } : {}) };
  } catch (e) {
    console.error(`[guias/pedido] llenar ${empresaKey}:`, e instanceof Error ? e.message : String(e));
    return { empresaKey, pendientes: 0, leidas: 0, motivo: "error" };
  }
}
