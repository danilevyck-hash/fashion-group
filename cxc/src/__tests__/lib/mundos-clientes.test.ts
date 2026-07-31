// ─────────────────────────────────────────────────────────────────────────────
// LOS TRES MUNDOS DE CLIENTES — y las DOS direcciones que hay que proteger.
//
// Daniel: *"los clientes de multifashion q vivan solo en el modulo de
// multifashion. en cxc de boston que este como hoy en dia, solo viven ahi. los
// de las otras empresas q si son un grupo, que conviva en todos lados"*.
//
// 🩸 UN TEST QUE SOLO MIRA "no se coló Boston" PASA CON EL DIRECTORIO VACÍO.
// Por eso cada regla se verifica en los dos sentidos: que Boston y Multifashion
// NO entren, **y que los 145 del grupo sigan estando**. Medido contra
// producción: 5.063 vivos = 145 grupo + 4.883 solo-Boston + 31 mixtos + 4 sin
// rastro en Switch.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const vista = vi.hoisted(() => ({ filas: [] as { empresa_key: string; codigo: string | null }[], falla: false }));

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: () => ({ select: () => ({ order: () => ({ range: () => ({}) }) }) }) } }));
vi.mock("@/lib/supabase-paginado", () => ({
  leerTodoPaginado: async () => {
    if (vista.falla) throw new Error("PostgREST se cayó");
    return vista.filas;
  },
}));

import {
  EMPRESAS_DEL_GRUPO,
  esEmpresaDelGrupo,
  mundosDeClientes,
  soloClientesDelGrupo,
} from "@/lib/clientes/mundos";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
beforeEach(() => { vista.filas = []; vista.falla = false; });

describe("el grupo se define por INCLUSIÓN", () => {
  it("son exactamente las 6 que conviven", () => {
    expect([...EMPRESAS_DEL_GRUPO].sort()).toEqual(
      ["active_shoes", "active_wear", "fashion_shoes", "fashion_wear", "joystep", "vistana"]
    );
  });

  it("Boston y Multifashion NO están", () => {
    expect(EMPRESAS_DEL_GRUPO).not.toContain("confecciones_boston");
    expect(EMPRESAS_DEL_GRUPO).not.toContain("american_classic");
  });

  it("una empresa NUEVA no contamina por default", () => {
    // Es el punto de definir por inclusión: lo desconocido queda afuera hasta
    // que alguien lo agregue a mano.
    expect(esEmpresaDelGrupo("empresa_que_no_existe_todavia")).toBe(false);
    expect(esEmpresaDelGrupo(null)).toBe(false);
    expect(esEmpresaDelGrupo("")).toBe(false);
  });

  it("las 6 del grupo SÍ dan true — la otra dirección", () => {
    for (const e of EMPRESAS_DEL_GRUPO) expect(esEmpresaDelGrupo(e)).toBe(true);
  });
});

describe("🔴 las dos direcciones del filtro", () => {
  const conMundos = async () => await mundosDeClientes();

  it("saca al cliente de Boston", async () => {
    vista.filas = [{ empresa_key: "confecciones_boston", codigo: "B-1" }];
    const r = soloClientesDelGrupo([{ codigo: "B-1" }], await conMundos());
    expect(r).toHaveLength(0);
  });

  it("saca al cliente de Multifashion", async () => {
    vista.filas = [{ empresa_key: "american_classic", codigo: "M-1" }];
    expect(soloClientesDelGrupo([{ codigo: "M-1" }], await conMundos())).toHaveLength(0);
  });

  it("DEJA al del grupo — sin esto, el Directorio vacío pasaría el test", async () => {
    vista.filas = [{ empresa_key: "vistana", codigo: "D-1" }];
    expect(soloClientesDelGrupo([{ codigo: "D-1" }], await conMundos())).toHaveLength(1);
  });

  it("DEJA al mixto que le compra al grupo Y a Boston", async () => {
    vista.filas = [
      { empresa_key: "confecciones_boston", codigo: "D-9" },
      { empresa_key: "fashion_wear", codigo: "D-9" },
    ];
    expect(soloClientesDelGrupo([{ codigo: "D-9" }], await conMundos())).toHaveLength(1);
  });

  it("la forma REAL de producción: 145 quedan, 4.883 se van", async () => {
    const filas: { empresa_key: string; codigo: string | null }[] = [];
    for (let i = 0; i < 145; i++) filas.push({ empresa_key: "vistana", codigo: `D-${i}` });
    for (let i = 0; i < 4883; i++) filas.push({ empresa_key: "confecciones_boston", codigo: `B-${i}` });
    vista.filas = filas;
    const todos = [
      ...Array.from({ length: 145 }, (_, i) => ({ codigo: `D-${i}` })),
      ...Array.from({ length: 4883 }, (_, i) => ({ codigo: `B-${i}` })),
    ];
    const r = soloClientesDelGrupo(todos, await conMundos());
    expect(r).toHaveLength(145);
    expect(r.every((c) => c.codigo.startsWith("D-"))).toBe(true);
  });
});

describe("🔴 si no se puede determinar el mundo, el cliente SE QUEDA", () => {
  it("los 3 del grupo con el código desfasado no desaparecen", async () => {
    // D-173 Metro Shoes, D-200 City Mall y D-101 El Machetazo existen en Switch
    // con OTRO código. Un default "no lo encuentro → lo escondo" los borraría
    // del Directorio, de Guías y de todos los selectores.
    vista.filas = [{ empresa_key: "vistana", codigo: "D-103" }];
    const r = soloClientesDelGrupo(
      [{ codigo: "D-173" }, { codigo: "D-200" }, { codigo: "D-101" }],
      await mundosDeClientes()
    );
    expect(r).toHaveLength(3);
  });

  it("un cliente sin código se queda", async () => {
    vista.filas = [{ empresa_key: "vistana", codigo: "D-1" }];
    expect(soloClientesDelGrupo([{ codigo: null }], await mundosDeClientes())).toHaveLength(1);
  });

  it("si la consulta falla NO se esconde a nadie", async () => {
    vista.falla = true;
    expect(await mundosDeClientes()).toBeNull();
    const lista = [{ codigo: "B-1" }, { codigo: "D-1" }];
    expect(soloClientesDelGrupo(lista, null)).toBe(lista);
  });
});

describe("una sola fuente de verdad", () => {
  const CONSUMIDORES = [
    "src/app/api/clientes/route.ts",
    "src/app/clientes/page.tsx",
    "src/app/clientes/[codigo]/page.tsx",
    "src/lib/ventas/queries.ts",
  ];

  it("los consumidores importan el módulo compartido", () => {
    for (const f of CONSUMIDORES) expect(leer(f), f).toContain("clientes/mundos");
  });

  it("nadie compara contra un nombre de empresa a mano", () => {
    const suelto = /[!=]==?\s*["'`](confecciones_boston|american_classic)|["'`](confecciones_boston|american_classic)["'`]\s*[!=]==?/;
    for (const f of CONSUMIDORES) expect(leer(f), f).not.toMatch(suelto);
  });

  it("se lee PAGINADO — switch_clientes tiene 6.634 filas y PostgREST corta en 1.000", () => {
    expect(leer("src/lib/clientes/mundos.ts")).toContain("leerTodoPaginado");
  });

  it("la ficha también se protege, no solo la lista", () => {
    const ficha = leer("src/app/clientes/[codigo]/page.tsx");
    expect(ficha).toContain("soloClientesDelGrupo");
    expect(ficha).toMatch(/notFound\(\)/);
  });

  it("deja escrita la ventana de retraso y los 4 sin rastro", () => {
    const src = leer("src/lib/clientes/mundos.ts");
    expect(src).toContain("D-173");
    expect(src).toContain("D-201");
  });
});

describe("⚠️ lo que NO se toca: la plata suma toda", () => {
  it("Vista General no pasa por el filtro de clientes", () => {
    expect(leer("src/app/vista-general/page.tsx")).not.toContain("clientes/mundos");
  });

  it("el modo Todas de Ventas no se filtra (su vista ya viene sin Boston ni MF)", () => {
    const q = leer("src/lib/ventas/queries.ts");
    expect(q).toContain("isTodas\n        ? filasCrudas");
  });
});
