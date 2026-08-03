/**
 * Candado del BUSCADOR GLOBAL (⌘K): solo clientes de las 6 del grupo.
 *
 * 🩸 LA REGLA, cerrada con Daniel (30-jul-2026): los clientes de Boston viven
 * SOLO en la pestaña CXC › Boston y los de Multifashion SOLO en su módulo. Las
 * 6 del grupo conviven en todos lados. Sobre perder la búsqueda por nombre del
 * saldo de un cliente de Boston, textual: *"no aparezca nunca"*.
 *
 * ⚠️ POR QUÉ EL ⌘K NECESITÓ SU PROPIO FILTRO. El PR del Directorio filtró
 * `clientes_master`; acá los clientes entran por OTRAS DOS PUERTAS, cada una
 * con su propia columna de empresa. Medido contra producción el 30-jul:
 *
 *   sección     tabla                        columna       filas de fuera
 *   ─────────────────────────────────────────────────────────────────────
 *   ventas      switch_facturas              empresa_key   37.205 de 52.480
 *   cxc         switch_estadocuenta_aging    company_key   0 de 221
 *   cheques     cheques                      empresa       0 de 19
 *
 * Los dos ceros NO son motivo para no filtrar: el cron de estado de cuenta ya
 * trae `confecciones_boston` a `switch_estadocuenta` desde el 27-jul, y el día
 * que eso llegue al agregado el buscador se llenaría de Boston sin que nadie lo
 * tocara.
 *
 * 🩸 LAS DOS DIRECCIONES, Y LA SEGUNDA ES LA QUE IMPORTA. Un buscador que no
 * encuentra NADA pasa todos los tests de exclusión con honores. Por eso hay
 * casos de que los clientes del grupo SIGAN saliendo, acá y en el verificador
 * de navegador (`scripts/_verif-buscador-solo-grupo.mjs`), que además deriva la
 * expectativa de cada término contra la base y falla si no encuentra casos.
 *
 * Medición fin a fin contra producción (6 términos de cada lado):
 *   solo Boston/Multifashion   1-4 resultados → 0, los 6
 *   del grupo                  siguen saliendo, los 6
 *   guías / reclamos / préstamos / caja   sin un solo cambio
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// `mundos.ts` crea el cliente de Supabase al importarse (para su otra mitad,
// la que clasifica `clientes_master` por código). Acá solo se usa la lista de
// las 6 y el predicado, que son PUROS — se dobla la base para no pedir env
// vars que este test no necesita.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));
vi.mock("@/lib/supabase-paginado", () => ({ leerTodoPaginado: async () => [] }));

import { EMPRESAS_DEL_GRUPO, esEmpresaDelGrupo } from "@/lib/clientes/mundos";

const src = join(__dirname, "..", "..");
const route = readFileSync(join(src, "app", "api", "search", "route.ts"), "utf8");
const mundos = readFileSync(join(src, "lib", "clientes", "mundos.ts"), "utf8");

describe("El grupo se define por INCLUSIÓN, en un solo lugar", () => {
  it("son exactamente las 6 empresas que conviven", () => {
    expect([...EMPRESAS_DEL_GRUPO]).toEqual([
      "vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep",
    ]);
  });

  it("Boston y Multifashion NO son del grupo, y una empresa nueva tampoco", () => {
    expect(esEmpresaDelGrupo("confecciones_boston")).toBe(false);
    expect(esEmpresaDelGrupo("american_classic")).toBe(false);
    // el default seguro: lo que no está listado, no contamina
    expect(esEmpresaDelGrupo("empresa_nueva_2027")).toBe(false);
    expect(esEmpresaDelGrupo(null)).toBe(false);
    expect(esEmpresaDelGrupo("")).toBe(false);
  });

  it("las 6 sí lo son", () => {
    for (const k of EMPRESAS_DEL_GRUPO) expect(esEmpresaDelGrupo(k)).toBe(true);
  });

  it("la fuente de verdad se define listando a los que ENTRAN, no excluyendo a dos", () => {
    // Un `!== "confecciones_boston"` haría que una empresa nueva apareciera en
    // todos lados sin que nadie lo decida. Es la diferencia entre un olvido que
    // esconde datos y uno que los expone.
    expect(mundos).toContain("EL GRUPO SE DEFINE POR INCLUSIÓN, NO POR EXCLUSIÓN");
    expect(mundos).not.toMatch(/!==\s*"confecciones_boston"/);
    expect(mundos).not.toMatch(/!==\s*"american_classic"/);
  });
});

describe("El ⌘K filtra las 3 puertas por donde entran clientes", () => {
  it("reusa la fuente de verdad — NO escribe una segunda lista", () => {
    expect(route).toContain('import { EMPRESAS_DEL_GRUPO } from "@/lib/clientes/mundos"');
    // Ninguna clave de empresa escrita a mano en el route: dos listas es una
    // que se corrige sola y otra que empieza a contradecirla en silencio.
    for (const k of [...EMPRESAS_DEL_GRUPO, "confecciones_boston", "american_classic"]) {
      expect(route, `"${k}" no puede estar escrita a mano en el buscador`).not.toContain(`"${k}"`);
    }
  });

  it("ventas (switch_facturas.empresa_key) — la puerta grande, 37.205 filas de fuera", () => {
    expect(route).toMatch(/\.in\("empresa_key", EMPRESAS_DEL_GRUPO\)[\s\S]{0,80}\.ilike\("cliente_nombre"/);
  });

  it("cxc (switch_estadocuenta_aging.company_key)", () => {
    expect(route).toMatch(/\.in\("company_key", EMPRESAS_DEL_GRUPO\)[\s\S]{0,80}\.ilike\("nombre_normalized"/);
  });

  it("cheques (cheques.empresa)", () => {
    expect(route).toMatch(/\.in\("empresa", EMPRESAS_DEL_GRUPO\)[\s\S]{0,60}\.ilike\("cliente"/);
  });

  it("las 3 secciones de cliente están filtradas, ni una de más ni una de menos", () => {
    expect((route.match(/\.in\("(?:empresa|empresa_key|company_key)", EMPRESAS_DEL_GRUPO\)/g) ?? []).length).toBe(3);
  });
});

describe("Lo que el ⌘K NO filtra, y está escrito por qué", () => {
  it("guías, reclamos, préstamos y caja no buscan por nombre de cliente", () => {
    // transportista / nro de reclamo o factura / empleado / proveedor.
    // Filtrarlas por empresa del grupo rompería búsquedas que no tienen nada
    // que ver con la regla.
    expect(route).toMatch(/guías, reclamos, préstamos y caja no buscan por nombre de cliente/);
    for (const tabla of ["guia_transporte", "reclamos", "prestamos_empleados", "caja_gastos"]) {
      const i = route.indexOf(`.from("${tabla}")`);
      expect(i, `no encontré la consulta de ${tabla}`).toBeGreaterThan(-1);
      expect(route.slice(i, i + 400)).not.toContain("EMPRESAS_DEL_GRUPO");
    }
  });

  it("`directorio_clientes` se queda: no tiene columna de empresa que mirar", () => {
    // 33 contactos cargados a mano, sin `empresa_key` ni `company_key` — no hay
    // con qué clasificarlos. Misma regla que en mundos.ts: si no se puede
    // determinar el mundo, el cliente SE QUEDA (esconder de más es peor que
    // mostrar de más). Ojo: NO es el Directorio del módulo /clientes, que lee
    // `clientes_master` y se filtró aparte.
    expect(route).toMatch(/no tiene columna de\s*\n\/\/\s*empresa/);
    const i = route.indexOf('.from("directorio_clientes")');
    expect(i).toBeGreaterThan(-1);
    expect(route.slice(i, i + 300)).not.toContain("EMPRESAS_DEL_GRUPO");
  });
});
