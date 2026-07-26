// Calendario de crons que tocan Switch — candados sobre SWITCH_CRON_ENTRADAS.
//
// Estos tests son la RED que impide que un horario nuevo rompa producción. Tres
// invariantes:
//
//  1. ESPEJO BIDIRECCIONAL con vercel.json. SWITCH_CRON_ENTRADAS es la fuente
//     única de la que se derivan los slots de heartbeat, el candado del sync
//     manual (proximoCronParaEmpresa) y la telemetría. Si se mueve una entrada
//     en vercel.json y no acá (o al revés), el sistema vigila un calendario que
//     no existe.
//  2. SEPARACIÓN ≥15 min entre entradas que comparten empresa. Switch es sesión
//     ÚNICA por empresa: un 2º login mata el token del 1º (code 0006).
//  3. UNA ENTRADA = UNA OCURRENCIA = UN SLOT. El nombre del slot se deriva del
//     horario (`<tipo>-<hhmm>`), así que dos entradas de switch-sync del mismo
//     tipo a la misma hora colisionarían y el detector de ocurrencias perdidas
//     dejaría de saber cuál se perdió. Por eso las entradas llevan horas
//     separadas y NO se usan listas de horas (`0 15,19,23 * * *`), que Vercel Pro
//     acepta pero el sistema de slots no puede desambiguar.
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn() } }));
vi.mock("@/lib/telegram", () => ({
  sendTelegramAlert: vi.fn(),
  shortError: (s: string) => s,
}));

import {
  SWITCH_CRON_ENTRADAS,
  SWITCH_SYNC_SLOTS,
  EXTRA_ENTRY_HOURS_UTC,
  SEPARACION_MINIMA_MIN,
  RECONCILIACION_PASS_HOURS,
  distanciaCircularMin,
  hhmmAMinutos,
  esSlotRetirado,
  slotHeartbeatName,
  slotRecuperadoName,
  slotVistoName,
  type SwitchCronEntrada,
} from "@/lib/cron-telemetry";
import { empresasConFacturas } from "@/lib/switch-api/empresas";

interface VercelCron {
  path: string;
  schedule: string;
}

const VERCEL: { crons: VercelCron[] } = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../../vercel.json"), "utf8"),
);

/** Ruta de /api/cron que corresponde a una entrada del cronograma. */
const rutaDe = (cron: string) =>
  `/api/cron/${cron.startsWith("switch-sync ") ? "switch-sync" : cron}`;

/** "hhmm" → expresión cron diaria de vercel.json ("0 15 * * *"). */
const scheduleDe = (hhmm: string) => `${Number(hhmm.slice(2, 4))} ${Number(hhmm.slice(0, 2))} * * *`;

/** Rutas de cron que abren sesión en el Switch de alguna empresa. Todo lo que
 *  esté acá TIENE que estar en SWITCH_CRON_ENTRADAS (y viceversa). */
const RUTAS_QUE_TOCAN_SWITCH = [...new Set(SWITCH_CRON_ENTRADAS.map((e) => rutaDe(e.cron)))];

/** Entradas de vercel.json que tocan Switch, con su "hhmm". */
const entradasVercelSwitch = VERCEL.crons
  .filter((c) => RUTAS_QUE_TOCAN_SWITCH.includes(c.path.split("?")[0]))
  .map((c) => {
    const [min, hora] = c.schedule.split(" ");
    return {
      ruta: c.path.split("?")[0],
      path: c.path,
      hhmm: `${hora.padStart(2, "0")}${min.padStart(2, "0")}`,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
describe("SWITCH_CRON_ENTRADAS — espejo bidireccional de vercel.json", () => {
  it("cada entrada del cronograma existe en vercel.json con su hora exacta", () => {
    for (const e of SWITCH_CRON_ENTRADAS) {
      const ruta = rutaDe(e.cron);
      const match = VERCEL.crons.filter(
        (c) => c.path.split("?")[0] === ruta && c.schedule === scheduleDe(e.hhmmUtc),
      );
      expect(
        match.length,
        `${e.cron} ${e.hhmmUtc} no está en vercel.json (o está duplicada)`,
      ).toBe(1);
    }
  });

  it("cada entrada de vercel.json que toca Switch está en el cronograma", () => {
    for (const v of entradasVercelSwitch) {
      const match = SWITCH_CRON_ENTRADAS.filter(
        (e) => rutaDe(e.cron) === v.ruta && e.hhmmUtc === v.hhmm,
      );
      expect(match.length, `${v.path} (${v.hhmm}) falta en SWITCH_CRON_ENTRADAS`).toBe(1);
    }
  });

  it("hay la MISMA cantidad de entradas de los dos lados", () => {
    expect(SWITCH_CRON_ENTRADAS.length).toBe(entradasVercelSwitch.length);
  });

  it("ninguna entrada usa lista de horas (rompería el slot por ocurrencia)", () => {
    // Vercel Pro acepta "0 15,19,23 * * *", pero el heartbeat por slot supone
    // UNA entrada = UNA ocurrencia al día: con una lista, slotsHuerfanos y el
    // detector de crons perdidos ya no saben cuál ocurrencia se perdió.
    for (const c of VERCEL.crons) {
      const [min, hora] = c.schedule.split(" ");
      expect(min, `${c.path}: minuto con lista/rango`).toMatch(/^\d{1,2}$/);
      expect(hora, `${c.path}: hora con lista/rango`).toMatch(/^\d{1,2}$/);
    }
  });

  it("las pasadas de reconciliación declaradas siguen siendo las de vercel.json", () => {
    const enVercel = SWITCH_CRON_ENTRADAS.filter((e) => e.cron === "switch-reconciliacion")
      .map((e) => Number(e.hhmmUtc.slice(0, 2)))
      .sort((a, b) => a - b);
    expect(enVercel).toEqual(RECONCILIACION_PASS_HOURS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("sesión única de Switch — separación entre entradas que comparten empresa", () => {
  const comparten = (a: SwitchCronEntrada, b: SwitchCronEntrada) =>
    a.empresas.filter((e) => b.empresas.includes(e));

  it(`ningún par de entradas con empresa en común queda a menos de ${SEPARACION_MINIMA_MIN} min`, () => {
    const choques: string[] = [];
    for (let i = 0; i < SWITCH_CRON_ENTRADAS.length; i++) {
      for (let j = i + 1; j < SWITCH_CRON_ENTRADAS.length; j++) {
        const a = SWITCH_CRON_ENTRADAS[i];
        const b = SWITCH_CRON_ENTRADAS[j];
        const compartidas = comparten(a, b);
        if (compartidas.length === 0) continue;
        const gap = distanciaCircularMin(a.hhmmUtc, b.hhmmUtc);
        if (gap < SEPARACION_MINIMA_MIN) {
          choques.push(
            `${a.cron} ${a.hhmmUtc} vs ${b.cron} ${b.hhmmUtc} — ${gap} min, comparten ${compartidas.join(",")}`,
          );
        }
      }
    }
    expect(choques, `choques de sesión única:\n${choques.join("\n")}`).toEqual([]);
  });

  it("las entradas que SÍ coinciden en hora tocan empresas disjuntas", () => {
    const porHora = new Map<string, SwitchCronEntrada[]>();
    for (const e of SWITCH_CRON_ENTRADAS) {
      porHora.set(e.hhmmUtc, [...(porHora.get(e.hhmmUtc) ?? []), e]);
    }
    for (const [hhmm, entradas] of porHora) {
      if (entradas.length < 2) continue;
      for (let i = 0; i < entradas.length; i++) {
        for (let j = i + 1; j < entradas.length; j++) {
          expect(
            comparten(entradas[i], entradas[j]),
            `${hhmm}: ${entradas[i].cron} y ${entradas[j].cron} comparten empresa`,
          ).toEqual([]);
        }
      }
    }
  });

  it("los pagos van 15 min DESPUÉS de las ventas, nunca antes (comparten 6 empresas)", () => {
    const ventas = SWITCH_CRON_ENTRADAS.filter((e) => e.cron === "switch-sync facturas");
    for (const recibos of SWITCH_CRON_ENTRADAS.filter((e) => e.cron === "sync-recibos")) {
      if (recibos.hhmmUtc === "0750") continue; // la corrida de madrugada es independiente
      const mismaVentana = ventas.find(
        (v) => hhmmAMinutos(recibos.hhmmUtc) - hhmmAMinutos(v.hhmmUtc) === SEPARACION_MINIMA_MIN,
      );
      expect(mismaVentana, `sync-recibos ${recibos.hhmmUtc} sin su ventas 15 min antes`).toBeTruthy();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("un slot por ocurrencia", () => {
  it("no hay dos entradas de switch-sync del mismo tipo a la misma hora", () => {
    const nombres = SWITCH_SYNC_SLOTS.map((s) => s.slot);
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  it("cada slot deriva su hhmm del horario de su entrada", () => {
    for (const s of SWITCH_SYNC_SLOTS) {
      expect(s.slot).toBe(`${s.tipo}-${s.hhmmUtc}`);
    }
  });

  it("el ?slot= de vercel.json es válido para el regex del route", () => {
    const RE = /^(all|facturas|estadocuenta)-\d{4}$/;
    for (const s of SWITCH_SYNC_SLOTS) expect(RE.test(s.slot)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("ventas intradía — cobertura de empresas", () => {
  const ventas = SWITCH_CRON_ENTRADAS.filter((e) => e.cron === "switch-sync facturas");

  it("las entradas grandes cubren TODAS las empresas con facturas (7 B2B + ACS)", () => {
    const completas = ventas.filter((e) => e.empresas.length > 1);
    // 11:50 = corrida temprana (06:50 Panamá) agregada el 26-jul-2026.
    expect(completas.map((e) => e.hhmmUtc)).toEqual(["1150", "1500", "1900", "2300"]);
    for (const e of completas) {
      expect([...e.empresas].sort()).toEqual([...empresasConFacturas()].sort());
    }
  });

  it("las 7 B2B son empresasConFacturas() menos american_classic", () => {
    const b2b = empresasConFacturas().filter((e) => e !== "american_classic");
    expect(b2b.length).toBe(7);
    expect(b2b).toContain("confecciones_boston");
    expect(b2b).toContain("joystep");
  });

  it("ACS (american_classic) se refresca cada 2h entre 13:00 y 23:00 UTC", () => {
    const acs = ventas
      .filter((e) => e.empresas.includes("american_classic"))
      .map((e) => e.hhmmUtc)
      .sort();
    expect(acs).toEqual(["0015", "1150", "1300", "1500", "1700", "1900", "2100", "2300"]);
  });

  it("el sync de CIERRE de ACS (00:15) sigue en pie — el resumen de la 01:00 depende de él", () => {
    expect(ventas.some((e) => e.hhmmUtc === "0015" && e.empresas.includes("american_classic"))).toBe(
      true,
    );
  });

  it("los saldos de CXC (estadocuenta) NO se tocaron: siguen 16:0x y 21:1x", () => {
    const ec = SWITCH_CRON_ENTRADAS.filter((e) => e.cron === "switch-sync estadocuenta")
      .map((e) => e.hhmmUtc)
      .sort();
    expect(ec).toEqual(["1600", "1605", "1610", "2110", "2115", "2120"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("frescura — hueco MÁS LARGO entre dos refrescos consecutivos", () => {
  /** Horas del hueco más largo entre corridas de `cron` que tocan `empresa`. */
  const peorHueco = (empresa: string, crons: string[]): number => {
    const min = SWITCH_CRON_ENTRADAS.filter(
      (e) => crons.includes(e.cron) && e.empresas.includes(empresa),
    )
      .map((e) => hhmmAMinutos(e.hhmmUtc))
      .sort((a, b) => a - b);
    let peor = 0;
    for (let i = 0; i < min.length; i++) {
      const sig = i + 1 < min.length ? min[i + 1] : min[0] + 24 * 60;
      peor = Math.max(peor, sig - min[i]);
    }
    return peor / 60;
  };

  // Ventas B2B: antes SOLO el bloque `tipo=all` de la madrugada (1×/día → 24h).
  const VENTAS = ["switch-sync all", "switch-sync facturas"];

  it("ventas B2B: de 9h30 a ≤7h30 con la corrida de las 11:50", () => {
    // La corrida temprana (11:50 UTC = 06:50 Panamá) parte el hueco nocturno
    // 05:3x → 15:00 que valía 9h30. El peor caso que queda es el de
    // confecciones_boston (23:00 → 06:30, de noche); vistana queda en 6h30.
    for (const empresa of empresasConFacturas().filter((e) => e !== "american_classic")) {
      expect(peorHueco(empresa, VENTAS), `${empresa}`).toBeLessThanOrEqual(7.5);
    }
    expect(peorHueco("vistana", VENTAS)).toBeCloseTo(6.5, 5);
    expect(peorHueco("confecciones_boston", VENTAS)).toBeCloseTo(7.5, 5);
    // Entre 15:00 y 23:00 UTC (10:00-18:00 Panamá, horario de oficina) el ritmo
    // sigue siendo de 4h, y el que entra a las 8 a.m. (13:00 UTC) tiene el dato
    // de las 11:50, o sea 1h10 de antigüedad en vez de 7h30.
    expect(distanciaCircularMin("1500", "1900") / 60).toBe(4);
    expect(distanciaCircularMin("1900", "2300") / 60).toBe(4);
    expect(distanciaCircularMin("1150", "1300") / 60).toBeCloseTo(1 + 10 / 60, 5);
  });

  it("la corrida temprana respeta la separación con sus vecinos de Switch", () => {
    // Los dos vecinos más cercanos son acs-fidelizacion 11:30 (american_classic)
    // y reebok-catalogo 12:10 (active_shoes): 20 min de cada lado, por encima
    // del mínimo. NO se puso a las 12:00 justo por reebok (habrían sido 10 min).
    expect(distanciaCircularMin("1150", "1130")).toBe(20);
    expect(distanciaCircularMin("1150", "1210")).toBe(20);
    expect(distanciaCircularMin("1200", "1210")).toBeLessThan(SEPARACION_MINIMA_MIN);
  });

  it("ventas ACS: de 6h30 a ≤6h15 (2h entre las 13:00 y las 23:00 UTC)", () => {
    expect(peorHueco("american_classic", VENTAS)).toBeCloseTo(6.25, 5);
    for (const [a, b] of [["1300", "1500"], ["1500", "1700"], ["1700", "1900"], ["1900", "2100"], ["2100", "2300"]]) {
      expect(distanciaCircularMin(a, b) / 60).toBe(2);
    }
  });

  it("pagos (recibos): de 12h20 a 8h35", () => {
    for (const empresa of ["vistana", "american_classic"]) {
      expect(peorHueco(empresa, ["sync-recibos"])).toBeCloseTo(8 + 35 / 60, 5);
    }
  });

  it("saldos CXC: SIN CAMBIO (paso 2) — peor caso 10h40 en vistana", () => {
    const SALDOS = ["switch-sync all", "switch-sync estadocuenta"];
    expect(peorHueco("vistana", SALDOS)).toBeCloseTo(10 + 40 / 60, 5);
    // Y en horario de oficina son 5h (16:10 → 21:10).
    expect(distanciaCircularMin("1610", "2110") / 60).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("esSlotRetirado — filas viejas de cron_heartbeats no alertan para siempre", () => {
  it("un slot que ya no está en el calendario se reconoce como retirado", () => {
    // facturas-2315 se movió a facturas-2300 el 26-jul-2026; su fila vieja sigue
    // en cron_heartbeats y el watchdog recorre TODAS las filas.
    expect(esSlotRetirado(slotHeartbeatName("facturas-2315"))).toBe(true);
    expect(esSlotRetirado(slotHeartbeatName("estadocuenta-9999"))).toBe(true);
  });

  it("un slot VIVO nunca se toma por retirado", () => {
    for (const s of SWITCH_SYNC_SLOTS) {
      expect(esSlotRetirado(slotHeartbeatName(s.slot)), s.slot).toBe(false);
    }
  });

  it("las marcas y los crons normales quedan fuera (los filtra otra regla)", () => {
    expect(esSlotRetirado(slotRecuperadoName("facturas-2315"))).toBe(false);
    expect(esSlotRetirado(slotVistoName("facturas-2315"))).toBe(false);
    expect(esSlotRetirado("switch-sync")).toBe(false);
    expect(esSlotRetirado("sync-recibos")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("helpers de horario", () => {
  it("hhmmAMinutos", () => {
    expect(hhmmAMinutos("0000")).toBe(0);
    expect(hhmmAMinutos("1515")).toBe(915);
    expect(hhmmAMinutos("2359")).toBe(1439);
  });

  it("distanciaCircularMin da la vuelta al reloj", () => {
    expect(distanciaCircularMin("2315", "0015")).toBe(60);
    expect(distanciaCircularMin("1500", "1515")).toBe(15);
    expect(distanciaCircularMin("1700", "1700")).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EXTRA_ENTRY_HOURS_UTC vive DUPLICADO respecto de vercel.json: son las horas de
// las entradas "segunda oportunidad" (las que responden no-op si una anterior ya
// registró success hoy). Hasta el 26-jul-2026 el único candado era una lista
// escrita a mano en cron-recovery.test.ts, así que mover una entrada en
// vercel.json y olvidarse de la constante dejaba a los dos watchdogs creyendo
// que una recuperación viene a una hora que ya no existe —y silenciando un cron
// realmente caído hasta PENDING_RECOVERY_MAX_HOURS—. Este bloque lo deriva de
// vercel.json y falla solo.
describe("EXTRA_ENTRY_HOURS_UTC — espejo derivado de vercel.json", () => {
  /** Path exacto en vercel.json de cada cron con entradas extra. */
  const PATH_DE: Record<string, string> = {
    backup: "/api/cron/backup",
    "backup-switch": "/api/cron/backup?grupo=switch",
    "backup-storage": "/api/cron/backup?grupo=storage",
    "acs-fidelizacion": "/api/cron/acs-fidelizacion",
  };

  /** Horas UTC fraccionales de un path, ordenadas (06:45 → 6.75). */
  const horasDe = (p: string) =>
    VERCEL.crons
      .filter((c) => c.path === p)
      .map((c) => {
        const [min, hora] = c.schedule.split(" ");
        return Number(hora) + Number(min) / 60;
      })
      .sort((a, b) => a - b);

  it("cubre exactamente los crons con entradas extra declarados en la constante", () => {
    expect(Object.keys(PATH_DE).sort()).toEqual(Object.keys(EXTRA_ENTRY_HOURS_UTC).sort());
  });

  for (const [cron, p] of Object.entries(PATH_DE)) {
    it(`${cron}: las extras son las entradas de vercel.json MENOS la primera del día`, () => {
      const horas = horasDe(p);
      expect(horas.length, `${p} no está en vercel.json`).toBeGreaterThan(1);
      // La 1ª entrada del día es la corrida normal; el resto son las que la
      // constante declara como "recuperación que aún viene hoy".
      expect(EXTRA_ENTRY_HOURS_UTC[cron]).toEqual(horas.slice(1));
    });
  }

  it("backup-switch quedó fuera del horario de oficina de Panamá (13:00-23:00 UTC)", () => {
    // Es el único grupo de backup que barre switch_articulo_diario (197k filas)
    // y switch_facturas (52k). Ninguna de sus 3 entradas debe caer en la jornada:
    // no hay motivo para mover ese volumen mientras la gente trabaja.
    for (const h of horasDe(PATH_DE["backup-switch"])) {
      expect(h >= 13 && h < 23, `backup?grupo=switch a las ${h} UTC cae en horario de oficina`).toBe(false);
    }
  });
});
