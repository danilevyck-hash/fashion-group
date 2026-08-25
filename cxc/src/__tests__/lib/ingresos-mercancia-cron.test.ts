/**
 * CANDADOS del cron de COMPRAS (ingreso de mercancía).
 *
 * 🔴 EL QUE MÁS IMPORTA: si el cuadre detalle-contra-resumen no da, NO SE
 * ESCRIBE NADA. De esta tabla sale el "Compré 935 · Vendí 552 · Me quedan 345"
 * de Ventas › Referencia, y de ahí salió la proyección con la que Daniel compró
 * 7.620 pares por $186.614. Un detalle truncado no hace que el número se vea
 * viejo: hace que el % vendido salga MÁS ALTO de lo real, o sea que la pantalla
 * diga "se vendió casi todo" con la bodega llena.
 *
 * SON TESTS DE CONDUCTA: corren la librería REAL contra un doble de PostgREST y
 * miran QUÉ SE ESCRIBIÓ. Un barrido de texto sobre el archivo no puede ver que
 * una escritura se haya hecho, y en este repo ya falló cuatro veces cumpliéndose
 * con su propio comentario — los pocos barridos que quedan borran los
 * comentarios primero.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

// ─── Fixtures: LÍNEAS REALES del CSV que bajó de vistana el 24-ago-2026 ──────
// Copiadas tal cual, con sus dobles espacios. Inventar el formato sería probar
// contra mi propia suposición del formato.
const HDR_DETALLE =
  "FECHA;N.INTERNO;SUCURSAL;PROVEEDOR; CODIGO  ARTICULO ;ARTICULO;REFERENCIA;PRECIO;CANTIDAD; COSTO  FOB ; COSTO  CIF ; COSTO  PROMEDIO ; UTILIDAD  % ";
const HDR_RESUMEN = "FECHA;N.INTERNO;SUCURSAL;PROVEEDOR;CANTIDAD; COSTO  FOB ; COSTO  CIF ;TOTAL";

const det = (doc: string, cod: string, cant: number, fecha = "2026-08-20") =>
  `${fecha};${doc};PRINCIPAL; American  Designer  Fashion ;${cod};Men-Brief;${cod};24.00;${cant.toFixed(2)};15.785;15.785;15.785;34.2292`;
const res = (doc: string, cant: number, fecha = "2026-08-20") =>
  `${fecha};${doc};PRINCIPAL; American  Designer  Fashion ;${cant.toFixed(2)};15.785;15.785;947.10`;

const csvDetalle = (...filas: string[]) => [HDR_DETALLE, ...filas].join("\n");
const csvResumen = (...filas: string[]) => [HDR_RESUMEN, ...filas].join("\n");

/** El caso feliz: 2 documentos, 3 líneas, cuadra al par. */
const DETALLE_OK = csvDetalle(
  det("19-000000900", "NB2568001", 60),
  det("19-000000900", "NB2568002", 40),
  det("19-000000901", "NB2570001", 120, "2026-08-21"),
);
const RESUMEN_OK = csvResumen(res("19-000000900", 100), res("19-000000901", 120, "2026-08-21"));

// ─── Doble de PostgREST ──────────────────────────────────────────────────────
interface Escritura {
  tipo: "upsert" | "delete";
  tabla: string;
  filas?: Record<string, unknown>[];
  onConflict?: string;
  filtros?: Record<string, unknown>;
}

const escrituras: Escritura[] = [];
let logFinal: { status?: string; error_message?: string | null } = {};
let logIdDevuelto: string | null = "log-1";
/** Lo que la tabla YA tiene dentro de la ventana. */
let guardadasEnVentana: { n_interno: string; linea: number }[] = [];
/** MAX(fecha) de la empresa. */
let ultimaFecha: string | null = "2026-08-07";

vi.mock("@/lib/supabase-server", () => {
  const cadena = (tabla: string) => {
    const filtros: Record<string, unknown> = {};
    let pedirCount = false;
    let cols = "";
    const c: Record<string, unknown> = {
      select: (columnas?: string, opts?: { count?: string }) => {
        cols = columnas ?? "";
        pedirCount = opts?.count === "exact";
        return c;
      },
      eq: (k: string, v: unknown) => {
        filtros[`eq:${k}`] = v;
        return c;
      },
      gte: (k: string, v: unknown) => {
        filtros[`gte:${k}`] = v;
        return c;
      },
      lte: (k: string, v: unknown) => {
        filtros[`lte:${k}`] = v;
        return c;
      },
      gt: (k: string, v: unknown) => {
        filtros[`gt:${k}`] = v;
        return c;
      },
      in: () => c,
      order: () => c,
      limit: async () => ({
        data: ultimaFecha ? [{ fecha: ultimaFecha }] : [],
        error: null,
      }),
      range: async () => ({
        data: guardadasEnVentana,
        error: null,
        count: pedirCount ? guardadasEnVentana.length : null,
      }),
      single: async () =>
        logIdDevuelto
          ? { data: { id: logIdDevuelto }, error: null }
          : { data: null, error: { message: "check constraint" } },
      insert: () => c,
      update: (patch: Record<string, unknown>) => {
        if (tabla === "switch_sync_log") logFinal = patch;
        return { eq: async () => ({ data: null, error: null }) };
      },
      upsert: async (filas: Record<string, unknown>[], opts?: { onConflict?: string }) => {
        escrituras.push({ tipo: "upsert", tabla, filas, onConflict: opts?.onConflict });
        return { data: null, error: null };
      },
      delete: (opts?: { count?: string }) => {
        void opts;
        const d: Record<string, unknown> = {};
        Object.assign(d, {
          eq: (k: string, v: unknown) => {
            filtros[`eq:${k}`] = v;
            return d;
          },
          gt: (k: string, v: unknown) => {
            filtros[`gt:${k}`] = v;
            escrituras.push({ tipo: "delete", tabla, filtros: { ...filtros } });
            return Promise.resolve({ data: null, error: null, count: 1 });
          },
          in: () => {
            escrituras.push({ tipo: "delete", tabla, filtros: { ...filtros } });
            return Promise.resolve({ data: null, error: null, count: 1 });
          },
          then: (r: (v: unknown) => void) => {
            escrituras.push({ tipo: "delete", tabla, filtros: { ...filtros } });
            return r({ data: null, error: null, count: 1 });
          },
        });
        return d;
      },
    };
    void cols;
    return c;
  };
  return { supabaseServer: { from: (t: string) => cadena(t) } };
});

// ─── Doble del login web ─────────────────────────────────────────────────────
let csvsDevueltos = { detalleCsv: DETALLE_OK, resumenCsv: RESUMEN_OK };
let loginFalla = false;
const sesionesCerradas: string[] = [];
const rangosPedidos: { desde: string; hasta: string }[] = [];

vi.mock("@/lib/switch-api/web-client", () => ({
  loginSwitchWeb: vi.fn(async (empresaKey: string) => {
    if (loginFalla) throw new Error("[switch-web] login: 401");
    return { empresaKey, baseUrl: "https://x", cookies: new Map() };
  }),
  fetchIngresosMercancia: vi.fn(async (_s: unknown, desde: string, hasta: string) => {
    rangosPedidos.push({ desde, hasta });
    return { ...csvsDevueltos, rondas: { detalle: 1, resumen: 1 }, archivos: { detalle: "a", resumen: "b" } };
  }),
  cerrarSesionWeb: vi.fn(async (s: { empresaKey: string }) => {
    sesionesCerradas.push(s.empresaKey);
  }),
}));

import {
  syncEmpresaIngresos,
  ventanaIngresos,
  INGRESOS_EMPRESA_KEYS,
  VENTANA_DIAS,
  SOLAPE_DIAS,
  VENTANA_MAX_DIAS,
  UMBRAL_BARRIDO_CORTO,
} from "@/lib/switch-api/ingresos-mercancia-web";
import { REFERENCIA_EMPRESA_KEYS } from "@/lib/ventas/referencia";
import { SYNC_LOG_TYPES } from "@/lib/switch-api/sync-log-tipos";

const HOY = "2026-08-25";

beforeEach(() => {
  escrituras.length = 0;
  sesionesCerradas.length = 0;
  rangosPedidos.length = 0;
  logFinal = {};
  logIdDevuelto = "log-1";
  guardadasEnVentana = [];
  ultimaFecha = "2026-08-07";
  csvsDevueltos = { detalleCsv: DETALLE_OK, resumenCsv: RESUMEN_OK };
  loginFalla = false;
});

const filasEscritas = () =>
  escrituras.filter((e) => e.tipo === "upsert").flatMap((e) => e.filas ?? []);

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el CUADRE es fail-closed: si no da, no se escribe NADA", () => {
  it("cuadrando, escribe las 3 líneas y el log queda en success", async () => {
    const r = await syncEmpresaIngresos("vistana", undefined, HOY);
    expect(r.ok).toBe(true);
    expect(r.cuadre?.ok).toBe(true);
    expect(r.lineas).toBe(3);
    expect(r.documentos).toBe(2);
    expect(r.unidades).toBe(220);
    expect(filasEscritas()).toHaveLength(3);
    expect(logFinal.status).toBe("success");
  });

  it("FALTA UN DOCUMENTO en el detalle → error y CERO escrituras", async () => {
    // El resumen conoce 2 documentos; el detalle solo trajo 1. Es la firma de
    // una descarga truncada — exactamente lo que hace que "Compré" mienta.
    csvsDevueltos = {
      detalleCsv: csvDetalle(det("19-000000900", "NB2568001", 60), det("19-000000900", "NB2568002", 40)),
      resumenCsv: RESUMEN_OK,
    };
    const r = await syncEmpresaIngresos("vistana", undefined, HOY);
    expect(r.ok).toBe(false);
    expect(escrituras).toHaveLength(0);
    expect(logFinal.status).toBe("error");
    expect(r.error).toMatch(/NO CUADRA/);
    expect(r.error).toMatch(/19-000000901/); // dice CUÁL falta
  });

  it("un documento con DISTINTA cantidad → error y CERO escrituras", async () => {
    csvsDevueltos = {
      detalleCsv: csvDetalle(
        det("19-000000900", "NB2568001", 60),
        det("19-000000900", "NB2568002", 40),
        det("19-000000901", "NB2570001", 119, "2026-08-21"), // una unidad menos
      ),
      resumenCsv: RESUMEN_OK,
    };
    const r = await syncEmpresaIngresos("vistana", undefined, HOY);
    expect(r.ok).toBe(false);
    expect(escrituras).toHaveLength(0);
    expect(r.error).toMatch(/19-000000901/);
  });

  it("DOS ERRORES QUE SE COMPENSAN no pasan: el gran total da igual", async () => {
    // 100 y 120 → 120 y 100. El total sigue siendo 220 y son dos documentos
    // mal cargados. Por eso el cuadre es POR DOCUMENTO, no por total.
    csvsDevueltos = {
      detalleCsv: csvDetalle(
        det("19-000000900", "NB2568001", 120),
        det("19-000000901", "NB2570001", 100, "2026-08-21"),
      ),
      resumenCsv: RESUMEN_OK,
    };
    const r = await syncEmpresaIngresos("vistana", undefined, HOY);
    expect(r.cuadre).toBeNull();
    expect(r.ok).toBe(false);
    expect(escrituras).toHaveLength(0);
  });

  it("la sesión se CIERRA aunque el cuadre falle", async () => {
    csvsDevueltos = { detalleCsv: csvDetalle(det("19-000000900", "X", 1)), resumenCsv: RESUMEN_OK };
    await syncEmpresaIngresos("vistana", undefined, HOY);
    expect(sesionesCerradas).toEqual(["vistana"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("los otros dos guards, también fail-closed", () => {
  it("CERO SILENCIOSO: reporte vacío con la ventana ya cargada → error, sin escribir", async () => {
    guardadasEnVentana = [{ n_interno: "19-000000899", linea: 1 }];
    csvsDevueltos = { detalleCsv: csvDetalle(), resumenCsv: csvResumen() };
    const r = await syncEmpresaIngresos("vistana", undefined, HOY);
    expect(r.ok).toBe(false);
    expect(escrituras).toHaveLength(0);
    expect(r.error).toMatch(/vac[ií]o/i);
  });

  it("una ventana LEGÍTIMAMENTE vacía no es un error", async () => {
    guardadasEnVentana = [];
    csvsDevueltos = { detalleCsv: csvDetalle(), resumenCsv: csvResumen() };
    const r = await syncEmpresaIngresos("joystep", undefined, HOY);
    expect(r.ok).toBe(true);
    expect(r.lineas).toBe(0);
    expect(filasEscritas()).toHaveLength(0);
  });

  it("BARRIDO CORTO: menos del 70% de lo ya cargado → error, sin escribir", async () => {
    guardadasEnVentana = Array.from({ length: 10 }, (_, i) => ({
      n_interno: `19-0000008${String(i).padStart(2, "0")}`,
      linea: 1,
    }));
    // El detalle trae 3 contra 10 → 30%.
    const r = await syncEmpresaIngresos("vistana", undefined, HOY);
    expect(r.ok).toBe(false);
    expect(escrituras).toHaveLength(0);
    expect(r.error).toMatch(/a medias/);
  });

  it("el umbral es holgado: justo por encima del 70% SÍ escribe", async () => {
    guardadasEnVentana = Array.from({ length: 4 }, (_, i) => ({ n_interno: `d${i}`, linea: 1 }));
    expect(3).toBeGreaterThanOrEqual(4 * UMBRAL_BARRIDO_CORTO);
    const r = await syncEmpresaIngresos("vistana", undefined, HOY);
    expect(r.ok).toBe(true);
    expect(filasEscritas()).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 la escritura es UPSERT + poda de la cola, nunca DELETE + INSERT", () => {
  it("upsert sobre la llave (empresa_key, n_interno, linea)", async () => {
    await syncEmpresaIngresos("vistana", undefined, HOY);
    const ups = escrituras.filter((e) => e.tipo === "upsert");
    expect(ups.length).toBeGreaterThan(0);
    for (const u of ups) {
      expect(u.tabla).toBe("switch_ingresos_mercancia");
      expect(u.onConflict).toBe("empresa_key,n_interno,linea");
    }
  });

  it("con la ventana ya cargada IGUAL, no se borra una sola fila", async () => {
    // El documento tiene las MISMAS líneas que antes: nada que podar.
    guardadasEnVentana = [
      { n_interno: "19-000000900", linea: 1 },
      { n_interno: "19-000000900", linea: 2 },
      { n_interno: "19-000000901", linea: 1 },
    ];
    await syncEmpresaIngresos("vistana", undefined, HOY);
    expect(escrituras.filter((e) => e.tipo === "delete")).toHaveLength(0);
  });

  it("un documento que se ACHICÓ poda solo su cola (linea > la última nueva)", async () => {
    guardadasEnVentana = [
      { n_interno: "19-000000900", linea: 1 },
      { n_interno: "19-000000900", linea: 2 },
      { n_interno: "19-000000900", linea: 3 }, // sobra: ahora el doc tiene 2
      { n_interno: "19-000000901", linea: 1 },
    ];
    const r = await syncEmpresaIngresos("vistana", undefined, HOY);
    const dels = escrituras.filter((e) => e.tipo === "delete");
    expect(dels).toHaveLength(1);
    expect(dels[0].filtros).toMatchObject({
      "eq:empresa_key": "vistana",
      "eq:n_interno": "19-000000900",
      "gt:linea": 2,
    });
    expect(r.filasPodadas).toBe(1);
  });

  it("EL UPSERT VA ANTES QUE LA PODA — no puede haber un instante sin la fila", async () => {
    guardadasEnVentana = [
      { n_interno: "19-000000900", linea: 1 },
      { n_interno: "19-000000900", linea: 2 },
      { n_interno: "19-000000900", linea: 9 },
      { n_interno: "19-000000901", linea: 1 },
    ];
    await syncEmpresaIngresos("vistana", undefined, HOY);
    const primerDelete = escrituras.findIndex((e) => e.tipo === "delete");
    const ultimoUpsert = escrituras.map((e) => e.tipo).lastIndexOf("upsert");
    expect(primerDelete).toBeGreaterThan(ultimoUpsert);
  });

  it("un documento ausente del reporte NO se borra: se REPORTA", async () => {
    guardadasEnVentana = [
      { n_interno: "19-000000900", linea: 1 },
      { n_interno: "19-000000900", linea: 2 },
      { n_interno: "19-000000901", linea: 1 },
      { n_interno: "19-000000777", linea: 1 }, // el reporte no lo trajo
    ];
    const r = await syncEmpresaIngresos("vistana", undefined, HOY);
    expect(r.documentosSoloEnLaBase).toEqual(["19-000000777"]);
    // Y NADIE lo borró: la ausencia también es la firma de una descarga a medias.
    const dels = escrituras.filter((e) => e.tipo === "delete");
    expect(dels.some((d) => d.filtros?.["eq:n_interno"] === "19-000000777")).toBe(false);
  });

  it("reporta cuáles documentos son NUEVOS", async () => {
    guardadasEnVentana = [{ n_interno: "19-000000900", linea: 1 }];
    const r = await syncEmpresaIngresos("vistana", undefined, HOY);
    expect(r.documentosNuevos).toEqual(["19-000000901"]);
  });

  it("cada fila escrita lleva su empresa y su llave completa", async () => {
    await syncEmpresaIngresos("fashion_wear", undefined, HOY);
    for (const f of filasEscritas()) {
      expect(f.empresa_key).toBe("fashion_wear");
      expect(typeof f.n_interno).toBe("string");
      expect(typeof f.linea).toBe("number");
      // La tabla tiene DEFAULT pero NO trigger: en un upsert hay que ponerlo.
      expect(typeof f.updated_at).toBe("string");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la ventana es INCREMENTAL y se estira si el hueco es mayor (PURA)", () => {
  it("con datos frescos usa la ventana normal", () => {
    const v = ventanaIngresos("2026-08-25", "2026-08-24");
    expect(v).toEqual({ desde: "2026-07-11", hasta: "2026-08-25", recortada: false });
  });

  it("sin nada cargado NO intenta traer la historia entera", () => {
    const v = ventanaIngresos("2026-08-25", null);
    expect(v.desde).toBe("2026-07-11");
    expect(v.recortada).toBe(false);
  });

  it("un hueco más viejo que la ventana SE CUBRE, con solape", () => {
    // joystep tenía datos hasta el 27-ene: con 45 días pelados el hueco no se
    // habría cerrado NUNCA.
    const v = ventanaIngresos("2026-08-25", "2026-01-27");
    expect(v.desde).toBe("2026-01-20"); // 27-ene menos SOLAPE_DIAS
    expect(v.recortada).toBe(false);
  });

  it("un hueco absurdo se RECORTA y se dice: eso es un backfill, no un cron", () => {
    const v = ventanaIngresos("2026-08-25", "2022-10-25");
    expect(v.desde).toBe("2025-07-21"); // hoy − VENTANA_MAX_DIAS
    expect(v.recortada).toBe(true);
  });

  it("las constantes son las esperadas", () => {
    expect(VENTANA_DIAS).toBe(45);
    expect(SOLAPE_DIAS).toBe(7);
    expect(VENTANA_MAX_DIAS).toBe(400);
  });

  it("el rango que se le pide a Switch es el de la ventana", async () => {
    ultimaFecha = "2026-08-07";
    await syncEmpresaIngresos("vistana", undefined, HOY);
    expect(rangosPedidos).toEqual([{ desde: "2026-07-11", hasta: "2026-08-25" }]);
  });

  it("un rango explícito manda sobre la ventana (backfill acotado)", async () => {
    await syncEmpresaIngresos("vistana", { desde: "2026-08-01", hasta: "2026-08-24" }, HOY);
    expect(rangosPedidos).toEqual([{ desde: "2026-08-01", hasta: "2026-08-24" }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 SOLO las 6 empresas de Fashion Group", () => {
  it("son exactamente las 6", () => {
    expect([...INGRESOS_EMPRESA_KEYS].sort()).toEqual(
      ["active_shoes", "active_wear", "fashion_shoes", "fashion_wear", "joystep", "vistana"].sort(),
    );
  });

  it("confecciones_boston y american_classic quedan FUERA", () => {
    expect(INGRESOS_EMPRESA_KEYS).not.toContain("confecciones_boston");
    expect(INGRESOS_EMPRESA_KEYS).not.toContain("american_classic");
  });

  it("🔑 es la MISMA lista que lee Ventas › Referencia, no una copia", () => {
    // Si el que ESCRIBE y el que LEE tuvieran dos listas, podrían separarse sin
    // que nada avise: una empresa cargada que la pantalla nunca muestra, o una
    // que la pantalla muestra vacía para siempre.
    expect([...INGRESOS_EMPRESA_KEYS].sort()).toEqual([...REFERENCIA_EMPRESA_KEYS].sort());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el sync_type y su DDL", () => {
  it("'ingresos_mercancia' está en SYNC_LOG_TYPES", () => {
    expect(SYNC_LOG_TYPES).toContain("ingresos_mercancia");
  });

  it("🔴 SIN la DDL corrida el cron SIGUE ESCRIBIENDO las compras", async () => {
    // El logger es degradable: sin el CHECK, createSwitchSyncLog devuelve null.
    // Eso NO puede impedir que las compras entren — la tabla existe desde el
    // 11-ago. Lo único que falta es la trazabilidad, y se REPORTA.
    logIdDevuelto = null;
    const r = await syncEmpresaIngresos("vistana", undefined, HOY);
    expect(r.ok).toBe(true);
    expect(r.logRegistrado).toBe(false);
    expect(filasEscritas()).toHaveLength(3);
  });

  it("con la DDL corrida, se registra", async () => {
    const r = await syncEmpresaIngresos("vistana", undefined, HOY);
    expect(r.logRegistrado).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("un fallo de red no tumba nada ni deja la sesión abierta", () => {
  it("login caído → ok:false, cero escrituras, log en error", async () => {
    loginFalla = true;
    const r = await syncEmpresaIngresos("vistana", undefined, HOY);
    expect(r.ok).toBe(false);
    expect(escrituras).toHaveLength(0);
    expect(logFinal.status).toBe("error");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("barridos estáticos (con los comentarios BORRADOS primero)", () => {
  const SRC = path.join(process.cwd(), "src");
  const sinComentarios = (rel: string) =>
    fs
      .readFileSync(path.join(SRC, rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

  const LIB = path.join("lib", "switch-api", "ingresos-mercancia-web.ts");

  it("no hay un segundo parser: se llama al módulo PURO", () => {
    const src = sinComentarios(LIB);
    expect(src).toMatch(/from "\.\/ingresos-mercancia"/);
    expect(src).toMatch(/parseDetalleCsv/);
    expect(src).toMatch(/parseResumenCsv/);
    expect(src).toMatch(/cuadrar\(/);
  });

  it("🔴 el único DELETE de la tabla acota por documento Y por línea", () => {
    const src = sinComentarios(LIB);
    const borrados = [...src.matchAll(/\.delete\(/g)];
    expect(borrados.length, "un DELETE de más acá borra compras").toBe(1);
    // Y lleva sus tres filtros: empresa, documento y el corte de la cola.
    expect(src).toMatch(/\.delete\([^)]*\)[\s\S]{0,220}?\.gt\("linea"/);
    expect(src).toMatch(/\.delete\([^)]*\)[\s\S]{0,220}?\.eq\("n_interno"/);
    expect(src).toMatch(/\.delete\([^)]*\)[\s\S]{0,220}?\.eq\("empresa_key"/);
  });

  it("la lectura de la ventana PAGINA: db-max-rows corta en silencio", () => {
    const src = sinComentarios(LIB);
    expect(src).toMatch(/leerTodoPaginado/);
    expect(src).toMatch(/\.order\("n_interno"/);
    expect(src).toMatch(/\.order\("linea"/);
    // Nada de un .range() con tope propio, que es el disfraz del mismo bug.
    expect(src).not.toMatch(/\.range\(\s*0\s*,\s*\d{4,}/);
  });

  it("las empresas se DERIVAN, no se escriben a mano", () => {
    const src = sinComentarios(LIB);
    expect(src).toMatch(/B2B_EMPRESA_KEYS/);
    expect(src).not.toMatch(/"confecciones_boston"/);
    expect(src).not.toMatch(/"american_classic"/);
  });

  it("el route reusa alertSwitchCronErrors: no estrena una alerta nueva", () => {
    const src = sinComentarios(path.join("app", "api", "cron", "sync-ingresos-mercancia", "route.ts"));
    expect(src).toMatch(/alertSwitchCronErrors/);
    expect(src).toMatch(/recordCronHeartbeat/);
    // El heartbeat SOLO si todo salió bien.
    expect(src).toMatch(/fallidas\.length === 0[\s\S]{0,120}recordCronHeartbeat/);
    expect(src).not.toMatch(/sendTelegramAlert|enviarSistema|enviarNegocio/);
  });

  it("las empresas se filtran contra el universo, no se confía en la URL", () => {
    const src = sinComentarios(path.join("app", "api", "cron", "sync-ingresos-mercancia", "route.ts"));
    expect(src).toMatch(/INGRESOS_EMPRESA_KEYS\.includes/);
  });

  it("la migración del CHECK es ADITIVA y no nombra ninguna tabla de negocio", () => {
    const sql = fs
      .readFileSync(
        path.join(
          process.cwd(),
          "supabase",
          "migrations",
          "20260825090000_switch_sync_log_ingresos_mercancia.sql",
        ),
        "utf8",
      )
      .replace(/^\s*--.*$/gm, "");
    expect(sql).toMatch(/'ingresos_mercancia'/);
    expect(sql).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
    expect(sql).not.toMatch(/switch_ingresos_mercancia/);
  });
});
