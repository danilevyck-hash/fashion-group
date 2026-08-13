// Ventana de recuperación de los catálogos (fix 25-jul-2026).
//
// INCIDENTE: tommy-catalogo cerró su último success a las 04:52:46 UTC (corrida
// de siembra manual — todos los tommy_products quedaron escritos entre 04:51:46
// y 04:52:45). La ventana de "ya corrió hoy" de findMissingColaterales era el
// inicio del día PANAMÁ (05:00 UTC), así que ese success caía 8 minutos del lado
// de "ayer": TODAS las pasadas de reconciliación desde las 13:00 lo veían
// perdido y re-corrían el catálogo entero (~490 llamadas /stock a Switch), se
// comían el RECOVERY_BUDGET_MS y una invocación murió con
// FUNCTION_INVOCATION_TIMEOUT a los 300s.
//
// FIX: para los catálogos la ventana es su CICLO (hueco más largo entre sus dos
// corridas diarias), no un corte de día calendario que su horario ni siquiera
// usa. Estos tests usan los timestamps REALES de producción del 25-jul-2026.
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

// cron-telemetry importa supabase-server y telegram en el top-level.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn() } }));
vi.mock("@/lib/telegram", () => ({
  sendTelegramAlert: vi.fn(),
  shortError: (s: string) => s,
}));

import {
  CATALOGO_CRON_SLOTS_UTC,
  catalogoCicloHoras,
  catalogoCicloSinceIso,
  COLATERAL_RECOVER_AFTER_HOUR_UTC,
  RECONCILIACION_PASS_HOURS,
} from "@/lib/cron-telemetry";
import { colateralDayStartIso } from "@/lib/fecha-panama";

const CATALOGOS = ["joybees-catalogo", "reebok-catalogo", "tommy-catalogo"] as const;

/** Espejo EXACTO de las dos condiciones de findMissingColaterales para un
 *  catálogo: (1) tiene success dentro de su ventana, (2) ya pasó su hora mínima. */
function alDia(cronName: string, lastSuccessAt: string, now: Date): boolean {
  return lastSuccessAt >= catalogoCicloSinceIso(cronName, now)!;
}
function horaElegible(cronName: string, now: Date): boolean {
  return now.getUTCHours() >= (COLATERAL_RECOVER_AFTER_HOUR_UTC[cronName] ?? 0);
}
/** ¿La reconciliación intentaría recuperar el catálogo en esta pasada? */
function seRecupera(cronName: string, lastSuccessAt: string, now: Date): boolean {
  return horaElegible(cronName, now) && !alDia(cronName, lastSuccessAt, now);
}

// Timestamps REALES de producción (25-jul-2026).
const TOMMY_SIEMBRA = "2026-07-25T04:52:46.806+00:00"; // último success de tommy-catalogo
const PASADA_14 = new Date("2026-07-25T14:00:00.000Z");
const PASADA_18 = new Date("2026-07-25T18:00:00.000Z");
const PASADA_10 = new Date("2026-07-25T10:00:00.000Z");

describe("CATALOGO_CRON_SLOTS_UTC — espejo de vercel.json", () => {
  it("los horarios declarados son EXACTAMENTE los de vercel.json", () => {
    const vercel = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../../../vercel.json"), "utf8"),
    ) as { crons: Array<{ path: string; schedule: string }> };
    for (const cronName of CATALOGOS) {
      const enVercel = vercel.crons
        .filter((c) => c.path === `/api/cron/${cronName}`)
        .map((c) => {
          const [min, hora] = c.schedule.split(" ");
          return `${hora.padStart(2, "0")}:${min.padStart(2, "0")}`;
        })
        .sort();
      // 3 desde el 13-ago-2026 (la 3ª pasada de media tarde de Panamá).
      expect(enVercel.length, `${cronName} debe tener 3 entradas en vercel.json`).toBe(3);
      expect([...CATALOGO_CRON_SLOTS_UTC[cronName]].sort()).toEqual(enVercel);
    }
  });

  it("la hora mínima de recuperación nunca es ANTERIOR al primer slot del día", () => {
    for (const cronName of CATALOGOS) {
      const primerSlotHora = Math.min(
        ...CATALOGO_CRON_SLOTS_UTC[cronName].map((s) => Number(s.split(":")[0])),
      );
      expect(
        COLATERAL_RECOVER_AFTER_HOUR_UTC[cronName],
        `${cronName}: la reconciliación no debe adelantarse a su propio horario`,
      ).toBeGreaterThanOrEqual(primerSlotHora);
    }
  });
});

describe("catalogoCicloHoras", () => {
  it("es el hueco MÁS LARGO entre corridas (da la vuelta al día)", () => {
    // Con la 3ª pasada (20:0x-20:3x UTC) el hueco largo es el de la noche:
    // última corrida de la tarde → primera de la mañana siguiente.
    expect(catalogoCicloHoras("tommy-catalogo")).toBeCloseTo(16 + 35 / 60, 5); // 20:05 → 12:40
    expect(catalogoCicloHoras("reebok-catalogo")).toBeCloseTo(15 + 45 / 60, 5); // 20:25 → 12:10
    expect(catalogoCicloHoras("joybees-catalogo")).toBeCloseTo(14 + 25 / 60, 5); // 20:35 → 11:00
    expect(catalogoCicloHoras("calvin-catalogo")).toBeCloseTo(16 + 35 / 60, 5); // 20:15 → 12:50
  });

  it("cron sin horario de catálogo → null (el caller usa su ventana por defecto)", () => {
    expect(catalogoCicloHoras("sync-clientes-master")).toBeNull();
    expect(catalogoCicloSinceIso("sync-clientes-master")).toBeNull();
  });

  it("todos los ciclos caen entre 1 y 2 corridas: > 13h y < 20h", () => {
    // Cota inferior: más que el hueco entre la pasada de las 18:00 y el slot de
    // la mañana → un success del propio día nunca se declara perdido.
    // Cota superior: menos que el peor caso legítimo (última corrida de ayer +
    // pérdida del slot de la mañana) → esa pérdida SÍ se detecta.
    for (const cronName of CATALOGOS) {
      const h = catalogoCicloHoras(cronName)!;
      expect(h, cronName).toBeGreaterThan(13);
      expect(h, cronName).toBeLessThan(20);
    }
  });

  it("el ciclo sigue siendo MÁS LARGO que el hueco última-corrida-de-ayer → pasada de las 14:00", () => {
    // Es el invariante que hace falta con la 3ª pasada: si el ciclo se acortara
    // por debajo de ese hueco, un catálogo que corrió bien a las 20:0x y perdió
    // su slot de la mañana quedaría "al día" y NADIE lo recuperaría.
    for (const cronName of CATALOGOS) {
      const ultimaDeAyer = Math.max(
        ...CATALOGO_CRON_SLOTS_UTC[cronName].map((s) => {
          const [h, m] = s.split(":").map(Number);
          return h + m / 60;
        }),
      );
      const huecoHastaLas14 = 24 - ultimaDeAyer + 14;
      expect(catalogoCicloHoras(cronName)!, cronName).toBeLessThan(huecoHastaLas14);
    }
  });
});

describe("incidente 25-jul: siembra de madrugada (04:52 UTC)", () => {
  it("la ventana VIEJA (día Panamá) declaraba perdido el success de las 04:52 → re-sync en cada pasada", () => {
    const viejaVentana14 = colateralDayStartIso(false, PASADA_14); // 2026-07-25T05:00:00Z
    expect(viejaVentana14).toBe("2026-07-25T05:00:00.000Z");
    expect(TOMMY_SIEMBRA >= viejaVentana14).toBe(false); // ← el bug: 8 min antes del corte
    expect(TOMMY_SIEMBRA >= colateralDayStartIso(false, PASADA_18)).toBe(false);
  });

  it("con la ventana de ciclo NO se re-corre en las pasadas de 14:00 ni 18:00", () => {
    expect(seRecupera("tommy-catalogo", TOMMY_SIEMBRA, PASADA_14)).toBe(false);
    expect(seRecupera("tommy-catalogo", TOMMY_SIEMBRA, PASADA_18)).toBe(false);
  });

  it("tampoco lo deja 'pendiente' todo el día: sigue fresco hasta cerrar su ciclo", () => {
    // 19h después de la siembra (23:52 UTC) ya no hay pasadas; a la mañana
    // siguiente el ciclo cerró y vuelve a ser recuperable en la pasada elegible.
    const maniana14 = new Date("2026-07-26T14:00:00.000Z");
    expect(alDia("tommy-catalogo", TOMMY_SIEMBRA, maniana14)).toBe(false);
    expect(seRecupera("tommy-catalogo", TOMMY_SIEMBRA, maniana14)).toBe(true);
  });
});

describe("la recuperación legítima NO se rompe", () => {
  it("si el slot de la mañana se pierde, la pasada de las 14:00 SÍ recupera", () => {
    // Último success = slot de la tarde de AYER (17:43 UTC) y hoy 12:40 se perdió.
    const ayerTarde = "2026-07-24T17:43:00.000Z"; // 20:17h antes de la pasada
    expect(seRecupera("tommy-catalogo", ayerTarde, PASADA_14)).toBe(true);
    expect(seRecupera("reebok-catalogo", "2026-07-24T17:03:00.000Z", PASADA_14)).toBe(true);
    expect(seRecupera("joybees-catalogo", "2026-07-24T17:08:00.000Z", PASADA_14)).toBe(true);
  });

  it("el peor caso REAL con 3 pasadas: éxito a las 20:0x de ayer + slot de la mañana perdido", () => {
    // Es el caso que el ciclo acortado tiene que seguir cazando. El success de
    // ayer es el de la ÚLTIMA pasada del día (la nueva), o sea el más reciente
    // posible antes de la pérdida.
    expect(seRecupera("tommy-catalogo", "2026-07-24T20:07:00.000Z", PASADA_14)).toBe(true);
    expect(seRecupera("reebok-catalogo", "2026-07-24T20:26:00.000Z", PASADA_14)).toBe(true);
    expect(seRecupera("joybees-catalogo", "2026-07-24T20:36:00.000Z", PASADA_14)).toBe(true);
  });

  it("un día sano con las 3 pasadas NO se re-corre en ninguna pasada", () => {
    // El success de la 3ª pasada de AYER no debe alcanzar para declarar fresco
    // al catálogo de hoy — eso lo cubre el test de arriba —, pero el de HOY sí.
    expect(seRecupera("tommy-catalogo", "2026-07-25T12:43:00.000Z", PASADA_14)).toBe(false);
    expect(seRecupera("reebok-catalogo", "2026-07-25T12:13:00.000Z", PASADA_14)).toBe(false);
    expect(seRecupera("joybees-catalogo", "2026-07-25T11:03:00.000Z", PASADA_18)).toBe(false);
  });

  it("si lleva días caído, se recupera igual", () => {
    expect(seRecupera("tommy-catalogo", "2026-07-22T12:45:00.000Z", PASADA_14)).toBe(true);
  });

  it("recuperado a las 14:05, la pasada de las 18:00 ya no lo re-corre", () => {
    expect(seRecupera("tommy-catalogo", "2026-07-25T14:05:00.000Z", PASADA_18)).toBe(false);
  });

  it("día sano (slot de la mañana OK) → ninguna pasada lo re-corre", () => {
    expect(seRecupera("tommy-catalogo", "2026-07-25T12:43:00.000Z", PASADA_14)).toBe(false);
    expect(seRecupera("tommy-catalogo", "2026-07-25T12:43:00.000Z", PASADA_18)).toBe(false);
    expect(seRecupera("reebok-catalogo", "2026-07-25T12:19:57.985+00:00", PASADA_14)).toBe(false);
    expect(seRecupera("joybees-catalogo", "2026-07-25T11:14:57.116+00:00", PASADA_14)).toBe(false);
  });
});

describe("nunca antes de su primer horario", () => {
  it("la pasada de las 10:00 no intenta ningún catálogo, esté como esté", () => {
    expect(RECONCILIACION_PASS_HOURS[0]).toBe(10);
    for (const cronName of CATALOGOS) {
      expect(horaElegible(cronName, PASADA_10), cronName).toBe(false);
      // aunque lleve 3 días sin correr:
      expect(seRecupera(cronName, "2026-07-22T12:00:00.000Z", PASADA_10), cronName).toBe(false);
    }
  });
});

describe("los 3 catálogos usan la ventana de ciclo en COLATERAL_CRONS", () => {
  it("cada catálogo de la reconciliación declara successSinceIso: cicloCatalogo(...)", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../app/api/cron/switch-reconciliacion/route.ts"),
      "utf8",
    );
    for (const cronName of CATALOGOS) {
      expect(src, `${cronName} sin ventana de ciclo`).toContain(`cicloCatalogo("${cronName}")`);
    }
  });
});
