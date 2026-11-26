// I/O del PDF de Switch para el correo de los lunes (lo puro y el porqué:
// `estado-cuenta-pdf-switch.ts`). Tres cosas:
//   · pedirle a Switch que mande su PDF al buzón intermedio (panel web, sesión
//     del usuario de cada empresa, una empresa por sesión, en serie);
//   · encontrar esos correos en el buzón por Microsoft Graph (Mail.Read);
//   · bajar el adjunto, intacto.
// El buzón ES el almacén: no se guarda ningún PDF en la base.

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { loginSwitchWeb, cerrarSesionWeb, enviarEstadoCuentaPendiente } from "@/lib/switch-api/web-client";
import { credencialesGraph, tokenGraph, bytesDeAdjunto } from "@/lib/tallas-pedido/graph";
import {
  BUZON_INTERMEDIO,
  REMITENTE_SWITCH,
  elegirIdSwitch,
  empresaDelAsunto,
  idDelAdjunto,
  type FilaIdSwitch,
} from "@/lib/cxc/estado-cuenta-pdf-switch";

import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { correoDelCliente } from "@/lib/cxc/correo-del-cliente";
import { direccionesValidas, seleccionarClientes, type ClienteDelLunes } from "@/lib/cxc/estado-cuenta-automatico";

const GRAPH = "https://graph.microsoft.com/v1.0";

export interface ClienteConCorreo extends ClienteDelLunes {
  /** Vacío = sin correo: no se le manda nada. */
  correos: string[];
}

/** Los clientes del lunes (cartera ya cargada, saldo > 0 en las 6), con su correo. */
export async function clientesDelLunes(soloCodigos: readonly string[] = []): Promise<ClienteConCorreo[]> {
  const filas = await leerTodoPaginado<{
    codigo: string | null;
    company_key: string;
    total: number | string | null;
    nombre: string | null;
    nombre_normalized: string | null;
  }>("switch_estadocuenta_aging_mv (estado de cuenta semanal)", (pedirCount, desde, hasta) =>
    supabaseServer
      .from("switch_estadocuenta_aging_mv")
      .select("id, codigo, company_key, total, nombre, nombre_normalized", pedirCount ? { count: "exact" } : {})
      .in("company_key", [...CXC_GRUPO_EMPRESA_KEYS])
      .gt("total", 0)
      .order("company_key", { ascending: true })
      .order("codigo", { ascending: true })
      .order("id", { ascending: true })
      .range(desde, hasta),
  );
  let clientes = seleccionarClientes(
    filas.map((f) => ({ codigo: f.codigo, empresa: f.company_key, total: f.total, nombre: f.nombre, nombreNormalizado: f.nombre_normalized })),
  );
  if (soloCodigos.length) clientes = clientes.filter((c) => soloCodigos.includes(c.codigo));
  const out: ClienteConCorreo[] = [];
  for (const c of clientes) out.push({ ...c, correos: direccionesValidas(await correoDelCliente(c.codigo, c.nombreNormalizado)) });
  return out;
}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Entre un pedido y el siguiente en la MISMA empresa (Switch arma y manda cada PDF). */
const PAUSA_ENTRE_PEDIDOS_MS = 1_000;
/** Cada cuánto se mira el buzón mientras se esperan los correos. */
const PAUSA_ENTRE_MIRADAS_MS = 10_000;

export interface Par {
  empresa: string;
  id: number;
}
export const llavePar = (empresa: string, id: number) => `${empresa}:${id}`;

export interface PdfEnBuzon {
  mensajeId: string;
  adjuntoId: string;
  recibido: string;
}

export async function tokenDelBuzon(): Promise<string> {
  const c = credencialesGraph();
  if (!c) throw new Error("faltan las claves de Microsoft (GRAPH_*) en Vercel");
  return tokenGraph(c);
}

/**
 * Los PDF de Switch que llegaron al buzón desde `desde` (ISO), por (empresa, id
 * de Switch). Si el mismo cliente llegó dos veces, manda el MÁS NUEVO.
 */
export async function indicePdfsSwitch(
  token: string,
  desde: string,
  empresas: readonly string[],
): Promise<Map<string, PdfEnBuzon>> {
  const q = new URLSearchParams({
    $filter: `receivedDateTime ge ${desde} and from/emailAddress/address eq '${REMITENTE_SWITCH}'`,
    $select: "id,subject,receivedDateTime",
    $expand: "attachments($select=id,name)",
    $top: "100",
  });
  let url: string | undefined = `${GRAPH}/users/${encodeURIComponent(BUZON_INTERMEDIO)}/messages?${q}`;
  const indice = new Map<string, PdfEnBuzon>();
  for (let pagina = 0; url && pagina < 30; pagina += 1) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!r.ok) throw new Error(`buzón ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const p = (await r.json()) as {
      value: { id: string; subject: string; receivedDateTime: string; attachments?: { id: string; name: string }[] }[];
      "@odata.nextLink"?: string;
    };
    for (const m of p.value) {
      const empresa = empresaDelAsunto(m.subject ?? "", empresas);
      if (!empresa) continue;
      for (const a of m.attachments ?? []) {
        const id = idDelAdjunto(a.name ?? "");
        if (id == null) continue;
        const k = llavePar(empresa, id);
        const previo = indice.get(k);
        if (!previo || previo.recibido < m.receivedDateTime) {
          indice.set(k, { mensajeId: m.id, adjuntoId: a.id, recibido: m.receivedDateTime });
        }
      }
    }
    url = p["@odata.nextLink"];
  }
  return indice;
}

export function bajarPdf(token: string, pdf: PdfEnBuzon): Promise<Uint8Array> {
  return bytesDeAdjunto(token, BUZON_INTERMEDIO, pdf.mensajeId, pdf.adjuntoId);
}

// ─── Que el buzón no se llene (Daniel, 27-nov-2026) ──────────────────────────
// Ya reenviado al cliente (Resend aceptó), el correo de Switch se MUEVE a la
// carpeta «Estados de cuenta Switch»; a los 30 días pasa a Elementos eliminados.
// Si el correo al cliente falló, el de Switch se queda donde está para el
// reintento. ⚠️ Mover pide Mail.ReadWrite: con Mail.Read (lo que la app tiene
// al 27-nov-2026) Microsoft contesta 403 y esto no hace nada —no corta el envío—;
// el día que se le dé el permiso empieza a ordenar solo.

export const CARPETA_SWITCH = "Estados de cuenta Switch";
export const DIAS_EN_CARPETA = 30;

const buzonUrl = () => `${GRAPH}/users/${encodeURIComponent(BUZON_INTERMEDIO)}`;
let sinPermisoParaMover = false;
let carpetaId: string | null = null;

async function graphJson(token: string, url: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  const r = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (r.status === 401 || r.status === 403) sinPermisoParaMover = true;
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function idDeLaCarpeta(token: string): Promise<string | null> {
  if (carpetaId || sinPermisoParaMover) return carpetaId;
  const filtro = encodeURIComponent(`displayName eq '${CARPETA_SWITCH}'`);
  const q = await graphJson(token, `${buzonUrl()}/mailFolders?$filter=${filtro}&$select=id`);
  const hallada = (q.body as { value?: { id: string }[] } | null)?.value?.[0]?.id;
  if (hallada) return (carpetaId = hallada);
  const c = await graphJson(token, `${buzonUrl()}/mailFolders`, { method: "POST", body: JSON.stringify({ displayName: CARPETA_SWITCH }) });
  return (carpetaId = (c.body as { id?: string } | null)?.id ?? null);
}

/** Mueve el correo de Switch ya reenviado a su carpeta. Best-effort: nunca lanza. */
export async function archivarCorreoSwitch(token: string, mensajeId: string): Promise<boolean> {
  try {
    const destino = await idDeLaCarpeta(token);
    if (!destino) return false;
    const r = await graphJson(token, `${buzonUrl()}/messages/${encodeURIComponent(mensajeId)}/move`, {
      method: "POST",
      body: JSON.stringify({ destinationId: destino }),
    });
    return r.status === 201 || r.status === 200;
  } catch {
    return false;
  }
}

/** Lo de la carpeta con más de 30 días pasa a Elementos eliminados. Devuelve cuántos. */
export async function limpiarCarpetaSwitch(token: string, ahora: number = Date.now()): Promise<number> {
  try {
    const destino = await idDeLaCarpeta(token);
    if (!destino) return 0;
    const corte = new Date(ahora - DIAS_EN_CARPETA * 86_400_000).toISOString().replace(/\.\d+Z$/, "Z");
    const q = new URLSearchParams({ $filter: `receivedDateTime lt ${corte}`, $select: "id", $top: "100" });
    let movidos = 0;
    for (let vuelta = 0; vuelta < 10; vuelta += 1) {
      const p = await graphJson(token, `${buzonUrl()}/mailFolders/${encodeURIComponent(destino)}/messages?${q}`);
      const ids = ((p.body as { value?: { id: string }[] } | null)?.value ?? []).map((m) => m.id);
      if (!ids.length) break;
      for (const id of ids) {
        const r = await graphJson(token, `${buzonUrl()}/messages/${encodeURIComponent(id)}/move`, {
          method: "POST",
          body: JSON.stringify({ destinationId: "deleteditems" }),
        });
        if (r.status === 201 || r.status === 200) movidos += 1;
        else return movidos;
      }
    }
    return movidos;
  } catch {
    return 0;
  }
}

/** ¿Microsoft dejó ordenar el buzón en esta corrida? (para decirlo en la respuesta) */
export const puedeOrdenarElBuzon = (): boolean => !sinPermisoParaMover;

/** Al empezar cada corrida: el permiso pudo cambiar desde la anterior. */
export function olvidarPermisoDelBuzon(): void {
  sinPermisoParaMover = false;
  carpetaId = null;
}

/** El id de Switch de cada (empresa, código). Sin id único → no está en el mapa. */
export async function idsDeSwitch(codigos: readonly string[], empresas: readonly string[]): Promise<Map<string, number>> {
  const filas = await leerTodoPaginado<FilaIdSwitch & { empresa_key: string; codigo: string }>(
    "switch_clientes (estado de cuenta semanal)",
    (pedirCount, desde, hasta) =>
      supabaseServer
        .from("switch_clientes")
        .select("id, empresa_key, codigo, cliente_switch_id, ausente_desde", pedirCount ? { count: "exact" } : {})
        .in("empresa_key", [...empresas])
        .in("codigo", [...codigos])
        .order("id", { ascending: true })
        .range(desde, hasta),
  );
  const grupos = new Map<string, FilaIdSwitch[]>();
  for (const f of filas) {
    const k = `${f.empresa_key}:${f.codigo}`;
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  const out = new Map<string, number>();
  for (const [k, g] of grupos) {
    const id = elegirIdSwitch(g);
    if (id != null) out.set(k, id);
  }
  return out;
}

export interface Fallo {
  empresa: string;
  id: number | null;
  motivo: string;
}

/** Le pide a Switch los PDF de una empresa, en UNA sesión, en serie. */
async function pedirEnUnaEmpresa(empresa: string, ids: number[], hasta: number): Promise<Fallo[]> {
  const fallos: Fallo[] = [];
  let sesion;
  try {
    sesion = await loginSwitchWeb(empresa);
  } catch (e) {
    return ids.map((id) => ({ empresa, id, motivo: `no se pudo entrar a Switch: ${(e as Error).message}` }));
  }
  try {
    for (const id of ids) {
      if (Date.now() > hasta) {
        fallos.push({ empresa, id, motivo: "no alcanzó el tiempo" });
        continue;
      }
      try {
        await enviarEstadoCuentaPendiente(sesion, id, BUZON_INTERMEDIO);
      } catch (e) {
        fallos.push({ empresa, id, motivo: (e as Error).message });
      }
      await dormir(PAUSA_ENTRE_PEDIDOS_MS);
    }
  } finally {
    await cerrarSesionWeb(sesion);
  }
  return fallos;
}

/** Pide los pares a Switch: las empresas a la vez (sesiones distintas), cada una en serie. */
export async function pedirASwitch(pares: readonly Par[], hasta: number): Promise<Fallo[]> {
  const porEmpresa = new Map<string, number[]>();
  for (const p of pares) porEmpresa.set(p.empresa, [...(porEmpresa.get(p.empresa) ?? []), p.id]);
  const res = await Promise.all([...porEmpresa].map(([e, ids]) => pedirEnUnaEmpresa(e, ids, hasta)));
  return res.flat();
}

export interface Asegurado {
  indice: Map<string, PdfEnBuzon>;
  pedidos: number;
  faltan: Par[];
  fallos: Fallo[];
}

/**
 * Que cada par tenga su PDF de Switch en el buzón desde `desde`: pide los que
 * faltan, espera a que lleguen (hasta `esperaMs`) y vuelve a pedir UNA vez los
 * que no llegaron. No pide lo que ya está (una segunda corrida no repite).
 */
export async function asegurarPdfs(opts: {
  token: string;
  pares: readonly Par[];
  desde: string;
  /** Tope de reloj (epoch ms) para dejar de pedir. */
  hasta: number;
  esperaMs: number;
  rondas?: number;
}): Promise<Asegurado> {
  const empresas = [...new Set(opts.pares.map((p) => p.empresa))];
  const faltantes = (ix: Map<string, PdfEnBuzon>) => opts.pares.filter((p) => !ix.has(llavePar(p.empresa, p.id)));
  let indice = await indicePdfsSwitch(opts.token, opts.desde, empresas);
  let faltan = faltantes(indice);
  let pedidos = 0;
  let fallos: Fallo[] = [];
  for (let ronda = 0; ronda < (opts.rondas ?? 2) && faltan.length && Date.now() < opts.hasta; ronda += 1) {
    pedidos += faltan.length;
    fallos = await pedirASwitch(faltan, opts.hasta);
    const limite = Math.min(Date.now() + opts.esperaMs, opts.hasta + opts.esperaMs);
    do {
      await dormir(PAUSA_ENTRE_MIRADAS_MS);
      indice = await indicePdfsSwitch(opts.token, opts.desde, empresas);
      faltan = faltantes(indice);
    } while (faltan.length && Date.now() < limite);
  }
  return { indice, pedidos, faltan, fallos };
}
