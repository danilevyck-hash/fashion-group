// ─────────────────────────────────────────────────────────────────────────────
// DOS PERSONAS, UN SOLO TELÉFONO (25-sep-2026).
//
// Daniel quiere ENTERARSE, no que el sistema decida. Si en el mismo día dos
// colaboradores distintos marcan desde el mismo aparato, le llega un mensaje a
// su chat privado y él sabe qué hacer con eso. **No se bloquea nada**: la marca
// entra igual, la planilla no cambia y ningún número se mueve.
//
// 🔴 EL MENSAJE VA AL CHAT PRIVADO (`enviarNegocioPrivado`), no al grupo. Es
// información del negocio —no una falla del sistema, así que no lleva el
// prefijo 🔧 SISTEMA— pero habla de dos personas por su nombre: al grupo de
// tres no va.
//
// 🔴 UN AVISO POR (APARATO, DÍA). No uno por marca: el día que cuatro personas
// se pasen un teléfono para las cuatro marcas del día serían dieciséis
// mensajes por la misma cosa. La llave del dedup se escribe **DESPUÉS** de que
// Telegram confirme, como el aviso de cheque vencido y el de los crons: marcar
// antes de saber que salió quema el único aviso del día.
//
// 🔴 SIN SELLO NO SE DICE NADA. Las marcas anteriores al 25-sep-2026 y las de
// los relojes físicos tienen `aparato_id` en NULL, y NULL nunca es igual a
// NULL acá: agrupar por «sin sello» acusaría a las 8.175 marcas viejas de venir
// del mismo teléfono.
//
// ⚠️ ESTE MÓDULO ES PURO. Lee nada y no manda nada: le pasan las marcas del día
// y devuelve qué avisar.
// ─────────────────────────────────────────────────────────────────────────────

import { selloValido } from "@/lib/marcacion/sello-del-aparato";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";

/** Una marca, con lo poco que hace falta para esta pregunta. */
export interface MarcaConSello {
  empleado_codigo: string;
  empleado_nombre?: string | null;
  ocurrio_en: string;
  aparato_id?: string | null;
}

/** Lo que se avisa: un aparato, un día, y las personas que lo usaron. */
export interface AparatoCompartido {
  aparatoId: string;
  /** El día de PANAMÁ (`YYYY-MM-DD`). */
  dia: string;
  /** Las personas, en el orden de su primera marca del día. */
  personas: Array<{ codigo: string; nombre: string; horaIso: string }>;
}

const PANAMA_OFFSET_MIN = -5 * 60;

/** El día de Panamá de un instante ISO. Panamá es UTC−5 fijo. */
export function diaPanama(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + PANAMA_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

/** `8:58` — la hora de Panamá, sin ceros de más y sin segundos. */
export function horaPanama(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms + PANAMA_OFFSET_MIN * 60_000);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** `jue 25 sep` — como se lee una fecha acá. */
export function fechaCortaPanama(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms + PANAMA_OFFSET_MIN * 60_000);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

/**
 * PURO. Los aparatos que hoy usaron DOS O MÁS personas distintas.
 *
 * Se agrupa por `(aparato_id, día de Panamá)`. Las marcas sin sello quedan
 * afuera. De cada persona se guarda su PRIMERA marca del día con ese aparato:
 * es la que dice a qué hora estuvo el teléfono en sus manos.
 */
export function aparatosCompartidos(
  marcas: readonly MarcaConSello[],
): AparatoCompartido[] {
  const grupos = new Map<string, Map<string, { codigo: string; nombre: string; horaIso: string }>>();

  for (const m of marcas) {
    if (!selloValido(m.aparato_id)) continue;
    const dia = diaPanama(m.ocurrio_en);
    if (!dia) continue;
    const llave = `${m.aparato_id}|${dia}`;
    const porPersona = grupos.get(llave) ?? new Map();
    const codigo = String(m.empleado_codigo);
    const yaEsta = porPersona.get(codigo);
    if (!yaEsta || m.ocurrio_en < yaEsta.horaIso) {
      porPersona.set(codigo, {
        codigo,
        nombre: String(m.empleado_nombre ?? "").trim() || codigo,
        horaIso: m.ocurrio_en,
      });
    }
    grupos.set(llave, porPersona);
  }

  const salida: AparatoCompartido[] = [];
  for (const [llave, porPersona] of grupos) {
    if (porPersona.size < 2) continue;
    const [aparatoId, dia] = llave.split("|");
    salida.push({
      aparatoId,
      dia,
      personas: [...porPersona.values()].sort((a, b) => a.horaIso.localeCompare(b.horaIso)),
    });
  }
  return salida.sort((a, b) => a.dia.localeCompare(b.dia) || a.aparatoId.localeCompare(b.aparatoId));
}

/**
 * El texto que le llega a Daniel. Sin jerga, sin ids, sin nombres de tabla:
 *
 *   «Ana Trejos y Cindy De Gracia marcaron desde el mismo teléfono ·
 *    Multifashion · jue 25 sep 8:58 y 9:00»
 */
export function textoDelAviso(
  caso: AparatoCompartido,
  empresaKey: string | null | undefined,
): string {
  const nombres = caso.personas.map((p) => p.nombre);
  const horas = caso.personas.map((p) => horaPanama(p.horaIso));
  const unir = (xs: readonly string[]): string =>
    xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;

  const empresa = empresaKey ? nombreCortoEmpresa(String(empresaKey)) : "";
  const fecha = fechaCortaPanama(caso.personas[0]?.horaIso ?? "");

  const partes = [
    `${unir(nombres)} marcaron desde el mismo teléfono`,
    empresa,
    `${fecha} ${unir(horas)}`.trim(),
  ].filter(Boolean);

  return `📱 ${partes.join(" · ")}`;
}

/** `tipo` con el que se anota el dedup en `cron_email_errors`. */
export const TIPO_MISMO_APARATO = "marcacion_mismo_aparato";

export const llaveDelAviso = (caso: AparatoCompartido): string =>
  `${TIPO_MISMO_APARATO}:${caso.aparatoId}:${caso.dia}`;
