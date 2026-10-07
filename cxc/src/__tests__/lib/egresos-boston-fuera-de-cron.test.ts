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
// 🔄 CAMBIÓ DE DIRECCIÓN el 7-oct-2026 (Daniel: «Apaga gasto»). El cronograma de
// sesión única YA NO declara ninguna entrada para `sync-egresos-varios`: el
// cron entero se retiró (vercel.json y `SWITCH_CRON_ENTRADAS`, los dos — ver
// `sync-egresos-varios.test.ts` › "C."). No hace falta distinguir 7 de 8
// empresas en un cronograma que ya no corre. `empresasConEgresosEnCron()`
// sigue viva en `switch-api/empresas.ts` para el sync MANUAL.
describe("🔴 y el cron ya no existe en el cronograma", () => {
  it("sync-egresos-varios se fue de vercel.json Y de cron-telemetry.ts, los dos", () => {
    // SIN COMENTARIOS: la nota que documenta el retiro nombra justo lo
    // retirado (dice cómo reactivarlo), así que el barrido los borra primero.
    const tel = leer("src/lib/cron-telemetry.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(tel).not.toMatch(/cron: "sync-egresos-varios"/);
    const vercel = leer("vercel.json");
    expect(vercel).not.toContain("sync-egresos-varios");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🩸 la PANTALLA lo dice — una empresa vacía sin explicación es un error del sistema", () => {
  it("sin descarga automática, la frase explica por qué y dice qué hacer", () => {
    // 🔄 1-oct-2026, Daniel: nombres normales de ERP — la frase pasó a la forma de ERP «Carga manual: …».
    const t = explicacionEgresos("sin_datos", null, false);
    expect(t).toMatch(/Carga manual: no se actualiza automáticamente/i);
    expect(t).toMatch(/Sin cargas todavía/i);
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
    // 🔄 1-oct-2026, Daniel: nombres normales de ERP: la frase de ERP no nombra ninguna otra pantalla.
    const t = explicacionEgresos("sin_datos", null, false);
    expect(t).not.toMatch(/pestaña|pantalla/i);
  });

  it("🔴 y NO se ve igual que un 'no traído' cualquiera", () => {
    const boston = explicacionEgresos("sin_datos", null, false);
    const normal = explicacionEgresos("sin_datos", null, true);
    expect(boston).not.toBe(normal);
    // 🔄 7-oct-2026, Daniel («Apaga gasto»): decía "todavía no se ha traído de
    // Switch" — con el registro pausado para siempre, no "todavía".
    expect(normal).toMatch(/pausado/i);
    expect(normal).not.toMatch(/Carga manual/i);
  });

  it("si alguna vez se trajo a mano, lo dice y dice hasta cuándo", () => {
    expect(explicacionEgresos("con_movimientos", "2026-03", false)).toMatch(/Carga manual/i);
    expect(explicacionEgresos("sin_datos", "2026-03", false)).toMatch(/marzo 2026/);
  });

  it("las otras 7 NO cambian ni una palabra", () => {
    expect(explicacionEgresos("con_movimientos", "2026-03", true)).toBe("");
    // 7-oct-2026, Daniel («Apaga gasto»): decía "Sin egresos este mes."
    expect(explicacionEgresos("sin_movimientos", null, true)).toBe("Registro de gastos pausado.");
    // Y el default es "sí se baja sola": una empresa nueva no nace muda.
    expect(explicacionEgresos("sin_movimientos", null)).toBe(
      explicacionEgresos("sin_movimientos", null, true),
    );
  });
});
