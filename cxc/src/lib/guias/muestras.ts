// ─────────────────────────────────────────────────────────────────────────────
// Despachos › Pedidos › «Muestras» (24-nov-2026, Daniel aprobó el mockup
// «Muestras - paso a paso»). Las reglas, PURAS: las leen la ruta y la pantalla.
//
//   1. Bodega (y admin) abre un pedido, toca varias referencias y pide la
//      muestra con UN botón («Pedir N muestras»). La muestra es la referencia:
//      sin talla, color ni nota.
//   2. Quién la manda, ESCRITO A MANO y sin tabla: Vistana → edwin; las otras
//      5 empresas del grupo → rey. Daniel (admin) ve todo.
//   3. El vendedor la marca «Enviada» (o «Enviar todas» las del pedido).
//   4. Bodega ve en el pedido «Falta muestra · esperando a Rey» → «Muestra
//      enviada · hace 2 h». Si no llegó, la reclama: vuelve a la lista del
//      vendedor como «No llegó · reclamada hace 1 h». 🔴 No se confirma
//      «Recibida» (Daniel: B): enviada = resuelta, salvo «No llegó».
//   5. «En espera de muestra» del pedido es AUTOMÁTICA: prendida mientras haya
//      alguna referencia en «Falta muestra» o «No llegó» (solo En preparación,
//      por el CHECK de la base).
//   6. Si el pedido se recibe o se factura (Switch lo saca de la lista), sus
//      muestras pendientes desaparecen solas al LEER. Sin cron.
// ─────────────────────────────────────────────────────────────────────────────

import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { veLaEmpresa, type Veredicto } from "./pedidos-bultos";
import { MESES_CORTOS, fechaPanamaDe } from "@/lib/fecha-panama";

/**
 * 🔴 PRENDIDO con el «sí» de Daniel (24-nov-2026). `false` = lo de antes: sin
 * sección Muestras y con los botones a mano «En espera de muestra» y «Quitar
 * espera» en la fila del pedido. Escape local: `NEXT_PUBLIC_MUESTRAS=0`.
 */
export const MUESTRAS_EN_CODIGO = true;
export const MUESTRAS_2026_11: boolean =
  MUESTRAS_EN_CODIGO && !(typeof process !== "undefined" && process.env?.NEXT_PUBLIC_MUESTRAS === "0");

export const ESTADOS_MUESTRA = ["falta", "enviada", "no_llego"] as const;
export type EstadoMuestra = (typeof ESTADOS_MUESTRA)[number];

/** Las que el vendedor tiene que mandar (y las que tienen al pedido en espera). */
export const ESTADOS_POR_MANDAR: readonly EstadoMuestra[] = ["falta", "no_llego"];

export function esPorMandar(e: string | null | undefined): boolean {
  return (ESTADOS_POR_MANDAR as readonly string[]).includes(String(e));
}

// ─── Quién manda la muestra ──────────────────────────────────────────────────

/** Vendedor (usuario del sistema) por empresa. Lo que no está aquí lo manda rey. */
export const VENDEDOR_DE_MUESTRAS_POR_EMPRESA: Readonly<Record<string, string>> = {
  vistana: "edwin",
};
export const VENDEDOR_DE_MUESTRAS_RESTO = "rey";

export function vendedorDeMuestra(empresaKey: string): string {
  return VENDEDOR_DE_MUESTRAS_POR_EMPRESA[empresaKey] ?? VENDEDOR_DE_MUESTRAS_RESTO;
}

/** «Rey», «Edwin»: como se lee en pantalla. */
export function nombreDelVendedor(usuario: string): string {
  const u = usuario.trim();
  return u ? u[0].toUpperCase() + u.slice(1) : u;
}

/**
 * Quién MANDA muestras además del vendedor, POR USUARIO y sin mirar el rol
 * (Daniel, 25-nov-2026): Angel —bodega en el sistema— las manda igual que Rey,
 * en todas las del grupo menos Vistana. Su rol NO cambia.
 */
export const MANDAN_MUESTRAS_ADEMAS: Readonly<Record<string, readonly string[]>> = {
  angel: B2B_EMPRESA_KEYS.filter((e) => e !== "vistana"),
};

/** Las empresas cuyas muestras manda esta persona. Admin: las 6. */
export function empresasDeMuestrasDe(userName: string | null | undefined, role: string | null | undefined): readonly string[] {
  if (role === "admin") return B2B_EMPRESA_KEYS;
  const u = (userName ?? "").trim().toLowerCase();
  if (!u) return [];
  const ademas = MUESTRAS_COMO_PEDIDOS_2026_11 ? MANDAN_MUESTRAS_ADEMAS[u] : undefined;
  if (ademas) return ademas;
  if (role !== "vendedor") return [];
  return B2B_EMPRESA_KEYS.filter((e) => vendedorDeMuestra(e) === u);
}

/** Todos los que mandan las muestras de una empresa (sin admin): el vendedor y los de `MANDAN_MUESTRAS_ADEMAS`. */
export function quienesMandanMuestras(empresaKey: string): readonly string[] {
  const extra = MUESTRAS_COMO_PEDIDOS_2026_11
    ? Object.keys(MANDAN_MUESTRAS_ADEMAS).filter((u) => MANDAN_MUESTRAS_ADEMAS[u].includes(empresaKey))
    : [];
  return [...extra, vendedorDeMuestra(empresaKey)];
}

/**
 * Despachos ABRE en «Muestras» para estos usuarios (25-nov-2026, Daniel:
 * «Edwin, Angel y Rey»). Los vendedores salen de la MISMA regla de quién ve
 * la lista; Angel (bodega) se agrega a mano. ⚠️ Sin la sección (hoy bodega no
 * tiene lista de Muestras) no cambia nada: abre en Pedidos como siempre.
 */
export const ABREN_EN_MUESTRAS_A_MANO: readonly string[] = ["angel"];

export function abreEnMuestras(userName: string | null | undefined, role: string | null | undefined): boolean {
  const u = (userName ?? "").trim().toLowerCase();
  if (!MUESTRAS_2026_11 || !u) return false;
  if (ABREN_EN_MUESTRAS_A_MANO.includes(u)) return true;
  return role === "vendedor" && empresasDeMuestrasDe(u, role).length > 0;
}

/**
 * 🔴 MUESTRAS EN EL ORDEN DE PEDIDOS (25-nov-2026, Daniel: «sí, los tres»).
 * Banda por empresa y una fila por pedido; todo lo por mandar viene MARCADO y
 * UN «Enviar N muestras» pide una sola guía o comentario para varios pedidos.
 * Angel (bodega) manda como Rey, sin Vistana. `false` = la pantalla anterior.
 */
export const MUESTRAS_COMO_PEDIDOS_2026_11 = true;

/** Quién MIRA la lista sin mandar nada. Hoy nadie: Angel pasó a mandar (Daniel, 25-nov-2026). */
export const MIRAN_MUESTRAS_SIN_ENVIAR: Readonly<Record<string, readonly string[]>> = {};

/** Las empresas cuya lista ve esta persona: las que manda, o las que solo mira. */
export function empresasQueVenMuestras(userName: string | null | undefined, role: string | null | undefined): readonly string[] {
  const propias = empresasDeMuestrasDe(userName, role);
  if (propias.length > 0 || !MUESTRAS_COMO_PEDIDOS_2026_11 || role !== "bodega") return propias;
  return MIRAN_MUESTRAS_SIN_ENVIAR[(userName ?? "").trim().toLowerCase()] ?? [];
}

/** ¿Mira la lista sin poder mandar? (Angel). Ve solo lo por mandar, como el vendedor. */
export function soloMiraMuestras(userName: string | null | undefined, role: string | null | undefined): boolean {
  return empresasDeMuestrasDe(userName, role).length === 0 && empresasQueVenMuestras(userName, role).length > 0;
}


/** ¿Ve la sección «Muestras»? El vendedor asignado y admin. */
export function veSeccionMuestras(userName: string | null | undefined, role: string | null | undefined): boolean {
  return MUESTRAS_2026_11 && empresasDeMuestrasDe(userName, role).length > 0;
}

// ─── Quién hace qué (lo decide el SERVIDOR con estas funciones) ─────────────

export const ROLES_PIDEN_MUESTRA: readonly string[] = ["admin", "bodega"];

export interface QuienMuestra {
  role: string | null | undefined;
  userName: string | null | undefined;
}

const esBodega = (q: QuienMuestra) => !!q.role && ROLES_PIDEN_MUESTRA.includes(q.role);

/** Pedir: bodega o admin, de una empresa suya, con el pedido sin recibir. */
export function puedePedirMuestra(args: { empresa_key: string; estadoPedido: string }, q: QuienMuestra): Veredicto {
  if (!esBodega(q)) return { ok: false, error: "La muestra la pide bodega" };
  if (!veLaEmpresa(args.empresa_key, q.userName, q.role)) return { ok: false, error: "Ese pedido no es de una de tus empresas" };
  if (args.estadoPedido === "recibido") return { ok: false, error: "El pedido ya se recibió: no lleva muestras" };
  return { ok: true };
}

export type AccionMuestra = "enviada" | "no_llego" | "quitar";

/**
 * ¿Puede esta persona hacer ESA acción sobre ESA muestra?
 *   · «Enviada»: el vendedor asignado a la empresa, o admin; desde Falta o No llegó.
 *   · «No llegó»: bodega o admin, de una empresa suya; solo una Enviada.
 *   · «Quitar»: bodega o admin, de una empresa suya; solo una que no se ha enviado.
 */
export function puedeAccionMuestra(
  accion: AccionMuestra,
  m: { empresa_key: string; estado: string },
  q: QuienMuestra,
): Veredicto {
  if (accion === "enviada") {
    if (!empresasDeMuestrasDe(q.userName, q.role).includes(m.empresa_key)) {
      return { ok: false, error: `Esa muestra la manda ${nombreDelVendedor(vendedorDeMuestra(m.empresa_key))}` };
    }
    if (!esPorMandar(m.estado)) return { ok: false, error: "Esa muestra ya se envió" };
    return { ok: true };
  }
  if (!esBodega(q)) return { ok: false, error: "Eso lo marca bodega" };
  if (!veLaEmpresa(m.empresa_key, q.userName, q.role)) return { ok: false, error: "Ese pedido no es de una de tus empresas" };
  if (accion === "no_llego") {
    return m.estado === "enviada" ? { ok: true } : { ok: false, error: "Solo se reclama una muestra enviada" };
  }
  return esPorMandar(m.estado) ? { ok: true } : { ok: false, error: "Una muestra enviada no se quita: si no llegó, reclámala" };
}

// ─── N.° de guía o comentario del envío (25-nov-2026, Daniel: obligatorio, UNO por caja) ─

export const MAX_GUIA = 120;

/**
 * Lo escrito en «N.° de guía o comentario» (25-nov-2026, Daniel: OBLIGATORIO).
 * Recortado; `null` = no vale (vacío, no es texto o pasa de `MAX_GUIA`).
 */
export function limpiarGuia(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const g = v.trim().replace(/\s+/g, " ");
  return g && g.length <= MAX_GUIA ? g : null;
}

/** Las columnas que escribe cada acción. La guía va en TODAS las enviadas de la misma acción. */
export function columnasDeAccion(accion: AccionMuestra, quien: string, ahora: string, guia: string | null = null): Record<string, unknown> {
  if (accion === "enviada") return { estado: "enviada", enviada_por: quien, enviada_en: ahora, guia_envio: guia };
  if (accion === "no_llego") return { estado: "no_llego", reclamada_por: quien, reclamada_en: ahora };
  return { deleted: true, deleted_por: quien, deleted_en: ahora };
}

// ─── La espera automática del pedido ─────────────────────────────────────────

/** ¿El pedido queda En espera de muestra? Alguna referencia en Falta o No llegó. */
export function pedidoEnEspera(estados: readonly string[]): boolean {
  return estados.some(esPorMandar);
}

/**
 * Qué hacer con las columnas de espera del pedido. Solo En preparación (CHECK
 * `pedidos_bodega_espera_muestra_solo_en_preparacion`); en otro estado no se
 * toca nada y las marcas por referencia valen igual.
 */
export function cambioDeEspera(
  estadoPedido: string | null | undefined,
  yaEnEspera: boolean,
  abiertas: number,
): "poner" | "quitar" | null {
  if (estadoPedido !== "en_preparacion") return null;
  if (abiertas > 0 && !yaEnEspera) return "poner";
  if (abiertas === 0 && yaEnEspera) return "quitar";
  return null;
}

/** «En espera de muestra · 2 referencias» (En preparación) o «Falta muestra · 1 referencia». */
export function lineaDeEsperaDelPedido(abiertas: number, estadoPedido: string | null | undefined): string | null {
  if (abiertas <= 0) return null;
  const refs = `${abiertas} ${abiertas === 1 ? "referencia" : "referencias"}`;
  return estadoPedido === "en_preparacion" ? `En espera de muestra · ${refs}` : `Falta muestra · ${refs}`;
}

// ─── Lo que se lee ───────────────────────────────────────────────────────────

/** Una muestra pendiente se ve mientras el pedido siga en Switch y no se haya recibido. */
export function muestraSigueViva(pedidoEnSwitch: boolean, estadoPedido: string | null | undefined): boolean {
  return pedidoEnSwitch && estadoPedido !== "recibido";
}

const HORA = 3_600_000;
const DIA = 86_400_000;

/** «hace 5 min», «hace 2 h», «hace 3 días». */
export function haceTiempo(desde: string, ahoraIso: string): string {
  const ms = Math.max(0, Date.parse(ahoraIso) - Date.parse(desde));
  if (ms < HORA) return `hace ${Math.max(1, Math.floor(ms / 60_000))} min`;
  if (ms < DIA) return `hace ${Math.floor(ms / HORA)} h`;
  const d = Math.floor(ms / DIA);
  return d === 1 ? "hace 1 día" : `hace ${d} días`;
}

/** «hoy», «hace 1 día», «hace 3 días» — la edad que ve el vendedor. */
export function edadEnDias(desde: string, ahoraIso: string): { texto: string; dias: number } {
  const dias = Math.max(0, Math.floor((Date.parse(ahoraIso) - Date.parse(desde)) / DIA));
  return { dias, texto: dias === 0 ? "hoy" : dias === 1 ? "hace 1 día" : `hace ${dias} días` };
}

/** 🔴 «hace N días» en rojo si pasa de 2 días sin enviar. */
export const MUESTRA_VIEJA_DIAS = 2;
export const muestraVieja = (dias: number): boolean => dias > MUESTRA_VIEJA_DIAS;

export interface MuestraLeida {
  id: number;
  empresa_key: string;
  pedido_switch_id: number;
  codigo: string;
  descripcion: string | null;
  estado: EstadoMuestra;
  pedida_por: string;
  pedida_en: string;
  enviada_por: string | null;
  enviada_en: string | null;
  reclamada_por: string | null;
  reclamada_en: string | null;
  /** N.° de guía o comentario del envío. */
  guia_envio?: string | null;
}

/** «25-nov», en hora de Panamá. */
export function diaMes(iso: string): string {
  const [, m, d] = fechaPanamaDe(iso).split("-");
  return `${Number(d)}-${MESES_CORTOS[Number(m) - 1]}`;
}

/** «Enviada · 123456 · 25-nov» (sin texto, las de antes: «Enviada · 25-nov»). */
export function lineaEnviada(m: Pick<MuestraLeida, "enviada_en" | "pedida_en" | "guia_envio">): string {
  const guia = m.guia_envio?.trim();
  return ["Enviada", guia || null, diaMes(m.enviada_en ?? m.pedida_en)].filter(Boolean).join(" · ");
}

/** La línea que ve BODEGA bajo la referencia, sin botones. */
export function lineaParaBodega(m: MuestraLeida, ahoraIso: string): string {
  const quien = nombreDelVendedor(vendedorDeMuestra(m.empresa_key));
  if (m.estado === "enviada") return lineaEnviada(m);
  if (m.estado === "no_llego") return `No llegó · reclamada a ${quien} ${haceTiempo(m.reclamada_en ?? m.pedida_en, ahoraIso)}`;
  return `Falta muestra · esperando a ${quien}`;
}

/** La marca que ve el VENDEDOR en una reclamada: «No llegó · reclamada hace 1 h». */
export function lineaReclamada(m: MuestraLeida, ahoraIso: string): string | null {
  return m.estado === "no_llego" && m.reclamada_en ? `No llegó · reclamada ${haceTiempo(m.reclamada_en, ahoraIso)}` : null;
}

export interface PedidoDeMuestras {
  empresa_key: string;
  pedido_switch_id: number;
  secuencial: string;
  cliente_nombre: string;
  /** El vendedor del pedido en Switch (25-nov-2026). */
  vendedor_nombre?: string | null;
  muestras: MuestraLeida[];
}

/** La lista del vendedor, agrupada por pedido, del pedido con la muestra más vieja al más nuevo. */
export function agruparPorPedido(
  muestras: readonly MuestraLeida[],
  pedidos: ReadonlyMap<string, { secuencial: string; cliente_nombre: string; vendedor_nombre?: string | null }>,
): PedidoDeMuestras[] {
  const grupos = new Map<string, PedidoDeMuestras>();
  const orden = [...muestras].sort((a, b) => a.pedida_en.localeCompare(b.pedida_en) || a.id - b.id);
  for (const m of orden) {
    const k = `${m.empresa_key}:${m.pedido_switch_id}`;
    const p = pedidos.get(k);
    if (!p) continue;
    const g = grupos.get(k) ?? { empresa_key: m.empresa_key, pedido_switch_id: m.pedido_switch_id, ...p, muestras: [] };
    g.muestras.push(m);
    grupos.set(k, g);
  }
  return [...grupos.values()];
}

/** Las referencias que se pueden pedir: las del pedido, sin repetir y sin las que ya tienen muestra viva. */
export function codigosAPedir(pedidas: readonly unknown[], delPedido: readonly string[], yaVivas: readonly string[]): string[] {
  const existen = new Set(delPedido.map((c) => c.trim()));
  const vivas = new Set(yaVivas.map((c) => c.trim()));
  const salida: string[] = [];
  for (const c of pedidas) {
    const s = typeof c === "string" ? c.trim() : "";
    if (s && existen.has(s) && !vivas.has(s) && !salida.includes(s)) salida.push(s);
  }
  return salida;
}

/** «Pedir 2 muestras». */
export function rotuloPedirMuestras(n: number): string {
  return n === 1 ? "Pedir 1 muestra" : `Pedir ${n} muestras`;
}

/** «3 por mandar». */
export function lineaPorMandar(n: number): string {
  return `${n} por mandar`;
}
