// ─────────────────────────────────────────────────────────────────────────────
// ENVÍO AUTOMÁTICO DEL ESTADO DE CUENTA — CADA LUNES, 8:00 a. m. DE PANAMÁ
// (26-nov-2026, Daniel). Lo PURO: quién entra, la semana, el texto del correo y
// el mensaje a Telegram. El I/O vive en `app/api/cron/estado-cuenta-semanal`.
//
// 🔴 QUIÉN ENTRA: todo cliente con saldo > 0 en alguna de las 6 empresas del
// grupo (`CXC_GRUPO_EMPRESA_KEYS`). Boston y Multifashion NO. Fuera también el
// mostrador (TCKCTA) y las empresas del grupo como clientes (`CLIENTES_FUERA`:
// 12188 Active Shoes, D-108 Multi Fashion Holding, D-38 Confecciones Boston) — la misma lista que
// los cobros del día.
// 🔴 UN correo por cliente (por CÓDIGO), con UN PDF por cada empresa donde
// tiene saldo > 0. Una empresa con saldo a favor no viaja.
// 🔴 A LO SUMO UNA VEZ POR SEMANA: llave (código, lunes) en
// `cxc_estado_cuenta_automatico`, reservada ANTES de mandar.
// ─────────────────────────────────────────────────────────────────────────────

import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { CLIENTES_FUERA } from "@/lib/cxc/cobros-del-dia";

/** Interruptor. `false` = el lunes no sale nada a clientes (test y prueba siguen).
 * APAGADO el 26-nov-2026: Daniel quiere el PDF que genera Switch, no uno regenerado. */
export const ESTADO_CUENTA_AUTOMATICO_2026_11 = false;

export const REMITENTE_AUTOMATICO = "Fashion Group <info@fashiongr.com>";
export const RESPONDER_A_AUTOMATICO = "info@fashiongr.com";
export const FIRMA_AUTOMATICO = "Departamento de Cobros";

/** Un renglón de la cartera: (cliente, empresa) con su saldo firmado. */
export interface FilaCartera {
  codigo: string | null;
  empresa: string;
  total: number | string | null;
  nombre: string | null;
  nombreNormalizado: string | null;
}

export interface ClienteDelLunes {
  codigo: string;
  nombre: string;
  nombreNormalizado: string;
  /** Empresas con saldo > 0, en el orden de la lista del grupo. */
  empresas: string[];
  /** Suma de esas empresas (lo que se cobra; los saldos a favor no restan). */
  saldo: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** ¿Este código queda fuera del envío? (mostrador y empresas del grupo) */
export function codigoFuera(codigo: string): boolean {
  return CLIENTES_FUERA.includes(codigo.trim().toUpperCase());
}

/** PURO. De la cartera, los clientes que reciben el correo del lunes. */
export function seleccionarClientes(filas: readonly FilaCartera[]): ClienteDelLunes[] {
  const grupo: readonly string[] = CXC_GRUPO_EMPRESA_KEYS;
  const porCodigo = new Map<string, ClienteDelLunes>();
  for (const f of filas) {
    const codigo = (f.codigo ?? "").trim();
    if (!codigo || codigoFuera(codigo)) continue;
    if (!grupo.includes(f.empresa)) continue;
    const total = round(Number(f.total) || 0);
    if (!(total > 0)) continue;
    const c = porCodigo.get(codigo) ?? {
      codigo,
      nombre: (f.nombre ?? "").trim() || codigo,
      nombreNormalizado: (f.nombreNormalizado ?? "").trim(),
      empresas: [],
      saldo: 0,
    };
    if (!c.empresas.includes(f.empresa)) c.empresas.push(f.empresa);
    c.saldo = round(c.saldo + total);
    if (!c.nombreNormalizado && f.nombreNormalizado) c.nombreNormalizado = f.nombreNormalizado.trim();
    porCodigo.set(codigo, c);
  }
  return [...porCodigo.values()]
    .map((c) => ({ ...c, empresas: grupo.filter((e) => c.empresas.includes(e)) }))
    .sort((a, b) => b.saldo - a.saldo || a.codigo.localeCompare(b.codigo));
}

/** El lunes de la semana de `hoyISO` (fecha de Panamá, AAAA-MM-DD). */
export function lunesDeLaSemana(hoyISO: string): string {
  const d = new Date(`${hoyISO}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0 = domingo
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

/** Separa un campo de correo en direcciones válidas (sin repetir). */
export function direccionesValidas(campo: string): string[] {
  const out: string[] = [];
  for (const parte of campo.split(/[;,\s]+/)) {
    const e = parte.trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && !out.includes(e)) out.push(e);
  }
  return out;
}

/** El cuerpo del correo: el MISMO del envío manual (ustedes), dicho semanal. */
export function cuerpoAutomatico(fechaLegible: string, contacto?: string | null): string {
  const nombre = (contacto ?? "").trim();
  return [
    nombre ? `Buen día ${nombre},` : "Buen día,",
    "",
    "Espero se encuentren bien.",
    "",
    `Adjunto encontrarán los estados de cuenta actualizados al ${fechaLegible}. Se los enviamos cada lunes.`,
    "",
    "Favor confirmar su programación de pagos.",
  ].join("\n");
}

/** Asunto: "{Empresas} — Estado de cuenta al {fecha}". */
export function asuntoAutomatico(empresasNombres: readonly string[], fechaLegible: string): string {
  return `${empresasNombres.join(" - ")} — Estado de cuenta al ${fechaLegible}`;
}

const dinero = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface ResumenCorrida {
  enviados: number;
  pdfs: number;
  sinCorreo: { nombre: string; saldo: number }[];
  fallaron: { nombre: string; motivo: string }[];
  /** Ya habían salido esta semana (el cron corrió otra vez). */
  yaEnviados: number;
  /** No alcanzó el tiempo de la función. */
  pendientes: number;
}

const TOPE_LISTA = 15;

/** El mensaje a 🔒 NEGOCIO PRIVADO al terminar. */
export function mensajeDelLunes(r: ResumenCorrida): string {
  const deuda = round(r.sinCorreo.reduce((s, c) => s + c.saldo, 0));
  const lineas = [
    `📧 Estados de cuenta del lunes: ${r.enviados} enviados · ${r.sinCorreo.length} clientes sin correo (deben ${dinero(deuda)})`,
  ];
  if (r.sinCorreo.length) {
    lineas.push("", "Sin correo:");
    const orden = [...r.sinCorreo].sort((a, b) => b.saldo - a.saldo);
    for (const c of orden.slice(0, TOPE_LISTA)) lineas.push(`· ${c.nombre} — ${dinero(c.saldo)}`);
    if (orden.length > TOPE_LISTA) lineas.push(`y ${orden.length - TOPE_LISTA} más · Ver en CxC`);
  }
  if (r.fallaron.length) {
    // 🔴 Lo que no cuadró con Switch se dice aquí, con su porqué (27-nov-2026).
    lineas.push("", `⚠️ ${r.fallaron.length} no salieron:`);
    for (const f of r.fallaron.slice(0, TOPE_LISTA)) lineas.push(`· ${f.nombre} — ${f.motivo}`);
    if (r.fallaron.length > TOPE_LISTA) lineas.push(`y ${r.fallaron.length - TOPE_LISTA} más`);
  }
  if (r.pendientes) lineas.push("", `⚠️ ${r.pendientes} quedaron sin mandar por tiempo.`);
  if (r.yaEnviados) lineas.push("", `(${r.yaEnviados} ya habían salido esta semana; no se repitieron.)`);
  return lineas.join("\n");
}
