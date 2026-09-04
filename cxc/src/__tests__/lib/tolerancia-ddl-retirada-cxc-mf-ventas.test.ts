/**
 * CANDADO — LA TOLERANCIA A LA DDL SE RETIRÓ (3-sep-2026).
 *
 * ─── QUÉ PASABA ─────────────────────────────────────────────────────────────
 * Cuando se estrenaba una tabla, el código se escribía para funcionar ANTES de
 * que la migración corriera: si Supabase contestaba "esa tabla no existe"
 * (`PGRST205`, `42P01`, `42703`), el módulo degradaba a "no hay datos" y la
 * pantalla se dibujaba vacía y tranquila. Era CORRECTO mientras la migración
 * estuviera pendiente — en esta casa los DDL los corre Daniel a mano y varios
 * se quedaron pendientes por semanas.
 *
 * ─── POR QUÉ YA NO ──────────────────────────────────────────────────────────
 * Las seis migraciones de esta tanda ya corrieron (verificado contra producción
 * por PostgREST el 3-sep-2026). Ese camino quedó como RAMA MUERTA que solo
 * puede esconder errores reales: un permiso denegado, un timeout o un cambio de
 * esquema que devuelva el mismo código se leen como "todavía no está instalado"
 * y la pantalla dice "sin datos" sin que nadie se entere. Es exactamente el
 * silencio que esta casa ya pagó (`docs/postmortems/crons-alertas.md`).
 *
 * ─── QUÉ MIDE ESTE ARCHIVO ──────────────────────────────────────────────────
 * Para cada archivo tocado, DOS tests que son las dos direcciones:
 *   · CONTROL — con la tabla presente la respuesta es la MISMA de antes.
 *   · el PGRST205 — ahora FALLA VISIBLE (500 con mensaje, o error propagado),
 *     nunca vacío, nunca `disponible:false`, nunca un 503 "todavía no instalado".
 *
 * Son tests de CONDUCTA: llaman a los handlers reales con la base doblada y
 * miran el JSON. Un barrido de texto no serviría — en este repo ya pasó tres
 * veces que el candado se cumpliera con el comentario que explica la regla.
 *
 * ⚠️ `esTablaAusente` (`src/lib/contable/tabla-ausente.ts`) NO se borró: lo
 * siguen usando egresos, cuentas y los syncs, que son de otra tanda.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── La base doblada ──────────────────────────────────────────────────────────
/** "Esa tabla no existe", tal cual la manda PostgREST cuando el schema cache no
 *  la conoce. Es el error que ANTES se tragaba cada uno de estos módulos. */
const PGRST205 = {
  code: "PGRST205",
  message: "Could not find the table 'public.lo_que_sea' in the schema cache",
};

type Res = { data: unknown; error: unknown; count?: number };

/** Qué contesta cada tabla. Se reescribe por test. */
let porTabla: Record<string, Res> = {};
/** Qué contesta la RPC (inventario valorizado). */
let respuestaRpc: Res = { data: [], error: null };
/** Las tablas que se tocaron, para poder afirmar que NO se escribió nada. */
const tocadas: string[] = [];

function cadena(res: Res): Record<string, unknown> {
  const self: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "not", "order", "limit", "insert", "update", "delete", "range"]) {
    self[m] = () => self;
  }
  self.maybeSingle = () => Promise.resolve(res);
  self.single = () => Promise.resolve(res);
  self.upsert = () => Promise.resolve(res);
  self.then = (ok: (v: Res) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(res).then(ok, rej);
  return self;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (tabla: string) => {
      tocadas.push(tabla);
      return cadena(porTabla[tabla] ?? { data: [], error: null, count: 0 });
    },
    rpc: async () => respuestaRpc,
  },
  HAS_SERVICE_ROLE: true,
}));

vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "admin", userId: "u-1", userName: "Daniel" }),
}));

// El PDF y Switch no son lo que se mide acá; se doblan para que el test sea
// rápido y no toque red.
vi.mock("@/lib/pdf-estado-cuenta", () => ({
  buildEstadoCuentaPDF: () => ({ doc: { output: () => new ArrayBuffer(8) } }),
}));
vi.mock("@/lib/cxc/estado-cuenta-data", () => ({
  fetchEstadoCuentaData: async () => ({ codigo: "D-25", empresas: [], generadoEn: "2026-09-03" }),
}));
vi.mock("@/lib/switch-api/client", () => ({
  createSwitchClient: () => ({
    getDiarioVentas: async () => ({ diarioDeVentas: { granTotal: 1234.56 } }),
    logout: async () => {},
  }),
}));

const pedir = (url: string) => new NextRequest(`https://fashiongr.com${url}`);

beforeEach(() => {
  porTabla = {};
  respuestaRpc = { data: [], error: null };
  tocadas.length = 0;
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. /api/cxc/enviar-email — la firma, el cc y el reply_to salen de `fg_users`
//    (columnas `nombre_completo` y `email`, migración 20260709120000).
// ═════════════════════════════════════════════════════════════════════════════
describe("1. /api/cxc/enviar-email — el 42703 de fg_users ya no se traga", () => {
  const URL = "/api/cxc/enviar-email?codigo=D-25&empresa=todas&nombre=CITY+MALL";

  it("CONTROL: con las columnas presentes contesta 200 y firma con el nombre completo", async () => {
    porTabla["fg_users"] = {
      data: { name: "daniel", associated_company: null, nombre_completo: "Daniel Levy", email: "daniel@fashiongr.com" },
      error: null,
    };
    const { GET } = await import("@/app/api/cxc/enviar-email/route");
    const res = await GET(pedir(URL));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { firma: string; remitenteEmail: string | null };
    expect(body.firma).toContain("Daniel Levy");
    expect(body.remitenteEmail).toBe("daniel@fashiongr.com");
  });

  it("🔴 con 42703 ('no existe la columna') es 500 — antes releía sin las columnas y mandaba sin firma ni copia", async () => {
    porTabla["fg_users"] = {
      data: null,
      error: { code: "42703", message: "column fg_users.nombre_completo does not exist" },
    };
    const { GET } = await import("@/app/api/cxc/enviar-email/route");
    const res = await GET(pedir(URL));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string; firma?: string };
    expect(body.error).toBeTruthy();
    expect(body.firma).toBeUndefined();
  });

  it("🔴 y el PGRST205 tampoco: ningún error de la base sale como una firma genérica", async () => {
    porTabla["fg_users"] = { data: null, error: PGRST205 };
    const { GET } = await import("@/app/api/cxc/enviar-email/route");
    const res = await GET(pedir(URL));
    expect(res.status).toBe(500);
  });

  it("🔴 el POST corta ANTES de mandar el correo: un error de la base no manda un estado de cuenta sin firma", async () => {
    // Sin la llave, el POST devolvería 500 por otra razón y el test pasaría por
    // el motivo equivocado (medido: con la mutación puesta seguía verde).
    process.env.RESEND_API_KEY = "re_test";
    porTabla["fg_users"] = { data: null, error: PGRST205 };
    const { POST } = await import("@/app/api/cxc/enviar-email/route");
    const res = await POST(
      new NextRequest("https://fashiongr.com/api/cxc/enviar-email", {
        method: "POST",
        body: JSON.stringify({
          codigo: "D-25",
          empresa: "todas",
          destinatario: "cliente@ejemplo.com",
          asunto: "Estado de cuenta",
        }),
      }),
    );
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toMatch(/No se pudo enviar el correo/);
    // Nada de bitácora: si no salió el correo, no hay nada que anotar.
    expect(tocadas).not.toContain("cxc_emails_enviados");
    delete process.env.RESEND_API_KEY;
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. /api/multifashion/caja — el caché existe desde 20260704210000.
// ═════════════════════════════════════════════════════════════════════════════
describe("2. /api/multifashion/caja — un caché ilegible ya no pasa de largo", () => {
  const URL = "/api/multifashion/caja?fecha=2026-01-15";

  it("CONTROL: sin fila cacheada va a Switch y contesta 200, igual que siempre", async () => {
    porTabla["multifashion_caja_diaria"] = { data: null, error: null };
    const { GET } = await import("@/app/api/multifashion/caja/route");
    const res = await GET(pedir(URL));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { caja: { granTotal: number }; cached: boolean };
    expect(body.caja.granTotal).toBe(1234.56);
    expect(body.cached).toBe(false);
  });

  it("CONTROL: con fila cacheada de un día cerrado la sirve sin tocar Switch", async () => {
    porTabla["multifashion_caja_diaria"] = {
      data: { fecha: "2026-01-15", data: { granTotal: 999 }, synced_at: "2026-01-16T00:00:00Z" },
      error: null,
    };
    const { GET } = await import("@/app/api/multifashion/caja/route");
    const res = await GET(pedir(URL));
    const body = (await res.json()) as { caja: { granTotal: number }; cached: boolean };
    expect(body.cached).toBe(true);
    expect(body.caja.granTotal).toBe(999);
  });

  it("🔴 con PGRST205 es 500 con mensaje humano — antes seguía en 'modo directo' y cada vista era un login de Switch", async () => {
    porTabla["multifashion_caja_diaria"] = { data: null, error: PGRST205 };
    const { GET } = await import("@/app/api/multifashion/caja/route");
    const res = await GET(pedir(URL));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; caja?: unknown };
    expect(body.error).toMatch(/Intenta de nuevo/);
    expect(body.caja).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. /api/multifashion/metas — las tablas existen desde 20260813170000.
//    Se prueba por el POST: en el GET, `leerMetas()` (en `metas-lectura.ts`,
//    fuera de esta tanda) todavía devuelve `null` cuando la tabla falta.
// ═════════════════════════════════════════════════════════════════════════════
describe("3. /api/multifashion/metas — 'todavía no instalado' ya no tapa un error", () => {
  const CUERPO = {
    nombre: "Viaje playa",
    desde: "2026-09-01",
    hasta: "2026-12-31",
    objetivo: 250000,
    tipo: "grupal",
    participantes: [],
  };
  const post = async (body: unknown) => {
    const { POST } = await import("@/app/api/multifashion/metas/route");
    return POST(
      new NextRequest("https://fashiongr.com/api/multifashion/metas", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  };

  it("CONTROL: con las tablas presentes guarda y contesta ok", async () => {
    porTabla["multifashion_metas"] = { data: { id: "meta-1" }, error: null };
    const res = await post(CUERPO);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "meta-1" });
  });

  it("🔴 con PGRST205 es 500 — antes era un 503 'pídele a Daniel que corra el SQL' que YA está corrido", async () => {
    porTabla["multifashion_metas"] = { data: null, error: PGRST205 };
    const res = await post(CUERPO);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string; instalado?: boolean; aviso?: string };
    expect(body.error).toBeTruthy();
    expect(body.instalado).toBeUndefined();
    expect(body.aviso).toBeUndefined();
  });

  it("🔴 el DELETE tampoco: retirar una meta no puede fallar en silencio con cara de 'no instalado'", async () => {
    porTabla["multifashion_metas"] = { data: null, error: PGRST205 };
    const { DELETE } = await import("@/app/api/multifashion/metas/route");
    const res = await DELETE(
      new NextRequest("https://fashiongr.com/api/multifashion/metas", {
        method: "DELETE",
        body: JSON.stringify({ id: "meta-1" }),
      }),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).instalado).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. El centinela de tipos — las vistas existen desde 20260826140000.
//    🔑 Lo que NO cambia: NUNCA lanza. Un centinela que puede tumbar el sync
//    que vigila es peor que no tenerlo. Lo que cambia es QUÉ dice.
// ═════════════════════════════════════════════════════════════════════════════
describe("4. centinela de tipos — el motivo dice el error de verdad", () => {
  it("CONTROL: con las vistas vacías mide bien y no avisa de nada", async () => {
    const { medirTiposSinClasificar } = await import("@/lib/ventas/centinela-tipos");
    const m = await medirTiposSinClasificar();
    expect(m.ok).toBe(true);
    if (m.ok) expect(m.hallazgos).toEqual([]);
  });

  it("🔴 con PGRST205 el motivo lleva el error CRUDO, no 'migración pendiente'", async () => {
    const { medirTiposSinClasificar, VISTA_VENTAS } = await import("@/lib/ventas/centinela-tipos");
    porTabla[VISTA_VENTAS] = { data: null, error: PGRST205 };
    const m = await medirTiposSinClasificar();
    expect(m.ok).toBe(false);
    if (!m.ok) {
      expect(m.motivo).toContain("schema cache");
      expect(m.motivo).not.toMatch(/migración pendiente|todavía no existe/);
    }
  });

  it("🔴 y sigue sin lanzar: el sync que vigila no se cae por esto", async () => {
    const { correrCentinelaTipos, VISTA_VENTAS } = await import("@/lib/ventas/centinela-tipos");
    porTabla[VISTA_VENTAS] = { data: null, error: PGRST205 };
    await expect(correrCentinelaTipos(["vistana"])).resolves.toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Inventario valorizado — `switch_articulo_info` y la RPC existen
//    (20260813190000). 🔴 Y NUNCA UN $0: o trae los números, o revienta.
// ═════════════════════════════════════════════════════════════════════════════
describe("5. inventario valorizado — 'no instalado' ya no apaga la tarjeta para siempre", () => {
  const FILA_RPC = {
    e: "vistana", art: 8254, stk: 1548, u: 50455, c: 625033.86, p: 890509.5,
    sca: 2, scu: 60, neg: -230, m: "2026-09-03T04:30:05.732+00:00",
  };

  it("CONTROL: con la RPC viva devuelve los números y `fuente: rpc`", async () => {
    respuestaRpc = { data: [FILA_RPC], error: null };
    const { leerInventarioValorizado } = await import("@/lib/inventario/leer");
    const inv = await leerInventarioValorizado(Date.parse("2026-09-03T12:00:00Z"));
    expect(inv.fuente).toBe("rpc");
    expect(inv.porEmpresa.find((e) => e.key === "vistana")?.costo).toBe(625033.86);
    expect(inv.disponible).toBe(true);
  });

  it("🔴 con PGRST205 REVIENTA — antes devolvía `disponible:false` y la tarjeta decía 'no se pudo medir' para siempre", async () => {
    respuestaRpc = { data: null, error: PGRST205 };
    const { leerInventarioValorizado } = await import("@/lib/inventario/leer");
    await expect(leerInventarioValorizado(Date.parse("2026-09-03T12:00:00Z"))).rejects.toThrow();
  });

  // ⚠️ HALLAZGO de esta tanda, anotado acá para que no se pierda: un `42P01`
  // en la RPC NO llega a la línea de arriba. `esFuncionAusente`
  // (`src/lib/multifashion/productos-lectura.ts`, FUERA de esta tanda) matchea
  // cualquier mensaje que diga "does not exist", así que un "no existe la
  // TABLA" se lee como "no existe la FUNCIÓN" y cae al camino paginado. No se
  // tocó porque ese helper es de otro módulo; lo que SÍ queda cerrado es que
  // ahí tampoco hay un `disponible:false` esperando: el paginado revienta.
  it("🔴 el camino paginado tampoco devuelve un inventario vacío: revienta", async () => {
    respuestaRpc = { data: null, error: { code: "42P01", message: 'relation "switch_articulo_info" does not exist' } };
    porTabla["switch_articulo_info"] = { data: null, error: PGRST205 };
    const { leerInventarioValorizado } = await import("@/lib/inventario/leer");
    await expect(leerInventarioValorizado(Date.parse("2026-09-03T12:00:00Z"))).rejects.toThrow();
  });
});
