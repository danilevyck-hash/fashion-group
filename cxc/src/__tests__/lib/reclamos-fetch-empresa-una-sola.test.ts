/* ─────────────────────────────────────────────────────────────────────────────
 * CANDADO — UNA SOLA `fetchReclamosForEmpresa`, Y FILTRA LOS BORRADOS.
 *
 * 🩸 Había DOS funciones con el mismo nombre: la de `pdf-bulk.ts` filtraba
 * `deleted = false` y la de `excel-bulk.ts` NO. O sea que un reclamo borrado no
 * salía en el PDF pero sí en el Excel que se le manda al proveedor — y el Excel
 * es justo el que lleva los montos que se le van a cobrar.
 *
 * Este archivo mira la llamada REAL a Supabase (con un cliente falso que anota
 * los filtros) en las DOS ramas del selector, y barre los dos módulos para que
 * ninguno vuelva a definirse la suya.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Cliente falso: anota cada filtro y devuelve una fila. */
const llamadas: Array<{ tabla: string; filtros: Array<[string, unknown]> }> = [];

vi.mock("@/lib/supabase-server", () => {
  const query = (registro: { tabla: string; filtros: Array<[string, unknown]> }) => {
    const q = {
      select: (cols: string) => { registro.filtros.push(["select", cols]); return q; },
      eq: (col: string, val: unknown) => { registro.filtros.push(["eq", `${col}=${val}`]); return q; },
      in: (col: string, val: unknown) => { registro.filtros.push(["in", col]); return q; },
      or: (expr: string) => { registro.filtros.push(["or", expr]); return q; },
      // El builder real devuelve el propio builder y es "thenable": `.order()`
      // no cierra la cadena — después todavía se le encadena `.eq()` / `.or()`.
      order: () => q,
      then: (resolver: (r: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: [{ id: "1" }], error: null }).then(resolver),
    };
    return q;
  };
  return {
    HAS_SERVICE_ROLE: false,
    supabaseServer: {
      from: (tabla: string) => {
        const registro = { tabla, filtros: [] as Array<[string, unknown]> };
        llamadas.push(registro);
        return query(registro);
      },
    },
  };
});

import { fetchReclamosForEmpresa } from "@/lib/reclamos/fetch-empresa";

const leer = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

beforeEach(() => { llamadas.length = 0; });

describe("🔴 las DOS ramas filtran los borrados", () => {
  it("por lista de ids", async () => {
    await fetchReclamosForEmpresa("Fashion Wear", { reclamo_ids: ["a", "b"] });
    const filtros = llamadas[0].filtros.map((f) => `${f[0]}:${f[1]}`);
    expect(llamadas[0].tabla).toBe("reclamos");
    expect(filtros).toContain("eq:deleted=false");
    expect(filtros).toContain("eq:empresa=Fashion Wear");
  });

  it("por filtro de la lista (todos / una pestaña / búsqueda)", async () => {
    await fetchReclamosForEmpresa("Fashion Wear", { all_with_filter: { tab: "all", search: "" } });
    expect(llamadas[0].filtros.map((f) => `${f[0]}:${f[1]}`)).toContain("eq:deleted=false");

    llamadas.length = 0;
    await fetchReclamosForEmpresa("Fashion Wear", { all_with_filter: { tab: "Creado", search: "VI-2026" } });
    const filtros = llamadas[0].filtros.map((f) => `${f[0]}:${f[1]}`);
    expect(filtros).toContain("eq:deleted=false");
    expect(filtros).toContain("eq:estado=Creado");
  });

  it("un selector vacío no lee la base y devuelve nada", async () => {
    expect(await fetchReclamosForEmpresa("Fashion Wear", {})).toEqual([]);
    expect(llamadas).toHaveLength(0);
  });

  it("trae los settlements — el PDF los necesita para la recuperación", async () => {
    await fetchReclamosForEmpresa("Fashion Wear", { reclamo_ids: ["a"] });
    const select = llamadas[0].filtros.find((f) => f[0] === "select")![1] as string;
    expect(select).toContain("reclamo_settlements");
    expect(select).toContain("reclamo_items");
    expect(select).toContain("reclamo_fotos");
  });
});

describe("🔴 no puede volver a haber dos", () => {
  for (const modulo of ["excel-bulk.ts", "pdf-bulk.ts"]) {
    it(`${modulo} ya no define la suya`, () => {
      const codigo = leer("src", "lib", "reclamos", modulo);
      expect(codigo).not.toMatch(/function\s+fetchReclamosForEmpresa/);
    });
  }

  it("los cuatro endpoints del proveedor la sacan del mismo módulo", () => {
    for (const ruta of ["export-excel", "export-pdf", "export-zip", "send-zip"]) {
      const codigo = leer("src", "app", "api", "reclamos", "proveedor", "[empresa]", ruta, "route.ts");
      expect(codigo, ruta).toMatch(/fetchReclamosForEmpresa[\s\S]*?from "@\/lib\/reclamos\/fetch-empresa"/);
    }
  });
});
