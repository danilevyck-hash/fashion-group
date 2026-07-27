// Candados del cron cleanup-sessions (/api/cron/cleanup-sessions, 02:30 UTC).
//
// Contexto: `user_sessions` no tiene `expires_at` y la cookie firmada no lleva
// claim de expiración → hasta jul-2026 una sesión no expiraba nunca del lado del
// servidor. Este cron es el único vencimiento que existe, así que sus tres
// cortes (14d inactividad / 90d vida máxima / 90d retención de revocadas) y su
// horario tienen que quedar clavados.
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

// cron-telemetry importa supabase-server/telegram al cargarse (I/O de
// heartbeats). Acá solo se leen constantes, así que se doblan.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn() } }));
vi.mock("@/lib/telegram", () => ({ sendTelegramAlert: vi.fn(), shortError: (s: string) => s }));

import {
  DIAS_INACTIVIDAD,
  DIAS_VIDA_MAXIMA,
  DIAS_RETENCION_REVOCADAS,
  cortesDeLimpieza,
  clasificarSesion,
  type FilaSesion,
} from "@/lib/session-retention";
import { CRONS_FAIL_CLOSED } from "@/lib/cron-telemetry";

const RUTA_CRON = "/api/cron/cleanup-sessions";
const SCHEDULE_CRON = "30 2 * * *";

// `now` fijo para que los cortes sean verificables a mano.
const NOW = new Date("2026-07-25T02:30:00.000Z");
const cortes = cortesDeLimpieza(NOW);

/** Un ISO a N días antes de NOW (para armar filas sintéticas legibles). */
const haceDias = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

// ─────────────────────────────────────────────────────────────────────────────
describe("cortesDeLimpieza — las 3 fechas de corte", () => {
  it("las constantes son las decididas (14 / 90 / 90)", () => {
    expect(DIAS_INACTIVIDAD).toBe(14);
    expect(DIAS_VIDA_MAXIMA).toBe(90);
    expect(DIAS_RETENCION_REVOCADAS).toBe(90);
  });

  it("para un now fijo devuelve exactamente las fechas esperadas", () => {
    // 2026-07-25 menos 14 días = 2026-07-11; menos 90 días = 2026-04-26.
    expect(cortes.inactividad).toBe("2026-07-11T02:30:00.000Z");
    expect(cortes.vidaMaxima).toBe("2026-04-26T02:30:00.000Z");
    expect(cortes.retencionRevocadas).toBe("2026-04-26T02:30:00.000Z");
  });

  it("son ISO UTC parseables y todas anteriores a now", () => {
    for (const [nombre, iso] of Object.entries(cortes)) {
      expect(iso, nombre).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(Date.parse(iso), nombre).toBeLessThan(NOW.getTime());
    }
  });

  it("el cálculo no depende del now: mover el reloj mueve los 3 cortes igual", () => {
    const otro = cortesDeLimpieza(new Date(NOW.getTime() + 3600_000));
    expect(Date.parse(otro.inactividad) - Date.parse(cortes.inactividad)).toBe(3600_000);
    expect(Date.parse(otro.vidaMaxima) - Date.parse(cortes.vidaMaxima)).toBe(3600_000);
  });
});

describe("orden de los cortes — invariantes que no se pueden invertir", () => {
  it("la inactividad es MÁS agresiva que la vida máxima (14 < 90)", () => {
    expect(DIAS_INACTIVIDAD).toBeLessThan(DIAS_VIDA_MAXIMA);
    // En fechas eso significa: el corte de inactividad es el MÁS RECIENTE.
    expect(Date.parse(cortes.inactividad)).toBeGreaterThan(Date.parse(cortes.vidaMaxima));
  });

  it("el corte de BORRADO nunca es más nuevo que el de revocación", () => {
    // Si lo fuera, se borrarían filas antes de haberlas podido revocar: la
    // ventana de auditoría dejaría de existir.
    expect(Date.parse(cortes.retencionRevocadas)).toBeLessThanOrEqual(
      Date.parse(cortes.inactividad),
    );
    expect(DIAS_RETENCION_REVOCADAS).toBeGreaterThanOrEqual(DIAS_INACTIVIDAD);
  });

  it("la retención de revocadas cubre al menos toda la vida de una sesión", () => {
    expect(DIAS_RETENCION_REVOCADAS).toBeGreaterThanOrEqual(DIAS_VIDA_MAXIMA);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("clasificarSesion — tabla de casos con las cifras reales", () => {
  const casos: { nombre: string; fila: FilaSesion; espera: string }[] = [
    {
      nombre: "activa de hace 3 días (el grupo ≤7d, 72 filas) → se queda",
      fila: { revoked: false, last_seen: haceDias(3), created_at: haceDias(10) },
      espera: "conservar",
    },
    {
      nombre: "activa de hace 20 días (dentro de las 147 que revoca el día 1) → revocar",
      fila: { revoked: false, last_seen: haceDias(20), created_at: haceDias(25) },
      espera: "revocar-inactividad",
    },
    {
      nombre: "activa de hace 45 días (la más vieja medida) → revocar",
      fila: { revoked: false, last_seen: haceDias(45), created_at: haceDias(50) },
      espera: "revocar-inactividad",
    },
    {
      nombre: "activa y usada ayer pero creada hace 100 días → tope duro",
      fila: { revoked: false, last_seen: haceDias(1), created_at: haceDias(100) },
      espera: "revocar-antiguedad",
    },
    {
      nombre: "revocada con last_seen de hace 100 días → borrar",
      fila: { revoked: true, last_seen: haceDias(100), created_at: haceDias(120) },
      espera: "borrar",
    },
    {
      nombre: "revocada la semana pasada → se queda (rastro de auditoría)",
      fila: { revoked: true, last_seen: haceDias(7), created_at: haceDias(30) },
      espera: "conservar",
    },
    {
      nombre: "activa de hoy, creada hoy → se queda",
      fila: { revoked: false, last_seen: haceDias(0), created_at: haceDias(0) },
      espera: "conservar",
    },
  ];

  for (const c of casos) {
    it(c.nombre, () => {
      expect(clasificarSesion(c.fila, cortes)).toBe(c.espera);
    });
  }

  it("bordes exactos: 14d justo NO cae, 14d+1s sí", () => {
    const justo = new Date(Date.parse(cortes.inactividad)).toISOString();
    const unSegundoAntes = new Date(Date.parse(cortes.inactividad) - 1000).toISOString();
    expect(clasificarSesion({ revoked: false, last_seen: justo, created_at: justo }, cortes))
      .toBe("conservar");
    expect(
      clasificarSesion({ revoked: false, last_seen: unSegundoAntes, created_at: justo }, cortes),
    ).toBe("revocar-inactividad");
  });

  it("last_seen NULL no revoca ni borra (en SQL `NULL < fecha` es falso)", () => {
    expect(
      clasificarSesion({ revoked: false, last_seen: null, created_at: haceDias(10) }, cortes),
    ).toBe("conservar");
    expect(
      clasificarSesion({ revoked: true, last_seen: null, created_at: haceDias(300) }, cortes),
    ).toBe("conservar");
    // …pero el tope duro de antigüedad sí la alcanza, porque mira created_at.
    expect(
      clasificarSesion({ revoked: false, last_seen: null, created_at: haceDias(300) }, cortes),
    ).toBe("revocar-antiguedad");
  });

  it("compara instantes, no strings: el formato de PostgREST (+00:00) no confunde", () => {
    // PostgREST devuelve "…T02:30:00+00:00"; toISOString() da "…T02:30:00.000Z".
    const postgrest = "2026-07-05T02:30:00+00:00"; // 20 días antes de NOW
    expect(
      clasificarSesion({ revoked: false, last_seen: postgrest, created_at: postgrest }, cortes),
    ).toBe("revocar-inactividad");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("vercel.json — la entrada del cron", () => {
  const vercel = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../../vercel.json"), "utf8"),
  ) as { crons: { path: string; schedule: string }[] };

  it("está en el registro fail-closed (si no, el watchdog no lo vigila)", () => {
    // Un cron que registra heartbeat pero no está en el registro es invisible
    // para /api/health-crons y para el watchdog de Telegram: podría dejar de
    // correr durante meses sin que nadie se entere, que es exactamente el
    // agujero que este cron vino a cerrar.
    //
    // La lista era EXPECTED_CRONS dentro de health-crons y se mudó a
    // CRONS_FAIL_CLOSED (cron-telemetry.ts) el 27-jul-2026, para que los DOS
    // vigías lean la misma. Se comprueba contra la CONSTANTE, no contra el texto
    // del archivo: así el candado no depende de dónde viva la lista.
    expect(CRONS_FAIL_CLOSED).toContain("cleanup-sessions");
  });

  it("existe UNA sola entrada para /api/cron/cleanup-sessions", () => {
    const mias = vercel.crons.filter((c) => c.path === RUTA_CRON);
    expect(mias).toHaveLength(1);
    expect(mias[0].schedule).toBe(SCHEDULE_CRON);
  });

  it("ningún otro cron comparte su minuto+hora exactos", () => {
    const choques = vercel.crons.filter(
      (c) => c.schedule === SCHEDULE_CRON && c.path !== RUTA_CRON,
    );
    expect(choques.map((c) => c.path)).toEqual([]);
  });

  it("queda a ≥30 min de sus vecinos (acs-resumen-diario 01:00, cleanup-packing-lists 03:00)", () => {
    const enMinutos = (schedule: string) => {
      const [min, hora] = schedule.split(" ");
      return Number(hora) * 60 + Number(min);
    };
    const mio = enMinutos(SCHEDULE_CRON); // 150
    // Distancia circular (el día da la vuelta) contra todos los demás crons
    // diarios que caen en el mismo bloque horario 00:00-05:00.
    for (const c of vercel.crons) {
      if (c.path === RUTA_CRON) continue;
      const [min, hora] = c.schedule.split(" ");
      if (!/^\d+$/.test(min) || !/^\d+$/.test(hora)) continue; // no diario simple
      const otro = enMinutos(c.schedule);
      if (otro < 0 || otro > 300) continue; // fuera de 00:00-05:00
      const d = Math.abs(mio - otro);
      expect(Math.min(d, 1440 - d), `${c.path} (${c.schedule})`).toBeGreaterThanOrEqual(30);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Se lee el fuente en vez de importar el route: importarlo arrastraría supabase
// y `maxDuration`/`dynamic` son exports estáticos que Next lee en build.
describe("route — exports y telemetría", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../../app/api/cron/cleanup-sessions/route.ts"),
    "utf8",
  );

  it("no cachea nada (dynamic + fetchCache) y declara maxDuration", () => {
    expect(src).toContain('export const dynamic = "force-dynamic"');
    expect(src).toContain('export const fetchCache = "force-no-store"');
    expect(src).toMatch(/export const maxDuration = \d+/);
  });

  it("registra heartbeat con el nombre del cron y responde 401 sin auth", () => {
    expect(src).toContain('recordCronHeartbeat(CRON_NAME)');
    expect(src).toContain('const CRON_NAME = "cleanup-sessions"');
    expect(src).toContain("Unauthorized");
    expect(src).toContain("status: 401");
  });

  it("no inventa columnas: solo toca revoked, last_seen y created_at", () => {
    // `expires_at` NO existe en user_sessions — si alguien la usa en una query,
    // el cron se cae en producción con un 400 de PostgREST. (En los comentarios
    // sí aparece: el hallazgo que originó el cron es justamente su ausencia.)
    const codigo = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(codigo).not.toMatch(/expires_at/);
    expect(src).toContain('.from("user_sessions")');
    // Y las columnas que sí usa existen todas en la tabla.
    for (const col of ["revoked", "last_seen", "created_at"]) {
      expect(codigo, col).toContain(col);
    }
  });

  it("el heartbeat va DESPUÉS de los 3 pasos y no se registra si hubo error", () => {
    const iErr = src.indexOf("errores.length > 0");
    const iHeartbeat = src.indexOf("await recordCronHeartbeat(CRON_NAME)");
    expect(iErr).toBeGreaterThan(-1);
    expect(iHeartbeat).toBeGreaterThan(iErr);
    expect(src).toContain("logCronError(");
  });
});
