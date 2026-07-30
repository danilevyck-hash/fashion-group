// ─────────────────────────────────────────────────────────────────────────────
// EL DIRECTORIO NO LISTA LOS CLIENTES EXCLUSIVOS DE BOSTON — Y LOS 11 DUALES SÍ.
//
// Daniel, textual: *"Ventas Vista General es lo que me interesa. no quiero ver
// sus miles de clientes en ningun lado"*. Y al decidir el criterio:
// *"sacar solo los 794 que compran únicamente a Boston"*.
//
// 🩸 EL TEST QUE MÁS IMPORTA ES EL DE LOS 11. Medido contra producción:
//
//   805  clientes de clientes_master con actividad en confecciones_boston
//   794  compran SOLO a Boston            → FUERA del Directorio
//    11  compran a Boston Y a otra empresa → SE QUEDAN
//
// El criterio ingenuo ("¿aparece Boston?") saca 805 y se lleva puestos a esos
// 11 — que para Vistana, Fashion Wear o Fashion Shoes son clientes como
// cualquier otro. Sería romper tres módulos para arreglar uno.
//
// LO QUE NO SE TOCA: Ventas, Ventas › Clientes, Vista General y la pestaña
// Boston del CXC. Ninguno pasa por este módulo — leen `clientes_empresa_12m_vw`
// y `switch_estadocuenta_aging` directo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const filasVista = vi.hoisted(() => ({ actual: [] as { cliente_id: string | null; empresa: string }[], falla: false }));

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: () => ({ select: () => ({ order: () => ({ range: () => ({}) }) }) }) } }));
vi.mock("@/lib/supabase-paginado", () => ({
  leerTodoPaginado: async () => {
    if (filasVista.falla) throw new Error("PostgREST se cayó");
    return filasVista.actual;
  },
}));

import {
  EMPRESAS_FUERA_DEL_DIRECTORIO,
  idsFueraDelDirectorio,
  sinClientesFueraDelDirectorio,
} from "@/lib/clientes/directorio-exclusiones";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

beforeEach(() => { filasVista.actual = []; filasVista.falla = false; });

describe("la lista de empresas excluidas", () => {
  it("tiene a confecciones_boston y NADA más", () => {
    expect([...EMPRESAS_FUERA_DEL_DIRECTORIO]).toEqual(["confecciones_boston"]);
  });
});

describe("🔴 el criterio es 'compra SOLO a Boston', no 'compra a Boston'", () => {
  it("saca al que solo le compra a Boston", async () => {
    filasVista.actual = [{ cliente_id: "solo-boston", empresa: "confecciones_boston" }];
    expect([...(await idsFueraDelDirectorio())]).toEqual(["solo-boston"]);
  });

  it("DEJA al que le compra a Boston Y a otra empresa — los 11 duales", async () => {
    filasVista.actual = [
      { cliente_id: "dual", empresa: "confecciones_boston" },
      { cliente_id: "dual", empresa: "vistana" },
    ];
    expect(await idsFueraDelDirectorio()).not.toContain("dual");
    expect((await idsFueraDelDirectorio()).size).toBe(0);
  });

  it("el orden de las filas no cambia el resultado (Boston puede venir primero o último)", async () => {
    filasVista.actual = [
      { cliente_id: "dual", empresa: "vistana" },
      { cliente_id: "dual", empresa: "confecciones_boston" },
    ];
    expect((await idsFueraDelDirectorio()).size).toBe(0);
  });

  it("deja intacto al que nunca le compró a Boston", async () => {
    filasVista.actual = [{ cliente_id: "otro", empresa: "fashion_wear" }];
    expect((await idsFueraDelDirectorio()).size).toBe(0);
  });

  it("con 3 empresas y solo una excluida, se queda", async () => {
    filasVista.actual = [
      { cliente_id: "x", empresa: "confecciones_boston" },
      { cliente_id: "x", empresa: "fashion_shoes" },
      { cliente_id: "x", empresa: "active_wear" },
    ];
    expect((await idsFueraDelDirectorio()).size).toBe(0);
  });

  it("la forma REAL de producción: 794 exclusivos fuera, 11 duales adentro", async () => {
    const filas: { cliente_id: string | null; empresa: string }[] = [];
    for (let i = 0; i < 794; i++) filas.push({ cliente_id: `solo-${i}`, empresa: "confecciones_boston" });
    for (let i = 0; i < 11; i++) {
      filas.push({ cliente_id: `dual-${i}`, empresa: "confecciones_boston" });
      filas.push({ cliente_id: `dual-${i}`, empresa: "vistana" });
    }
    for (let i = 0; i < 500; i++) filas.push({ cliente_id: `ac-${i}`, empresa: "american_classic" });
    filasVista.actual = filas;

    const fuera = await idsFueraDelDirectorio();
    expect(fuera.size).toBe(794);
    for (let i = 0; i < 11; i++) expect(fuera.has(`dual-${i}`)).toBe(false);
    expect(fuera.has("ac-0")).toBe(false);
  });

  it("un huérfano (cliente_id null) no rompe ni entra: no está en el Directorio", async () => {
    filasVista.actual = [{ cliente_id: null, empresa: "confecciones_boston" }];
    expect((await idsFueraDelDirectorio()).size).toBe(0);
  });
});

describe("falla hacia el lado seguro", () => {
  it("si la vista falla, NO esconde a nadie", async () => {
    filasVista.falla = true;
    expect((await idsFueraDelDirectorio()).size).toBe(0);
  });

  it("mostrar de más es ruido; esconder clientes buenos es un módulo roto", async () => {
    filasVista.falla = true;
    const clientes = [{ id: "a" }, { id: "b" }];
    expect(sinClientesFueraDelDirectorio(clientes, await idsFueraDelDirectorio())).toHaveLength(2);
  });
});

describe("el filtro que aplican las pantallas", () => {
  it("quita solo los excluidos y conserva el orden", () => {
    const clientes = [{ id: "a" }, { id: "fuera" }, { id: "b" }];
    expect(sinClientesFueraDelDirectorio(clientes, new Set(["fuera"])).map(c => c.id)).toEqual(["a", "b"]);
  });

  it("sin excluidos devuelve la MISMA lista", () => {
    const clientes = [{ id: "a" }];
    expect(sinClientesFueraDelDirectorio(clientes, new Set())).toBe(clientes);
  });
});

describe("la exclusión vive en UN solo lugar", () => {
  const MODULO = "src/lib/clientes/directorio-exclusiones.ts";
  const CONSUMIDORES = [
    "src/app/api/clientes/route.ts",
    "src/app/clientes/page.tsx",
    "src/app/clientes/[codigo]/page.tsx",
  ];

  it("los 3 consumidores del Directorio importan el módulo", () => {
    for (const f of CONSUMIDORES) {
      expect(leer(f), `${f} tiene que usar la exclusión compartida`).toContain("directorio-exclusiones");
    }
  });

  it("NADIE compara contra 'confecciones_boston' a mano en el Directorio", () => {
    // Así fue como este repo se quemó antes: listas repartidas que se
    // contradecían en silencio (ver EMPRESA_SYNC_CAPABILITIES).
    //
    // Se prohíbe la COMPARACIÓN, no la palabra: mencionar la empresa en un
    // comentario es legítimo (la ficha ya lo hacía por otra razón, hablando de
    // switch_recibos). Lo que no puede haber es un filtro escrito a mano.
    const comparacionSuelta = /[!=]==?\s*["'`]confecciones_boston|["'`]confecciones_boston["'`]\s*[!=]==?|\.(eq|neq|not)\([^)]*confecciones_boston/;
    for (const f of CONSUMIDORES) {
      expect(leer(f), `${f} tiene que delegar en la lista compartida`).not.toMatch(comparacionSuelta);
    }
  });

  it("la ficha también se protege — no alcanza con sacarlo de la lista", () => {
    // Si no, "en ningún lado" duraría hasta que alguien pegue un enlace.
    const ficha = leer("src/app/clientes/[codigo]/page.tsx");
    expect(ficha).toContain("idsFueraDelDirectorio");
    expect(ficha).toMatch(/notFound\(\)/);
  });

  it("se lee PAGINADO — PostgREST corta en 1.000 y la vista tiene 1.601 filas", () => {
    // Sin paginar se perderían empresas enteras y clientes que SÍ le compran a
    // otra empresa parecerían exclusivos de Boston.
    expect(leer(MODULO)).toContain("leerTodoPaginado");
  });

  it("deja escrita la ventana de retraso, no implícita", () => {
    const src = leer(MODULO);
    expect(src).toMatch(/13 h 35|13,5/);
    expect(src).toContain("refresh-clientes-views");
  });
});

describe("lo que NO se toca", () => {
  it("Ventas › Clientes no pasa por la exclusión", () => {
    const q = leer("src/lib/ventas/queries.ts");
    expect(q).not.toContain("directorio-exclusiones");
    expect(q).toContain("clientes_empresa_12m_vw");
  });

  it("la búsqueda global tampoco (decisión pendiente de Daniel)", () => {
    expect(leer("src/app/api/search/route.ts")).not.toContain("directorio-exclusiones");
  });
});
