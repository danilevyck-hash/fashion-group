/**
 * ¿A qué hora puede correr `sync-ingresos-mercancia` sin matarle la sesión de
 * Switch a nadie? SOLO LECTURA — no toca red ni base, mide el calendario.
 *
 * El horario NO se elige a ojo. Este script recorre `SWITCH_CRON_ENTRADAS`
 * (espejo de vercel.json) minuto a minuto dentro de la franja de LOGIN WEB
 * —06:00-11:00 UTC, la madrugada de Panamá, la única donde expulsar a Daniel del
 * panel no le cuesta nada— y para cada minuto calcula la distancia al vecino más
 * cercano que comparte alguna de las 6 empresas.
 *
 * ⚠️ La franja 00:20-05:20 UTC *parece* de madrugada y es la tarde-noche de
 * Panamá (19:20-00:20). Además ahí manda el candado de `cleanup-sessions`, que
 * exige 30 min entre crons — es lo que rechazó el primer horario de
 * `sync-factura-lineas`.
 *
 *   npx tsx scripts/_verif-hueco-ingresos-mercancia.ts
 */
import {
  SWITCH_CRON_ENTRADAS,
  SEPARACION_MINIMA_MIN,
  distanciaCircularMin,
  horaPanamaDeUtc,
} from "../src/lib/cron-telemetry";
import { INGRESOS_EMPRESA_KEYS } from "../src/lib/switch-api/ingresos-mercancia-web";

const CRON = "sync-ingresos-mercancia";
/** Franja de login web: madrugada de Panamá. */
const DESDE_UTC = 6 * 60;
const HASTA_UTC = 11 * 60;

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}${String(min % 60).padStart(2, "0")}`;

/** Las entradas que comparten empresa conmigo — las únicas que me pueden chocar. */
const vecinas = SWITCH_CRON_ENTRADAS.filter(
  (e) => e.cron !== CRON && e.empresas.some((k) => INGRESOS_EMPRESA_KEYS.includes(k)),
);

console.log(
  `Empresas del cron: ${INGRESOS_EMPRESA_KEYS.join(", ")}\n` +
    `Entradas del calendario que comparten al menos una: ${vecinas.length}\n` +
    `Separación mínima exigida: ${SEPARACION_MINIMA_MIN} min\n`,
);

interface Candidato {
  min: number;
  gap: number;
  vecinoCron: string;
  vecinoHora: string;
}

const candidatos: Candidato[] = [];
for (let m = DESDE_UTC; m <= HASTA_UTC; m++) {
  const mio = hhmm(m);
  let gap = Infinity;
  let vecinoCron = "";
  let vecinoHora = "";
  for (const v of vecinas) {
    const d = distanciaCircularMin(mio, v.hhmmUtc);
    if (d < gap) {
      gap = d;
      vecinoCron = v.cron;
      vecinoHora = v.hhmmUtc;
    }
  }
  candidatos.push({ min: m, gap, vecinoCron, vecinoHora });
}

const mejor = Math.max(...candidatos.map((c) => c.gap));
const ganadores = candidatos.filter((c) => c.gap === mejor);

console.log("═══ Los 10 mejores minutos de la franja 06:00-11:00 UTC ═══");
for (const c of [...candidatos].sort((a, b) => b.gap - a.gap).slice(0, 10)) {
  const p = horaPanamaDeUtc(Math.floor(c.min / 60));
  console.log(
    `  ${hhmm(c.min)} UTC (~${String(p).padStart(2, "0")}:${String(c.min % 60).padStart(2, "0")} Panamá)` +
      `  → ${String(c.gap).padStart(3)} min del vecino más cercano (${c.vecinoCron} ${c.vecinoHora})`,
  );
}

console.log(
  `\nMáxima separación posible en la franja: ${mejor} min` +
    `\nMinutos que la alcanzan: ${ganadores.map((c) => hhmm(c.min)).join(", ")}`,
);

// ── El horario elegido ──
const ELEGIDO = SWITCH_CRON_ENTRADAS.find((e) => e.cron === CRON)?.hhmmUtc;
if (!ELEGIDO) {
  console.log(`\n🔴 ${CRON} no está en SWITCH_CRON_ENTRADAS.`);
  process.exit(1);
}
const elegido = candidatos.find((c) => hhmm(c.min) === ELEGIDO);
console.log(`\n═══ El horario ELEGIDO: ${ELEGIDO} UTC ═══`);
if (!elegido) {
  console.log(`🔴 ${ELEGIDO} cae FUERA de la franja de login web 06:00-11:00 UTC.`);
  process.exit(1);
}
console.log(`  vecino más cercano: ${elegido.vecinoCron} ${elegido.vecinoHora} — ${elegido.gap} min`);
console.log("  todas las vecinas que comparten empresa, ordenadas por distancia:");
for (const v of [...vecinas]
  .map((v) => ({ v, d: distanciaCircularMin(ELEGIDO, v.hhmmUtc) }))
  .sort((a, b) => a.d - b.d)
  .slice(0, 8)) {
  console.log(
    `    ${String(v.d).padStart(4)} min  ${v.v.cron} ${v.v.hhmmUtc}  ` +
      `(comparte: ${v.v.empresas.filter((k) => INGRESOS_EMPRESA_KEYS.includes(k)).join(",")})`,
  );
}

const ok = elegido.gap >= SEPARACION_MINIMA_MIN;
console.log(
  `\n${ok ? "🟢" : "🔴"} ${elegido.gap} min ${ok ? "≥" : "<"} ${SEPARACION_MINIMA_MIN} min de SEPARACION_MINIMA_MIN`,
);
process.exit(ok ? 0 : 1);
