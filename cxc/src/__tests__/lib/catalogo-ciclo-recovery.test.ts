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
  pasadasElegiblesParaColateral,
  CRON_STALE_HOURS_DEFAULT,
  CRON_STALE_HOURS_POR_CRON,
  cronStaleThresholdHours,
  cronsStaleParaAlerta,
} from "@/lib/cron-telemetry";
import { HORAS_DATO_VIEJO, empresasDe } from "@/lib/datos-frescos";
import { colateralDayStartIso } from "@/lib/fecha-panama";

const CATALOGOS = [
  "joybees-catalogo",
  "reebok-catalogo",
  "tommy-catalogo",
  "calvin-catalogo",
] as const;

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
      // 4 desde el 13-ago-2026: los pases se mudaron DENTRO de la ventana de uso
      // de Panamá (9:30 a.m. - 5:10 p.m.) y se sumó uno.
      expect(enVercel.length, `${cronName} debe tener 4 entradas en vercel.json`).toBe(4);
      expect([...CATALOGO_CRON_SLOTS_UTC[cronName]].sort()).toEqual(enVercel);
    }
  });

  it("NINGÚN pase queda fuera de la ventana de uso (9:30 a.m. - 5:10 p.m. Panamá)", () => {
    // Es la razón de ser del cambio: Daniel dijo "se usa catalogo mas de 10am a
    // 6pm aproximadamente", así que un refresco de las 6 a.m. no le sirve a
    // nadie. Panamá es UTC−5 FIJO (sin horario de verano).
    const DESDE = 9 * 60 + 30; // 9:30 a.m. Panamá
    const HASTA = 17 * 60 + 10; // 5:10 p.m. Panamá
    for (const cronName of CATALOGOS) {
      for (const slot of CATALOGO_CRON_SLOTS_UTC[cronName]) {
        const [h, m] = slot.split(":").map(Number);
        const panama = (h * 60 + m - 5 * 60 + 1440) % 1440;
        expect(panama, `${cronName} ${slot} UTC cae fuera de la ventana de uso`).toBeGreaterThanOrEqual(DESDE);
        expect(panama, `${cronName} ${slot} UTC cae fuera de la ventana de uso`).toBeLessThanOrEqual(HASTA);
      }
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
  it("con los 4 pases el hueco MÁS LARGO es el de la NOCHE, y es el mismo para los cuatro", () => {
    // 21:55 → 14:30 del día siguiente, y sus equivalentes: los cuatro catálogos
    // están escalonados 5 min, así que su hueco nocturno es idéntico.
    for (const cronName of CATALOGOS) {
      expect(catalogoCicloHoras(cronName)!, cronName).toBeCloseTo(16 + 35 / 60, 5);
    }
  });

  it("cron sin horario de catálogo → null (el caller usa su ventana por defecto)", () => {
    expect(catalogoCicloHoras("sync-clientes-master")).toBeNull();
    expect(catalogoCicloSinceIso("sync-clientes-master")).toBeNull();
  });

  it("todos los ciclos caen entre 1 y 2 corridas: > 13h y < 20h", () => {
    // Cota inferior: más que el hueco entre la pasada de las 18:00 y el primer
    // slot del día → un success del propio día nunca se declara perdido.
    // Cota superior: menos que el peor caso legítimo (última corrida de ayer +
    // pérdida de los slots de la mañana) → esa pérdida SÍ se detecta.
    for (const cronName of CATALOGOS) {
      const h = catalogoCicloHoras(cronName)!;
      expect(h, cronName).toBeGreaterThan(13);
      expect(h, cronName).toBeLessThan(20);
    }
  });

  it("🔴 EL INVARIANTE: el ciclo entra entre los dos huecos que lo acotan", () => {
    // Es lo que hubo que rehacer al mudar los pases dentro de la ventana de uso,
    // porque los dos huecos CAMBIARON de valor. Se derivan del horario real, no
    // de números sueltos, para que un retoque futuro los recalcule solo.
    for (const cronName of CATALOGOS) {
      const horas = CATALOGO_CRON_SLOTS_UTC[cronName].map((s) => {
        const [h, m] = s.split(":").map(Number);
        return h + m / 60;
      });
      const primeroDelDia = Math.min(...horas);
      const ultimaDeAyer = Math.max(...horas);
      const PASADA = 18; // la ÚNICA pasada elegible con hora mínima 15

      // (a) COTA INFERIOR — un día sano no se re-corre: en la pasada de las
      //     18:00, el success del primer slot de HOY tiene que seguir contando
      //     como fresco.
      expect(catalogoCicloHoras(cronName)!, `${cronName}: se re-correría un día sano`).toBeGreaterThan(
        PASADA - primeroDelDia,
      );

      // (b) COTA SUPERIOR — una pérdida real SÍ se caza: si hoy se perdieron
      //     TODOS los slots anteriores a la pasada, el último success es el de
      //     ayer y ese hueco tiene que pasarse del ciclo.
      expect(
        catalogoCicloHoras(cronName)!,
        `${cronName}: una mañana perdida quedaría sin recuperar`,
      ).toBeLessThan(24 - ultimaDeAyer + PASADA);
    }
  });
});

describe("⚠️ los pases de la tarde NO se recuperan el mismo día — escrito, no escondido", () => {
  it("con hora mínima 15, la ÚNICA pasada que recupera catálogos es la de las 18:00", () => {
    expect(RECONCILIACION_PASS_HOURS).toEqual([10, 14, 18]);
    for (const cronName of CATALOGOS) {
      expect(COLATERAL_RECOVER_AFTER_HOUR_UTC[cronName], cronName).toBe(15);
      expect(pasadasElegiblesParaColateral(cronName), cronName).toEqual([18]);
    }
  });

  it("los slots posteriores a las 18:00 quedan sin red el mismo día (y son 2 de 4)", () => {
    for (const cronName of CATALOGOS) {
      const slots = CATALOGO_CRON_SLOTS_UTC[cronName];
      const sinRed = slots.filter((s) => Number(s.split(":")[0]) >= 18);
      expect(sinRed.length, `${cronName}: cambió cuántos pases quedan sin recuperación`).toBe(2);
      // Los otros dos SÍ tienen la pasada de las 18:00 por delante.
      expect(slots.length - sinRed.length).toBe(2);
    }
  });
});

describe("🔴 el hueco NOCTURNO de 16h35 no despierta a nadie", () => {
  // Con los 4 pases metidos en la ventana de uso, de las 5:10 p.m. a las 9:30
  // a.m. del día siguiente no se sincroniza nada. Es el costo del cambio y hay
  // que probar que no dispara ninguna de las dos alarmas que podrían sonar.

  it("está por debajo del umbral de heartbeat (26h) con margen de sobra", () => {
    for (const cronName of CATALOGOS) {
      // Sin override propio → rige CRON_STALE_HOURS_DEFAULT = 26h. Si alguien le
      // pusiera uno más bajo que el hueco, el catálogo aparecería "caído" todas
      // las madrugadas.
      expect(CRON_STALE_HOURS_POR_CRON[cronName], `${cronName} ganó un override`).toBeUndefined();
      expect(cronStaleThresholdHours(cronName)).toBe(CRON_STALE_HOURS_DEFAULT);

      const hueco = catalogoCicloHoras(cronName)!;
      expect(hueco, `${cronName}: el hueco nocturno pasó el umbral`).toBeLessThan(
        CRON_STALE_HOURS_DEFAULT,
      );
      // Margen concreto: 26 − 16h35 = 9h25. Antes del cambio eran 7h (ciclo 19h).
      expect(CRON_STALE_HOURS_DEFAULT - hueco, cronName).toBeGreaterThan(9);
    }
  });

  it("un catálogo dormido toda la noche NO se reporta como caído", () => {
    // 9:29 a.m. de Panamá (14:29 UTC), un minuto antes del primer pase: el peor
    // instante posible del día.
    const antesDelPrimerPase = Date.parse("2026-08-14T14:29:00.000Z");
    const ultimaDeAyer = "2026-08-13T21:55:00.000Z"; // el pase de las 4:55 p.m.
    for (const cronName of CATALOGOS) {
      expect(
        cronsStaleParaAlerta([{ cron_name: cronName, last_success_at: ultimaDeAyer }], antesDelPrimerPase),
        cronName,
      ).toEqual([]);
    }
  });

  it("la regla de las 24h de 'dato viejo' NO mira catálogos — solo cartera y ventas", () => {
    // datos-frescos.ts es la única alerta de "dato viejo" que quiere Daniel, y su
    // universo son los DOS datos que él mira. Un catálogo con 16h35 encima no
    // entra por ningún lado. Se prueba por conducta: se le piden las empresas de
    // los dos datos y ninguna lista puede nombrar un catálogo.
    expect(HORAS_DATO_VIEJO).toBe(24);
    const universo = [...empresasDe("cartera"), ...empresasDe("ventas")];
    for (const cronName of CATALOGOS) {
      expect(universo, `${cronName} se coló en el universo de datos-frescos`).not.toContain(cronName);
    }
    // Y el barrido que lo sostiene a futuro: el módulo no puede empezar a
    // nombrar catálogos sin que este candado se ponga rojo (comentarios fuera —
    // este repo ya pagó tres veces un candado satisfecho por su propia nota).
    const src = fs
      .readFileSync(path.resolve(__dirname, "../../lib/datos-frescos.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(src, "datos-frescos.ts empezó a vigilar catálogos").not.toMatch(/catalogo/i);
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
    // Pasado el ciclo (16h35), a la tarde siguiente vuelve a ser recuperable en
    // la pasada elegible (que con el horario nuevo es la de las 18:00).
    const maniana18 = new Date("2026-07-26T18:00:00.000Z");
    expect(alDia("tommy-catalogo", TOMMY_SIEMBRA, maniana18)).toBe(false);
    expect(seRecupera("tommy-catalogo", TOMMY_SIEMBRA, maniana18)).toBe(true);
  });
});

describe("la recuperación legítima NO se rompe", () => {
  it("si los DOS slots de la mañana se pierden, la pasada de las 18:00 SÍ recupera", () => {
    // Último success = ÚLTIMO slot de AYER (el más reciente posible antes de la
    // pérdida, o sea el caso más difícil de cazar), y hoy se perdieron 14:3x y
    // 17:0x. El hueco es de ~20h contra un ciclo de 16h35.
    expect(seRecupera("tommy-catalogo", "2026-07-24T21:57:00.000Z", PASADA_18)).toBe(true);
    expect(seRecupera("calvin-catalogo", "2026-07-24T22:02:00.000Z", PASADA_18)).toBe(true);
    expect(seRecupera("reebok-catalogo", "2026-07-24T22:07:00.000Z", PASADA_18)).toBe(true);
    expect(seRecupera("joybees-catalogo", "2026-07-24T22:12:00.000Z", PASADA_18)).toBe(true);
  });

  it("si lleva días caído, se recupera igual", () => {
    expect(seRecupera("tommy-catalogo", "2026-07-22T14:35:00.000Z", PASADA_18)).toBe(true);
  });

  it("recuperado en su propio slot de las 14:3x, la pasada de las 18:00 ya no lo re-corre", () => {
    expect(seRecupera("tommy-catalogo", "2026-07-25T14:32:00.000Z", PASADA_18)).toBe(false);
  });

  it("día sano (slot de la mañana OK) → la pasada de las 18:00 no lo re-corre", () => {
    expect(seRecupera("tommy-catalogo", "2026-07-25T14:32:00.000Z", PASADA_18)).toBe(false);
    expect(seRecupera("calvin-catalogo", "2026-07-25T14:36:00.000Z", PASADA_18)).toBe(false);
    expect(seRecupera("reebok-catalogo", "2026-07-25T14:41:00.000Z", PASADA_18)).toBe(false);
    expect(seRecupera("joybees-catalogo", "2026-07-25T14:46:00.000Z", PASADA_18)).toBe(false);
  });

  it("un día SANO de ayer completo tampoco dispara la pasada de las 14:00 de hoy", () => {
    // Con hora mínima 15 esto está cerrado por construcción, y el test lo fija:
    // a las 14:00 el success de ayer 21:5x lleva 16h05 y el ciclo son 16h35 —
    // solo 30 min de margen. Si alguien bajara la hora mínima a 14, cualquier
    // recorte futuro del ciclo re-sincronizaría los CUATRO catálogos todos los
    // días (el incidente del 25-jul-2026 exacto).
    expect(seRecupera("tommy-catalogo", "2026-07-24T21:57:00.000Z", PASADA_14)).toBe(false);
    expect(alDia("tommy-catalogo", "2026-07-24T21:57:00.000Z", PASADA_14)).toBe(true);
  });
});

describe("nunca antes de su primer horario", () => {
  it("las pasadas de las 10:00 y las 14:00 no intentan ningún catálogo, esté como esté", () => {
    expect(RECONCILIACION_PASS_HOURS[0]).toBe(10);
    for (const pasada of [PASADA_10, PASADA_14]) {
      for (const cronName of CATALOGOS) {
        expect(horaElegible(cronName, pasada), cronName).toBe(false);
        // aunque lleve 3 días sin correr:
        expect(seRecupera(cronName, "2026-07-22T12:00:00.000Z", pasada), cronName).toBe(false);
      }
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
