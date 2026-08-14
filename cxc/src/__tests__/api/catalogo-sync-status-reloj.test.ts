// @vitest-environment node
//
// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — el reloj del catálogo ("Sincronizado con Switch hace X").
//
// El bug (14-ago-2026): el indicador leía `cron_heartbeats`, que SOLO escribe
// el cron. El botón "Actualizar ahora" corría el sync de verdad y escribía en
// `switch_sync_log` con triggered_by='manual', así que el reloj se quedaba en
// la hora del último cron. Medido en producción a las 15:47 UTC:
//   cron_heartbeats.tommy-catalogo         14:32:41  ← lo que mostraba el banner
//   switch_sync_log catalogo_tommy manual  15:39:50  ← lo que Daniel corrió
// El banner decía "hace una hora" seis minutos después de sincronizar.
//
// Los DOS candados obligatorios, y los dos son de CONDUCTA (se llama al handler
// REAL con la base doblada y se mira qué devuelve / qué escribe — un barrido de
// texto acá no probaría nada):
//   1) una corrida MANUAL más reciente que el último cron TIENE QUE GANAR;
//   2) el botón manual NO puede escribir `cron_heartbeats`.
//
// 🔴 Por qué (2) importa tanto: `cron_heartbeats` es la tabla que vigilan el
// watchdog de Telegram y /api/health-crons para saber si el CRON corrió. Si un
// clic la refrescara, un cron caído quedaría tapado por una persona y el vigía
// diría que todo está bien. El arreglo del reloj es de LECTURA, no de
// escritura, y es exactamente el atajo que alguien va a querer tomar.
//
// El doble de Supabase de este archivo NO es el de catalogo-mock-db (que
// devuelve lo que se le encoló sin mirar los filtros): acá FILTRA, ORDENA y
// CORTA de verdad, porque lo que hay que probar es justamente que el handler
// ELIGE la corrida más reciente. Con un doble que devuelve lo encolado, un
// handler que volviera a `cron_heartbeats` pasaría en verde.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import type { NextRequest } from "next/server";

// ─── Doble de PostgREST con semántica real ───────────────────────────────────

type Fila = Record<string, unknown>;
interface Escritura {
  tabla: string;
  metodo: "insert" | "update" | "upsert" | "delete";
  payload: unknown;
}

interface BaseDoblada {
  from: (tabla: string) => unknown;
  escrituras: Escritura[];
  tablasLeidas: string[];
}

function baseDoblada(
  tablas: Record<string, Fila[]>,
  opts: { errorEn?: string } = {},
): BaseDoblada {
  const escrituras: Escritura[] = [];
  const tablasLeidas: string[] = [];

  const from = (tabla: string) => {
    let filas: Fila[] = [...(tablas[tabla] ?? [])];
    let esLectura = true;

    const resultado = () => {
      if (esLectura) tablasLeidas.push(tabla);
      if (opts.errorEn === tabla) {
        return { data: null, error: { message: "la base dijo que no" }, count: null };
      }
      return { data: filas, error: null, count: filas.length };
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        filas = filas.filter((f) => f[col] === val);
        return chain;
      },
      neq: (col: string, val: unknown) => {
        filas = filas.filter((f) => f[col] !== val);
        return chain;
      },
      lt: (col: string, val: unknown) => {
        filas = filas.filter((f) => (f[col] as string) < (val as string));
        return chain;
      },
      gt: () => chain,
      gte: () => chain,
      lte: () => chain,
      is: () => chain,
      in: (col: string, vals: unknown[]) => {
        filas = filas.filter((f) => vals.includes(f[col]));
        return chain;
      },
      order: (col: string, o?: { ascending?: boolean; nullsFirst?: boolean }) => {
        const asc = o?.ascending !== false;
        // Default de Postgres: ASC → NULLS LAST, DESC → NULLS FIRST.
        const nullsFirst = o?.nullsFirst ?? !asc;
        filas = [...filas].sort((a, b) => {
          const av = a[col] as string | null | undefined;
          const bv = b[col] as string | null | undefined;
          const aNull = av === null || av === undefined;
          const bNull = bv === null || bv === undefined;
          if (aNull && bNull) return 0;
          if (aNull) return nullsFirst ? -1 : 1;
          if (bNull) return nullsFirst ? 1 : -1;
          if (av === bv) return 0;
          return asc ? (av! < bv! ? -1 : 1) : (av! > bv! ? -1 : 1);
        });
        return chain;
      },
      limit: (n: number) => {
        filas = filas.slice(0, n);
        return chain;
      },
      range: () => chain,
      maybeSingle: async () => {
        const r = resultado();
        return { data: (r.data as Fila[] | null)?.[0] ?? null, error: r.error };
      },
      single: async () => {
        const r = resultado();
        return { data: (r.data as Fila[] | null)?.[0] ?? null, error: r.error };
      },
      then: (onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve(resultado()).then(onF, onR),
    };

    for (const m of ["insert", "update", "upsert", "delete"] as const) {
      chain[m] = (payload: unknown) => {
        esLectura = false;
        escrituras.push({ tabla, metodo: m, payload });
        return chain;
      };
    }
    return chain;
  };

  return { from, escrituras, tablasLeidas };
}

let db: BaseDoblada;

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (t: string) => db.from(t),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  },
}));

// Los 4 syncs de catálogo mockeados: el botón manual no puede pegarle a Switch
// desde un test. Lo que se mide es lo que ESCRIBE el route, no el sync.
const syncCatalogo = vi.fn(async () => ({
  hadError: false,
  empresas: [{ empresaKey: "fashion_shoes", actualizados: 1, agregados: 0, ocultados: 0, error: null }],
}));
vi.mock("@/lib/switch-api/sync-catalogo-reebok", () => ({ syncCatalogoReebok: (...a: unknown[]) => syncCatalogo(...(a as [])) }));
vi.mock("@/lib/switch-api/sync-catalogo-joybees", () => ({ syncCatalogoJoybees: (...a: unknown[]) => syncCatalogo(...(a as [])) }));
vi.mock("@/lib/switch-api/sync-catalogo-tommy", () => ({ syncCatalogoTommy: (...a: unknown[]) => syncCatalogo(...(a as [])) }));
vi.mock("@/lib/switch-api/sync-catalogo-calvin", () => ({ syncCatalogoCalvin: (...a: unknown[]) => syncCatalogo(...(a as [])) }));
vi.mock("@/lib/catalogos/fotos-nuevos", () => ({
  avisarNuevosSinFoto: vi.fn(async () => ({ codigos: [] })),
}));
vi.mock("@/lib/switch-api/client", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  logoutAllSwitchSessions: vi.fn(async () => {}),
}));

import { GET as syncStatusGet } from "@/app/api/catalogo/[marca]/sync-status/route";
import { POST as syncNowPost } from "@/app/api/admin/sync-now/route";
import { getMarcaConfig, MARCAS_CONFIG } from "@/lib/catalogo/marcas";
import { lockKeyDe, moduloConfig } from "@/lib/switch-api/sync-now";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

const pedirReloj = (marca: string, role = "admin") =>
  syncStatusGet(makeReq("/x", { role }) as NextRequest, { params: { marca } });

beforeAll(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

// ── Datos REALES de producción, medidos el 14-ago-2026 a las 15:47 UTC ───────
const CRON_TOMMY = "2026-08-14T14:32:40.636+00:00";
const MANUAL_TOMMY = "2026-08-14T15:39:50.329+00:00";
const HEARTBEAT_TOMMY = "2026-08-14T14:32:41.419+00:00";

const filaLog = (
  empresa: string,
  tipo: string,
  finished: string | null,
  by: string,
  status = "success",
): Fila => ({
  empresa_key: empresa,
  sync_type: tipo,
  status,
  triggered_by: by,
  finished_at: finished,
  started_at: finished,
});

const HEARTBEATS: Fila[] = [
  { cron_name: "tommy-catalogo", last_success_at: HEARTBEAT_TOMMY },
  { cron_name: "reebok-catalogo", last_success_at: "2026-08-14T14:41:57.082+00:00" },
  { cron_name: "calvin-catalogo", last_success_at: "2026-08-14T14:36:53.778+00:00" },
  { cron_name: "joybees-catalogo", last_success_at: "2026-08-14T14:45:35.978+00:00" },
];

beforeEach(() => {
  vi.clearAllMocks();
  db = baseDoblada({});
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── 1. El candado principal: el manual más reciente GANA ────────────────────

describe("el reloj muestra la sincronización más reciente, la haya disparado quien la haya disparado", () => {
  it("🔴 el caso REAL del 14-ago: corrida manual 15:39 contra cron 14:32 → gana 15:39", async () => {
    db = baseDoblada({
      cron_heartbeats: HEARTBEATS,
      switch_sync_log: [
        filaLog("fashion_shoes", "catalogo_tommy", CRON_TOMMY, "cron"),
        filaLog("fashion_shoes", "catalogo_tommy", MANUAL_TOMMY, "manual"),
      ],
    });
    const res = await pedirReloj("tommy");
    expect(res.status).toBe(200);
    // Si alguien devuelve la lectura a cron_heartbeats, esto da 14:32 y falla.
    expect(await res.json()).toEqual({ lastSync: MANUAL_TOMMY });
  });

  it("y al revés: si el cron es el más reciente, gana el cron", async () => {
    db = baseDoblada({
      cron_heartbeats: HEARTBEATS,
      switch_sync_log: [
        filaLog("fashion_shoes", "catalogo_tommy", MANUAL_TOMMY, "manual"),
        filaLog("fashion_shoes", "catalogo_tommy", "2026-08-14T17:02:00.000+00:00", "cron"),
      ],
    });
    expect(await (await pedirReloj("tommy")).json()).toEqual({
      lastSync: "2026-08-14T17:02:00.000+00:00",
    });
  });

  it("NO lee cron_heartbeats (esa tabla contesta '¿corrió el cron?', otra pregunta)", async () => {
    db = baseDoblada({
      cron_heartbeats: HEARTBEATS,
      switch_sync_log: [filaLog("fashion_shoes", "catalogo_tommy", MANUAL_TOMMY, "manual")],
    });
    await pedirReloj("tommy");
    expect(db.tablasLeidas).toContain("switch_sync_log");
    expect(db.tablasLeidas).not.toContain("cron_heartbeats");
  });

  it("las 4 marcas leen SU (empresa_key, sync_type) y no se pisan entre ellas", async () => {
    const esperado: Record<string, string> = {
      tommy: "2026-08-14T15:39:50.000+00:00",
      reebok: "2026-08-14T14:41:56.647+00:00",
      calvin: "2026-08-14T14:36:53.152+00:00",
      joybees: "2026-08-14T14:45:35.032+00:00",
    };
    const filas = Object.entries(esperado).map(([marca, cuando]) => {
      const cfg = MARCAS_CONFIG[marca];
      return filaLog(cfg.empresaKey, cfg.syncType, cuando, "cron");
    });
    for (const [marca, cuando] of Object.entries(esperado)) {
      db = baseDoblada({ cron_heartbeats: HEARTBEATS, switch_sync_log: filas });
      expect(await (await pedirReloj(marca)).json(), marca).toEqual({ lastSync: cuando });
    }
  });

  it("una corrida de OTRA marca no puede contestar por esta", async () => {
    db = baseDoblada({
      switch_sync_log: [
        filaLog("active_shoes", "catalogo_reebok", "2026-08-14T23:00:00.000+00:00", "manual"),
      ],
    });
    expect(await (await pedirReloj("tommy")).json()).toEqual({ lastSync: null });
  });

  it("una corrida con ERROR no cuenta como sincronización", async () => {
    db = baseDoblada({
      switch_sync_log: [
        filaLog("fashion_shoes", "catalogo_tommy", CRON_TOMMY, "cron"),
        filaLog("fashion_shoes", "catalogo_tommy", "2026-08-14T16:00:00.000+00:00", "manual", "error"),
      ],
    });
    expect(await (await pedirReloj("tommy")).json()).toEqual({ lastSync: CRON_TOMMY });
  });

  it("una fila success sin finished_at no se lleva el primer puesto (NULLS FIRST de Postgres)", async () => {
    db = baseDoblada({
      switch_sync_log: [
        filaLog("fashion_shoes", "catalogo_tommy", null, "cron"),
        filaLog("fashion_shoes", "catalogo_tommy", MANUAL_TOMMY, "manual"),
      ],
    });
    expect(await (await pedirReloj("tommy")).json()).toEqual({ lastSync: MANUAL_TOMMY });
  });
});

// ─── 2. Degradación: preferible "no sé" a una hora inventada ─────────────────

describe("degradación — nunca una hora inventada", () => {
  it("sin ninguna corrida → lastSync null (la pantalla no muestra hora)", async () => {
    db = baseDoblada({ cron_heartbeats: HEARTBEATS, switch_sync_log: [] });
    const res = await pedirReloj("calvin");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lastSync: null });
  });

  it("si la lectura falla → lastSync null, y NO cae de vuelta al heartbeat", async () => {
    db = baseDoblada(
      { cron_heartbeats: HEARTBEATS, switch_sync_log: [filaLog("joystep", "catalogo_joybees", MANUAL_TOMMY, "manual")] },
      { errorEn: "switch_sync_log" },
    );
    const res = await pedirReloj("joybees");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lastSync: null });
    expect(db.tablasLeidas).not.toContain("cron_heartbeats");
  });
});

// ─── 3. Permiso y read-only: no cambian ──────────────────────────────────────

describe("el permiso no cambia y la ruta sigue siendo read-only", () => {
  it("401 sin sesión", async () => {
    db = baseDoblada({});
    expect((await syncStatusGet(makeReq("/x") as NextRequest, { params: { marca: "tommy" } })).status).toBe(401);
  });

  it("admin, secretaria y vendedor entran; bodega y contabilidad no", async () => {
    const filas = [filaLog("fashion_shoes", "catalogo_tommy", MANUAL_TOMMY, "manual")];
    for (const role of ["admin", "secretaria", "vendedor"]) {
      db = baseDoblada({ switch_sync_log: filas });
      expect((await pedirReloj("tommy", role)).status, role).toBe(200);
    }
    for (const role of ["bodega", "contabilidad"]) {
      db = baseDoblada({ switch_sync_log: filas });
      expect((await pedirReloj("tommy", role)).status, role).toBe(403);
    }
  });

  it("marca desconocida → 404", async () => {
    db = baseDoblada({});
    expect((await pedirReloj("gucci")).status).toBe(404);
  });

  it("la ruta no escribe NADA en ninguna tabla", async () => {
    db = baseDoblada({
      cron_heartbeats: HEARTBEATS,
      switch_sync_log: [filaLog("fashion_shoes", "catalogo_tommy", MANUAL_TOMMY, "manual")],
    });
    await pedirReloj("tommy");
    expect(db.escrituras).toEqual([]);
  });
});

// ─── 4. 🔴 El botón manual NO puede escribir cron_heartbeats ─────────────────

describe("🔴 el botón 'Actualizar ahora' NO escribe cron_heartbeats", () => {
  // Si lo hiciera, un cron caído quedaría tapado por un clic y el watchdog de
  // Telegram / health-crons dirían que todo está bien. Se llama al POST REAL.
  const correrBoton = async (modulo: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T20:00:00.000Z"));
    db = baseDoblada({
      cron_heartbeats: HEARTBEATS,
      switch_sync_log: [
        filaLog("fashion_shoes", "catalogo_tommy", CRON_TOMMY, "cron"),
        filaLog("active_shoes", "catalogo_reebok", CRON_TOMMY, "cron"),
        filaLog("vistana", "catalogo_calvin", CRON_TOMMY, "cron"),
        filaLog("joystep", "catalogo_joybees", CRON_TOMMY, "cron"),
      ],
    });
    const res = await syncNowPost(
      makeReq("/api/admin/sync-now", { method: "POST", role: "admin", body: { modulo } }) as NextRequest,
    );
    return { res, body: await res.json() };
  };

  it("catalogo-tommy: el sync corre y cron_heartbeats queda intacta", async () => {
    const { res, body } = await correrBoton("catalogo-tommy");
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(syncCatalogo).toHaveBeenCalledTimes(1); // el 200 no es de un camino vacío
    expect(db.escrituras.filter((e) => e.tabla === "cron_heartbeats")).toEqual([]);
  });

  it("las 4 marcas: ninguna toca cron_heartbeats", async () => {
    for (const modulo of ["catalogo-reebok", "catalogo-joybees", "catalogo-tommy", "catalogo-calvin"]) {
      const { res } = await correrBoton(modulo);
      expect(res.status, modulo).toBe(200);
      expect(db.escrituras.filter((e) => e.tabla === "cron_heartbeats"), modulo).toEqual([]);
    }
  });
});

// ─── 5. Paridad con el candado del sync manual ───────────────────────────────

describe("el (empresa_key, sync_type) de la marca es EL MISMO que usa el lock del sync manual", () => {
  // Dos definiciones del mismo par se separan con el tiempo: el reloj miraría
  // una corrida y el botón bloquearía otra.
  it("las 4 marcas coinciden con lockKeyDe('catalogo-<marca>')", () => {
    for (const marca of ["reebok", "joybees", "tommy", "calvin"]) {
      const cfg = getMarcaConfig(marca)!;
      const lock = lockKeyDe(`catalogo-${marca}` as never, null)!;
      expect(lock, marca).toEqual({ empresaKey: cfg.empresaKey, syncType: cfg.syncType });
    }
  });

  it("y con moduloConfig, que es de donde sale el sync_type que escribe la lib", () => {
    for (const marca of ["reebok", "joybees", "tommy", "calvin"]) {
      expect(moduloConfig(`catalogo-${marca}` as never).syncType, marca).toBe(
        getMarcaConfig(marca)!.syncType,
      );
    }
  });
});
