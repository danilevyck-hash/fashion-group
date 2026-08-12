import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { textoOrigenFob } from "@/lib/ventas/referencia-excel";

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
import {
  infoParaCliente,
  fmtFrescura,
  fobEstimado,
  margenSobreFob,
  PCT_IMPORTACION_DEFAULT,
  type ArticuloInfoFila,
} from "@/lib/ventas/referencia-info";
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

describe("costos — el CIF es real, el FOB SOLO derivado y etiquetado (decisión final 10-ago)", () => {
  const fila: ArticuloInfoFila = {
    empresa_key: "vistana",
    codigo: "31KAE22003001",
    descripcion: "KAHLO PASSCASE",
    existencia: "0.0000",
    precio_etiqueta: "23.0000",
    synced_at: ISO,
    costo_api: "16.9400",
  };

  it("infoParaCliente presenta costo_api SIEMPRE como `costoCif` — nunca como FOB ni pelado", () => {
    const info = infoParaCliente(fila);
    expect(info).toEqual({
      descripcion: "KAHLO PASSCASE",
      existencia: 0,
      precioEtiqueta: 23,
      costoCif: 16.94,
      syncedAt: ISO,
    });
    // El nombre ES el contrato: ni costo_api crudo, ni fob, ni "costo" a secas.
    expect(Object.keys(info)).toContain("costoCif");
    expect(Object.keys(info)).not.toContain("costo_api");
    expect(JSON.stringify(info)).not.toMatch(/fob/i);
  });

  // 🩸 ESTE INVARIANTE CAMBIÓ, Y NO ES UNA CONCESIÓN — es que apareció el dato
  // bueno. Cuando el tab no tenía las compras reales, el único costo a mano era
  // `costo_api` del catálogo (un promedio de HOY) y el FOB solo podía existir
  // derivado, así que "FOB siempre dice est." era correcto. Ahora cada fila es
  // una COMPRA y trae SU costo del documento de ingreso: el CIF es el de esa
  // llegada y el FOB tiene TRES procedencias distintas, de las cuales solo una
  // es estimada. Exigirle "est." a las otras dos sería etiquetar de estimado un
  // dato que Switch mandó.
  it("el route lee los costos de la COMPRA, no el promedio del catálogo", () => {
    const ruta = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/api/ventas/referencia/route.ts"),
      "utf8",
    );
    // El CIF/FOB que se muestra sale del documento de ingreso.
    expect(ruta).toMatch(/costo_cif/);
    expect(ruta).toMatch(/costo_fob/);
    // Fashion Shoes no desglosa: su columna única también se pide.
    expect(ruta).toMatch(/costo_sin_desglosar/);
    // Y el catálogo se sigue leyendo, pero solo por existencia/precio/frescura.
    expect(ruta).toMatch(/switch_articulo_info/);
    expect(ruta).toMatch(/existencia/);
  });

  it("el FOB NUNCA se muestra sin decir de dónde salió", () => {
    // Las 4 procedencias tienen texto, y ninguna miente sobre otra.
    expect(textoOrigenFob("real")).toBe("de Switch");
    expect(textoOrigenFob("igual-al-cif")).toMatch(/igual al CIF/i);
    expect(textoOrigenFob("estimado")).toMatch(/estimado/i);
    expect(textoOrigenFob("sin-dato")).toBe("—");
    // Solo la estimada puede decir "estimado": si "de Switch" lo dijera, la
    // columna dejaría de distinguir el dato real del derivado, que es TODO lo
    // que Daniel pidió de esta columna ("quiero saber cuáles creer").
    expect(textoOrigenFob("real")).not.toMatch(/estimad/i);
    expect(textoOrigenFob("igual-al-cif")).not.toMatch(/estimad/i);
  });

  it("🔴 la vista NO pinta el FOB de Switch: el que muestra es el CALCULADO", () => {
    // ⚠️ Este candado cambió de forma el 11-ago-2026 (noche) y ahora exige MÁS.
    // Antes el FOB de Switch se mostraba con su procedencia al lado (<Fob/>);
    // Daniel pidió el suyo —*"pon costo fob (calcula fob/1.1)"*— porque el de
    // Switch llega IGUAL al CIF en el 93% de las líneas y no distinguía nada.
    // Un `costos.fob` en la vista sería el número viejo de vuelta.
    // La fila de plata vive en ReferenciaTarjeta.tsx desde el 12-ago-2026 (el
    // modo pedido reusa el cuerpo); se barren las TRES piezas de la vista.
    const vista = ["ReferenciaTarjeta.tsx", "ReferenciaView.tsx", "ReferenciaTablaPedido.tsx"]
      .map((f) => fs.readFileSync(path.resolve(process.cwd(), "src/components/ventas", f), "utf8"))
      .join("\n");
    const codigo = vista
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
      .join("\n");
    expect(codigo).not.toContain("costos.fob");
    expect(codigo).not.toContain("fobOrigen");
    // Y el que sí muestra sale de la ficha. 🔴 El rótulo es "FOB" a secas desde
    // el 12-ago-2026 — Daniel: *"la palabra calculado esta de mas"*. La cuenta
    // (CIF ÷ 1,10) la explica el ⓘ, no el rótulo.
    expect(codigo).toContain("fobCalculado");
    expect(codigo).toContain('k="FOB"');
    expect(codigo).not.toContain("(calculado)");
  });

  it("🔴 el Costo FOB de la ficha REUSA `fobEstimado` — una sola división en el repo", () => {
    const fuente = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/ventas/resumen-articulo.ts"),
      "utf8",
    );
    // El encabezado CITA la fórmula de Daniel para explicarla: se mira el
    // código, no los comentarios.
    const ficha = fuente
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
      .join("\n");
    expect(ficha).toContain("fobEstimado");
    // Nada de escribir la división a mano: sería una segunda definición, y la
    // trampa conocida es multiplicar por 0,9 en vez de dividir entre 1,1.
    expect(ficha).not.toMatch(/\/\s*1\.1\b/);
    expect(ficha).not.toMatch(/\*\s*0\.9\b/);
  });
});

describe("FOB estimado — DIVISIÓN de vuelta, nunca CIF × (1 − %)", () => {
  it("los 3 casos reales de la ficha de Switch: CIF ÷ 1.1 = el FOB de pantalla", () => {
    // QD3636001, KCSALYA929, K10K109927DWE — medidos el 10-ago-2026.
    expect(fobEstimado(3.19)).toBeCloseTo(2.9, 4);
    expect(fobEstimado(10.01)).toBeCloseTo(9.1, 4);
    expect(fobEstimado(39.6)).toBeCloseTo(36.0, 4);
  });

  it("restar el 10% NO es lo mismo: 3.19 × 0.9 = 2.871 ≠ 2.90 (Daniel cazó la diferencia)", () => {
    expect(3.19 * 0.9).toBeCloseTo(2.871, 4);
    expect(fobEstimado(3.19)!).not.toBeCloseTo(2.871, 3);
  });

  it("el % es configurable y el default es 10%", () => {
    expect(PCT_IMPORTACION_DEFAULT).toBe(0.1);
    expect(fobEstimado(3.19, 0.177)).toBeCloseTo(3.19 / 1.177, 6); // CK Jeans importó a 17,7%
  });

  it("sin CIF (null, 0, negativo) no hay FOB estimado — no se inventa", () => {
    expect(fobEstimado(null)).toBeNull();
    expect(fobEstimado(0)).toBeNull();
    expect(fobEstimado(-3.19)).toBeNull();
  });

  it("margen s/FOB est.: sobre el FOB estimado, NO sobre el CIF", () => {
    const fob = fobEstimado(3.19)!; // 2.90
    // Precio real 7.00 (QD3636001): margen = (7 − 2.90) / 7 = 58.6%
    expect(margenSobreFob(7, fob)).toBeCloseTo((7 - 2.9) / 7, 4);
    // Si alguien lo calcula sobre el CIF daría 54.4% — distinto, y el test lo ve.
    expect(margenSobreFob(7, fob)!).not.toBeCloseTo((7 - 3.19) / 7, 3);
  });

  it("sin precio no hay margen", () => {
    expect(margenSobreFob(null, 2.9)).toBeNull();
    expect(margenSobreFob(0, 2.9)).toBeNull();
    expect(margenSobreFob(7, null)).toBeNull();
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

  it("CON cron desde el 10-ago-2026: vercel.json programa las 3 entradas — y el botón sigue", () => {
    // Daniel: "es que debería ser ya automático". El detalle del calendario
    // (grupos, horas, cobertura exacta de las 6 FG) vive en
    // cron-sync-articulo-info.test.ts; acá solo se fija que el cron EXISTE.
    const vercel = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "vercel.json"), "utf8")) as {
      crons: Array<{ path: string }>;
    };
    const entradas = vercel.crons.filter((c) => c.path.startsWith("/api/cron/sync-articulo-info"));
    expect(entradas).toHaveLength(3);
    // Y el botón manual no se retiró: el route del tab sigue existiendo.
    expect(fs.existsSync(path.resolve(process.cwd(), "src/app/api/ventas/referencia/actualizar/route.ts"))).toBe(true);
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
