/**
 * CANDADO — MARKETING › LAS FOTOS DE LA TIENDA (24-sep-2026).
 *
 * Los dos defectos que Daniel reportó, medidos contra producción:
 *
 *  1. 🩸 NO SE PODÍA GUARDAR NINGUNA FOTO DE TIENDA, Y NUNCA SE PUDO. La puerta
 *     manda `tipo = 'foto_proyecto'` con el proyecto VACÍO y la regla vieja
 *     `mk_adjuntos_destino_chk` exige proyecto: 23514 → 400, con el archivo YA
 *     subido. Medido: 0 de 160 filas con tienda sin proyecto y 4 archivos
 *     huérfanos en `tienda/D-118/` del 24-sep 21:50–21:51 UTC.
 *
 *  2. Daniel: *«cuando me meto al período abierto, veo las fotos del período
 *     viejo»*. Las dos fotos de Outlet Duty Free N3 (16-jun y 30-jul) son de
 *     «mid 2026 · PVH», cerrado el 12-ago-2026, y salían bajo «Abierto».
 *
 * Lo que este archivo no deja aflojar:
 *   1. LA REGLA DE LA MIGRACIÓN ACEPTA LA FILA QUE LA PUERTA INSERTA. El CHECK
 *      se LEE del archivo SQL y se evalúa: nada de buscar una frase.
 *   2. LA PUERTA INSERTA TIENDA, SIN PROYECTO Y CON SELLO.
 *   3. SIN LA MIGRACIÓN EL AVISO ES EN ESPAÑOL Y NO QUEDA UN SOLO HUÉRFANO.
 *   4. LA CUADRÍCULA SIGUE AL CHIP, y «Todos» las muestra todas.
 *   5. EL ZIP LLEVA LAS FOTOS DE LA TIENDA DEL PERÍODO, SIN DUPLICAR.
 *   6. APAGADO = COMO ANTES.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
  process.env.SESSION_SECRET ||= "test-secret";
});

// ── Un Supabase de mentira: anota lo que se le manda ─────────────────────────
const fake = vi.hoisted(() => {
  const inserts: Array<{ tabla: string; fila: Record<string, unknown> }> = [];
  const removidos: string[][] = [];
  const estado = {
    errorInsert: null as { code?: string; message?: string } | null,
    periodos: [] as Array<Record<string, unknown>>,
    facturas: [] as Array<Record<string, unknown>>,
    entregas: [] as Array<Record<string, unknown>>,
    sellos: [] as Array<Record<string, unknown>>,
    adjuntos: [] as Array<Record<string, unknown>>,
  };
  const datosDe = (tabla: string): unknown[] => {
    if (tabla === "mk_periodos") return estado.periodos;
    if (tabla === "mk_facturas") return estado.facturas;
    if (tabla === "mk_entregas_muebles") return estado.entregas;
    if (tabla === "mk_periodo_documentos") return estado.sellos;
    if (tabla === "mk_adjuntos") return estado.adjuntos;
    return [];
  };
  function consulta(tabla: string) {
    let esInsert = false;
    let filaInsertada: Record<string, unknown> | null = null;
    const q: Record<string, unknown> = {};
    const paso = () => () => q;
    for (const op of ["select", "eq", "in", "is", "order", "not", "limit"]) q[op] = paso();
    q.insert = (fila: Record<string, unknown>) => {
      esInsert = true;
      filaInsertada = fila;
      inserts.push({ tabla, fila });
      return q;
    };
    q.single = () =>
      Promise.resolve(
        estado.errorInsert
          ? { data: null, error: estado.errorInsert }
          : { data: { id: "nueva", ...(filaInsertada ?? {}) }, error: null },
      );
    q.then = (resolve: (v: unknown) => unknown) => {
      if (esInsert) {
        return resolve(
          estado.errorInsert ? { data: null, error: estado.errorInsert } : { data: [], error: null },
        );
      }
      return resolve({ data: datosDe(tabla), error: null, count: null });
    };
    return q;
  }
  return {
    inserts,
    removidos,
    estado,
    supabaseServer: {
      from: consulta,
      storage: {
        from: () => ({
          remove: async (paths: string[]) => {
            removidos.push(paths);
            return { error: null };
          },
          createSignedUrls: async (paths: string[]) => ({
            data: paths.map((p) => ({ path: p, signedUrl: `https://firmada/${p}` })),
            error: null,
          }),
          createSignedUrl: async (p: string) => ({ data: { signedUrl: `https://firmada/${p}` }, error: null }),
        }),
      },
    },
  };
});

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: fake.supabaseServer, HAS_SERVICE_ROLE: true }));
vi.mock("@/lib/requireRole", () => ({ requireRole: () => ({ role: "admin", userId: "u1" }) }));

import {
  MARKETING_FOTOS_CON_PERIODO,
  AVISO_FALTA_LA_MIGRACION,
  avisoSinFotosDelPeriodo,
  esLaReglaDeDestino,
  fotosDelPeriodo,
  periodoAbiertoParaFotoNueva,
  periodoDeLaFoto,
  type PeriodoLeidoParaFoto,
} from "@/lib/marketing/fotos-periodo";
import { PERIODO_ABIERTO, PERIODO_TODOS } from "@/lib/marketing/periodo-manda";
import { armarFotosPorCarpeta } from "@/lib/marketing/zip-marca";

const RAIZ = path.resolve(__dirname, "..", "..", "..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const MIGRACION = "supabase/migrations/20261219130000_marketing_fotos_de_tienda.sql";
const MIGRACION_VIEJA = "supabase/migrations/20260811180000_marketing_periodos_por_marca.sql";
const RUTA = "src/app/api/marketing/tienda/[codigo]/fotos/route.ts";

// Producción, 24-sep-2026.
const MID_2026 = "8e2ee894-2b68-47f2-b342-b6c0bc9f5a0a";
const TH_ABIERTO = "f1ac9b37-61af-4d84-8fc1-fe8bb3fc4d86";
const CK_ABIERTO = "cefdd262-f398-491a-a8b9-0e0dc73b89e8";
const FOTO_JUN = "013d9316-fb4b-49fd-8bba-5116f1ef8eec";
const FOTO_JUL = "9ec37900-f530-44b8-a8de-04427b475c43";

// ─── 1. LA REGLA DE LA BASE, LEÍDA Y EVALUADA ────────────────────────────────

interface FilaAdjunto {
  tipo: string;
  factura_id: string | null;
  proyecto_id: string | null;
  tienda_codigo: string | null;
}

/**
 * Saca el CHECK de `mk_adjuntos_destino_chk` del archivo SQL y lo convierte en
 * una función de verdad. Así el candado valida la FORMA de la fila contra la
 * regla escrita, no contra una frase suelta: si mañana alguien afloja o
 * endurece el CHECK, estas pruebas se enteran.
 */
function reglaDeDestinoDe(rel: string): (f: FilaAdjunto) => boolean {
  const sql = leer(rel);
  const i = sql.indexOf("ADD CONSTRAINT mk_adjuntos_destino_chk");
  expect(i).toBeGreaterThan(-1);
  const desdeCheck = sql.slice(sql.indexOf("CHECK", i));
  // El cuerpo del CHECK: desde el primer paréntesis hasta el que lo cierra.
  let nivel = 0;
  let fin = -1;
  for (let k = desdeCheck.indexOf("("); k < desdeCheck.length; k++) {
    if (desdeCheck[k] === "(") nivel += 1;
    else if (desdeCheck[k] === ")") {
      nivel -= 1;
      if (nivel === 0) {
        fin = k;
        break;
      }
    }
  }
  expect(fin).toBeGreaterThan(-1);
  const cuerpo = desdeCheck
    .slice(desdeCheck.indexOf("(") + 1, fin)
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
  const js = cuerpo
    .replace(/([a-z_]+)\s+IS NOT NULL/g, "(f.$1 != null)")
    .replace(/([a-z_]+)\s+IS NULL/g, "(f.$1 == null)")
    .replace(/tipo\s*=\s*'([a-z_]+)'/g, "(f.tipo === '$1')")
    .replace(/\bAND\b/g, "&&")
    .replace(/\bOR\b/g, "||");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function("f", `return (${js});`) as (f: FilaAdjunto) => boolean;
}

const FOTO_DE_TIENDA: FilaAdjunto = {
  tipo: "foto_proyecto",
  factura_id: null,
  proyecto_id: null,
  tienda_codigo: "D-118",
};

describe("1. la regla de la base acepta la fila que la puerta inserta", () => {
  it("la regla VIEJA la rechazaba — ése era el defecto", () => {
    expect(reglaDeDestinoDe(MIGRACION_VIEJA)(FOTO_DE_TIENDA)).toBe(false);
  });

  it("la regla NUEVA la acepta, y conserva todo lo que exigía antes", () => {
    const regla = reglaDeDestinoDe(MIGRACION);
    expect(regla(FOTO_DE_TIENDA)).toBe(true);
    // Lo de siempre sigue igual.
    expect(regla({ tipo: "foto_proyecto", factura_id: null, proyecto_id: "p1", tienda_codigo: null })).toBe(true);
    expect(regla({ tipo: "pdf_factura", factura_id: "f1", proyecto_id: null, tienda_codigo: null })).toBe(true);
    expect(regla({ tipo: "foto_factura", factura_id: "f1", proyecto_id: null, tienda_codigo: null })).toBe(true);
    expect(regla({ tipo: "foto_instalacion", factura_id: "f1", proyecto_id: null, tienda_codigo: null })).toBe(true);
    expect(regla({ tipo: "otro", factura_id: null, proyecto_id: null, tienda_codigo: null })).toBe(true);
    // Y lo que rechazaba lo sigue rechazando.
    expect(regla({ tipo: "pdf_factura", factura_id: null, proyecto_id: "p1", tienda_codigo: null })).toBe(false);
    expect(regla({ tipo: "foto_factura", factura_id: null, proyecto_id: null, tienda_codigo: "D-118" })).toBe(false);
    expect(regla({ tipo: "foto_instalacion", factura_id: null, proyecto_id: null, tienda_codigo: "D-118" })).toBe(false);
    expect(regla({ tipo: "foto_proyecto", factura_id: "f1", proyecto_id: "p1", tienda_codigo: "D-118" })).toBe(false);
    expect(regla({ tipo: "foto_proyecto", factura_id: null, proyecto_id: null, tienda_codigo: null })).toBe(false);
  });

  it("la migración es ADITIVA: agrega la columna del sello y no borra nada", () => {
    const sql = leer(MIGRACION);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS periodo_id uuid REFERENCES mk_periodos\(id\)/);
    expect(sql).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM|DROP COLUMN/i);
  });

  it("las fotos viejas se sellan POR LISTA DE IDS: 52, y las dos de D-118 están", () => {
    const sql = leer(MIGRACION);
    const ids = [...sql.matchAll(/^\s{4}\('([0-9a-f-]{36}')\),?$/gm)].map((m) => m[1].slice(0, -1));
    expect(ids.length).toBe(52);
    expect(new Set(ids).size).toBe(52);
    expect(ids).toContain(FOTO_JUN);
    expect(ids).toContain(FOTO_JUL);
    expect(sql).toContain(MID_2026);
    // Nunca un UPDATE abierto: el UPDATE va atado a la lista.
    expect(sql).toMatch(/UPDATE mk_adjuntos a[\s\S]*?FROM viejas v[\s\S]*?WHERE a\.id = v\.id::uuid/);
  });
});

// ─── 2 Y 3. LA PUERTA ────────────────────────────────────────────────────────

async function postFoto(url = "tienda/D-118/foto.jpeg") {
  const { POST } = await import("@/app/api/marketing/tienda/[codigo]/fotos/route");
  const req = {
    json: async () => ({ url, nombreOriginal: "foto.jpeg", sizeBytes: 123 }),
  } as unknown as Parameters<typeof POST>[0];
  return POST(req, { params: { codigo: "D-118" } });
}

describe("2 y 3. la puerta guarda la foto de la tienda, o avisa sin dejar basura", () => {
  beforeEach(() => {
    fake.inserts.length = 0;
    fake.removidos.length = 0;
    fake.estado.errorInsert = null;
    // D-118 tal como está en producción: dos gastos abiertos, Calvin y Tommy.
    fake.estado.facturas = [
      { id: "fac-ck", created_at: "2026-09-21T10:00:00Z", fecha_factura: "2026-09-21" },
      { id: "fac-th", created_at: "2026-09-21T11:00:00Z", fecha_factura: "2026-09-21" },
    ];
    fake.estado.entregas = [];
    fake.estado.sellos = [
      { documento_id: "fac-ck", periodo_id: CK_ABIERTO },
      { documento_id: "fac-th", periodo_id: TH_ABIERTO },
    ];
    fake.estado.periodos = [
      { id: CK_ABIERTO, estado: "abierto" },
      { id: TH_ABIERTO, estado: "abierto" },
    ];
  });

  it("inserta la foto con TIENDA, SIN proyecto y CON sello", async () => {
    const res = await postFoto();
    expect(res.status).toBe(200);
    const fila = fake.inserts.find((i) => i.tabla === "mk_adjuntos")?.fila ?? {};
    expect(fila.tipo).toBe("foto_proyecto");
    expect(fila.proyecto_id).toBeNull();
    expect(fila.factura_id).toBeNull();
    expect(fila.tienda_codigo).toBe("D-118");
    // El gasto más reciente de la tienda es el de Tommy: ése manda.
    expect(fila.periodo_id).toBe(TH_ABIERTO);
    expect(fake.removidos).toEqual([]);
  });

  it("sin la migración avisa EN ESPAÑOL y borra el archivo que acababa de subir", async () => {
    fake.estado.errorInsert = {
      code: "23514",
      message: 'new row violates check constraint "mk_adjuntos_destino_chk"',
    };
    const res = await postFoto("tienda/D-118/huerfana.jpeg");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe(AVISO_FALTA_LA_MIGRACION);
    expect(body.error).not.toMatch(/check constraint|mk_adjuntos|23514/);
    expect(fake.removidos).toEqual([["tienda/D-118/huerfana.jpeg"]]);
  });

  it("`esLaReglaDeDestino` reconoce el 23514 y no confunde otros errores", () => {
    expect(esLaReglaDeDestino({ code: "23514", message: "x" })).toBe(true);
    expect(esLaReglaDeDestino({ code: "XX", message: 'violates "mk_adjuntos_destino_chk"' })).toBe(true);
    expect(esLaReglaDeDestino({ code: "42703", message: "column does not exist" })).toBe(false);
    expect(esLaReglaDeDestino(null)).toBe(false);
  });

  it("la puerta no arma el sello con una lista de marcas escrita a mano", () => {
    const src = leer(RUTA);
    expect(src).toMatch(/periodoAbiertoDeLaTienda\(codigo\)/);
    expect(src).not.toMatch(/\bTH\b.*\bCK\b/);
  });
});

// ─── 4. LA CUADRÍCULA SIGUE AL CHIP ──────────────────────────────────────────

const cerrado = { id: MID_2026, nombre: "mid 2026", proveedorKey: "pvh", cerradoEn: "2026-08-12T01:20:45Z" };
const FOTOS = [
  { id: FOTO_JUN, periodo: cerrado },
  { id: FOTO_JUL, periodo: cerrado },
  { id: "nueva-1", periodo: null }, // sellada a un abierto → llega sin período
  { id: "vieja-sin-sello" }, // sin sello
];

describe("4. la cuadrícula sigue al chip", () => {
  it("«Abierto» muestra las nuevas y las sin sello, NUNCA las de «mid 2026»", () => {
    const vistas = fotosDelPeriodo(FOTOS, PERIODO_ABIERTO).map((f) => f.id);
    expect(vistas).toEqual(["nueva-1", "vieja-sin-sello"]);
  });

  it("un cierre muestra SOLO las suyas — las dos de D-118", () => {
    expect(fotosDelPeriodo(FOTOS, MID_2026).map((f) => f.id)).toEqual([FOTO_JUN, FOTO_JUL]);
  });

  it("«Todos» las muestra todas", () => {
    expect(fotosDelPeriodo(FOTOS, PERIODO_TODOS).length).toBe(FOTOS.length);
  });

  it("el período de una foto solo existe si su sello ya CERRÓ", () => {
    const periodos = new Map<string, PeriodoLeidoParaFoto>([
      [MID_2026, { id: MID_2026, nombre: "Período 2026", nombreAlCerrar: "mid 2026", proveedorKey: "pvh", estado: "cerrado", cerradoEn: "2026-08-12T01:20:45Z" }],
      [TH_ABIERTO, { id: TH_ABIERTO, nombre: "Período 2026", nombreAlCerrar: null, proveedorKey: "TH", estado: "abierto", cerradoEn: null }],
    ]);
    expect(periodoDeLaFoto(MID_2026, periodos)?.nombre).toBe("mid 2026");
    expect(periodoDeLaFoto(TH_ABIERTO, periodos)).toBeNull();
    expect(periodoDeLaFoto(null, periodos)).toBeNull();
    expect(periodoDeLaFoto("no-existe", periodos)).toBeNull();
  });

  it("el aviso de la cuadrícula vacía dice dónde mirar", () => {
    expect(avisoSinFotosDelPeriodo(PERIODO_TODOS, true)).toBe("Esta tienda no tiene fotos.");
    expect(avisoSinFotosDelPeriodo(PERIODO_ABIERTO, true)).toMatch(/Mira «Todos»/);
    expect(avisoSinFotosDelPeriodo(MID_2026, true)).toMatch(/Mira «Todos»/);
  });

  it("la foto nueva nace en el período del gasto MÁS RECIENTE, con desempate estable", () => {
    expect(
      periodoAbiertoParaFotoNueva([
        { documentoId: "fac-ck", cuando: "2026-09-21T10:00:00Z", periodosAbiertos: [CK_ABIERTO] },
        { documentoId: "fac-th", cuando: "2026-09-21T11:00:00Z", periodosAbiertos: [TH_ABIERTO] },
      ]),
    ).toBe(TH_ABIERTO);
    // Empatados en fecha: manda el id de documento, y de ahí el período menor.
    expect(
      periodoAbiertoParaFotoNueva([
        { documentoId: "b", cuando: "2026-09-21T10:00:00Z", periodosAbiertos: [TH_ABIERTO] },
        { documentoId: "a", cuando: "2026-09-21T10:00:00Z", periodosAbiertos: [CK_ABIERTO] },
      ]),
    ).toBe(CK_ABIERTO);
    // Sin gasto abierto no se inventa un período: la foto queda en «Abierto».
    expect(periodoAbiertoParaFotoNueva([])).toBeNull();
    expect(periodoAbiertoParaFotoNueva([{ documentoId: "x", cuando: "2026-01-01", periodosAbiertos: [] }])).toBeNull();
  });

  it("la ficha le pasa el chip a la cuadrícula, y la vista de antes no", () => {
    expect(leer("src/app/marketing/tienda/[codigo]/FichaTienda.tsx")).toMatch(
      /<FotosSection tiendaCodigo=\{datos\.codigo \?\? TIENDA_GENERAL\} periodo=\{periodo\}/,
    );
    expect(leer("src/app/marketing/tienda/[codigo]/VistaTiendaAnterior.tsx")).not.toMatch(/periodo=\{/);
  });
});

// ─── 5. EL ZIP ───────────────────────────────────────────────────────────────

describe("5. el ZIP lleva las fotos de la tienda del período, sin duplicar", () => {
  const gastos = [
    { tipo: "factura" as const, documentoId: "fac-th", fecha: "2026-06-10", numero: "1", concepto: "", proveedor: "", periodoTrabajado: "", carpeta: "Outlet Duty Free N3", clienteCodigo: "D-118", monto: 100 },
    { tipo: "factura" as const, documentoId: "fac-otra", fecha: "2026-06-11", numero: "2", concepto: "", proveedor: "", periodoTrabajado: "", carpeta: "Nova Lux", clienteCodigo: "D-14", monto: 50 },
  ];
  const adjuntos = [
    // La de siempre: cuelga del proyecto del gasto de D-118.
    { id: "por-proyecto", tipo: "foto_proyecto", factura_id: null, proyecto_id: "proy-118", url: "a.jpg", nombre_original: "a.jpg", tienda_codigo: "D-118", periodo_id: MID_2026 },
    // Nueva: cuelga de la TIENDA y está sellada al período que se baja.
    { id: "de-tienda", tipo: "foto_proyecto", factura_id: null, proyecto_id: null, url: "b.jpg", nombre_original: "b.jpg", tienda_codigo: "D-118", periodo_id: MID_2026 },
    // De la misma tienda pero de OTRO período: no entra.
    { id: "de-otro-periodo", tipo: "foto_proyecto", factura_id: null, proyecto_id: null, url: "c.jpg", nombre_original: "c.jpg", tienda_codigo: "D-118", periodo_id: TH_ABIERTO },
    // De otra tienda que sí está en el ZIP.
    { id: "de-nova", tipo: "foto_proyecto", factura_id: null, proyecto_id: null, url: "d.jpg", nombre_original: "d.jpg", tienda_codigo: "D-14", periodo_id: MID_2026 },
  ];
  const ctx = {
    proyectoDeFactura: (fid: string) => (fid === "fac-th" ? "proy-118" : null),
    proyectoDeEntrega: () => null,
  };

  it("cada carpeta se lleva las suyas, y la del proyecto no sale dos veces", () => {
    const out = armarFotosPorCarpeta(gastos, adjuntos, { ...ctx, periodoId: MID_2026 });
    expect((out.get("Outlet Duty Free N3") ?? []).map((a) => a.id)).toEqual(["por-proyecto", "de-tienda"]);
    expect((out.get("Nova Lux") ?? []).map((a) => a.id)).toEqual(["de-nova"]);
  });

  it("sin período —Multifashion— el ZIP sale EXACTAMENTE como antes", () => {
    const out = armarFotosPorCarpeta(gastos, adjuntos, ctx);
    expect((out.get("Outlet Duty Free N3") ?? []).map((a) => a.id)).toEqual(["por-proyecto"]);
    expect(out.get("Nova Lux")).toBeUndefined();
  });

  it("el armador recibe el período de la descarga y lee las columnas con respaldo", () => {
    const src = leer("src/lib/marketing/zip-marca.ts");
    expect(src).toMatch(/periodoId: periodo\.id/);
    expect(src).toMatch(/conRespaldoSinColumnas<AdjuntoFila\[\]>/);
    expect(src).toMatch(/tienda_codigo, periodo_id/);
  });
});

// ─── 6. EL INTERRUPTOR ───────────────────────────────────────────────────────

describe("6. apagado = como antes", () => {
  it("hoy está prendido, y es UNA constante", () => {
    expect(MARKETING_FOTOS_CON_PERIODO).toBe(true);
    expect(leer("src/lib/marketing/fotos-periodo.ts")).toMatch(
      /export const MARKETING_FOTOS_CON_PERIODO = (true|false);/,
    );
  });

  it("las tres piezas preguntan por el interruptor antes de cambiar nada", () => {
    expect(leer("src/lib/marketing/fotos-periodo.ts")).toMatch(
      /if \(!MARKETING_FOTOS_CON_PERIODO\) return \[\.\.\.fotos\];/,
    );
    expect(leer(RUTA)).toMatch(/MARKETING_FOTOS_CON_PERIODO\s*\n?\s*\?\s*await periodoAbiertoDeLaTienda/);
    expect(leer("src/lib/marketing/zip-marca.ts")).toMatch(/MARKETING_FOTOS_CON_PERIODO &&/);
  });

  it("nada de lo que ya se guarda cambia de forma: el sello es una columna NUEVA y nullable", () => {
    const sql = leer(MIGRACION);
    expect(sql).not.toMatch(/periodo_id uuid NOT NULL/);
    expect(sql).not.toMatch(/ALTER COLUMN/i);
  });
});
