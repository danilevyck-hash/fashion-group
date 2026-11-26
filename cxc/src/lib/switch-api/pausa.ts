// ─────────────────────────────────────────────────────────────────────────────
// 🔴 «PAUSAR SWITCH» (26-nov-2026, Daniel). Módulo PURO: ni base ni red.
//
// Daniel entra a Switch con el MISMO usuario (`daniel`) que usa el sistema, y
// Switch admite UNA sesión por usuario: cada cron o «Actualizar» lo saca del
// panel. Desde Usuarios (solo admin) escribe cuántas horas quiere trabajar
// tranquilo; mientras dure, NINGÚN camino del sistema entra a Switch.
//
// El freno vive en las DOS únicas puertas de red hacia Switch —`rawCall`
// (client.ts, API con token) y `webFetch` (web-client.ts, panel web)—, no en
// cada cron. Candado: `switch-pausa.test.ts` (barre que nadie más hable con
// Switch). La lectura de la base y el caché viven en `pausa-io.ts`.
// ─────────────────────────────────────────────────────────────────────────────

export interface PausaSwitch {
  id: number;
  pausadoPor: string;
  desde: string;
  hasta: string;
  reanudadaEn: string | null;
}

/** Lo que Daniel puede escribir: horas, entero o decimal. Máximo 24 h
 *  (Daniel, 26-nov-2026); la casilla sugiere 1 h. */
export const HORAS_MIN = 0.25;
export const HORAS_MAX = 24;
export const HORAS_SUGERIDAS = 1;

/**
 * Tras terminar la pausa, las alertas de «dato viejo», el silencio (A/B) y los
 * vigías de heartbeats siguen callados este tiempo: la primera corrida de cada
 * cron diario se pone al día dentro de esa ventana. Una falla real después de
 * la pausa la sigue diciendo la regla de 2 fallos seguidos, que no se calla.
 */
export const GRACIA_TRAS_PAUSA_HORAS = 26;

/** Marca que lleva todo error de pausa (para reconocerlo en logs y alertas). */
export const MARCA_PAUSA = "SWITCH_EN_PAUSA";

/** Valida lo que escribió Daniel. Devuelve las horas o el texto del error. */
export function validarHoras(raw: unknown): { ok: true; horas: number } | { ok: false; error: string } {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim().replace(",", "."));
  if (!Number.isFinite(n)) return { ok: false, error: "Escribe las horas con un número, por ejemplo 2 o 1.5." };
  if (n > HORAS_MAX) return { ok: false, error: `Máximo ${HORAS_MAX} horas.` };
  if (n < HORAS_MIN) return { ok: false, error: "Mínimo 15 minutos (0.25 horas)." };
  return { ok: true, horas: Math.round(n * 100) / 100 };
}

/** Hasta cuándo manda la pausa: la que sea primero, el plazo o «Reanudar ahora». */
export function finDePausa(p: PausaSwitch): number {
  const hasta = Date.parse(p.hasta);
  const reanudada = p.reanudadaEn ? Date.parse(p.reanudadaEn) : Infinity;
  return Math.min(hasta, reanudada);
}

export function pausaActiva(p: PausaSwitch | null, ahora: number = Date.now()): boolean {
  return !!p && Date.parse(p.desde) <= ahora && ahora < finDePausa(p);
}

/** Activa, o terminó hace menos de `GRACIA_TRAS_PAUSA_HORAS`. */
export function pausaEnGracia(p: PausaSwitch | null, ahora: number = Date.now()): boolean {
  if (!p) return false;
  if (pausaActiva(p, ahora)) return true;
  const fin = finDePausa(p);
  return ahora >= fin && ahora - fin < GRACIA_TRAS_PAUSA_HORAS * 3_600_000;
}

const PANAMA_MS = -5 * 3_600_000; // UTC−5 fijo, sin horario de verano.
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «3:00 p. m.» en hora de Panamá. */
export function horaPanama(iso: string): string {
  const d = new Date(Date.parse(iso) + PANAMA_MS);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "a. m." : "p. m."}`;
}

/** «hasta las 3:00 p. m.», «hasta mañana a las 9:00 a. m.» o «hasta el 28 nov a las …». */
export function hastaTexto(iso: string, ahora: number = Date.now()): string {
  const dia = (ms: number) => new Date(ms + PANAMA_MS).toISOString().slice(0, 10);
  const fin = Date.parse(iso);
  const hoy = dia(ahora);
  const manana = dia(ahora + 86_400_000);
  const d = dia(fin);
  const hora = horaPanama(iso);
  if (d === hoy) return `hasta las ${hora}`;
  if (d === manana) return `hasta mañana a las ${hora}`;
  const f = new Date(fin + PANAMA_MS);
  return `hasta el ${f.getUTCDate()} ${MESES[f.getUTCMonth()]} a las ${hora}`;
}

/** La línea que se ve en toda pantalla: «Switch en pausa hasta las 3:00 p. m.». */
export function textoPausa(p: PausaSwitch, ahora: number = Date.now()): string {
  return `Switch en pausa ${hastaTexto(new Date(finDePausa(p)).toISOString(), ahora)}`;
}

/** Lo que lanza el freno. NO es un `SwitchApiError`: no se reintenta ni cuenta como caída. */
export class SwitchEnPausaError extends Error {
  readonly hasta: string;
  constructor(p: PausaSwitch) {
    super(`${textoPausa(p)}. [${MARCA_PAUSA}]`);
    this.name = "SwitchEnPausaError";
    this.hasta = p.hasta;
  }
}

export function esErrorDePausa(err: unknown): boolean {
  if (err instanceof SwitchEnPausaError) return true;
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return msg.includes(MARCA_PAUSA);
}

/** El texto de un error de pausa sin la marca técnica (para pantalla). */
export function sinMarca(msg: string): string {
  return msg.replace(` [${MARCA_PAUSA}]`, "").trim();
}

/**
 * Crons que hablan con Switch. Al arrancar llaman `respuestaSiSwitchEnPausa`
 * y, en pausa, terminan «en pausa» sin escribir nada (ni éxito ni fallo).
 * Durante la pausa y su gracia, los vigías de heartbeats no los cuentan.
 * Candado: `switch-pausa.test.ts` barre que cada uno llame al freno.
 */
export const CRONS_DE_SWITCH = [
  "acs-fidelizacion",
  "boston-cartera",
  "estado-cuenta-switch",
  "calvin-catalogo",
  "joybees-catalogo",
  "reebok-catalogo",
  "tommy-catalogo",
  "switch-articulos",
  "switch-reconciliacion",
  "switch-sync",
  "sync-articulo-info",
  "sync-clientes-boston",
  "sync-egresos-varios",
  "sync-factura-lineas",
  "sync-ingresos-mercancia",
  "sync-pedidos",
  "sync-proveedores",
  "sync-recibos",
  "sync-utilidad",
] as const;

const SET_CRONS_DE_SWITCH: ReadonlySet<string> = new Set(CRONS_DE_SWITCH);

/** ¿Este heartbeat es de un cron que habla con Switch? (incluye los slots `switch-sync:*`). */
export function esCronDeSwitch(cronName: string): boolean {
  return SET_CRONS_DE_SWITCH.has(cronName) || cronName.startsWith("switch-sync:");
}
