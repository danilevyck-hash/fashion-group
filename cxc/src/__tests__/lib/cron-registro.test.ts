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
//  D. NINGUNA FILA DE cron_heartbeats SOBREVIVE A SU CRON (3-sep-2026). La
//     mitad A hace que una fila huérfana no ALERTE; esta exige que no EXISTA.
//     `sync-mayor` se retiró el 13-ago-2026 y su fila quedó tres semanas
//     envejeciendo en silencio — nadie la barrió porque nada la denunciaba.
//     Acá se fija el clasificador puro con la FOTO exacta de producción; la
//     tabla real la mira src/__tests__/integration/cron-heartbeats-huerfanos.
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
  HEARTBEATS_EXTERNOS,
  esCronRetirado,
  esHeartbeatNoVigilable,
  esHeartbeatHuerfano,
  heartbeatsHuerfanos,
  cronsStaleParaAlerta,
  cronStaleThresholdHours,
  slotHeartbeatName,
  slotRecuperadoName,
  slotVistoName,
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
  // Los vigías EXTERNOS (HEARTBEATS_EXTERNOS) quedan fuera de la biyección a
  // propósito: los dispara cron-job.org desde afuera, así que no tienen ni pueden
  // tener entrada en vercel.json. Sí están en el registro porque SÍ se vigilan —
  // es lo contrario de HEARTBEATS_NO_CRON. La lista es cerrada y corta, y
  // vigia-externo.test.ts fija que se sigan vigilando.
  const REGISTRO_PROGRAMADO = [...CRONS_CONOCIDOS].filter(
    (c) => !(HEARTBEATS_EXTERNOS as readonly string[]).includes(c),
  );

  it("cada cron de vercel.json está en el registro (si no, nadie lo vigila)", () => {
    const huerfanos = CRONS_EN_VERCEL.filter((c) => !CRONS_CONOCIDOS.has(c));
    expect(
      huerfanos,
      `crons programados que ningún vigía conoce: ${huerfanos.join(", ")}\n` +
        `Agregalos a CRONS_FAIL_CLOSED o SEED_TOLERANT_CRONS en cron-telemetry.ts.`,
    ).toEqual([]);
  });

  it("cada cron del registro sigue teniendo entrada en vercel.json", () => {
    const fantasmas = REGISTRO_PROGRAMADO.filter((c) => !CRONS_EN_VERCEL.includes(c)).sort();
    expect(
      fantasmas,
      `el registro vigila crons que ya no están en vercel.json: ${fantasmas.join(", ")}\n` +
        `Si el retiro es a propósito, sacalos del registro (y borrá su fila de cron_heartbeats).\n` +
        `Si NO lo es, alguien borró una entrada de vercel.json por accidente — restaurala.`,
    ).toEqual([]);
  });

  it("un vigía externo NO se cuela como cron programado", () => {
    // Si alguno apareciera en vercel.json sería un cron de verdad y tendría que
    // salir de HEARTBEATS_EXTERNOS (o la biyección dejaría de proteger nada).
    for (const n of HEARTBEATS_EXTERNOS) {
      expect(CRONS_EN_VERCEL, `${n} está en vercel.json: no es un vigía externo`).not.toContain(n);
      expect(CRONS_CONOCIDOS.has(n), `${n} tiene que seguir vigilado`).toBe(true);
    }
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

// ─────────────────────────────────────────────────────────────────────────────
describe("D. ninguna fila de cron_heartbeats sobrevive a su cron", () => {
  const PROGRAMADOS = new Set(CRONS_EN_VERCEL);

  // Las 75 filas REALES de cron_heartbeats, medidas el 3-sep-2026 23:10 UTC
  // (solo lectura). Es la foto con la que se encontró el huérfano.
  const FOTO_3_SEP_2026 = [
    "acs-fidelizacion", "acs-resumen-diario", "asistencia-vigia", "backup", "backup-storage",
    "backup-switch", "boston-cartera", "calvin-catalogo", "catalogos-fotos-nuevos:calvin",
    "catalogos-fotos-nuevos:joybees", "catalogos-fotos-nuevos:reebok", "catalogos-fotos-nuevos:tommy",
    "catalogos-fotos-resumen", "cheques-alert", "cleanup-packing-lists", "cleanup-sessions", "db-salud",
    "grupo-resumen-mensual", "guias-pendientes", "integrity-check", "joybees-catalogo", "reebok-catalogo",
    "refresh-clientes-views", "switch-articulos", "switch-reconciliacion", "switch-sync",
    "switch-sync:all-0530", "switch-sync:all-0535", "switch-sync:all-0535#recuperado",
    "switch-sync:all-0540", "switch-sync:all-0540#recuperado", "switch-sync:all-0630",
    "switch-sync:all-0630#recuperado", "switch-sync:estadocuenta-1600", "switch-sync:estadocuenta-1605",
    "switch-sync:estadocuenta-1610", "switch-sync:estadocuenta-2110",
    "switch-sync:estadocuenta-2110#recuperado", "switch-sync:estadocuenta-2115",
    "switch-sync:estadocuenta-2115#recuperado", "switch-sync:estadocuenta-2120",
    "switch-sync:estadocuenta-2120#recuperado", "switch-sync:facturas-0015",
    "switch-sync:facturas-0015#recuperado", "switch-sync:facturas-1150",
    "switch-sync:facturas-1150#recuperado", "switch-sync:facturas-1150#visto", "switch-sync:facturas-1300",
    "switch-sync:facturas-1300#recuperado", "switch-sync:facturas-1300#visto", "switch-sync:facturas-1500",
    "switch-sync:facturas-1500#recuperado", "switch-sync:facturas-1700",
    "switch-sync:facturas-1700#recuperado", "switch-sync:facturas-1700#visto", "switch-sync:facturas-1900",
    "switch-sync:facturas-1900#recuperado", "switch-sync:facturas-1900#visto", "switch-sync:facturas-2100",
    "switch-sync:facturas-2100#recuperado", "switch-sync:facturas-2100#visto", "switch-sync:facturas-2300",
    "switch-sync:facturas-2300#recuperado", "switch-sync:facturas-2300#visto", "sync-articulo-info",
    "sync-clientes-master", "sync-egresos-varios", "sync-factura-lineas", "sync-ingresos-mercancia",
    "sync-mayor", "sync-proveedores", "sync-recibos", "sync-utilidad", "tommy-catalogo", "vigia-externo",
  ];

  it("la foto tiene las 75 filas medidas, sin repetidos", () => {
    expect(FOTO_3_SEP_2026).toHaveLength(75);
    expect(new Set(FOTO_3_SEP_2026).size).toBe(75);
  });

  it("en la foto del 3-sep-2026 el ÚNICO huérfano es sync-mayor", () => {
    expect(heartbeatsHuerfanos(FOTO_3_SEP_2026, PROGRAMADOS)).toEqual(["sync-mayor"]);
  });

  it("después de la migración 20260914120000 no queda ninguno", () => {
    const sinMayor = FOTO_3_SEP_2026.filter((n) => n !== "sync-mayor");
    expect(heartbeatsHuerfanos(sinMayor, PROGRAMADOS)).toEqual([]);
  });

  it("CONTROL: cada cron de vercel.json tiene derecho a su fila", () => {
    for (const cron of CRONS_EN_VERCEL) {
      expect(esHeartbeatHuerfano(cron, PROGRAMADOS), `${cron} está en vercel.json`).toBe(false);
    }
  });

  it("excepción 1 y 2: los slots VIVOS de switch-sync y sus marcas no son huérfanos", () => {
    for (const s of SWITCH_SYNC_SLOTS) {
      for (const n of [slotHeartbeatName(s.slot), slotRecuperadoName(s.slot), slotVistoName(s.slot)]) {
        expect(esHeartbeatHuerfano(n, PROGRAMADOS), n).toBe(false);
      }
    }
  });

  it("excepción 3: los heartbeats MANUALES no son huérfanos (nadie los programa)", () => {
    for (const n of HEARTBEATS_NO_CRON) {
      expect(esHeartbeatHuerfano(n, PROGRAMADOS), n).toBe(false);
      // Y la excepción no tapa un cron real: si alguno apareciera en vercel.json
      // dejaría de ser manual y tendría que salir de HEARTBEATS_NO_CRON.
      expect(CRONS_EN_VERCEL, `${n} está en vercel.json: no es manual`).not.toContain(n);
    }
  });

  it("excepción 4: el vigía EXTERNO no es huérfano (no puede estar en vercel.json)", () => {
    for (const n of HEARTBEATS_EXTERNOS) {
      expect(esHeartbeatHuerfano(n, PROGRAMADOS), n).toBe(false);
    }
  });

  it("un cron retirado, un slot retirado y sus marcas SÍ son huérfanos", () => {
    // multifashion-sync: retirado el 26-jul-2026. facturas-2315: se movió a
    // facturas-2300 el 26-jul-2026. Un nombre inventado: nunca existió.
    for (const n of [
      "multifashion-sync",
      "sync-mayor",
      "cron-que-no-existe",
      slotHeartbeatName("facturas-2315"),
      slotRecuperadoName("facturas-2315"),
      slotVistoName("facturas-2315"),
    ]) {
      expect(esHeartbeatHuerfano(n, PROGRAMADOS), `${n} tendría que ser huérfano`).toBe(true);
    }
  });

  it("las excepciones son una lista CERRADA: sin vercel.json todo lo demás es huérfano", () => {
    // Con el conjunto de programados VACÍO solo sobreviven las 4 excepciones.
    const vacio = new Set<string>();
    const sobreviven = FOTO_3_SEP_2026.filter((n) => !esHeartbeatHuerfano(n, vacio)).sort();
    // (`sync-now-refresh-vistas` es excepción pero hoy no tiene fila: nadie
    // usó el botón todavía. Se mide sobre lo que SÍ está en la foto.)
    const excepciones = new Set<string>([...HEARTBEATS_NO_CRON, ...HEARTBEATS_EXTERNOS]);
    const esperadas = FOTO_3_SEP_2026.filter(
      (n) => excepciones.has(n) || n.startsWith("switch-sync:"),
    ).sort();
    expect(sobreviven).toEqual(esperadas);
  });
});
