import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// El sync importa supabase-server (que exige env) y el cliente de Switch.
// Acá solo se ejercita la parte PURA + el rechazo de empresas: dobles mínimos.
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: false,
  supabaseServer: new Proxy({}, { get: () => () => { throw new Error("supabase no debe tocarse en estos tests"); } }),
}));
vi.mock("@/lib/switch-api/client", () => ({
  createSwitchClient: () => { throw new Error("Switch no debe tocarse en estos tests"); },
  logoutAllSwitchSessions: async () => {},
}));

import {
  filaDeArticulo,
  dedupePorCodigo,
  EXISTENCIA_MAX,
  syncArticuloInfo,
  type FilaArticuloInfo,
} from "@/lib/switch-api/sync-articulo-info";
import { infoParaCliente, fmtFrescura, type ArticuloInfoFila } from "@/lib/ventas/referencia-info";
import { GUARDS } from "@/lib/switch-api/monto-guard";
import { SYNC_LOG_TYPES } from "@/lib/switch-api/sync-log-tipos";

// ─────────────────────────────────────────────────────────────────────────────
// Candados de la Fase 2 (reducida) del tab Referencia: switch_articulo_info.
//
// El invariante que MÁS importa acá: `costo_api` se GUARDA pero NUNCA viaja al
// cliente ni se pinta — la API de Switch trae UN `costo` sin etiqueta FOB/CIF
// (sondeo 9-ago-2026) y mostrar un costo ambiguo como FOB está prohibido.
// ─────────────────────────────────────────────────────────────────────────────

const ISO = "2026-08-09T20:10:00.000Z";

const crudo = (p: Partial<Parameters<typeof filaDeArticulo>[1]>) => ({
  id: 4164,
  codigo: "31KAE22003001",
  descripcion: "Men-Small Leather",
  disponible: "0.0000",
  precio: "23.0000",
  costo: "16.9400",
  ...p,
});

describe("filaDeArticulo — traducción cruda → fila", () => {
  it("caso real medido en vivo (31KAE22003001, vistana)", () => {
    const f = filaDeArticulo("vistana", crudo({}), ISO)!;
    expect(f).toMatchObject({
      empresa_key: "vistana",
      articulo_id: 4164,
      codigo: "31KAE22003001",
      descripcion: "Men-Small Leather",
      existencia: 0,
      precio_etiqueta: 23,
      costo_api: 16.94,
      synced_at: ISO,
    });
  });

  it("sin código no hay fila — no se adivina la llave", () => {
    expect(filaDeArticulo("vistana", crudo({ codigo: "" }), ISO)).toBeNull();
    expect(filaDeArticulo("vistana", crudo({ codigo: null }), ISO)).toBeNull();
  });

  it("existencia negativa es un dato real (sobreventa) y se conserva", () => {
    const f = filaDeArticulo("vistana", crudo({ disponible: "-8.0000" }), ISO)!;
    expect(f.existencia).toBe(-8);
  });

  it(`existencia por encima de ${EXISTENCIA_MAX} es la clase 4,46 billones → NULL, sin tumbar la fila`, () => {
    const f = filaDeArticulo("vistana", crudo({ disponible: "4460999999999.55" }), ISO)!;
    expect(f.existencia).toBeNull();
    expect(f.precio_etiqueta).toBe(23); // el resto de la fila sigue bueno
  });

  it("valores vacíos o no numéricos → null, nunca 0 inventado", () => {
    const f = filaDeArticulo("vistana", crudo({ precio: null, costo: "", disponible: "abc" }), ISO)!;
    expect(f.precio_etiqueta).toBeNull();
    expect(f.costo_api).toBeNull();
    expect(f.existencia).toBeNull();
  });
});

describe("dedupePorCodigo — el catálogo de Switch repite renglones", () => {
  it("gana la ÚLTIMA aparición (semántica del upsert renglón a renglón)", () => {
    const a = filaDeArticulo("vistana", crudo({ disponible: "1.0000" }), ISO)!;
    const b = filaDeArticulo("vistana", crudo({ disponible: "5.0000" }), ISO)!;
    const otras = filaDeArticulo("vistana", crudo({ codigo: "OTRO001" }), ISO)!;
    const unicas = dedupePorCodigo([a, b, otras]);
    expect(unicas).toHaveLength(2);
    expect(unicas.find((f) => f.codigo === "31KAE22003001")?.existencia).toBe(5);
  });
});

describe("costo_api NUNCA viaja al cliente", () => {
  const fila: ArticuloInfoFila = {
    empresa_key: "vistana",
    codigo: "31KAE22003001",
    descripcion: "KAHLO PASSCASE",
    existencia: "0.0000",
    precio_etiqueta: "23.0000",
    synced_at: ISO,
    costo_api: "16.9400",
  };

  it("infoParaCliente elige los campos UNO POR UNO y costo_api no está", () => {
    const info = infoParaCliente(fila);
    expect(info).toEqual({
      descripcion: "KAHLO PASSCASE",
      existencia: 0,
      precioEtiqueta: 23,
      syncedAt: ISO,
    });
    expect(Object.keys(info)).not.toContain("costo_api");
    expect(JSON.stringify(info)).not.toMatch(/costo/i);
  });

  it("el route del tab ni siquiera SELECCIONA costo_api", () => {
    const ruta = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/api/ventas/referencia/route.ts"),
      "utf8",
    );
    const m = ruta.match(/const COLUMNAS_INFO = "([^"]+)"/);
    expect(m, "no encontré COLUMNAS_INFO en el route").toBeTruthy();
    expect(m![1]).not.toMatch(/costo/);
  });

  it("la vista no pinta ningún costo del catálogo", () => {
    const vista = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/ventas/ReferenciaView.tsx"),
      "utf8",
    );
    // La palabra puede aparecer en comentarios que explican la prohibición;
    // lo vedado es LEERLA de los datos.
    expect(vista).not.toMatch(/info\??\.costo/);
    expect(vista).not.toMatch(/costoApi/);
  });
});

describe("frescura en hora Panamá — 'existencia al 9-ago, 3:10 pm'", () => {
  it("convierte UTC → Panamá (UTC-5 fijo)", () => {
    expect(fmtFrescura("2026-08-09T20:10:00.000Z")).toBe("9-ago, 3:10 pm");
  });

  it("cruza la medianoche: 03:00Z del 10-ago sigue siendo la noche del 9-ago en Panamá", () => {
    expect(fmtFrescura("2026-08-10T03:00:00.000Z")).toBe("9-ago, 10:00 pm");
  });

  it("mediodía y medianoche no dan '0:xx'", () => {
    expect(fmtFrescura("2026-08-09T17:00:00.000Z")).toBe("9-ago, 12:00 pm");
    expect(fmtFrescura("2026-08-09T05:00:00.000Z")).toBe("9-ago, 12:00 am");
  });

  it("fecha ilegible → '—', nunca una hora inventada", () => {
    expect(fmtFrescura("no-es-fecha")).toBe("—");
  });
});

describe("el sync respeta los límites del tab", () => {
  it("Boston y Multifashion/ACS quedan FUERA — el sync los rechaza antes de tocar nada", async () => {
    await expect(syncArticuloInfo("confecciones_boston")).rejects.toThrow(/fuera del tab/);
    await expect(syncArticuloInfo("american_classic")).rejects.toThrow(/fuera del tab/);
  });

  it("el guard de montos tiene la familia articulo_info con simetría precio+costo", () => {
    const g = GUARDS.articulo_info;
    expect(g.tabla).toBe("switch_articulo_info");
    expect(g.columnas).toContain("precio_etiqueta");
    expect(g.columnas).toContain("costo_api"); // cuando se encienda, ya llega filtrado
    expect(g.piso / g.record).toBeGreaterThanOrEqual(7);
  });

  it("el sync_type está declarado (el CHECK de la base lo fija sync-log-tipos-check)", () => {
    expect(SYNC_LOG_TYPES).toContain("articulo_info");
  });

  it("sin cron: vercel.json no programa articulo_info — lo dispara el botón", () => {
    const vercel = fs.readFileSync(path.resolve(process.cwd(), "vercel.json"), "utf8");
    expect(vercel).not.toMatch(/articulo-info|articulo_info/);
  });

  it("la sonda de 'tabla no existe' va con GET, nunca con HEAD (un HEAD sobre tabla ausente da 204 mudo)", () => {
    const sync = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/switch-api/sync-articulo-info.ts"),
      "utf8",
    );
    // La primera consulta de filasGuardadas tiene que ser un select SIN head.
    const cuerpo = sync.slice(sync.indexOf("async function filasGuardadas"));
    const primeraConsulta = cuerpo.indexOf(".select(");
    const primerHead = cuerpo.indexOf("head: true");
    expect(primeraConsulta).toBeGreaterThan(-1);
    expect(primerHead).toBeGreaterThan(primeraConsulta); // el head llega DESPUÉS de la sonda GET
    expect(cuerpo).toMatch(/\.select\("codigo"\)\.limit\(1\)/);
  });
});

describe("FilaArticuloInfo — la forma que se upsertea", () => {
  it("una fila completa trae exactamente las columnas de la tabla", () => {
    const f: FilaArticuloInfo = filaDeArticulo("vistana", crudo({}), ISO)!;
    expect(Object.keys(f).sort()).toEqual(
      ["articulo_id", "codigo", "costo_api", "descripcion", "empresa_key", "existencia", "precio_etiqueta", "synced_at", "updated_at"].sort(),
    );
  });
});
