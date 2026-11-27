// I/O del PDF de Switch para el correo de los lunes (lo puro y el porqué:
// `estado-cuenta-pdf-switch.ts`). Por empresa, en UNA sesión del panel y en serie:
//   · el papel de «Imprimir» de cada cliente (vista Pendientes) → PDF con Chromium;
//   · cerrada la sesión web, el saldo de cada uno por el API, para el candado.
// El orden importa: entrar al API con el mismo usuario CIERRA la sesión web
// (medido 27-nov-2026). Las empresas van a la vez: cada una es otra instancia.
// No se guarda ningún PDF: se imprimen y se mandan en la misma corrida.

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { loginSwitchWeb, cerrarSesionWeb, leerEstadoCuentaParaImprimir, type WebSession } from "@/lib/switch-api/web-client";
import { createSwitchClient, logoutSwitchSessions } from "@/lib/switch-api/client";
import { cuadreDeSwitch } from "@/lib/switch-api/estadocuenta-cuadre";
import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { correoDelCliente } from "@/lib/cxc/correo-del-cliente";
import { direccionesValidas, seleccionarClientes, type ClienteDelLunes } from "@/lib/cxc/estado-cuenta-automatico";
import { elegirIdSwitch, leerPapelSwitch, veredictoDelPapel, type FilaIdSwitch } from "@/lib/cxc/estado-cuenta-pdf-switch";
import type { Browser } from "puppeteer-core";

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
    const k = llave(f.empresa_key, f.codigo);
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  const out = new Map<string, number>();
  for (const [k, g] of grupos) {
    const id = elegirIdSwitch(g);
    if (id != null) out.set(k, id);
  }
  return out;
}

export const llave = (empresa: string, codigo: string) => `${empresa}:${codigo}`;

export interface Par {
  empresa: string;
  codigo: string;
  id: number;
}

/** Lo que salió de un (empresa, cliente): su PDF ya comprobado, o por qué no. */
export type Papel = { ok: true; total: number; pdf: Uint8Array } | { ok: false; motivo: string };

async function abrirChromium(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;
  // Local (Mac): CHROMIUM_LOCAL = ruta de un Chromium instalado. En Vercel, el de @sparticuz.
  if (process.env.CHROMIUM_LOCAL) return puppeteer.launch({ executablePath: process.env.CHROMIUM_LOCAL, headless: true });
  const chromium = (await import("@sparticuz/chromium")).default;
  return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
}

/** El papel de «Imprimir», guardado a PDF tal cual (A4, con fondos, como lo imprime Daniel). */
async function aPdf(browser: Browser, sesion: WebSession, html: string): Promise<Uint8Array> {
  const page = await browser.newPage();
  try {
    // El logo y la hoja de estilo los sirve el panel: van con la sesión.
    await page.setCookie(...[...sesion.cookies].map(([name, value]) => ({ name, value, url: sesion.baseUrl })));
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    return await page.pdf({ format: "A4", printBackground: true });
  } finally {
    await page.close().catch(() => {});
  }
}

/** Una empresa: los papeles en una sesión web y después los saldos por el API. */
async function imprimirEnUnaEmpresa(browser: Browser, empresa: string, pares: readonly Par[], hasta: number): Promise<Map<string, Papel>> {
  const out = new Map<string, Papel>();
  const impresos = new Map<string, { html: string; pdf: Uint8Array }>();
  const falla = (p: Par, motivo: string) => out.set(llave(empresa, p.codigo), { ok: false, motivo });

  let sesion: WebSession;
  try {
    sesion = await loginSwitchWeb(empresa);
  } catch (e) {
    for (const p of pares) falla(p, `no se pudo entrar a Switch: ${(e as Error).message}`);
    return out;
  }
  try {
    for (const p of pares) {
      if (Date.now() > hasta) {
        falla(p, "no alcanzó el tiempo");
        continue;
      }
      try {
        const html = await leerEstadoCuentaParaImprimir(sesion, p.id);
        impresos.set(p.codigo, { html, pdf: await aPdf(browser, sesion, html) });
      } catch (e) {
        falla(p, `no se pudo imprimir: ${(e as Error).message}`);
      }
    }
  } finally {
    await cerrarSesionWeb(sesion);
  }

  // 🔴 El candado: cada papel contra lo que Switch dice AHORA por su API.
  try {
    const api = createSwitchClient(empresa);
    for (const p of pares) {
      const impreso = impresos.get(p.codigo);
      if (!impreso) continue;
      let switchDice: { saldo: number | null; documentos: number | null } = { saldo: null, documentos: null };
      try {
        const ec = await api.getEstadoCuenta(p.id);
        const elementos = (ec as { estadocuenta?: { elements?: unknown } })?.estadocuenta?.elements;
        switchDice = { saldo: cuadreDeSwitch(ec).saldoTotal, documentos: Array.isArray(elementos) ? elementos.length : null };
      } catch (e) {
        falla(p, `Switch no dio el saldo para comprobar: ${(e as Error).message}`);
        continue;
      }
      const v = veredictoDelPapel(leerPapelSwitch(impreso.html), p.codigo, switchDice);
      out.set(llave(empresa, p.codigo), v.ok ? { ok: true, total: v.total, pdf: impreso.pdf } : v);
    }
  } catch (e) {
    for (const p of pares) if (!out.has(llave(empresa, p.codigo))) falla(p, `Switch no dio el saldo para comprobar: ${(e as Error).message}`);
  } finally {
    await logoutSwitchSessions([empresa]);
  }
  return out;
}

/** Todos los papeles: las empresas a la vez (instancias distintas), cada una en serie. */
export async function imprimirEstadosDeCuenta(pares: readonly Par[], hasta: number): Promise<Map<string, Papel>> {
  const porEmpresa = new Map<string, Par[]>();
  for (const p of pares) porEmpresa.set(p.empresa, [...(porEmpresa.get(p.empresa) ?? []), p]);
  if (!porEmpresa.size) return new Map();
  const browser = await abrirChromium();
  try {
    const partes = await Promise.all([...porEmpresa].map(([empresa, ps]) => imprimirEnUnaEmpresa(browser, empresa, ps, hasta)));
    return new Map(partes.flatMap((m) => [...m]));
  } finally {
    await browser.close().catch(() => {});
  }
}
