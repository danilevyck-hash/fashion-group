/**
 * CANDADO — MARKETING › LA FOTO VA A LA TIENDA DEL PERÍODO ABIERTO, Y LA MARCA
 * SE ELIGE (24-sep-2026).
 *
 * Daniel, textual: *«las fotos deben ir a la tienda del período abierto; un
 * período cerrado, nada debe entrar ni salir»*.
 *
 * Los períodos son POR MARCA (`mk_periodos.proveedor_key`), así que una tienda
 * puede tener DOS abiertos a la vez. Medido contra producción el 24-sep-2026,
 * solo lectura:
 *
 *   · 4 tiendas tienen gastos vivos sellados a un período ABIERTO;
 *   · 3 de esas 4 tienen DOS marcas abiertas — Outlet Duty Free N3 (D-118:
 *     Tommy `f1ac9b37…` + Calvin `cefdd262…`), D-170 y el cajón «General»;
 *   · D-87 tiene UNA sola (Joybees);
 *   · 1 período cerrado en toda la base: «mid 2026» · PVH, `8e2ee894…`;
 *   · la migración `20261219130000` está APLICADA: `mk_adjuntos.periodo_id`
 *     existe y 52 de las 60 fotos ya están selladas.
 *
 * 🩸 Hasta hoy la foto se sellaba sola al período de la marca del gasto MÁS
 * RECIENTE de la tienda. En D-118 eso mandaba las cuatro fotos de Daniel a
 * Tommy sin preguntarle, y la del 21-sep de Calvin quedaba sin respaldo.
 *
 * Lo que este archivo no deja aflojar:
 *   1. UNA marca abierta → no se pregunta nada y el sello es ésa.
 *   2. DOS o más → se pregunta, y el sello es la ELEGIDA. Sin elegir, 400 en
 *      español y el archivo recién subido se borra del cajón.
 *   3. A UN PERÍODO CERRADO NO ENTRA NI SALE NADA: la ruta lo rechaza con su
 *      propio aviso, y el ZIP de un período cerrado no cambia por fotos
 *      nuevas. Con barrido.
 *   4. LA PANTALLA PREGUNTA ANTES DE ABRIR EL SELECTOR DE ARCHIVO, y no
 *      preselecciona ninguna marca.
 *   5. APAGADO = COMO ANTES.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
  process.env.SESSION_SECRET ||= "test-secret";
});

// ── Un Supabase de mentira que SÍ respeta los filtros que importan ──────────
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
  const datosDe = (tabla: string): Array<Record<string, unknown>> => {
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
    const filtros: Array<(f: Record<string, unknown>) => boolean> = [];
    const q: Record<string, unknown> = {};
    const paso = () => () => q;
    for (const op of ["select", "is", "order", "not", "limit"]) q[op] = paso();
    q.eq = (col: string, val: unknown) => {
      filtros.push((f) => String(f[col] ?? "") === String(val));
      return q;
    };
    q.in = (col: string, vals: unknown[]) => {
      const set = new Set(vals.map(String));
      filtros.push((f) => set.has(String(f[col] ?? "")));
      return q;
    };
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
      const filas = datosDe(tabla).filter((f) => filtros.every((p) => p(f)));
      return resolve({ data: filas, error: null, count: null });
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
          createSignedUrl: async (p: string) => ({
            data: { signedUrl: `https://firmada/${p}` },
            error: null,
          }),
        }),
      },
    },
  };
});

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: fake.supabaseServer, HAS_SERVICE_ROLE: true }));
vi.mock("@/lib/requireRole", () => ({ requireRole: () => ({ role: "admin", userId: "u1" }) }));

import {
  AVISO_ELIGE_LA_MARCA,
  AVISO_MARCA_AJENA,
  AVISO_PERIODO_CERRADO,
  MARKETING_FOTOS_CON_PERIODO,
  PREGUNTA_DE_LA_MARCA,
  destinoDeFotoNueva,
  marcaElegidaEntre,
  marcasAbiertasOrdenadas,
  necesitaElegirMarca,
  nombreDeMarcaAbierta,
  type MarcaAbiertaDeLaTienda,
} from "@/lib/marketing/fotos-periodo";
import { armarFotosPorCarpeta } from "@/lib/marketing/zip-marca";

const RAIZ = path.resolve(__dirname, "..", "..", "..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const RUTA = "src/app/api/marketing/tienda/[codigo]/fotos/route.ts";
const RUTA_MARCAS = "src/app/api/marketing/tienda/[codigo]/fotos/marcas/route.ts";
const PURO = "src/lib/marketing/fotos-periodo.ts";
const SERVIDOR = "src/lib/marketing/fotos-periodo-server.ts";
const PANTALLA = "src/app/marketing/components/FotosSection.tsx";
const SCRIPT = "scripts/marketing-rescatar-fotos-huerfanas.ts";

// Producción, 24-sep-2026.
const MID_2026 = "8e2ee894-2b68-47f2-b342-b6c0bc9f5a0a";
const TH_ABIERTO = "f1ac9b37-61af-4d84-8fc1-fe8bb3fc4d86";
const CK_ABIERTO = "cefdd262-f398-491a-a8b9-0e0dc73b89e8";
const J_ABIERTO = "1eaecba0-036d-4746-9722-766629c6f65c";

const TOMMY: MarcaAbiertaDeLaTienda = { periodoId: TH_ABIERTO, proveedorKey: "TH", nombre: "Tommy Hilfiger" };
const CALVIN: MarcaAbiertaDeLaTienda = { periodoId: CK_ABIERTO, proveedorKey: "CK", nombre: "Calvin Klein" };
const JOYBEES: MarcaAbiertaDeLaTienda = { periodoId: J_ABIERTO, proveedorKey: "J", nombre: "Joybees" };

// ─── 0. LA REGLA, PURA ───────────────────────────────────────────────────────

describe("0. la regla pura: una marca no se pregunta, dos sí", () => {
  it("sin marcas abiertas la foto queda SIN sello, como hoy", () => {
    const d = destinoDeFotoNueva([], "");
    expect(d.ok).toBe(true);
    expect(d.periodoId).toBeNull();
    expect(d.faltaElegir).toBe(false);
  });

  it("UNA marca abierta: va ahí, sin preguntar", () => {
    expect(necesitaElegirMarca([JOYBEES])).toBe(false);
    const d = destinoDeFotoNueva([JOYBEES], "");
    expect(d.ok).toBe(true);
    expect(d.periodoId).toBe(J_ABIERTO);
    expect(d.faltaElegir).toBe(false);
  });

  it("DOS marcas y nada elegido: no se adivina — se pide elegir", () => {
    expect(necesitaElegirMarca([TOMMY, CALVIN])).toBe(true);
    const d = destinoDeFotoNueva([TOMMY, CALVIN], "");
    expect(d.ok).toBe(false);
    expect(d.faltaElegir).toBe(true);
    expect(d.periodoId).toBeNull();
    expect(d.error).toBe(AVISO_ELIGE_LA_MARCA);
  });

  it("DOS marcas y una elegida: el sello es la ELEGIDA, por id o por clave", () => {
    expect(destinoDeFotoNueva([TOMMY, CALVIN], CK_ABIERTO).periodoId).toBe(CK_ABIERTO);
    expect(destinoDeFotoNueva([TOMMY, CALVIN], "CK").periodoId).toBe(CK_ABIERTO);
    expect(destinoDeFotoNueva([TOMMY, CALVIN], "ck").periodoId).toBe(CK_ABIERTO);
    expect(destinoDeFotoNueva([TOMMY, CALVIN], TH_ABIERTO).periodoId).toBe(TH_ABIERTO);
  });

  it("una marca que NO es de esta tienda se rechaza, nunca cae en la primera", () => {
    const d = destinoDeFotoNueva([TOMMY, CALVIN], "RBK");
    expect(d.ok).toBe(false);
    expect(d.periodoId).toBeNull();
    expect(d.error).toBe(AVISO_MARCA_AJENA);
    // Y con UNA sola abierta, tampoco: elegir mal no se corrige solo.
    expect(destinoDeFotoNueva([JOYBEES], "TH").ok).toBe(false);
  });

  it("un período CERRADO nunca está entre las opciones, así que se rechaza", () => {
    expect(marcaElegidaEntre([TOMMY, CALVIN], MID_2026)).toBeNull();
    expect(destinoDeFotoNueva([TOMMY, CALVIN], MID_2026).ok).toBe(false);
  });

  it("las opciones salen sin repetir y en el orden de siempre", () => {
    const m = marcasAbiertasOrdenadas([
      { periodoId: CK_ABIERTO, proveedorKey: "CK" },
      { periodoId: TH_ABIERTO, proveedorKey: "TH" },
      { periodoId: CK_ABIERTO, proveedorKey: "CK" },
    ]);
    expect(m.map((x) => x.proveedorKey)).toEqual(["TH", "CK"]);
    expect(m.map((x) => x.nombre)).toEqual(["Tommy Hilfiger", "Calvin Klein"]);
  });

  it("una clave desconocida no se adivina: se lee tal cual", () => {
    expect(nombreDeMarcaAbierta("TH")).toBe("Tommy Hilfiger");
    expect(nombreDeMarcaAbierta("pvh")).toBe("PVH");
    expect(nombreDeMarcaAbierta("XYZ")).toBe("XYZ");
    expect(nombreDeMarcaAbierta("")).toBe("");
  });

  it("los tres avisos están en español y sin voseo", () => {
    for (const t of [AVISO_ELIGE_LA_MARCA, AVISO_MARCA_AJENA, AVISO_PERIODO_CERRADO, PREGUNTA_DE_LA_MARCA]) {
      expect(t).not.toMatch(/eleg[ií]|escrib[ií]|mir[áa]\b|ten[ée]s|pod[ée]s|ac[áa]\b/);
      expect(t.length).toBeGreaterThan(10);
    }
    expect(AVISO_PERIODO_CERRADO).toMatch(/cerrado/);
  });
});

// ─── 1, 2 Y 3. LA PUERTA ─────────────────────────────────────────────────────

async function postFoto(opts: {
  url?: string;
  periodoId?: string;
  marca?: string;
  codigo?: string;
} = {}) {
  const { POST } = await import("@/app/api/marketing/tienda/[codigo]/fotos/route");
  const req = {
    json: async () => ({
      url: opts.url ?? "tienda/D-118/foto.jpeg",
      nombreOriginal: "foto.jpeg",
      sizeBytes: 123,
      ...(opts.periodoId ? { periodoId: opts.periodoId } : {}),
      ...(opts.marca ? { marca: opts.marca } : {}),
    }),
  } as unknown as Parameters<typeof POST>[0];
  return POST(req, { params: { codigo: opts.codigo ?? "D-118" } });
}

function ponerD118DosMarcas() {
  // D-118 tal como está en producción: Calvin del 21-sep y Tommy del 21-sep.
  fake.estado.facturas = [
    { id: "fac-ck", tienda_codigo: "D-118", created_at: "2026-09-23T16:23:15Z", fecha_factura: "2026-09-21", anulado_en: null },
    { id: "fac-th", tienda_codigo: "D-118", created_at: "2026-09-23T16:26:28Z", fecha_factura: "2026-09-21", anulado_en: null },
  ];
  fake.estado.entregas = [];
  fake.estado.sellos = [
    { documento_id: "fac-ck", periodo_id: CK_ABIERTO },
    { documento_id: "fac-th", periodo_id: TH_ABIERTO },
  ];
  fake.estado.periodos = [
    { id: CK_ABIERTO, proveedor_key: "CK", estado: "abierto" },
    { id: TH_ABIERTO, proveedor_key: "TH", estado: "abierto" },
    { id: MID_2026, proveedor_key: "pvh", estado: "cerrado" },
  ];
}

function ponerD87UnaMarca() {
  // D-87: una sola marca abierta (Joybees).
  fake.estado.facturas = [
    { id: "fac-j", tienda_codigo: "D-87", created_at: "2026-09-10T10:00:00Z", fecha_factura: "2026-09-10", anulado_en: null },
  ];
  fake.estado.entregas = [];
  fake.estado.sellos = [{ documento_id: "fac-j", periodo_id: J_ABIERTO }];
  fake.estado.periodos = [
    { id: J_ABIERTO, proveedor_key: "J", estado: "abierto" },
    { id: MID_2026, proveedor_key: "pvh", estado: "cerrado" },
  ];
}

describe("1. UNA marca abierta: se sella sin preguntar", () => {
  beforeEach(() => {
    fake.inserts.length = 0;
    fake.removidos.length = 0;
    fake.estado.errorInsert = null;
    ponerD87UnaMarca();
  });

  it("la foto entra con el sello de su única marca, y no se borra nada", async () => {
    const res = await postFoto({ codigo: "D-87", url: "tienda/D-87/foto.jpeg" });
    expect(res.status).toBe(200);
    const fila = fake.inserts.find((i) => i.tabla === "mk_adjuntos")?.fila ?? {};
    expect(fila.tienda_codigo).toBe("D-87");
    expect(fila.periodo_id).toBe(J_ABIERTO);
    expect(fake.removidos).toEqual([]);
  });

  it("la ruta de las marcas dice UNA y que no hay que elegir", async () => {
    const { GET } = await import("@/app/api/marketing/tienda/[codigo]/fotos/marcas/route");
    const res = await GET({} as never, { params: { codigo: "D-87" } });
    const body = (await res.json()) as { marcas: MarcaAbiertaDeLaTienda[]; hayQueElegir: boolean };
    expect(body.marcas.map((m) => m.proveedorKey)).toEqual(["J"]);
    expect(body.hayQueElegir).toBe(false);
  });
});

describe("2. DOS marcas abiertas: se pregunta, y el sello es la elegida", () => {
  beforeEach(() => {
    fake.inserts.length = 0;
    fake.removidos.length = 0;
    fake.estado.errorInsert = null;
    ponerD118DosMarcas();
  });

  it("la ruta de las marcas ofrece las DOS, en el orden de siempre", async () => {
    const { GET } = await import("@/app/api/marketing/tienda/[codigo]/fotos/marcas/route");
    const res = await GET({} as never, { params: { codigo: "D-118" } });
    const body = (await res.json()) as { marcas: MarcaAbiertaDeLaTienda[]; hayQueElegir: boolean };
    expect(body.marcas.map((m) => m.nombre)).toEqual(["Tommy Hilfiger", "Calvin Klein"]);
    expect(body.hayQueElegir).toBe(true);
  });

  it("sin elegir: 400 en español, NADA se inserta y el archivo no queda tirado", async () => {
    const res = await postFoto({ url: "tienda/D-118/sin-elegir.jpeg" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; faltaElegir: boolean; marcas: MarcaAbiertaDeLaTienda[] };
    expect(body.error).toBe(AVISO_ELIGE_LA_MARCA);
    expect(body.faltaElegir).toBe(true);
    expect(body.marcas.map((m) => m.proveedorKey)).toEqual(["TH", "CK"]);
    expect(fake.inserts.filter((i) => i.tabla === "mk_adjuntos")).toEqual([]);
    expect(fake.removidos).toEqual([["tienda/D-118/sin-elegir.jpeg"]]);
  });

  it("con Calvin elegido, el sello es Calvin — no el gasto más reciente", async () => {
    const res = await postFoto({ periodoId: CK_ABIERTO });
    expect(res.status).toBe(200);
    expect(fake.inserts.find((i) => i.tabla === "mk_adjuntos")?.fila.periodo_id).toBe(CK_ABIERTO);
    expect(fake.removidos).toEqual([]);
  });

  it("la marca también se puede mandar por su clave", async () => {
    const res = await postFoto({ marca: "TH" });
    expect(res.status).toBe(200);
    expect(fake.inserts.find((i) => i.tabla === "mk_adjuntos")?.fila.periodo_id).toBe(TH_ABIERTO);
  });

  it("una marca que no es de esta tienda: 400, y nada se guarda", async () => {
    const res = await postFoto({ marca: "RBK", url: "tienda/D-118/ajena.jpeg" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(AVISO_MARCA_AJENA);
    expect(fake.inserts.filter((i) => i.tabla === "mk_adjuntos")).toEqual([]);
    expect(fake.removidos).toEqual([["tienda/D-118/ajena.jpeg"]]);
  });
});

describe("3. a un período CERRADO no entra ni sale nada", () => {
  beforeEach(() => {
    fake.inserts.length = 0;
    fake.removidos.length = 0;
    fake.estado.errorInsert = null;
    ponerD118DosMarcas();
  });

  it("sellar a «mid 2026» se rechaza con SU aviso, no con el genérico", async () => {
    const res = await postFoto({ periodoId: MID_2026, url: "tienda/D-118/al-cerrado.jpeg" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe(AVISO_PERIODO_CERRADO);
    expect(fake.inserts.filter((i) => i.tabla === "mk_adjuntos")).toEqual([]);
    expect(fake.removidos).toEqual([["tienda/D-118/al-cerrado.jpeg"]]);
  });

  it("el ZIP de un período cerrado NO cambia por una foto nueva", () => {
    const gastos = [
      { tipo: "factura" as const, documentoId: "fac-vieja", fecha: "2026-06-10", numero: "1", concepto: "", proveedor: "", periodoTrabajado: "", carpeta: "Outlet Duty Free N3", clienteCodigo: "D-118", monto: 100 },
    ];
    const adjuntos = [
      // La vieja, sellada al cerrado: ésa sí viaja en el ZIP de «mid 2026».
      { id: "vieja", tipo: "foto_proyecto", factura_id: null, proyecto_id: null, url: "a.jpg", nombre_original: "a.jpg", tienda_codigo: "D-118", periodo_id: MID_2026 },
      // Las nuevas, selladas a un ABIERTO: no entran a un ZIP ya cerrado.
      { id: "nueva-th", tipo: "foto_proyecto", factura_id: null, proyecto_id: null, url: "b.jpg", nombre_original: "b.jpg", tienda_codigo: "D-118", periodo_id: TH_ABIERTO },
      { id: "nueva-ck", tipo: "foto_proyecto", factura_id: null, proyecto_id: null, url: "c.jpg", nombre_original: "c.jpg", tienda_codigo: "D-118", periodo_id: CK_ABIERTO },
      // Y una SIN sello tampoco: nunca se le pasó a ninguna marca.
      { id: "sin-sello", tipo: "foto_proyecto", factura_id: null, proyecto_id: null, url: "d.jpg", nombre_original: "d.jpg", tienda_codigo: "D-118", periodo_id: null },
    ];
    const ctx = { proyectoDeFactura: () => null, proyectoDeEntrega: () => null };
    const cerrado = armarFotosPorCarpeta(gastos, adjuntos, { ...ctx, periodoId: MID_2026 });
    expect((cerrado.get("Outlet Duty Free N3") ?? []).map((a) => a.id)).toEqual(["vieja"]);
    // Y el ZIP del período de Tommy se lleva la suya, no la de Calvin.
    const deTommy = armarFotosPorCarpeta(gastos, adjuntos, { ...ctx, periodoId: TH_ABIERTO });
    expect((deTommy.get("Outlet Duty Free N3") ?? []).map((a) => a.id)).toEqual(["nueva-th"]);
  });

  it("BARRIDO: nadie sella una foto por su cuenta — todo pasa por `destinoDeFotoNueva`", () => {
    const ruta = leer(RUTA);
    // El sello de la puerta sale de la función pura, con las marcas ABIERTAS.
    expect(ruta).toMatch(/const destino = destinoDeFotoNueva\(marcas, elegido\)/);
    expect(ruta).toMatch(/const periodoId = destino\.periodoId/);
    // Y no hay un segundo camino que escriba el sello a mano.
    expect(ruta).not.toMatch(/periodo_id:\s*["'`]/);
    // El servidor solo ofrece períodos ABIERTOS.
    expect(leer(SERVIDOR)).toMatch(/\.eq\("estado", "abierto"\)/);
    expect(leer(SCRIPT)).toMatch(/\.eq\("estado", "abierto"\)/);
    // El script usa la MISMA función pura: ninguna regla escrita dos veces.
    expect(leer(SCRIPT)).toMatch(/destinoDeFotoNueva/);
    expect(leer(SCRIPT)).toMatch(/--marca=/);
    // 🔴 Y NADIE MÁS SELLA UNA FOTO: ni un archivo del módulo ni una ruta
    // escribe `periodo_id` en `mk_adjuntos`. La única puerta es ésta.
    const sellan: string[] = [];
    const barrer = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          barrer(p);
          continue;
        }
        if (!/\.tsx?$/.test(e.name)) continue;
        const src = fs.readFileSync(p, "utf8");
        if (!/periodo_id/.test(src)) continue;
        if (!/mk_adjuntos/.test(src)) continue;
        // Escribir es `.insert(` o `.update(` sobre `mk_adjuntos`.
        if (!/from\("mk_adjuntos"\)[\s\S]{0,300}?\.(insert|update|upsert)\(/.test(src)) continue;
        sellan.push(path.relative(RAIZ, p));
      }
    };
    barrer(path.join(RAIZ, "src/lib/marketing"));
    barrer(path.join(RAIZ, "src/app/api/marketing"));
    expect(sellan).toEqual([RUTA]);
  });
});

// ─── 4. LA PANTALLA PREGUNTA ─────────────────────────────────────────────────

// 🔑 El toast tiene que ser SIEMPRE el mismo objeto: `cargar` lo lleva de
// dependencia y uno nuevo en cada pintado deja la sección cargando para
// siempre.
const toastEstable = vi.hoisted(() => ({ toast: () => {} }));
vi.mock("@/components/ToastSystem", () => ({ useToast: () => toastEstable }));

function ponerFetch(marcas: MarcaAbiertaDeLaTienda[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entrada: unknown) => {
      const u = String(entrada);
      if (u.includes("/fotos/marcas")) {
        return { ok: true, json: async () => ({ marcas, hayQueElegir: marcas.length >= 2 }) } as Response;
      }
      return { ok: true, json: async () => [] } as unknown as Response;
    }),
  );
}

describe("4. la pantalla pregunta antes de abrir el selector de archivo", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("con DOS marcas: salen las dos, ninguna viene puesta y no hay botón de subir", async () => {
    ponerFetch([TOMMY, CALVIN]);
    const FotosSection = (await import("@/app/marketing/components/FotosSection")).default;
    render(<FotosSection tiendaCodigo="D-118" periodo="abierto" />);
    await screen.findByText(PREGUNTA_DE_LA_MARCA);
    expect(screen.getAllByText("Tommy Hilfiger").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Calvin Klein").length).toBeGreaterThan(0);
    // Nada preseleccionado: el desplegable arranca vacío.
    const select = screen.getByLabelText(PREGUNTA_DE_LA_MARCA) as HTMLSelectElement;
    expect(select.value).toBe("");
    // Y el selector de archivo todavía no existe.
    expect(screen.queryByText(/Sube fotos de la tienda/)).toBeNull();
  });

  it("al tocar una marca aparece el botón de subir", async () => {
    ponerFetch([TOMMY, CALVIN]);
    const FotosSection = (await import("@/app/marketing/components/FotosSection")).default;
    render(<FotosSection tiendaCodigo="D-118" periodo="abierto" />);
    await screen.findByText(PREGUNTA_DE_LA_MARCA);
    const botones = screen.getAllByRole("button", { name: "Calvin Klein" });
    fireEvent.click(botones[0]);
    await waitFor(() => expect(screen.getByText(/Sube fotos de la tienda/)).toBeTruthy());
  });

  it("con UNA sola marca no se pregunta nada", async () => {
    ponerFetch([JOYBEES]);
    const FotosSection = (await import("@/app/marketing/components/FotosSection")).default;
    render(<FotosSection tiendaCodigo="D-87" periodo="abierto" />);
    await waitFor(() => expect(screen.getByText(/Sube fotos de la tienda/)).toBeTruthy());
    expect(screen.queryByText(PREGUNTA_DE_LA_MARCA)).toBeNull();
  });

  it("los botones del celular son de 44 px, como todo lo que se toca", () => {
    expect(leer(PANTALLA)).toMatch(/min-h-\[44px\][^\n]*rounded-md/);
  });
});

// ─── 5. APAGADO = COMO ANTES ─────────────────────────────────────────────────

describe("5. apagado = como antes", () => {
  it("hoy está prendido, y todo cuelga del MISMO interruptor", () => {
    expect(MARKETING_FOTOS_CON_PERIODO).toBe(true);
    expect(leer(PURO)).toMatch(/if \(!MARKETING_FOTOS_CON_PERIODO\) \{\n\s*return \{ ok: true, periodoId: null/);
    expect(leer(PURO)).toMatch(/return MARKETING_FOTOS_CON_PERIODO && opciones\.length >= 2;/);
    expect(leer(RUTA)).toMatch(/MARKETING_FOTOS_CON_PERIODO\s*\n?\s*\?\s*await marcasAbiertasDeLaTienda/);
    expect(leer(RUTA_MARCAS)).toMatch(/MARKETING_FOTOS_CON_PERIODO/);
    expect(leer(PANTALLA)).toMatch(/if \(!MARKETING_FOTOS_CON_PERIODO \|\| !tiendaCodigo \|\| readonly\) return;/);
  });

  it("nada de lo que se guarda cambia: el sello sigue siendo la MISMA columna", () => {
    const ruta = leer(RUTA);
    expect(ruta).toMatch(/conTienda\.periodo_id = periodoId/);
    expect(ruta).not.toMatch(/ALTER TABLE|ADD COLUMN/i);
    // La fila que se inserta no ganó ni un campo nuevo.
    expect(ruta).toMatch(/proyecto_id: null,\n\s*factura_id: null,\n\s*tipo: "foto_proyecto"/);
  });
});
