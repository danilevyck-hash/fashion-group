/* ─────────────────────────────────────────────────────────────────────────────
 * EL AVISO DEL RELOJ, SOLO CUANDO LA PC DE LA OFICINA DEBERÍA ESTAR PRENDIDA
 * (29-sep-2026). Módulo PURO: «ahora» entra por parámetro.
 *
 * 🩸 EL CASO (audit visual aprobado por Daniel, 29-sep-2026): a las 6:20 p.m.
 * la pastilla decía en ámbar «Reloj de Multifashion y Reloj de Boston sin señal
 * hace 1 hora» + «Traer ahora», cuando ya no trabaja nadie.
 *
 * 🔑 POR QUÉ SALÍA. `reloj-fuera-de-horario.ts` juzga cada reloj con SU
 * horario: el de Multifashion trabaja lun–sáb 10:00–18:30, así que a las 18:20
 * seguía «en horario» y el ámbar se encendía. Pero el que se calla no es el
 * reloj: es la PC que empuja las marcas de LOS DOS (`scripts/agente-reloj`:
 * vive en la red de la oficina, junto al reloj de Boston, y al de Multifashion
 * lo ve por un túnel WireGuard). Esa PC se apaga cuando cierra la oficina.
 *
 * 🔴 LA REGLA: un reloj callado es «apagado normal» (gris, sin aviso) si está
 * fuera de SU horario **o** fuera del horario de la PC, que es el de la oficina
 * = el del reloj de Boston (`ventanaDelReloj`: lun–vie 08:00–17:00, de la regla
 * de la casa, no escrito aquí). Las dos redes de seguridad no se aflojan:
 *   · la última lectura más vieja que el último día hábil avisa a cualquier hora;
 *   · «nunca instalado» y «no se pudo leer» no se callan nunca.
 *
 * 🔑 Ningún número cambia, y «Traer ahora» tampoco: se puede pedir igual.
 * ────────────────────────────────────────────────────────────────────────── */

import { nombreRelojEnPantalla } from "./agente";
import {
  cuandoFueLaUltimaLectura, esApagadoPorHorario, type RelojParaElHorario,
} from "./reloj-fuera-de-horario";

/** El reloj que está en la misma red que la PC: su horario es el de la PC. */
export const RELOJ_DE_LA_OFICINA = "reloj cboston";

/** ¿Este reloj callado se lee como «la oficina cerró» y no como una avería? */
export function apagadoPorHorarioConLaPc(reloj: RelojParaElHorario, ahoraMs: number): boolean {
  return (
    esApagadoPorHorario(reloj, ahoraMs)
    || esApagadoPorHorario({ ...reloj, dispositivo: RELOJ_DE_LA_OFICINA }, ahoraMs)
  );
}

/** Lo mismo que `textoRelojApagado`, pero sabiendo que la PC cierra con la oficina. */
export function textoRelojApagadoConLaPc(
  relojes: readonly RelojParaElHorario[],
  ahoraMs: number,
): string | null {
  const malos = relojes.filter((r) => r.salud !== "al_dia");
  if (malos.length === 0 || !malos.every((r) => apagadoPorHorarioConLaPc(r, ahoraMs))) return null;

  const nombres = malos.map((r) => nombreRelojEnPantalla(r.dispositivo));
  const cabeza = malos.length === relojes.length
    ? malos.length > 1 ? "Relojes apagados" : "Reloj apagado"
    : `${nombres.length > 1 ? `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}` : nombres[0]} ${malos.length > 1 ? "apagados" : "apagado"}`;

  // La lectura más vieja manda: decir «hoy 17:20» con otra de ayer sería mentir.
  const lecturas = malos
    .map((r) => ({ r, cuando: cuandoFueLaUltimaLectura(r, ahoraMs), ms: r.vistoEn ? Date.parse(r.vistoEn) : ahoraMs - (r.minutosSinNoticias ?? 0) * 60_000 }))
    .filter((x) => x.cuando !== null)
    .sort((a, b) => a.ms - b.ms);
  return lecturas.length ? `${cabeza} · última lectura ${lecturas[0].cuando}` : cabeza;
}
