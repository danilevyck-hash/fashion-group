/**
 * 🔴 BOSTON SE VE EN GASTOS, PERO NO SE BAJA SOLA — la regla, textual
 * (13-ago-2026):
 *
 *   "ve avanzando con todas menos boston, ese usuario es mio y no entrare"
 *
 * Son DOS afirmaciones y las dos se prueban acá:
 *   1. el CRON no entra a Confecciones Boston (su usuario de Switch es el de
 *      Daniel, y el login usa `changesession=SI`, que EXPULSA a quien esté en
 *      el panel);
 *   2. Boston **sigue en el módulo** — su pestaña existe, el sync MANUAL la
 *      sigue aceptando, y la pantalla DICE por qué está vacía.
 *
 * ⚠️ NO es "sacar a Boston de Gastos". Dos mensajes antes Daniel había dicho
 * *"si quiero ver gastos de boston"*, y una empresa que se ve vacía sin
 * explicación se lee como un error del sistema — o, peor, como que esa empresa
 * no gastó nada.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  EMPRESAS_EGRESOS_FUERA_DE_CRON,
  empresasConEgresosEnCron,
  EMPRESA_SYNC_CAPABILITIES,
} from "@/lib/switch-api/empresas";
import { ALL_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { explicacionEgresos } from "@/app/gastos-contabilidad/components/ResumenEgresos";

const raiz = join(__dirname, "..", "..", "..");
const leer = (rel: string) => readFileSync(join(raiz, rel), "utf8");

const BOSTON = "confecciones_boston";

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el CRON no entra a Boston", () => {
  it("la lista es EXPLÍCITA y dice quién queda fuera", () => {
    // Lista con nombre y motivo escrito, no un `if` perdido en un route: es una
    // decisión de negocio. Mismo patrón que EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON.
    expect([...EMPRESAS_EGRESOS_FUERA_DE_CRON]).toEqual([BOSTON]);
  });

  it("las 7 restantes SÍ corren", () => {
    const enCron = empresasConEgresosEnCron();
    expect(enCron).toHaveLength(7);
    expect(enCron).not.toContain(BOSTON);
    for (const k of ALL_EMPRESA_KEYS) {
      if (k !== BOSTON) expect(enCron).toContain(k);
    }
  });

  it("y el sync DERIVA su lista de ahí, sin copiarla a mano", () => {
    // `sync-egresos-varios.ts` arrastra supabase, así que no se importa acá:
    // se lee el archivo. Lo que importa es que no haya una segunda lista.
    const sync = leer("src/lib/switch-api/sync-egresos-varios.ts");
    expect(sync).toMatch(
      /export const EGRESOS_EMPRESA_KEYS_CRON = empresasConEgresosEnCron\(\)/,
    );
    expect(sync).not.toMatch(/EGRESOS_EMPRESA_KEYS_CRON\s*=\s*\[/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 pero Boston NO se retira del módulo", () => {
  it("el universo del módulo sigue siendo las 8 empresas", () => {
    const sync = leer("src/lib/switch-api/sync-egresos-varios.ts");
    expect(sync).toMatch(/export const EGRESOS_EMPRESA_KEYS = \[\.\.\.ALL_EMPRESA_KEYS\]/);
    expect(ALL_EMPRESA_KEYS).toHaveLength(8);
    expect([...ALL_EMPRESA_KEYS]).toContain(BOSTON);
  });

  it("🩸 y NO se le apagó ninguna capability", () => {
    // Apagar una bandera diría "de esta empresa no traemos gastos", que es
    // falso: se pueden traer, sólo que no solos. Y desharía lo del mayor.
    expect(EMPRESA_SYNC_CAPABILITIES[BOSTON].facturas).toBe(true);
    expect(EMPRESA_SYNC_CAPABILITIES[BOSTON].estadoCuenta).toBe(true);
  });

  it("el sync MANUAL la sigue aceptando: se valida contra las 8, no contra las 7", () => {
    const route = leer("src/app/api/cron/sync-egresos-varios/route.ts");
    // El filtro de `?empresas=` usa el universo completo…
    expect(route).toMatch(/pedidas\.filter\(\(e\) => EGRESOS_EMPRESA_KEYS\.includes\(e\)\)/);
    // …y sólo el DEFAULT (sin parámetro) es la lista del cron.
    expect(route).toMatch(/:\s*EGRESOS_EMPRESA_KEYS_CRON/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 y el vigía no la reporta como caída", () => {
  it("el cronograma de sesión única declara las 7 que corre, no las 8", () => {
    const tel = leer("src/lib/cron-telemetry.ts");
    // Se DERIVA. Declarar una empresa que la entrada no corre le reservaría a
    // Boston una ventana de sesión única que nadie usa — y este cronograma es
    // lo que decide si un sync manual se rechaza.
    expect(tel).toMatch(/const CRON_EMPRESAS_EGRESOS = empresasConEgresosEnCron\(\);/);
    expect(tel).toMatch(/cron: "sync-egresos-varios",[^}]*empresas: CRON_EMPRESAS_EGRESOS/);
  });

  it("el cronograma NO vuelve a decir 'todas' para esa entrada", () => {
    const tel = leer("src/lib/cron-telemetry.ts");
    expect(tel).not.toMatch(/cron: "sync-egresos-varios",[^}]*empresas: CRON_EMPRESAS_TODAS/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🩸 la PANTALLA lo dice — una empresa vacía sin explicación es un error del sistema", () => {
  it("sin descarga automática, la frase explica por qué y dice qué hacer", () => {
    const t = explicacionEgresos("sin_datos", null, false);
    expect(t).toMatch(/no se traen solos de Switch/i);
    // Termina en lo único accionable que queda: traerlos a mano otra vez.
    expect(t).toMatch(/traerlos a mano/i);
  });

  it("🩸 y NO manda a la pestaña del mayor, que se retiró el 13-ago-2026", () => {
    // El texto viejo decía *"En 'Lo que cerró la contadora' sí se ven"* y esa
    // perilla ya no existe: quien lo leyera se iba a buscar una segunda fuente
    // que no está. Se prueba sobre los TRES estados, no sobre uno: la rama de
    // Boston los recorre todos y el final de la frase es común a los tres.
    for (const estado of ["con_movimientos", "sin_movimientos", "sin_datos"] as const) {
      for (const ultimo of [null, "2026-03"]) {
        const t = explicacionEgresos(estado, ultimo, false);
        expect(t).not.toMatch(/cerró la contadora/i);
        expect(t).not.toMatch(/mayor/i);
      }
    }
  });

  it("🔴 y dice que ÉSTA es la única fuente — no promete otra pantalla", () => {
    const t = explicacionEgresos("sin_datos", null, false);
    expect(t).toMatch(/único lugar donde se ven/i);
  });

  it("🔴 y NO se ve igual que un 'no traído' cualquiera", () => {
    const boston = explicacionEgresos("sin_datos", null, false);
    const normal = explicacionEgresos("sin_datos", null, true);
    expect(boston).not.toBe(normal);
    expect(normal).toMatch(/todavía no se ha traído de Switch/i);
    expect(normal).not.toMatch(/no se traen solos/i);
  });

  it("si alguna vez se trajo a mano, lo dice y dice hasta cuándo", () => {
    expect(explicacionEgresos("con_movimientos", "2026-03", false)).toMatch(
      /última vez que se trajo a mano/i,
    );
    expect(explicacionEgresos("sin_datos", "2026-03", false)).toMatch(/marzo 2026/);
  });

  it("las otras 7 NO cambian ni una palabra", () => {
    expect(explicacionEgresos("con_movimientos", "2026-03", true)).toBe("");
    expect(explicacionEgresos("sin_movimientos", null, true)).toBe(
      "Este mes no salió plata de caja ni del banco.",
    );
    // Y el default es "sí se baja sola": una empresa nueva no nace muda.
    expect(explicacionEgresos("sin_movimientos", null)).toBe(
      explicacionEgresos("sin_movimientos", null, true),
    );
  });
});
