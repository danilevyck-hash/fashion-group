// Registro de crons vigilados — candados de las DOS direcciones.
//
// INCIDENTE 27-jul-2026. El PR #316 retiró el cron `multifashion-sync`: se sacó
// su entrada de vercel.json, su route, su librería y el repaso que le hacía la
// reconciliación. Pero su FILA quedó en cron_heartbeats
// (last_success_at = 2026-07-26T05:00:34) y el watchdog Telegram —que recorre
// TODAS las filas de la tabla, no una lista— la siguió vigilando. A las 26h pasó
// a stale y Daniel empezó a recibir "⏰ Watchdog crons — 1 sin success reciente:
// multifashion-sync" todos los días, para siempre, por un cron que ya no existe.
//
// El mecanismo que ya existía (`esSlotRetirado`, PR #290) cubría exactamente
// este caso pero SOLO para los slots de switch-sync, porque los slots se derivan
// de una lista y "no está en la lista" era computable. `multifashion-sync` es un
// heartbeat de nombre plano y se escapó por el costado.
//
// Estos tests fijan las dos mitades del arreglo:
//
//  A. UN CRON RETIRADO NO ALERTA. Si su nombre no está en el registro de crons
//     conocidos, su fila huérfana se ignora.
//
//  B. UN CRON VIVO SIGUE ALERTANDO. Ni el filtro nuevo ni ningún otro silencia a
//     un cron que de verdad dejó de correr. Se prueba con TODOS los nombres del
//     registro, uno por uno, no con una muestra.
//
//  C. EL REGISTRO Y vercel.json SON BIYECTIVOS. Acá está la resolución de la
//     tensión con el fail-closed: la regla ingenua "si no está en vercel.json no
//     alerto" sería PEOR que el bug, porque quien borrara una entrada por
//     accidente apagaría la alerta en silencio. Por eso el criterio de runtime
//     mira un registro de CÓDIGO, que borrar vercel.json no encoge — y esta
//     biyección convierte el borrado accidental en un BUILD ROJO. Retirar un
//     cron a propósito son dos ediciones deliberadas; el accidente se atrapa en
//     CI, no en producción.
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn() } }));
vi.mock("@/lib/telegram", () => ({
  sendTelegramAlert: vi.fn(),
  shortError: (s: string) => s,
}));

import {
  CRONS_CONOCIDOS,
  CRONS_FAIL_CLOSED,
  SEED_TOLERANT_CRONS,
  HEARTBEATS_NO_CRON,
  esCronRetirado,
  esHeartbeatNoVigilable,
  cronsStaleParaAlerta,
  cronStaleThresholdHours,
  slotHeartbeatName,
  slotRecuperadoName,
  SWITCH_SYNC_SLOTS,
  type HeartbeatRow,
} from "@/lib/cron-telemetry";

const VERCEL: { crons: Array<{ path: string; schedule: string }> } = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../../vercel.json"), "utf8"),
);

/**
 * Nombre de heartbeat que registra una entrada de vercel.json. El route de
 * backup usa `?grupo=` para elegir su nombre ("backup-switch"/"backup-storage");
 * el resto usa el basename del path. `switch-sync` registra además un heartbeat
 * por slot, pero eso ya lo cubre cron-calendario.test.ts.
 */
function cronNameDe(rutaCompleta: string): string {
  const [ruta, query = ""] = rutaCompleta.split("?");
  const base = ruta.replace("/api/cron/", "");
  const grupo = new URLSearchParams(query).get("grupo");
  return base === "backup" && grupo ? `backup-${grupo}` : base;
}

const CRONS_EN_VERCEL = [...new Set(VERCEL.crons.map((c) => cronNameDe(c.path)))].sort();

/** Un instante sin ninguna recuperación por delante (última pasada de la
 *  reconciliación 18:00, última entrada extra 23:30) → nada se silencia por
 *  "recuperación en camino" y el test mide el filtro que le interesa. */
const NOW = Date.parse("2026-07-27T23:45:00.000Z");
const haceHoras = (h: number) => new Date(NOW - h * 3600 * 1000).toISOString();

// ─────────────────────────────────────────────────────────────────────────────
describe("A. un cron RETIRADO no alerta", () => {
  it("multifashion-sync (retirado el 26-jul-2026) es un cron retirado", () => {
    expect(esCronRetirado("multifashion-sync")).toBe(true);
    expect(esHeartbeatNoVigilable("multifashion-sync")).toBe(true);
  });

  it("su fila huérfana NO se reporta, con los datos exactos de producción", () => {
    // Fila real medida el 27-jul-2026: 32,3h sin success, muy por encima de las
    // 26h del umbral. Antes de este arreglo generaba una alerta diaria eterna.
    const filas: HeartbeatRow[] = [
      { cron_name: "multifashion-sync", last_success_at: "2026-07-26T05:00:34.139+00:00" },
    ];
    expect(cronsStaleParaAlerta(filas, NOW)).toEqual([]);
  });

  it("un slot retirado del calendario tampoco (el mecanismo viejo sigue vivo)", () => {
    // facturas-2315 se movió a facturas-2300 el 26-jul-2026; su fila quedó.
    const filas: HeartbeatRow[] = [
      { cron_name: "switch-sync:facturas-2315", last_success_at: haceHoras(40) },
      { cron_name: "switch-sync:facturas-2315#recuperado", last_success_at: haceHoras(45) },
    ];
    expect(cronsStaleParaAlerta(filas, NOW)).toEqual([]);
  });

  it("un heartbeat de acción MANUAL nunca se vigila (nadie lo programa)", () => {
    // "Actualizar ahora" de Ventas escribe sync-now-refresh-vistas como cooldown.
    // Que lleve días sin escribirse es lo normal, no una caída.
    for (const nombre of HEARTBEATS_NO_CRON) {
      expect(esHeartbeatNoVigilable(nombre)).toBe(true);
      expect(esCronRetirado(nombre), `${nombre} no es un cron retirado, es manual`).toBe(false);
      expect(cronsStaleParaAlerta([{ cron_name: nombre, last_success_at: haceHoras(400) }], NOW)).toEqual([]);
    }
  });

  it("las marcas de la reconciliación no son crons retirados ni se vigilan", () => {
    const slot = SWITCH_SYNC_SLOTS[0].slot;
    for (const marca of [slotRecuperadoName(slot), `switch-sync:${slot}#visto`]) {
      expect(esCronRetirado(marca)).toBe(false);
      expect(esHeartbeatNoVigilable(marca)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("B. un cron VIVO sigue alertando", () => {
  it.each([...CRONS_CONOCIDOS].sort())("%s stale se reporta", (cron) => {
    expect(esCronRetirado(cron), `${cron} quedó fuera del registro`).toBe(false);
    const vencido = haceHoras(cronStaleThresholdHours(cron) + 1);
    const reportados = cronsStaleParaAlerta([{ cron_name: cron, last_success_at: vencido }], NOW);
    expect(reportados, `${cron} dejó de alertar`).toEqual([`${cron} (último: ${vencido})`]);
  });

  it("un slot VIVO del calendario stale se reporta", () => {
    const slot = slotHeartbeatName(SWITCH_SYNC_SLOTS[0].slot);
    const vencido = haceHoras(40);
    expect(cronsStaleParaAlerta([{ cron_name: slot, last_success_at: vencido }], NOW)).toEqual([
      `${slot} (último: ${vencido})`,
    ]);
  });

  it("el retirado se calla SIN callar a los vivos de la misma tanda", () => {
    const vencido = haceHoras(40);
    const filas: HeartbeatRow[] = [
      { cron_name: "multifashion-sync", last_success_at: vencido },
      { cron_name: "sync-recibos", last_success_at: vencido },
      { cron_name: "cheques-alert", last_success_at: vencido },
    ];
    expect(cronsStaleParaAlerta(filas, NOW).sort()).toEqual(
      [`cheques-alert (último: ${vencido})`, `sync-recibos (último: ${vencido})`].sort(),
    );
  });

  it("un cron fresco no se reporta (el filtro nuevo no invierte nada)", () => {
    expect(cronsStaleParaAlerta([{ cron_name: "sync-recibos", last_success_at: haceHoras(2) }], NOW)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("C. el registro y vercel.json son biyectivos", () => {
  it("cada cron de vercel.json está en el registro (si no, nadie lo vigila)", () => {
    const huerfanos = CRONS_EN_VERCEL.filter((c) => !CRONS_CONOCIDOS.has(c));
    expect(
      huerfanos,
      `crons programados que ningún vigía conoce: ${huerfanos.join(", ")}\n` +
        `Agregalos a CRONS_FAIL_CLOSED o SEED_TOLERANT_CRONS en cron-telemetry.ts.`,
    ).toEqual([]);
  });

  it("cada cron del registro sigue teniendo entrada en vercel.json", () => {
    const fantasmas = [...CRONS_CONOCIDOS].filter((c) => !CRONS_EN_VERCEL.includes(c)).sort();
    expect(
      fantasmas,
      `el registro vigila crons que ya no están en vercel.json: ${fantasmas.join(", ")}\n` +
        `Si el retiro es a propósito, sacalos del registro (y borrá su fila de cron_heartbeats).\n` +
        `Si NO lo es, alguien borró una entrada de vercel.json por accidente — restaurala.`,
    ).toEqual([]);
  });

  it("multifashion-sync no está en ninguno de los dos lados", () => {
    expect(CRONS_EN_VERCEL).not.toContain("multifashion-sync");
    expect(CRONS_CONOCIDOS.has("multifashion-sync")).toBe(false);
  });

  it("ningún nombre está en las dos listas del registro a la vez", () => {
    const dobles = CRONS_FAIL_CLOSED.filter((c) => (SEED_TOLERANT_CRONS as string[]).includes(c));
    expect(dobles, `fail-closed y seed-tolerante a la vez: ${dobles.join(", ")}`).toEqual([]);
  });

  it("el criterio de runtime NO lee vercel.json (ahí vive el fail-closed)", () => {
    // Si `esCronRetirado` se derivara de vercel.json en tiempo de ejecución,
    // borrar una entrada por accidente apagaría su alerta EN SILENCIO — peor que
    // el bug original. El registro tiene que ser una constante de código, y la
    // biyección de arriba es lo que lo mantiene honesto.
    // Se buscan las construcciones que HARÍAN falta para leerlo: el path como
    // literal entrecomillado y cualquier acceso al sistema de archivos. Las
    // menciones en comentarios ("espejo de vercel.json") son documentación y no
    // ejecutan nada.
    const codigo = fs
      .readFileSync(path.resolve(__dirname, "../../lib/cron-telemetry.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "") // comentarios de bloque
      .replace(/(^|[^:])\/\/.*$/gm, "$1"); // comentarios de línea
    expect(codigo, "cron-telemetry.ts no debe referenciar vercel.json").not.toMatch(
      /["']([^"']*\/)?vercel\.json["']/,
    );
    expect(codigo, "cron-telemetry.ts no debe leer del filesystem").not.toMatch(
      /from ["'](node:)?(fs|path)["']|readFileSync|require\(/,
    );
  });
});
