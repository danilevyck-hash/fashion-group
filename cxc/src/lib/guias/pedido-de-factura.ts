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
 * Solo LEE. El login usa `changesession=SI` y saca a Daniel del panel de esa
 * empresa (lo acepta). UN login por empresa y por pedido de la pantalla, con
 * las facturas una tras otra; se cierra la sesión al terminar.
 */
import { inflateSync } from "zlib";
import { supabaseServer } from "@/lib/supabase-server";
import { RUNNING_STALE_MIN } from "@/lib/switch-api/sync-log";
import { cerrarSesionWeb, leerFacturaMostrar, loginSwitchWeb } from "@/lib/switch-api/web-client";
import { normalizarPedido } from "./etiquetas-por-envio";

/** Tope de la búsqueda entera (login + facturas). Medido: login 2–12 s, cada factura 0,5–3,5 s. */
export const TOPE_BUSQUEDA_PEDIDO_MS = 12_000;
/** Cuántas facturas se miran por pedido de la pantalla, como mucho. */
export const MAX_FACTURAS_PEDIDO = 10;

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
 * La «Referencia Pedido» de la vista de una factura (HTML o PDF), o `null`.
 * Pasa por `normalizarPedido`: lo que no cabe en la etiqueta no se devuelve.
 */
export function extraerReferenciaPedido(pagina: Uint8Array | string): string | null {
  let texto: string;
  if (typeof pagina === "string") texto = pagina;
  else if (Buffer.from(pagina.subarray(0, 5)).toString("latin1") === "%PDF-") texto = textoDePdf(pagina);
  else texto = new TextDecoder().decode(pagina);
  const plano = texto.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ");
  const hallado = RE_PEDIDO.exec(plano)?.[1];
  if (!hallado) return null;
  const n = normalizarPedido(hallado);
  return n.ok ? n.valor : null;
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

export type PedidosPorFactura = Record<string, string | null>;

/**
 * El pedido de cada factura (`switch_factura_id`), o `null`. NUNCA lanza: un
 * login caído, una corrida en curso o el tope de tiempo dejan `null` en lo que
 * falte, y la pantalla deja el campo para escribirlo a mano.
 */
export async function buscarPedidosDeFacturas(
  empresaKey: string,
  ids: readonly number[],
  topeMs: number = TOPE_BUSQUEDA_PEDIDO_MS,
): Promise<{ pedidos: PedidosPorFactura; motivo?: "ocupado" | "error" | "tiempo" }> {
  const pedidos: PedidosPorFactura = Object.fromEntries(ids.map((id) => [String(id), null]));
  if (ids.length === 0) return { pedidos };
  const limite = Date.now() + topeMs;
  let motivo: "ocupado" | "error" | "tiempo" | undefined;

  const trabajo = (async () => {
    if (await hayCorridaEnCurso(empresaKey)) { motivo = "ocupado"; return; }
    const sesion = await loginSwitchWeb(empresaKey);
    try {
      for (const id of ids) {
        if (Date.now() >= limite) { motivo = "tiempo"; break; }
        try {
          pedidos[String(id)] = extraerReferenciaPedido(await leerFacturaMostrar(sesion, id));
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
  return { pedidos: { ...pedidos }, ...(motivo ? { motivo } : {}) };
}
