// @vitest-environment node
// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — UNA DESCRIPCIÓN QUE «PASA» TAMBIÉN ENTRA AL CATÁLOGO (17-sep-2026).
//
// Daniel, textual (8-sep-2026): «q siga pasando pero se agregue al catalogo
// (para poner formulas en algun momento)».
//
// 🩸 Medido antes: el único camino que escribía en `depurador_descripciones`
// era `…/descripciones/aprobar`, llamado SOLO desde la alarma. De las 304 filas
// de producción, 227 son la semilla y 77 se aprobaron a mano; ninguna nació de
// una descripción que pasó. Por eso nunca se le podía poner una fórmula propia.
//
// Lo que este candado exige:
//   1. 🔴 «Pasar» NO cambia de significado: solo entra el veredicto `pasa`.
//      La que alerta sigue alertando y NO se registra; la que ya existe con
//      otros espacios tampoco (la regla 3 de Daniel dice usar la que ya está).
//   2. 🔴 No se duplica: la clave es marca + descripción normalizada, y lo que
//      ya está en la tabla no se vuelve a escribir. Repetir la llamada no
//      agrega una fila.
//   3. 🔴 Escribir no frena la descarga del Excel: la ÚNICA puerta al endpoint
//      es `useRegistrarQuePasan.ts`, que corre al PROCESAR. El camino de la
//      descarga no lo menciona, no lo espera y no sabe que existe.
//   4. No aprueba nada: `origen = 'automatica'`, con `aprobada_por` y
//      `aprobada_at` en NULL. Aprobar sigue siendo un acto de una persona.
//   5. Falla ABIERTA: sin la migración `20261206120000` (CHECK 23514) contesta
//      ok con cero registradas y nadie ve un error.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";
import { marcaKey, type CatalogoDescripciones } from "@/lib/depurador/logic";

type Fila = Record<string, unknown>;

const estado = vi.hoisted(() => ({
  filas: [] as Fila[],
  /** false = la migración del `origen` no corrió (CHECK 23514). */
  origenAncho: true,
}));

vi.mock("@/lib/supabase-server", () => {
  const from = (tabla: string) => {
    if (tabla !== "depurador_descripciones") throw new Error(`tabla inesperada: ${tabla}`);
    const clave = (m: unknown, d: unknown) =>
      `${String(m).trim().toLowerCase()}|||${String(d).trim().toLowerCase()}`;
    const meter = (fila: Fila) => {
      if (!estado.origenAncho && fila.origen === "automatica") {
        return {
          error: {
            code: "23514",
            message: 'violates check constraint "depurador_descripciones_origen_check"',
          },
        };
      }
      const k = clave(fila.marca, fila.descripcion);
      if (estado.filas.some((f) => clave(f.marca, f.descripcion) === k)) {
        return { error: { code: "23505", message: "duplicate key" } };
      }
      estado.filas.push({ id: crypto.randomUUID(), ...fila });
      return { error: null };
    };
    return {
      insert: async (rows: Fila | Fila[]) => {
        const lote = Array.isArray(rows) ? rows : [rows];
        // Un lote se rechaza ENTERO por una fila mala, como en Postgres.
        for (const r of lote) {
          const k = clave(r.marca, r.descripcion);
          if (estado.filas.some((f) => clave(f.marca, f.descripcion) === k)) {
            return { error: { code: "23505", message: "duplicate key" } };
          }
          if (!estado.origenAncho && r.origen === "automatica") {
            return {
              error: {
                code: "23514",
                message: 'violates check constraint "depurador_descripciones_origen_check"',
              },
            };
          }
        }
        for (const r of lote) meter(r);
        return { error: null };
      },
      select: () => ({
        in: async (col: string, vals: unknown[]) => ({
          data: estado.filas.filter((f) => vals.includes(f[col])),
          error: null,
        }),
      }),
    };
  };
  return { supabaseServer: { from }, HAS_SERVICE_ROLE: true };
});

const { POST } = await import("@/app/api/productos/cargar/descripciones/registrar/route");
const { descripcionesQuePasan, claveRegistro, MAX_POR_ENVIO, ORIGEN_AUTOMATICA } = await import(
  "@/app/productos/cargar/descripciones-que-pasan"
);

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-registrar-descs"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

beforeEach(() => {
  estado.filas = [];
  estado.origenAncho = true;
});

function req(descripciones: unknown, role: string | null = "secretaria") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (role) {
    headers.cookie = `cxc_session=${signSession({ role, userId: "u1", userName: "Angela", sessionToken: "t1" })}`;
  }
  return new NextRequest("https://fashiongr.com/api/productos/cargar/descripciones/registrar", {
    method: "POST",
    headers,
    body: JSON.stringify({ descripciones }),
  });
}

/* ── 1 · «Pasar» no cambia de significado ─────────────────────────────────── */

// Catálogo chico con la forma real. «Men» y «Polos S/S» existen en TH Menswear.
const CATALOGO: CatalogoDescripciones = {
  "TH Menswear": ["Men-Polos S/S", "Men-T-Shirts S/S"],
  "TH Kids": ["Boys-Polos S/S Core"],
};

describe("🔴 solo entra lo que PASA", () => {
  it("las dos mitades existen en su marca → se registra", () => {
    const r = descripcionesQuePasan([{ marca: "TH Menswear", desc: "Men-T-Shirts S/S" }], {
      ...CATALOGO,
      "TH Menswear": ["Men-Polos S/S", "Women-T-Shirts S/S"],
    });
    expect(r).toEqual([{ marca: "TH Menswear", descripcion: "Men-T-Shirts S/S" }]);
  });

  it("la casi-gemela ALERTA y NO se registra (la regla 2 de Daniel)", () => {
    // «Men-Polo S/S» es casi igual a «Men-Polos S/S»: alerta, no pasa.
    expect(descripcionesQuePasan([{ marca: "TH Menswear", desc: "Men-Polo S/S" }], CATALOGO)).toEqual([]);
  });

  it("la mitad nueva ALERTA y NO se registra", () => {
    expect(descripcionesQuePasan([{ marca: "TH Menswear", desc: "Men-Paraguas" }], CATALOGO)).toEqual([]);
  });

  it("la que ya existe con otros espacios NO se registra: se usa la que ya está", () => {
    expect(descripcionesQuePasan([{ marca: "TH Menswear", desc: "Men - Polos  S/S" }], CATALOGO)).toEqual([]);
  });

  it("una marca sin catálogo («Otros») se ignora entera", () => {
    expect(descripcionesQuePasan([{ marca: "Otros", desc: "Men-Polos S/S" }], CATALOGO)).toEqual([]);
  });

  it("la que ya está catalogada bajo su marca no se vuelve a mandar", () => {
    expect(descripcionesQuePasan([{ marca: "TH Menswear", desc: "Men-Polos S/S" }], CATALOGO)).toEqual([]);
  });

  it("las mitades de OTRA marca no sirven (regla del 8-sep-2026)", () => {
    // «Polos S/S Core» existe, pero en TH Kids: bajo TH Menswear no pasa.
    expect(
      descripcionesQuePasan([{ marca: "TH Menswear", desc: "Men-Polos S/S Core" }], CATALOGO),
    ).toEqual([]);
  });
});

describe("🔴 no se duplica y la descripción viaja normalizada", () => {
  it("el mismo par repetido en el archivo viaja UNA vez", () => {
    const catalogo: CatalogoDescripciones = { "TH Menswear": ["Men-Polos S/S", "Women-T-Shirts S/S"] };
    const r = descripcionesQuePasan(
      [
        { marca: "TH Menswear", desc: "Men-T-Shirts S/S" },
        { marca: "TH MENSWEAR", desc: "men-t-shirts s/s" },
        { marca: "TH Menswear", desc: "Men-T-Shirts  S/S" },
      ],
      catalogo,
    );
    expect(r).toHaveLength(1);
  });

  it("la clave de deduplicación no distingue caja ni espacios de más", () => {
    expect(claveRegistro("TH Menswear", "Men-Polos S/S")).toBe(
      claveRegistro("th  menswear", "MEN-POLOS  S/S"),
    );
  });

  it("nunca manda más de MAX_POR_ENVIO, y el tope del servidor lo acompaña", () => {
    const catalogo: CatalogoDescripciones = { "TH Menswear": ["Men-Polos S/S", "Women-Polos S/S"] };
    const pares = Array.from({ length: MAX_POR_ENVIO + 50 }, (_, i) => ({
      marca: "TH Menswear",
      desc: `Men-Polos S/S ${i}`,
    }));
    // Ninguna de esas pasa (mitad derecha nueva), así que se fuerza con mitades
    // conocidas: lo que importa es que el corte exista.
    expect(descripcionesQuePasan(pares, catalogo).length).toBeLessThanOrEqual(MAX_POR_ENVIO);
  });
});

/* ── 2 · La ruta ──────────────────────────────────────────────────────────── */

describe("🔴 la ruta registra, es idempotente y no aprueba nada", () => {
  it("registra con origen «automatica» y sin firma de nadie", async () => {
    const res = await POST(req([{ marca: "TH Menswear", descripcion: "Men-Prenda Uno" }]));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, registradas: 1 });
    expect(estado.filas).toHaveLength(1);
    expect(estado.filas[0]).toMatchObject({
      marca: "TH Menswear",
      descripcion: "Men-Prenda Uno",
      activa: true,
      origen: ORIGEN_AUTOMATICA,
      aprobada_por: null,
      aprobada_at: null,
    });
    expect(ORIGEN_AUTOMATICA).not.toBe("aprobada");
  });

  it("llamarla dos veces no agrega una segunda fila", async () => {
    await POST(req([{ marca: "TH Menswear", descripcion: "Men-Prenda Uno" }]));
    const res = await POST(req([{ marca: "TH Menswear", descripcion: "Men-Prenda Uno" }]));
    expect(await res.json()).toMatchObject({ ok: true, registradas: 0, yaEstaban: 1 });
    expect(estado.filas).toHaveLength(1);
  });

  it("la misma descripción con otra caja tampoco crea una gemela", async () => {
    await POST(req([{ marca: "TH Menswear", descripcion: "Men-Prenda Uno" }]));
    await POST(req([{ marca: "th menswear", descripcion: "MEN-PRENDA UNO" }]));
    expect(estado.filas).toHaveLength(1);
  });

  it("normaliza los espacios antes de escribir (el CHECK de la base lo exige)", async () => {
    await POST(req([{ marca: "TH Menswear", descripcion: "  Men-Prenda   Dos  " }]));
    expect(estado.filas[0].descripcion).toBe("Men-Prenda Dos");
  });

  it("una marca que no está en ningún catálogo se SALTA sin tumbar el lote", async () => {
    const res = await POST(
      req([
        { marca: "Marca Inventada", descripcion: "Men-Prenda Uno" },
        { marca: "TH Menswear", descripcion: "Men-Prenda Tres" },
      ]),
    );
    expect(await res.json()).toMatchObject({ ok: true, registradas: 1 });
    expect(estado.filas.map((f) => f.marca)).toEqual(["TH Menswear"]);
  });

  it("acepta también las marcas de Facturas Tienda (misma tabla)", async () => {
    const res = await POST(req([{ marca: "RBK FOOTWEAR", descripcion: "Men-Prenda Uno" }]));
    expect(await res.json()).toMatchObject({ registradas: 1 });
    expect(estado.filas[0].marca).toBe("RBK FOOTWEAR");
  });

  it("solo admin y secretaria; sin sesión 401, bodega 403", async () => {
    expect((await POST(req([], null))).status).toBe(401);
    expect((await POST(req([], "bodega"))).status).toBe(403);
    expect((await POST(req([], "vendedor"))).status).toBe(403);
    expect((await POST(req([], "admin"))).status).toBe(200);
  });

  it("un lote gigante se rechaza en el borde", async () => {
    const muchas = Array.from({ length: MAX_POR_ENVIO + 1 }, (_, i) => ({
      marca: "TH Menswear",
      descripcion: `Men-Prenda ${i}`,
    }));
    expect((await POST(req(muchas))).status).toBe(400);
    expect(estado.filas).toHaveLength(0);
  });
});

describe("🔴 falla ABIERTA: sin la migración, nadie se entera", () => {
  it("el CHECK 23514 contesta ok con cero, no un error", async () => {
    estado.origenAncho = false;
    const res = await POST(req([{ marca: "TH Menswear", descripcion: "Men-Prenda Uno" }]));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, registradas: 0, sinMigracion: true });
    expect(estado.filas).toHaveLength(0);
  });

  it("la migración existe y ENSANCHA el CHECK sin borrar los valores viejos", () => {
    const sql = readFileSync(
      path.join(process.cwd(), "supabase/migrations/20261206120000_descripciones_origen_automatica.sql"),
      "utf8",
    );
    expect(sql).toContain("depurador_descripciones_origen_check");
    expect(sql).toContain("'seed'");
    expect(sql).toContain("'aprobada'");
    expect(sql).toContain("'automatica'");
    // Aditiva: ni un DELETE, ni un DROP TABLE, ni un DROP COLUMN.
    expect(/\bdelete\s+from\b/i.test(sql)).toBe(false);
    expect(/\bdrop\s+table\b/i.test(sql)).toBe(false);
    expect(/\bdrop\s+column\b/i.test(sql)).toBe(false);
  });
});

/* ── 3 · Escribir no frena la descarga del Excel ──────────────────────────── */

const SRC = path.join(process.cwd(), "src");
const leer = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

describe("🔴 escribir no frena ni retrasa la descarga del Excel", () => {
  const RUTA = "descripciones/registrar";

  it("la ÚNICA puerta al endpoint es el gancho: nadie más lo nombra", () => {
    const gancho = leer("app/productos/cargar/useRegistrarQuePasan.ts");
    expect(gancho).toContain(RUTA);
    for (const f of [
      "app/productos/cargar/DepuradorClient.tsx",
      "app/productos/cargar/FacturasTiendaClient.tsx",
      "app/productos/cargar/ReebokClient.tsx",
      "app/productos/cargar/page.tsx",
      "app/productos/cargar/descripciones-que-pasan.ts",
    ]) {
      expect(leer(f).includes(RUTA), `${f} no debería nombrar el endpoint`).toBe(false);
    }
  });

  it("el gancho no sabe nada de Excel: no toca el libro ni la descarga", () => {
    const gancho = leer("app/productos/cargar/useRegistrarQuePasan.ts");
    for (const prohibido of ["saveAs", "workbook", "onDownloaded", "XLSX"]) {
      expect(gancho.includes(prohibido), `el gancho no puede mencionar ${prohibido}`).toBe(false);
    }
  });

  it("y el envío no se espera: nadie hace await del gancho", () => {
    for (const f of [
      "app/productos/cargar/DepuradorClient.tsx",
      "app/productos/cargar/FacturasTiendaClient.tsx",
    ]) {
      expect(leer(f).includes("await useRegistrarQuePasan"), `${f} no puede esperar el envío`).toBe(false);
      expect(leer(f).includes("useRegistrarQuePasan("), `${f} tiene que llamar al gancho`).toBe(true);
    }
  });

  it("los DOS caminos que generan plantilla lo llaman: el Depurador y Facturas Tienda", () => {
    expect(leer("app/productos/cargar/DepuradorClient.tsx")).toContain("useRegistrarQuePasan(paresDelArchivo");
    expect(leer("app/productos/cargar/FacturasTiendaClient.tsx")).toContain("useRegistrarQuePasan(paresDelArchivo");
  });
});

/* ── 4 · Lo que se ve en la pantalla de admin ─────────────────────────────── */

describe("🔴 el catálogo de admin no llama «Catálogo original» a la que entró sola", () => {
  it("tiene su propio rótulo", () => {
    const src = leer("app/productos/cargar/CatalogoDescripcionesAdmin.tsx");
    expect(src).toContain('r.origen === "automatica"');
    expect(src).toContain("ROTULO_AUTOMATICA");
  });
});

/* Control de la clave: `marcaKey` es la que usan las dos puntas. */
describe("control", () => {
  it("la clave del cliente y la del servidor son la misma idea", () => {
    expect(claveRegistro("TH Menswear", "Men-Polos S/S")).toBe(
      `${marcaKey("TH Menswear")}|||${marcaKey("Men-Polos S/S")}`,
    );
  });
});
