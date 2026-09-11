// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — Ventas › Clientes: el desplegable de empresa, «Nuevo», el período
// que se SIRVE y la frescura (11-sep-2026). Sin DOM.
//
// Cuatro decisiones de Daniel con el mockup del 11-sep-2026:
//
//  🔴 «Todas las empresas», no «Fashion Group». Depende de LA LISTA, no de la
//     pantalla: si todas son del grupo, «Todas las empresas»; si la lista
//     mezcla grupo y no-grupo (Comisiones, con Multifashion), «Fashion Group»
//     (Daniel, 6-sep-2026: *«en todas pon fashion group para no confundir»*).
//     La regla vive en `lib/ventas/rotulo-empresas.ts` y acá se prueba en
//     las dos direcciones.
//
//  🔴 «Nuevo» en vez de «+0 %». La vista devuelve `delta_vs_2025 = NULL`
//     cuando no hay con qué compararse y `queries.ts` lo convertía en `0`:
//     34 de 116 clientes se leían estancados. Ahora `delta` viaja en `null`.
//
//  🔴 La columna dice el período que el servidor SIRVIÓ. Se pide «Últimos 12
//     meses», pero si la vista todavía no trae `compras_12m` (migración
//     `20261121120000` pendiente) o el año está cerrado, se sirve el AÑO y la
//     respuesta lo dice (`ventana: null`). Nunca se rotula lo que no se sumó.
//
//  🔴 La vista se refresca con cada sync de facturas y deja una MARCA
//     (`clientes-vw-refrescada`, en `HEARTBEATS_NO_CRON`) que la pantalla
//     convierte en «datos de hoy 10:00 a.m.», en hora de PANAMÁ.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Las filas que la vista «devuelve». Se cambian por test. */
let filasVista: Record<string, unknown>[] = [];
/** Cuándo se refrescó la vista (fila de cron_heartbeats), o null. */
let marcaFrescura: string | null = null;

vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    rpc: async () => ({ data: [], error: null }),
    from: (tabla: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "order", "limit", "eq", "in", "gte", "lte", "range"]) q[m] = () => q;
      q.maybeSingle = async () =>
        tabla === "cron_heartbeats"
          ? { data: marcaFrescura ? { last_success_at: marcaFrescura } : null, error: null }
          : { data: null, error: null };
      q.then = (res: (v: unknown) => unknown) => res({ data: [], error: null, count: 0 });
      return q;
    },
  },
}));

vi.mock("@/lib/supabase-paginado", () => ({
  leerTodoPaginado: async () => filasVista,
}));

import { B2B_EMPRESA_KEYS, nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { EMPRESAS_COMISIONAN } from "@/lib/comisiones/empresas";
import {
  ROTULO_FASHION_GROUP, ROTULO_TODAS_LAS_EMPRESAS, VALOR_TODAS,
  opcionesEmpresaClientes, rotuloDeTodas,
} from "@/lib/ventas/rotulo-empresas";
import { MODOS_CLIENTES, modoHeredado } from "@/lib/ventas/pestanas";
import { rotuloCompras, rotuloVs } from "@/lib/ventas/periodo";
import { textoFrescura } from "@/lib/ventas/frescura";
import { HEARTBEATS_NO_CRON } from "@/lib/cron-telemetry";
import { HEARTBEAT_VISTA_CLIENTES } from "@/lib/ventas/refrescar-vista-clientes";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const plano = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");

// Un año cerrado va por la RPC `clientes_anio`; el en curso es el de Panamá.
const ANIO_EN_CURSO = 2026;

const filaVista = (over: Record<string, unknown> = {}) => ({
  cliente_id: 7,
  cliente_nombre: "City Mall Paso Canoa",
  cliente_codigo: "D-25",
  empresa: "vistana",
  compras_ytd: "1000",
  compras_anio_anterior: "800",
  delta_vs_2025: "0.25",
  ultima_compra: "2026-09-07",
  whatsapp: null,
  ...over,
});

beforeEach(() => {
  filasVista = [];
  marcaFrescura = null;
});

// ─────────────────────────────────────────────────────────────────────────────
describe("a · cómo se llama «todas» depende de la lista, no de la pantalla", () => {
  it("🔴 solo las 6 del grupo → «Todas las empresas» (el caso de Ventas › Clientes)", () => {
    expect(rotuloDeTodas(B2B_EMPRESA_KEYS)).toBe(ROTULO_TODAS_LAS_EMPRESAS);
    expect(ROTULO_TODAS_LAS_EMPRESAS).toBe("Todas las empresas");
  });

  it("🔴 el grupo MÁS Multifashion → «Fashion Group» (el caso de Comisiones)", () => {
    expect(rotuloDeTodas([...EMPRESAS_COMISIONAN, "american_classic"])).toBe(ROTULO_FASHION_GROUP);
    expect(ROTULO_FASHION_GROUP).toBe("Fashion Group");
  });

  it("CONTROL — las dos frases no son la misma, y una lista vacía no nombra ningún grupo", () => {
    expect(ROTULO_TODAS_LAS_EMPRESAS).not.toBe(ROTULO_FASHION_GROUP);
    expect(rotuloDeTodas([])).toBe(ROTULO_TODAS_LAS_EMPRESAS);
  });

  it("las opciones del desplegable: «Todas las empresas» + las 6 con nombre corto, sin Boston ni Multifashion", () => {
    const opciones = opcionesEmpresaClientes();
    expect(opciones[0]).toEqual({ valor: VALOR_TODAS, etiqueta: ROTULO_TODAS_LAS_EMPRESAS });
    expect(opciones.slice(1)).toEqual(
      B2B_EMPRESA_KEYS.map((k) => ({ valor: k, etiqueta: nombreCortoEmpresa(k) })),
    );
    const valores = opciones.map((o) => o.valor);
    expect(valores).not.toContain("confecciones_boston");
    expect(valores).not.toContain("american_classic");
    // 🔴 Se DERIVA: ninguna de las seis está escrita a mano en el módulo.
    const modulo = plano(leer("src/lib/ventas/rotulo-empresas.ts"));
    for (const k of B2B_EMPRESA_KEYS) expect(modulo).not.toContain(`"${k}"`);
    expect(modulo).toContain("B2B_EMPRESA_KEYS");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("d · la columna rotula lo que se SIRVIÓ", () => {
  it("un año → «Compras · Año 2026» y «vs 2025»", () => {
    expect(rotuloCompras({ tipo: "anio", anio: 2026 })).toBe("Compras · Año 2026");
    expect(rotuloVs({ tipo: "anio", anio: 2026 }, 2025)).toBe("vs 2025");
  });

  it("una ventana → «Compras · Últimos 12 meses» y «vs año anterior»", () => {
    expect(rotuloCompras({ tipo: "ultimos", n: 12 })).toBe("Compras · Últimos 12 meses");
    expect(rotuloVs({ tipo: "ultimos", n: 12 }, 2025)).toBe("vs año anterior");
    expect(rotuloCompras({ tipo: "ultimos", n: 6 })).toBe("Compras · Últimos 6 meses");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("e · la frescura, en hora de Panamá", () => {
  it("del mismo día: «datos de hoy 10:00 a.m.» (15:00 UTC = 10:00 a.m. en Panamá)", () => {
    expect(textoFrescura("2026-09-11T15:00:00Z", new Date("2026-09-11T17:00:00Z"))).toBe("datos de hoy 10:00 a.m.");
  });

  it("de otro día: «datos del 10 sep, 6:15 p.m.»", () => {
    expect(textoFrescura("2026-09-10T23:15:00Z", new Date("2026-09-11T17:00:00Z"))).toBe("datos del 10 sep, 6:15 p.m.");
  });

  it("el borde: las 11 de la noche de Panamá ya es «mañana» en UTC, y sigue siendo hoy", () => {
    // 2026-09-12T03:30Z = 10:30 p.m. del 11 en Panamá.
    expect(textoFrescura("2026-09-12T03:30:00Z", new Date("2026-09-12T04:00:00Z"))).toBe("datos de hoy 10:30 p.m.");
  });

  it("sin marca, o con basura, no se dice nada — mejor callar que inventar una hora", () => {
    expect(textoFrescura(null)).toBeNull();
    expect(textoFrescura(undefined)).toBeNull();
    expect(textoFrescura("")).toBeNull();
    expect(textoFrescura("no-es-fecha")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("f · dos modos, y «margen» hereda a «utilidad»", () => {
  it("MODOS_CLIENTES son exactamente Ventas y Utilidad", () => {
    expect([...MODOS_CLIENTES]).toEqual(["ventas", "utilidad"]);
  });

  it("un `?modo=margen` guardado llega a Utilidad; los demás no se tocan", () => {
    expect(modoHeredado("margen")).toBe("utilidad");
    expect(modoHeredado("ventas")).toBeNull();
    expect(modoHeredado("utilidad")).toBeNull();
    expect(modoHeredado("cualquier-cosa")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("g · fetchClientes sirve la ventana SOLO si la vista la trae", () => {
  async function clientes(ventana: 6 | 12 | null, year = ANIO_EN_CURSO) {
    const { fetchClientes } = await import("@/lib/ventas/queries");
    return fetchClientes({ year, empresaKey: "vistana", ventana });
  }

  it("🔴 filas SIN `compras_12m` y ventana 12 pedida → se sirve el AÑO y se dice", async () => {
    filasVista = [filaVista()];
    const r = await clientes(12);
    expect(r.ventana).toBeNull();
    expect(r.ventanasDisponibles).toEqual([]);
    expect(r.rows[0].ytd).toBe(1000);
    expect(r.rows[0].prev).toBe(800);
    expect(r.rows[0].delta).toBeCloseTo(0.25);
  });

  it("🔴 filas CON las columnas → se sirve la ventana, con SU suma y SU comparativo", async () => {
    filasVista = [filaVista({
      compras_12m: "3000", compras_12m_prev: "2000",
      compras_6m: "1500", compras_6m_prev: "500",
    })];
    const r = await clientes(12);
    expect(r.ventana).toBe(12);
    expect(r.ventanasDisponibles).toEqual([12, 6]);
    expect(r.rows[0].ytd).toBe(3000);
    expect(r.rows[0].prev).toBe(2000);
    // La MISMA regla que el SQL de la vista: (actual − prev) / prev.
    expect(r.rows[0].delta).toBeCloseTo(0.5);

    const r6 = await clientes(6);
    expect(r6.ventana).toBe(6);
    expect(r6.rows[0].ytd).toBe(1500);
    expect(r6.rows[0].delta).toBeCloseTo(2);
  });

  it("sin ventana pedida, aunque la vista la traiga, se sirve el año — y la columna del año no se mueve", async () => {
    filasVista = [filaVista({ compras_12m: "3000", compras_12m_prev: "2000", compras_6m: "1", compras_6m_prev: "1" })];
    const r = await clientes(null);
    expect(r.ventana).toBeNull();
    expect(r.ventanasDisponibles).toEqual([12, 6]);
    expect(r.rows[0].ytd).toBe(1000);
  });

  it("🔴 `delta_vs_2025: null` llega como `null` — NUNCA como 0 («Nuevo», no «+0 %»)", async () => {
    filasVista = [filaVista({ compras_anio_anterior: "0", delta_vs_2025: null })];
    const r = await clientes(null);
    expect(r.rows[0].delta).toBeNull();
    expect(r.rows[0].delta).not.toBe(0);
  });

  it("con la ventana, un prev en cero también es «Nuevo» (prev > 0 es la regla)", async () => {
    filasVista = [filaVista({ compras_12m: "3000", compras_12m_prev: "0", compras_6m: "0", compras_6m_prev: "0" })];
    const r = await clientes(12);
    expect(r.rows[0].delta).toBeNull();
  });

  it("la marca de frescura viaja en la respuesta cuando existe, y en null cuando no", async () => {
    filasVista = [filaVista()];
    marcaFrescura = "2026-09-11T15:00:00Z";
    expect((await clientes(null)).actualizadoAt).toBe("2026-09-11T15:00:00Z");
    marcaFrescura = null;
    expect((await clientes(null)).actualizadoAt).toBeNull();
  });

  it("el `?? 0` que convertía el null en «+0 %» no volvió a queries.ts", () => {
    const src = plano(leer("src/lib/ventas/queries.ts"));
    expect(src).not.toMatch(/delta_vs_2025 == null \? 0/);
    expect(src).toMatch(/delta_vs_2025 == null \? null/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("h · la vista se refresca con cada sync y deja su marca", () => {
  it("la marca está en HEARTBEATS_NO_CRON — nadie la programa, no se vigila, no es huérfana", () => {
    expect(HEARTBEAT_VISTA_CLIENTES).toBe("clientes-vw-refrescada");
    expect(HEARTBEATS_NO_CRON as readonly string[]).toContain(HEARTBEAT_VISTA_CLIENTES);
  });

  it("🔴 los TRES caminos que refrescan la vista pasan por el mismo módulo", () => {
    const sync = plano(leer("src/app/api/cron/switch-sync/route.ts"));
    expect(sync).toContain("refrescarVistaClientes()");
    // Solo en las corridas que traen facturas, y de alguna de las 6 del grupo.
    expect(sync).toMatch(/tipo === "facturas" \|\| tipo === "all"/);
    expect(sync).toContain("esEmpresaDelGrupo(r.empresaKey)");

    const boton = plano(leer("src/lib/refresh-vistas.ts"));
    expect(boton).toContain("marcarVistaClientesRefrescada()");
    expect(boton).toContain("RPC_REFRESH_VISTA_CLIENTES");

    const cron = plano(leer("src/app/api/cron/refresh-clientes-views/route.ts"));
    expect(cron).toContain("marcarVistaClientesRefrescada()");
    expect(cron).toContain("RPC_REFRESH_VISTA_CLIENTES");
  });

  it("la marca se deja DESPUÉS de que el refresh confirmó, nunca antes", () => {
    const modulo = plano(leer("src/lib/ventas/refrescar-vista-clientes.ts"));
    const iRpc = modulo.indexOf("supabaseServer.rpc(RPC_REFRESH_VISTA_CLIENTES)");
    const iError = modulo.indexOf("if (error) return { ok: false", iRpc);
    const iMarca = modulo.indexOf("await marcarVistaClientesRefrescada()", iError);
    expect(iRpc).toBeGreaterThan(-1);
    expect(iError).toBeGreaterThan(iRpc);
    expect(iMarca).toBeGreaterThan(iError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("i · la migración de las ventanas es ADITIVA", () => {
  const sql = leer("supabase/migrations/20261121120000_clientes_vw_ventanas_6_y_12.sql");
  const ejecutable = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  const mv = ejecutable.split("CREATE MATERIALIZED VIEW clientes_empresa_12m_vw AS")[1]?.split("CREATE UNIQUE INDEX")[0] ?? "";
  const agregada = ejecutable.split("CREATE VIEW clientes_agregado_12m_vw AS")[1] ?? "";

  it("la MV define las cuatro columnas nuevas", () => {
    for (const col of ["compras_12m", "compras_12m_prev", "compras_6m", "compras_6m_prev"]) {
      expect(mv).toMatch(new RegExp(`AS ${col}\\b`));
    }
  });

  it("y la vista agregada las suma por cliente y las lleva en el desglose", () => {
    for (const col of ["compras_12m", "compras_12m_prev", "compras_6m", "compras_6m_prev"]) {
      expect(agregada).toMatch(new RegExp(`AS ${col}\\b`));
    }
    expect(agregada).toContain("'monto_12m', compras_12m");
    expect(agregada).toContain("'monto_6m', compras_6m");
  });

  it("🔴 conserva byte a byte lo del año: compras_ytd, compras_anio_anterior, delta_vs_2025", () => {
    for (const col of ["compras_ytd", "compras_anio_anterior", "delta_vs_2025"]) {
      expect(mv).toMatch(new RegExp(`AS ${col}\\b`));
      expect(agregada).toMatch(new RegExp(`AS ${col}\\b`));
    }
    // El corte del comparativo sigue siendo por DÍA (los mismos días).
    expect(mv).toContain("k.anio = cy.y - 1 AND k.fecha <= cp.d");
  });

  it("DROP + CREATE con el MISMO índice único (cliente_norm, empresa)", () => {
    expect(ejecutable).toContain("DROP MATERIALIZED VIEW IF EXISTS clientes_empresa_12m_vw");
    expect(ejecutable).toMatch(/CREATE UNIQUE INDEX idx_clientes_empresa_12m_vw_unq\s+ON clientes_empresa_12m_vw \(cliente_norm, empresa\)/);
    expect(ejecutable).toContain("REFRESH MATERIALIZED VIEW clientes_empresa_12m_vw;");
  });

  it("las ventanas comparan contra la MISMA ventana un año antes, cortada en corte_prev", () => {
    expect(mv).toMatch(/ult12_prev AS \([\s\S]*?c\.d - INTERVAL '1 year'[\s\S]*?k\.fecha <= cp\.d/);
    expect(mv).toMatch(/ult6_prev AS \([\s\S]*?c\.d - INTERVAL '1 year'[\s\S]*?k\.fecha <= cp\.d/);
  });
});
