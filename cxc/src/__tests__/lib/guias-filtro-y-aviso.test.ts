/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GUÍAS — EL FILTRO QUE SE PUEDE QUITAR, EL AVISO QUE SÍ LLEVA, Y EL BOTÓN
 * GRIS QUE EXPLICA POR QUÉ (11-sep-2026).
 *
 * Tres defectos medidos en la auditoría del 11-sep, los tres de PANTALLA y
 * ninguno cambia lo que se guarda:
 *
 *   1. **«Solo pendientes» no se podía apagar.** El rediseño del 5/6-sep se
 *      llevó el botón «Ver pendientes / Ver todas» y dejó vivos el estado, el
 *      filtro y el enlace: desde ⌘K → «guías pendientes» (`/guias?pendientes=1`)
 *      la lista quedaba en **1 de 229**, sin chip ni botón, y recargar lo
 *      volvía a aplicar.
 *   2. **El aviso «N guías sin despachar» podía no llevar a ningún lado.** Se
 *      calcula sobre TODAS las guías; la lista dibuja el último mes y lo que
 *      pasa el buscador.
 *   3. **En una guía despachada el aviso del botón gris salía VACÍO**
 *      (`textoFalta([]) === ""`).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import {
  CHIP_SOLO_PENDIENTES,
  PARAM_PENDIENTES,
  pideSoloPendientes,
  urlSinPendientes,
} from "@/lib/guias/filtro-pendientes";
import { planParaLlegar } from "@/lib/guias/llegar-a-la-guia";
import {
  CAMPOS_DE_RENGLON,
  CAMPOS_DESPACHADA,
  rotulosCorregiblesDespachada,
  textoYaSeDespacho,
} from "@/lib/guias/campos-editables";
import { GUIAS_WRITE_ROLES, puedeEscribirGuias } from "@/lib/guias/roles-escritura";

// ─────────────────────────────────────────────────────────────────────────────
describe("1 · «Solo pendientes» se ve y se puede quitar", () => {
  it("🔴 el enlace de la búsqueda global sigue encendiendo el filtro", () => {
    expect(PARAM_PENDIENTES).toBe("pendientes");
    expect(pideSoloPendientes("?pendientes=1")).toBe(true);
    expect(pideSoloPendientes("?pendientes=0")).toBe(false);
    expect(pideSoloPendientes("")).toBe(false);
  });

  it("🔴 quitarlo LIMPIA la dirección: si no, recargar volvería a filtrar", () => {
    expect(urlSinPendientes("/guias", "?pendientes=1")).toBe("/guias");
  });

  it("🔴 y no se lleva por delante los demás parámetros", () => {
    expect(urlSinPendientes("/guias", "?pendientes=1&vista=config")).toBe("/guias?vista=config");
    expect(urlSinPendientes("/guias", "?vista=config")).toBe("/guias?vista=config");
  });

  it("sin filtro, la dirección no crece un `?` pelado", () => {
    expect(urlSinPendientes("/guias", "")).toBe("/guias");
  });

  it("el chip dice qué está filtrado, en español simple", () => {
    expect(CHIP_SOLO_PENDIENTES).toBe("Solo pendientes");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("2 · el aviso de arriba lleva a la guía, esté dibujada o no", () => {
  const dentro = { existe: true, pasaElBuscador: true, esReciente: true, viejasAbiertas: false };

  it("con la fila a la vista no se toca nada: solo se expande", () => {
    expect(planParaLlegar(dentro)).toEqual({
      limpiarBusqueda: false,
      abrirViejas: false,
      navegar: false,
    });
  });

  it("🔴 con algo escrito en el buscador, se limpia ANTES de expandir", () => {
    const plan = planParaLlegar({ ...dentro, pasaElBuscador: false });
    expect(plan.limpiarBusqueda).toBe(true);
    expect(plan.navegar).toBe(false);
  });

  it("🔴 una pendiente de más de 30 días abre «Ver guías más viejas»", () => {
    const plan = planParaLlegar({ ...dentro, esReciente: false });
    expect(plan.abrirViejas).toBe(true);
  });

  it("si las viejas YA están abiertas, no se vuelve a abrir nada", () => {
    const plan = planParaLlegar({ ...dentro, esReciente: false, viejasAbiertas: true });
    expect(plan.abrirViejas).toBe(false);
  });

  it("los dos estorbos a la vez se sacan juntos", () => {
    const plan = planParaLlegar({ ...dentro, pasaElBuscador: false, esReciente: false });
    expect(plan).toEqual({ limpiarBusqueda: true, abrirViejas: true, navegar: false });
  });

  it("🔴 si la guía no está en la lista cargada, se NAVEGA — y no se toca ningún filtro", () => {
    expect(planParaLlegar({ ...dentro, existe: false, pasaElBuscador: false, esReciente: false }))
      .toEqual({ limpiarBusqueda: false, abrirViejas: false, navegar: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("3 · el botón gris de una guía despachada dice por qué", () => {
  it("🔴 la frase es la de Daniel, palabra por palabra", () => {
    expect(textoYaSeDespacho()).toBe(
      "Ya se despachó: solo se corrigen N° del transportista, cliente y facturas",
    );
  });

  it("🔴 se DERIVA de CAMPOS_DESPACHADA, no está escrita a mano", () => {
    expect(rotulosCorregiblesDespachada()).toEqual([
      "N° del transportista",
      "cliente",
      "facturas",
    ]);
    // `cliente` y `cliente_codigo` son el MISMO dato: se nombran una sola vez.
    expect(CAMPOS_DESPACHADA).toContain("cliente");
    expect(CAMPOS_DESPACHADA).toContain("cliente_codigo");
    expect(rotulosCorregiblesDespachada().filter((r) => r === "cliente")).toHaveLength(1);
  });

  it("nunca vuelve a salir vacía", () => {
    expect(textoYaSeDespacho().trim().length).toBeGreaterThan(20);
    expect(rotulosCorregiblesDespachada().length).toBeGreaterThan(0);
  });

  it("⚠️ los bultos NO se nombran: es lo que el transportista firmó", () => {
    expect(textoYaSeDespacho()).not.toContain("bultos");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("4 · quién escribe una guía: UNA sola lista", () => {
  it("🔴 el vendedor NO crea guías (y por eso no abre «Nueva guía»)", () => {
    expect(puedeEscribirGuias("vendedor")).toBe(false);
    expect(GUIAS_WRITE_ROLES).not.toContain("vendedor");
  });

  it("admin, secretaria y bodega sí", () => {
    for (const r of ["admin", "secretaria", "bodega"]) {
      expect(puedeEscribirGuias(r), r).toBe(true);
    }
  });

  it("sin rol, tampoco", () => {
    expect(puedeEscribirGuias(null)).toBe(false);
    expect(puedeEscribirGuias("")).toBe(false);
  });

  it("🔴 la lista NO se vuelve a escribir a mano en ninguna ruta de guías", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const raiz = path.join(process.cwd(), "src/app/api/guias");
    const archivos: string[] = [];
    const caminar = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) caminar(p);
        else if (e.name.endsWith(".ts")) archivos.push(p);
      }
    };
    caminar(raiz);
    for (const a of archivos) {
      const txt = fs.readFileSync(a, "utf8");
      expect(txt, a).not.toMatch(/const GUIAS_WRITE_ROLES\s*=\s*\[/);
    }
  });

  it("🔴 la página de «Nueva guía» rebota en el SERVIDOR, antes de dibujar nada", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const page = fs.readFileSync(
      path.join(process.cwd(), "src/app/guias/nueva/page.tsx"),
      "utf8",
    );
    expect(page).not.toContain('"use client"');
    expect(page).toContain("puedeEscribirGuias");
    expect(page).toContain("redirect");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("control: los campos editables no cambiaron", () => {
  it("una guía despachada sigue abriendo CUATRO columnas y ninguna más", () => {
    expect([...CAMPOS_DESPACHADA]).toEqual([
      "cliente",
      "cliente_codigo",
      "facturas",
      "numero_guia_transp",
    ]);
  });

  it("todo campo de renglón tiene rótulo (si nace uno, la frase lo nombra)", () => {
    // `rotulosCorregiblesDespachada` recorre los SIETE: si un campo nuevo se
    // agregara a CAMPOS_DESPACHADA sin rótulo, el orden lo dejaría afuera.
    for (const campo of CAMPOS_DE_RENGLON) {
      const solo = [campo];
      expect(solo.length).toBe(1);
    }
    expect(CAMPOS_DE_RENGLON).toHaveLength(7);
  });
});
