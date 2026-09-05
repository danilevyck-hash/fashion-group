/**
 * CANDADO — LA TOLERANCIA A LA DDL SE RETIRÓ, TERCERA TANDA (3-sep-2026).
 *
 * ─── QUÉ PASABA ─────────────────────────────────────────────────────────────
 * Cuando se estrenaba una tabla o una columna, el código se escribía para
 * funcionar ANTES de que la migración corriera: si Supabase contestaba "eso no
 * existe" (`PGRST205`, `42P01`, `42703`, `PGRST204`), el módulo degradaba a "no
 * hay datos", "todavía no instalado", "se guardó lo demás" — y la pantalla se
 * dibujaba vacía y tranquila. Correcto mientras la migración estuviera
 * pendiente: en esta casa los DDL los corre Daniel a mano.
 *
 * ─── POR QUÉ YA NO ──────────────────────────────────────────────────────────
 * Todas las migraciones de esta tanda corrieron (verificado contra producción
 * por PostgREST el 3-sep-2026, tabla por tabla y columna por columna). Ese
 * camino quedó como RAMA MUERTA que solo puede esconder errores reales: un
 * permiso denegado, un timeout o un cambio de esquema devuelven el mismo código
 * y se leen como "todavía no corrió el SQL".
 *
 * ─── QUÉ MIDE ESTE ARCHIVO ──────────────────────────────────────────────────
 * Un bloque por archivo tocado, con DOS direcciones:
 *   · CONTROL — con la tabla presente la respuesta es la MISMA de antes.
 *   · el PGRST205 (o el 42703/PGRST204 de columna) — ahora FALLA VISIBLE: 500
 *     con mensaje, error propagado, `ok:false`, o —donde la invariante del
 *     módulo manda seguir— por lo menos un `console.error`.
 *
 * Son tests de CONDUCTA contra los handlers reales con la base doblada. Un
 * barrido de texto no serviría: en este repo ya pasó que el candado se cumpliera
 * con el comentario que explica la regla.
 *
 * ⚠️ Los helpers puros NO se borraron: `esTablaAusente` (contable),
 * `esErrorSinColumnaCartera` + `CarteraNoDisponibleError` (cxc/cartera),
 * `esTablaRecordatoriosFaltante` (recordatorios/recordatorio) y
 * `columna-codigo-opcional` siguen definidos. Lo que se fue son sus USOS.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── La base doblada ──────────────────────────────────────────────────────────
/** "Esa tabla no existe", tal cual la manda PostgREST. */
const PGRST205 = {
  code: "PGRST205",
  message: "Could not find the table 'public.lo_que_sea' in the schema cache",
};
/** "Esa columna no existe" (select) y (insert/update), tal cual las manda. */
const COL_42703 = { code: "42703", message: "column tabla.columna does not exist" };
const COL_PGRST204 = { code: "PGRST204", message: "Could not find the 'columna' column of 'tabla' in the schema cache" };

type Res = { data: unknown; error: unknown; count?: number | null };

/** Qué contesta cada tabla. Se reescribe por test. */
let porTabla: Record<string, Res> = {};
/** Último payload escrito por tabla (insert/update/upsert). */
let escrito: Record<string, unknown> = {};
/** Cuántas veces se tocó cada tabla. */
let toques: Record<string, number> = {};

function cadena(tabla: string): Record<string, unknown> {
  const res = () => porTabla[tabla] ?? { data: [], error: null, count: 0 };
  const self: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "not", "order", "limit", "range", "delete"]) {
    self[m] = () => self;
  }
  for (const m of ["insert", "update", "upsert"]) {
    self[m] = (payload: unknown) => {
      escrito[tabla] = payload;
      return self;
    };
  }
  self.maybeSingle = () => Promise.resolve(res());
  self.single = () => Promise.resolve(res());
  self.then = (ok: (v: Res) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(res()).then(ok, rej);
  return self;
}

const fakeDb = {
  from: (tabla: string) => {
    toques[tabla] = (toques[tabla] ?? 0) + 1;
    return cadena(tabla);
  },
  rpc: async () => ({ data: [], error: null }),
};

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: fakeDb, HAS_SERVICE_ROLE: true }));
vi.mock("@/lib/reebok-supabase-server", () => ({ reebokServer: fakeDb }));
vi.mock("@/lib/joybees-supabase-server", () => ({ joybeesServer: fakeDb }));
vi.mock("@/lib/tommy-supabase-server", () => ({ tommyServer: fakeDb }));
vi.mock("@/lib/calvin-supabase-server", () => ({ calvinServer: fakeDb }));

const SESION = { role: "admin", userId: "u-1", userName: "Daniel", sessionToken: "t" };
vi.mock("@/lib/requireRole", () => ({ requireRole: () => SESION }));
vi.mock("@/lib/require-auth", () => ({ getSession: () => SESION }));
vi.mock("@/lib/session-cookie", () => ({ verifySession: () => SESION }));

// El cron de egresos: ni heartbeat ni Switch se tocan en este archivo.
const heartbeat = vi.fn();
vi.mock("@/lib/cron-telemetry", () => ({
  recordCronHeartbeat: (...a: unknown[]) => heartbeat(...a),
  SEED_TOLERANT_CRONS: [],
  CRONS_FAIL_CLOSED: [],
}));
vi.mock("@/lib/switch-api/alert-policy", () => ({ alertSwitchCronErrors: async () => {} }));
vi.mock("@/lib/switch-api/sync-log", () => ({
  createSwitchSyncLog: async () => "log-1",
  finishSwitchSyncLog: async () => {},
}));
/** 31 cuentas válidas: pasa `catalogoUtilizable` (mínimo 30). */
const NODOS_OK = Array.from({ length: 31 }, (_, i) => ({
  cuenta: `6.01.${String(i + 1).padStart(2, "0")}.00.00`,
  nombreCuenta: `CUENTA ${i + 1}`,
  nivel: 3,
}));
vi.mock("@/lib/switch-api/web-client", () => ({
  fetchCatalogoCuentas: async () => ({ nodos: NODOS_OK }),
}));
vi.mock("@/lib/rechazos-de-switch", () => ({ lineaDeNoLeidos: async () => null }));

const pedir = (url: string, init?: RequestInit) => new NextRequest(`https://fashiongr.com${url}`, init as never);

let errorLog: ReturnType<typeof vi.fn>;
beforeEach(() => {
  porTabla = {};
  escrito = {};
  toques = {};
  heartbeat.mockReset();
  errorLog = vi.fn();
  vi.spyOn(console, "error").mockImplementation(errorLog as (...a: unknown[]) => void);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
describe("api/admin/vendedor-mapping — fg_user_switch_vendedor (20260705100000)", () => {
  it("CONTROL: GET devuelve los mapeos", async () => {
    porTabla.fg_user_switch_vendedor = { data: [{ user_id: "u-1", empresa_key: "vistana", vendedor_id: 2, vendedor_nombre: "Rey" }], error: null };
    const { GET } = await import("@/app/api/admin/vendedor-mapping/route");
    const res = await GET(pedir("/api/admin/vendedor-mapping"));
    expect(res.status).toBe(200);
    expect((await res.json()).mappings).toHaveLength(1);
  });

  it("🔴 PGRST205 → 500 con el mensaje (antes: 503 'Falta correr el DDL')", async () => {
    porTabla.fg_user_switch_vendedor = { data: null, error: PGRST205 };
    const { GET, PUT } = await import("@/app/api/admin/vendedor-mapping/route");
    const g = await GET(pedir("/api/admin/vendedor-mapping"));
    expect(g.status).toBe(500);
    expect((await g.json()).error).toContain("schema cache");
    const p = await PUT(pedir("/api/admin/vendedor-mapping", { method: "PUT", body: JSON.stringify({ user_id: "u-1", empresa_key: "vistana", vendedor_id: 2 }) }));
    expect(p.status).toBe(500);
    expect((await p.json()).error).not.toMatch(/DDL|Falta correr/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("api/auth/perfil — fg_users.nombre_completo (20260709120000)", () => {
  it("CONTROL: saluda con el nombre completo", async () => {
    porTabla.fg_users = { data: { name: "daniel", nombre_completo: "Daniel Levy" }, error: null };
    const { GET } = await import("@/app/api/auth/perfil/route");
    const d = await (await GET(pedir("/api/auth/perfil"))).json();
    expect(d).toEqual({ userName: "daniel", displayName: "Daniel Levy" });
  });

  it("🔴 42703 → el saludo NO rompe (invariante) pero el error SE LOGUEA (antes: silencio)", async () => {
    porTabla.fg_users = { data: null, error: COL_42703 };
    const { GET } = await import("@/app/api/auth/perfil/route");
    const res = await GET(pedir("/api/auth/perfil"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userName: "Daniel", displayName: "Daniel" });
    expect(errorLog).toHaveBeenCalledWith("[auth/perfil] fg_users:", COL_42703.message);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("api/cheques/vendedores + lib/cheques-vendedores — cheque_vendedores (20260727160000)", () => {
  it("CONTROL: GET lista de la base con fuente 'db'", async () => {
    porTabla.cheque_vendedores = { data: [{ nombre: "Edwin" }, { nombre: "Rey" }], error: null };
    const { GET } = await import("@/app/api/cheques/vendedores/route");
    expect(await (await GET(pedir("/api/cheques/vendedores"))).json()).toEqual({ vendedores: ["Edwin", "Rey"], fuente: "db" });
  });

  it("🔴 PGRST205 → GET sigue con los de siempre (el vendedor es obligatorio) pero LOGUEA; POST es 500", async () => {
    porTabla.cheque_vendedores = { data: null, error: PGRST205 };
    const { GET, POST } = await import("@/app/api/cheques/vendedores/route");
    const g = await GET(pedir("/api/cheques/vendedores"));
    expect((await g.json()).fuente).toBe("local");
    expect(errorLog).toHaveBeenCalledWith("[api/cheques/vendedores] GET:", PGRST205.message);

    const p = await POST(pedir("/api/cheques/vendedores", { method: "POST", body: JSON.stringify({ nombre: "Julio" }) }));
    expect(p.status).toBe(500);
    expect((await p.json()).error).toBe("No se pudo agregar. Intenta de nuevo.");
  });

  it("el helper `tablaAusente` se fue de lib/cheques-vendedores (nadie más lo usaba)", async () => {
    const mod = await import("@/lib/cheques-vendedores");
    expect(mod).not.toHaveProperty("tablaAusente");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("lib/egresos/leer + api/gastos-contabilidad/egresos — egresos_varios (20260813120000)", () => {
  it("CONTROL: con las tablas presentes devuelve las 8 empresas e `instalado: true`", async () => {
    const { leerEgresosMes } = await import("@/lib/egresos/leer");
    const r = await leerEgresosMes("2026-07");
    expect(r.instalado).toBe(true);
    expect(r.empresas).toHaveLength(8);
    // 🔴 Invariante de Gastos: las 8 se ven, NUNCA se suman. No hay un total.
    expect(r).not.toHaveProperty("total");
  });

  it("🔴 lib: PGRST205 → LANZA (antes: `{ instalado: false, empresas: [] }`)", async () => {
    porTabla.egresos_varios = { data: null, error: PGRST205 };
    const { leerEgresosMes } = await import("@/lib/egresos/leer");
    await expect(leerEgresosMes("2026-07")).rejects.toThrow(/schema cache/);
  });

  it("🔴 ruta: PGRST205 → 500 con el mensaje humano (antes: 200 `instalado:false`)", async () => {
    porTabla.egresos_varios = { data: null, error: PGRST205 };
    const { GET } = await import("@/app/api/gastos-contabilidad/egresos/route");
    const res = await GET(pedir("/api/gastos-contabilidad/egresos?mes=2026-07"));
    expect(res.status).toBe(500);
    const d = await res.json();
    expect(d.error).toBe("No se pudo cargar la información. Intenta de nuevo en unos segundos.");
    expect(d).not.toHaveProperty("instalado");
    expect(errorLog).toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("lib/cuentas/leer — cuentas_contables (20260813180000)", () => {
  const USADAS = new Map([["vistana", ["6.01.01.00.00"]]]);

  it("CONTROL: resuelve los nombres del catálogo", async () => {
    porTabla.cuentas_contables = { data: [{ empresa_key: "vistana", cuenta: "6.01.01.00.00", nombre: "SALARIOS" }], error: null };
    const { leerNombresDeCuentas } = await import("@/lib/cuentas/leer");
    const n = await leerNombresDeCuentas(USADAS);
    expect(n.get("vistana")?.get("6.01.01.00.00")).toBe("SALARIOS");
  });

  it("🔴 PGRST205 → falla ABIERTO (invariante: un nombre no tumba una pantalla de plata) pero LOGUEA (antes: silencio)", async () => {
    porTabla.cuentas_contables = { data: null, error: PGRST205 };
    porTabla.mayor_lineas = { data: null, error: PGRST205 };
    const { leerNombresDeCuentas } = await import("@/lib/cuentas/leer");
    const n = await leerNombresDeCuentas(USADAS);
    expect(n.get("vistana")?.get("6.01.01.00.00")).toBeUndefined();
    const etiquetas = errorLog.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(etiquetas).toContain("[cuentas/leer] cuentas_contables:");
    expect(etiquetas).toContain("[cuentas/leer] mayor_lineas:");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("lib/switch-api/sync-cuentas-contables — la sonda `cuentasInstalado` se fue", () => {
  const session = { empresaKey: "vistana", baseUrl: "https://x", cookies: new Map() };

  it("CONTROL: con la tabla presente escribe las cuentas", async () => {
    const { syncCuentasContables } = await import("@/lib/switch-api/sync-cuentas-contables");
    const r = await syncCuentasContables(session);
    expect(r).toMatchObject({ ok: true, cuentas: 31 });
    expect(r).not.toHaveProperty("omitido");
  });

  it("🔴 PGRST205 en el upsert → `ok:false` con el mensaje (antes: `ok:true, omitido: 'la migración … no corrió'`)", async () => {
    porTabla.cuentas_contables = { data: null, error: PGRST205 };
    const { syncCuentasContables } = await import("@/lib/switch-api/sync-cuentas-contables");
    const r = await syncCuentasContables(session);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("schema cache");
    expect(r).not.toHaveProperty("omitido");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("lib/switch-api/sync-egresos-varios + cron — la sonda lanza ante CUALQUIER error", () => {
  it("CONTROL: con la tabla presente la sonda pasa en silencio", async () => {
    const { verificarBaseDeEgresos } = await import("@/lib/switch-api/sync-egresos-varios");
    await expect(verificarBaseDeEgresos()).resolves.toBeUndefined();
  });

  it("🔴 PGRST205 → LANZA (antes: `false` = 'todavía no instalado')", async () => {
    porTabla.egresos_varios = { data: null, error: PGRST205 };
    const { verificarBaseDeEgresos } = await import("@/lib/switch-api/sync-egresos-varios");
    await expect(verificarBaseDeEgresos()).rejects.toThrow(/schema cache/);
  });

  it("🔴 cron: PGRST205 → 500 sin heartbeat y SIN `omitido` (antes: 503 'la migración todavía no corrió')", async () => {
    porTabla.egresos_varios = { data: null, error: PGRST205 };
    process.env.CRON_SECRET = "s3cr3t";
    const { GET } = await import("@/app/api/cron/sync-egresos-varios/route");
    const res = await GET(pedir("/api/cron/sync-egresos-varios", { headers: { authorization: "Bearer s3cr3t" } }));
    expect(res.status).toBe(500);
    const d = await res.json();
    expect(d.ok).toBe(false);
    expect(d.error).toContain("no se pudo consultar la base");
    expect(d).not.toHaveProperty("omitido");
    expect(heartbeat).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("lib/catalogo/enviar-switch-route — *_orders y *_switch_envios (20260705120000 / 20260824160000)", () => {
  it("CONTROL: GET devuelve el último envío con su `documento`", async () => {
    const envio = { estado: "verificado", pedido_switch_id: 60, numero_interno: "16-000000060", error_detalle: null, documento: "pedido", created_at: "x", updated_at: "x" };
    porTabla.joybees_switch_envios = { data: envio, error: null };
    const { handleGetEnvio } = await import("@/lib/catalogo/enviar-switch-route");
    const res = await handleGetEnvio(pedir("/x"), "joybees", "11111111-1111-4111-8111-111111111111");
    expect(await res.json()).toEqual({ envio });
    // UNA sola lectura: sin el escalón "sin documento".
    expect(toques.joybees_switch_envios).toBe(1);
  });

  it("🔴 GET: PGRST205 → 500 (antes: `{ envio: null, ddlPendiente: true }`)", async () => {
    porTabla.joybees_switch_envios = { data: null, error: PGRST205 };
    const { handleGetEnvio } = await import("@/lib/catalogo/enviar-switch-route");
    const res = await handleGetEnvio(pedir("/x"), "joybees", "11111111-1111-4111-8111-111111111111");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Error interno" });
    expect(toques.joybees_switch_envios).toBe(1);
  });

  it("🔴 GET: un 42703 que nombra `documento` ya NO relee sin la columna: 500 y UNA lectura", async () => {
    porTabla.joybees_switch_envios = { data: null, error: { code: "42703", message: "column joybees_switch_envios.documento does not exist" } };
    const { handleGetEnvio } = await import("@/lib/catalogo/enviar-switch-route");
    const res = await handleGetEnvio(pedir("/x"), "joybees", "11111111-1111-4111-8111-111111111111");
    expect(res.status).toBe(500);
    expect(toques.joybees_switch_envios).toBe(1);
  });

  it("🔴 POST: un 42703 que nombra `cliente_switch_id` ya NO relee en 'modo legacy': 500 y UNA lectura", async () => {
    porTabla.reebok_orders = { data: null, error: { code: "42703", message: "column reebok_orders.cliente_switch_id does not exist" } };
    const { handlePostEnvio } = await import("@/lib/catalogo/enviar-switch-route");
    const res = await handlePostEnvio(pedir("/x", { method: "POST", body: "{}" }), "reebok", "11111111-1111-4111-8111-111111111111");
    expect(res.status).toBe(500);
    expect(toques.reebok_orders).toBe(1);
    expect(errorLog).toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("lib/cxc/anotaciones — columna `cartera` (20260813120000)", () => {
  // ⚠️ Los dos casos de este bloque se medían sobre los FAVORITOS. La estrella
  // se retiró el 4-sep-2026 (`cxc_favorites` sin lectores), así que la misma
  // regla se mide sobre las anotaciones que quedan vivas: las notas de contacto
  // y la bitácora.
  it("CONTROL: lee los contactos de ESA cartera", async () => {
    porTabla.cxc_client_overrides = { data: [{ nombre_normalized: "CITY MALL" }], error: null };
    const { leerOverrides } = await import("@/lib/cxc/anotaciones");
    expect((await leerOverrides("boston")).map((o) => o.nombre_normalized)).toEqual(["CITY MALL"]);
    expect(toques.cxc_client_overrides).toBe(1);
  });

  it("🔴 42703 en `cartera` → LANZA con el code, UNA sola consulta, NADA escrito (antes: el grupo reintentaba sin cartera)", async () => {
    porTabla.cxc_client_overrides = { data: null, error: COL_42703 };
    porTabla.cxc_contact_log = { data: null, error: COL_PGRST204 };
    const { leerOverrides, registrarContacto } = await import("@/lib/cxc/anotaciones");
    await expect(leerOverrides("grupo")).rejects.toMatchObject({ name: "ErrorAnotacion", code: "42703" });
    expect(toques.cxc_client_overrides).toBe(1);
    await expect(registrarContacto("grupo", "CITY MALL", "llamada")).rejects.toMatchObject({ name: "ErrorAnotacion", code: "PGRST204" });
    expect(toques.cxc_contact_log).toBe(1);
    // 🔴 Boston nunca en el CXC del grupo: lo que se intentó escribir llevaba la cartera.
    expect(escrito.cxc_contact_log).toMatchObject({ cartera: "grupo" });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("lib/recordatorios/server + api/recordatorios — recordatorios (20260824120000)", () => {
  const FILA = { id: "r-1", fecha: "2026-09-10", texto: "Pagar alquiler", cliente: null, cliente_codigo: null, repeticion: "mensual", creado_por: "daniel", created_at: "x" };

  it("CONTROL: lee y escribe, con `faltaMigracion: false`", async () => {
    porTabla.recordatorios = { data: [FILA], error: null, count: 1 };
    const { leerRecordatorios, crearRecordatorio } = await import("@/lib/recordatorios/server");
    const l = await leerRecordatorios();
    expect(l.faltaMigracion).toBe(false);
    expect(l.recordatorios[0].texto).toBe("Pagar alquiler");
    porTabla.recordatorios = { data: FILA, error: null };
    const c = await crearRecordatorio({ fecha: "2026-09-10", texto: "Pagar alquiler", cliente: "", clienteCodigo: null, repeticion: "mensual" }, "daniel");
    expect(c.ok).toBe(true);
  });

  it("🔴 lib: PGRST205 → la lectura LANZA y la escritura es `{ ok:false, error }` sin `faltaMigracion` (antes: vacío + `faltaMigracion:true`)", async () => {
    porTabla.recordatorios = { data: null, error: PGRST205, count: null };
    const { leerRecordatorios, crearRecordatorio, actualizarRecordatorio, borrarRecordatorio } = await import("@/lib/recordatorios/server");
    await expect(leerRecordatorios()).rejects.toThrow(/schema cache/);
    const nuevo = { fecha: "2026-09-10", texto: "x", cliente: "", clienteCodigo: null, repeticion: "una_vez" as const };
    for (const r of [await crearRecordatorio(nuevo, "d"), await actualizarRecordatorio("id", nuevo), await borrarRecordatorio("id")]) {
      expect(r.ok).toBe(false);
      expect(r).not.toHaveProperty("faltaMigracion");
      expect((r as { error: string }).error).toContain("schema cache");
    }
  });

  it("🔴 GET: PGRST205 → 500 (antes: 200 vacío con aviso en ámbar)", async () => {
    porTabla.recordatorios = { data: null, error: PGRST205, count: null };
    const { GET } = await import("@/app/api/recordatorios/route");
    const res = await GET(pedir("/api/recordatorios"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Error interno");
  });

  it("🔴 POST: PGRST205 → 500 'No se pudo guardar' (antes: 503 con el nombre del SQL)", async () => {
    porTabla.recordatorios = { data: null, error: PGRST205 };
    const { POST } = await import("@/app/api/recordatorios/route");
    const res = await POST(pedir("/api/recordatorios", { method: "POST", body: JSON.stringify({ fecha: "2026-09-10", texto: "x", repeticion: "una_vez" }) }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("No se pudo guardar. Intenta de nuevo.");
  });

  it("🔴 PUT/DELETE [id]: PGRST205 → 400 con el mensaje de la base (antes: 503 con el nombre del SQL)", async () => {
    porTabla.recordatorios = { data: null, error: PGRST205 };
    const { PUT, DELETE } = await import("@/app/api/recordatorios/[id]/route");
    const id = "11111111-1111-4111-8111-111111111111";
    const p = await PUT(pedir(`/api/recordatorios/${id}`, { method: "PUT", body: JSON.stringify({ fecha: "2026-09-10", texto: "x", repeticion: "una_vez" }) }), { params: { id } });
    expect(p.status).toBe(400);
    expect((await p.json()).error).toContain("schema cache");
    const d = await DELETE(pedir(`/api/recordatorios/${id}`, { method: "DELETE" }), { params: { id } });
    expect(d.status).toBe(400);
    expect((await d.json()).error).not.toMatch(/\.sql/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("lib/multifashion/productos-lectura — `esFuncionAusente` estrecho DE VERDAD", () => {
  it("CONTROL: reconoce 'no existe la función' por código y por texto", async () => {
    const { esFuncionAusente } = await import("@/lib/multifashion/productos-lectura");
    expect(esFuncionAusente({ code: "PGRST202", message: "Could not find the function public.f in the schema cache" })).toBe(true);
    expect(esFuncionAusente({ code: "42883", message: "function public.f(integer) does not exist" })).toBe(true);
    expect(esFuncionAusente({ message: "function public.f(integer) does not exist" })).toBe(true);
    expect(esFuncionAusente({ message: "Could not find the function public.f" })).toBe(true);
  });

  it("🔴 un 'does not exist' de TABLA o de COLUMNA ya NO es 'no existe la función' (antes caía al camino paginado)", async () => {
    const { esFuncionAusente } = await import("@/lib/multifashion/productos-lectura");
    expect(esFuncionAusente({ code: "42P01", message: 'relation "switch_articulo_info" does not exist' })).toBe(false);
    expect(esFuncionAusente({ message: 'relation "multifashion_articulo_diario" does not exist' })).toBe(false);
    expect(esFuncionAusente({ code: "42703", message: "column switch_facturas.marca does not exist" })).toBe(false);
    expect(esFuncionAusente(PGRST205)).toBe(false);
  });
});
