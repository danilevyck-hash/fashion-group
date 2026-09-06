// ═════════════════════════════════════════════════════════════════════════════
// 🔴 MULTIFASHION SE CIERRA A QUIEN NO LO TIENE, Y SU RANKING DE VENDEDORAS
//    SE VE DESDE COMISIONES — ESPEJO, NO FUSIÓN.
// ═════════════════════════════════════════════════════════════════════════════
// 🩸 Auditoría medida contra el código el 6-sep-2026:
//   · `/multifashion` (la PÁGINA) NO comprobaba ningún rol. `/ventas` manda a
//     casa a quien no es admin en dos líneas; Multifashion no tenía ninguna, y
//     el middleware solo valida que la sesión EXISTA. Cualquiera con sesión
//     —bodega, un vendedor, contabilidad— abría esa dirección y el resumen de
//     la tienda le llegaba YA ESCRITO EN EL HTML.
//   · 10 de las 11 rutas de `/api/multifashion/*` dejaban entrar a
//     `secretaria`, y dos además a `contabilidad`. Ninguno de los dos roles
//     tiene el módulo en `src/lib/modules.ts`.
//   · `ROLES_LECTURA_METAS` incluía `secretaria` a propósito: era la última
//     puerta que le quedaba adentro.
//
// Daniel, 6-sep-2026, al preguntarle si lo cerraba igual aunque las secretarias
// perdieran el avance de las metas: **«A»** — ciérralo igual; con la pestaña
// nueva de Comisiones ven lo que necesitan.
//
// Daniel, sobre la pestaña, textual: «quiero que la pestaña de vendedoras de
// Multifashion pase aquí también, ya que aquí podemos ver todas las comisiones.
// Y allá dejarlo tal cual como está. No hay diferencia, solo son un espejo.»
//
// 🔴 ESPEJO, NO FUSIÓN. Multifashion comisiona con OTRA base
// (SUM(subtotal firmado) × 0,5 %, sin filtro de utilidad) que el grupo
// (0,5 % sobre la venta de las facturas con pct_utilidad > 20). Que las dos
// digan «0,5 %» es coincidencia. No se unifican cálculos ni se mezclan totales.
//
// ⚠️ JENNIFER (`gerente_acs`) NO PIERDE NADA: Multifashion es su único módulo y
// su casa. Este archivo lo recorre ruta por ruta.
// ⚠️ LOS CRONS NO PASAN POR ACÁ: el resumen diario de ACS, la fidelización y el
// ritmo de la meta leen la BASE directo y entran con CRON_SECRET.
// ═════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ALL_MODULES } from "@/lib/modules";
import {
  ROLES_MULTIFASHION,
  ROLES_COMISIONES,
  ROLES_VENDEDORAS_ESPEJO,
  puedeAbrirMultifashion,
} from "@/lib/multifashion/acceso";
import { ROLES_LECTURA_METAS, ROLES_ADMIN_METAS, puedeVerMetas, rolesQueEntranAMetas } from "@/lib/multifashion/metas-permiso";

const RAIZ = process.cwd();
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const API = "src/app/api/multifashion";

/** Las 11 rutas del grupo, leídas del disco (no una lista escrita a mano). */
function rutas(): { grupo: string; rel: string; src: string }[] {
  return readdirSync(path.join(RAIZ, API), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ grupo: d.name, rel: `${API}/${d.name}/route.ts` }))
    .map((r) => ({ ...r, src: leer(r.rel) }));
}

// ═══ 1. La lista vive en UN solo lugar y se DERIVA ═══════════════════════════
describe("🔴 una sola lista de roles, derivada del catálogo de módulos", () => {
  it("ROLES_MULTIFASHION = lo que declara `src/lib/modules.ts` para la ficha", () => {
    const ficha = ALL_MODULES.find((m) => m.key === "multifashion")!;
    expect([...ROLES_MULTIFASHION].sort()).toEqual([...ficha.roles].sort());
    expect([...ROLES_MULTIFASHION].sort()).toEqual(["admin", "gerente_acs"]);
    expect(leer("src/lib/multifashion/acceso.ts")).toContain('ALL_MODULES.find((m) => m.key === "multifashion")');
  });

  it("🔴 quien NO tiene el módulo no abre la página; Jennifer sí", () => {
    expect(puedeAbrirMultifashion("gerente_acs")).toBe(true);
    expect(puedeAbrirMultifashion("admin")).toBe(true);
    for (const rol of ["secretaria", "contabilidad", "vendedor", "bodega", "gerente_boston", "", null, undefined]) {
      expect(puedeAbrirMultifashion(rol), `rol ${rol}`).toBe(false);
    }
  });

  it("los roles de Comisiones son los MISMOS que declara su pantalla", () => {
    const cliente = leer("src/app/comisiones/ComisionesPageClient.tsx");
    expect(cliente).toContain('allowedRoles: ["admin", "contabilidad", "secretaria"]');
    expect([...ROLES_COMISIONES].sort()).toEqual(["admin", "contabilidad", "secretaria"]);
  });

  it("la lista del espejo es la unión, sin repetidos", () => {
    expect([...ROLES_VENDEDORAS_ESPEJO].sort()).toEqual(["admin", "contabilidad", "gerente_acs", "secretaria"]);
    expect(new Set(ROLES_VENDEDORAS_ESPEJO).size).toBe(ROLES_VENDEDORAS_ESPEJO.length);
  });
});

// ═══ 2. La PÁGINA tiene guard, como /ventas ══════════════════════════════════
describe("🔴 /multifashion comprueba el rol ANTES de cargar la data", () => {
  const page = leer("src/app/multifashion/page.tsx");

  it("lee la sesión de la cookie, manda a «/» sin sesión y a «/home» sin el módulo", () => {
    expect(page).toContain('verifySession');
    expect(page).toContain('cookies()).get("cxc_session")');
    expect(page).toContain('if (!role) redirect("/");');
    expect(page).toContain('if (!puedeAbrirMultifashion(role)) redirect("/home");');
  });

  it("🔴 el guard va ANTES del fetch: si no, el resumen se calcula igual", () => {
    expect(page.indexOf("redirect(\"/home\")")).toBeLessThan(page.indexOf("fetchMultifashion({"));
  });

  it("no escribe la lista de roles a mano: la pide al módulo único", () => {
    expect(page).not.toMatch(/"gerente_acs"/);
    expect(page).toContain('from "@/lib/multifashion/acceso"');
  });
});

// ═══ 3. Las 11 rutas ═════════════════════════════════════════════════════════
describe("🔴 ninguna ruta de Multifashion escribe su lista de roles a mano", () => {
  const todas = rutas();

  it("son las 11 de siempre (si nace una nueva, este número la delata)", () => {
    expect(todas.map((r) => r.grupo).sort()).toEqual([
      "bonos", "caja", "clientes-wholesale", "detalle-mensual", "fidelizacion", "metas",
      "overview", "productos", "retail-recurrentes", "vendedoras", "venta-hoy",
    ]);
  });

  it("🔴 CADA UNA usa una de las tres listas del módulo — nunca un array literal", () => {
    for (const r of todas) {
      const llamadas = r.src.match(/requireRole\(\s*req\s*,\s*([^)]+)\)/g) ?? [];
      expect(llamadas.length, `${r.grupo}: sin requireRole`).toBeGreaterThan(0);
      for (const l of llamadas) {
        expect(
          /ROLES_MULTIFASHION|ROLES_VENDEDORAS_ESPEJO|rolesQueEntranAMetas\(\)/.test(l),
          `${r.grupo}: ${l}`,
        ).toBe(true);
      }
      expect(r.src, `${r.grupo}: lista a mano`).not.toMatch(/requireRole\(req, \[/);
    }
  });

  it("🔴 SOLO las dos del espejo (vendedoras y bonos) usan la lista ancha, y las DOS la usan", () => {
    // Se mira la LLAMADA a requireRole, no el import: dejar el import y cambiar
    // la llamada es justo la forma de que el espejo se quede sin sus roles.
    const anchas = todas
      .filter((r) => /requireRole\(\s*req\s*,\s*ROLES_VENDEDORAS_ESPEJO\s*\)/.test(r.src))
      .map((r) => r.grupo)
      .sort();
    expect(anchas).toEqual(["bonos", "vendedoras"]);
  });

  it("🔴 «secretaria» y «contabilidad» no aparecen escritos en ninguna ruta del grupo", () => {
    for (const r of todas) {
      const codigo = r.src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
      expect(codigo, r.grupo).not.toMatch(/"secretaria"/);
      expect(codigo, r.grupo).not.toMatch(/"contabilidad"/);
    }
  });

  it("⚠️ JENNIFER NO PIERDE NADA: `gerente_acs` entra a las ONCE", () => {
    const listas: Record<string, readonly string[]> = {
      ROLES_MULTIFASHION,
      ROLES_VENDEDORAS_ESPEJO,
      "rolesQueEntranAMetas()": rolesQueEntranAMetas(),
    };
    for (const r of todas) {
      const usada = Object.keys(listas).find((k) => r.src.includes(k.replace("()", "")))!;
      expect(listas[usada], `${r.grupo} (${usada})`).toContain("gerente_acs");
    }
  });
});

// ═══ 4. Las metas ════════════════════════════════════════════════════════════
describe("🔴 metas: sale secretaria, se queda Jennifer, edita solo admin", () => {
  it("la lista de lectura quedó en admin + gerente_acs", () => {
    expect([...ROLES_LECTURA_METAS].sort()).toEqual(["admin", "gerente_acs"]);
    expect(puedeVerMetas("secretaria")).toBe(false);
    expect(puedeVerMetas("gerente_acs")).toBe(true);
  });

  it("🔑 VER NO ES EDITAR: `ROLES_ADMIN_METAS` no se tocó", () => {
    expect([...ROLES_ADMIN_METAS]).toEqual(["admin"]);
  });

  it("la decisión de Daniel queda escrita con su fecha", () => {
    const src = leer("src/lib/multifashion/metas-permiso.ts");
    expect(src).toMatch(/6-sep-2026/);
    expect(src).toMatch(/«A»/);
  });
});

// ═══ 5. Los crons no entran por acá ══════════════════════════════════════════
describe("⚠️ nada fuera del navegador llama a /api/multifashion/*", () => {
  it("el resumen diario de ACS, la fidelización y el ritmo de la meta leen la BASE", () => {
    for (const rel of [
      "src/lib/acs-resumen-diario.ts",
      "src/lib/multifashion/retail-dia.ts",
      "src/lib/multifashion/meta-ritmo-lectura.ts",
      "src/app/api/cron/acs-resumen-diario/route.ts",
    ]) {
      const codigo = leer(rel).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
      expect(codigo, rel).not.toMatch(/fetch\([^)]*api\/multifashion/);
    }
  });
});

/** El fuente SIN comentarios: lo que este barrido cuida es lo que CORRE. */
const sinComentarios = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ═══ 6. Multifashion dentro de Comisiones ════════════════════════════════════
describe("🔴 Multifashion en Comisiones: una opción más, nunca una suma", () => {
  const shell = leer("src/components/ventas/ComisionesView.tsx");
  const vista = leer("src/components/multifashion/VendedorasSubtab.tsx");

  it("🔴 REUSA la vista del módulo Multifashion; no hay una segunda copia", () => {
    expect(shell).toContain('import("@/components/multifashion/VendedorasSubtab")');
    // Una sola implementación en todo el repo.
    expect(vista).toContain("export function VendedorasSubtab");
  });

  it("🔴 la vista de Multifashion NO se tocó en lo que calcula: mismas RPC", () => {
    expect(vista).toContain("/api/multifashion/vendedoras?");
    expect(vista).toContain("<BonosSection");
  });

  it("🔴 NO se fusiona nada: Comisiones no suma lo de Multifashion en ningún total", () => {
    // 🔴 SIGUE SIENDO LA REGLA, y desde el 6-sep-2026 pesa MÁS: Multifashion es
    // una opción del mismo selector que «Fashion Group», así que la tentación de
    // sumarlas está a un clic. Son dos comisiones calculadas distinto —el grupo
    // paga 0,5 % solo sobre las facturas con más de 20 % de utilidad;
    // Multifashion, 0,5 % sobre TODA la venta— y medido en agosto 2026 son
    // $5.978,55 contra $255,27. Ni el consolidado ni la vista de una empresa la
    // conocen, y `EMPRESAS_COMISIONAN` sigue siendo las 6 del grupo.
    // 🔄 Se barre el CÓDIGO, sin comentarios: el porqué de la regla se escribe
    // arriba de la regla, y nombrarla en una nota no es sumarla.
    expect(sinComentarios(leer("src/components/ventas/ComisionesConsolidadoView.tsx")))
      .not.toMatch(/multifashion|american_classic/i);
    expect(sinComentarios(leer("src/components/ventas/ComisionesPorEmpresaView.tsx")))
      .not.toMatch(/american_classic/i);
    expect(leer("src/lib/comisiones/empresas.ts")).toContain("export const EMPRESAS_COMISIONAN = B2B_EMPRESA_KEYS;");
    // Y la matriz de Fashion Group se dibuja SOLO con esas 6.
    expect(leer("src/components/ventas/ComisionesConsolidadoView.tsx"))
      .toContain("const EMPRESAS = EMPRESAS_COMISIONAN;");
  });

  it("Multifashion se ofrece SOLO en el módulo /comisiones, no en la pestaña de Ventas", () => {
    // 🔄 CANDADO RE-APUNTADO EL 6-sep-2026: era una PESTAÑA y hoy es una opción
    // del único selector de empresa, debajo de una línea (Daniel: «multifashion
    // es una empresa más… cambio mi opinión de que sea un espejo»). La bandera
    // que la enciende es la misma.
    expect(leer("src/app/comisiones/ComisionesPageClient.tsx")).toContain("conMultifashion");
    expect(shell).toContain("conMultifashion = false");
    // Sin la bandera, la opción ni se ofrece ni se puede restaurar de memoria.
    expect(shell).toContain("conMultifashion || !esVistaMultifashion(o.valor)");
    expect(shell).toContain("esVistaMultifashion(resuelta.vista) && !conMultifashion ? VISTA_GRUPO");
    // Va DEBAJO DE UNA LÍNEA en el selector: no es del grupo y se ve.
    expect(leer("src/lib/comisiones/vistas.ts")).toContain("separadorAntes: true");
  });

  it("el período y la descarga del shell no aplican a Multifashion (trae sus propios chips)", () => {
    expect(shell).toContain("!esVistaMultifashion(vista)");
  });
});
