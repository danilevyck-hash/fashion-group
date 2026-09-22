/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — «FOTOS A MI EXCEL» SE RETIRÓ DE LA PANTALLA (22-sep-2026)
 *
 * Daniel, textual: *«si si borra ese»* — y en la MISMA frase *«y no talla por
 * bulto»*, o sea: «Tallas por bulto» SE QUEDA. Las dos mitades se vigilan acá.
 *
 * 🩸 QUÉ ERA. Plantilla Switch › «Tallas y catálogo» › «Fotos a mi Excel»: se
 * subía un .xlsx/.xlsm propio y una carpeta de fotos, y el navegador le pegaba
 * las fotos en la columna A sin tocar nada más del archivo. Nunca calculó un
 * precio ni escribió en la base.
 *
 * 📏 MEDIDO CONTRA PRODUCCIÓN ANTES DE TOCAR NADA (22-sep-2026):
 * `activity_logs` no tiene NI UNA fila de `descarga_misfotos` en toda su
 * historia. CERO usos. Y ese cero sí significa «nadie lo usó»: el contador
 * escribe de verdad —se comprobó con las 3 filas de `descarga_excel` del
 * 20-sep-2026— desde que se arregló el insert el 4-sep-2026.
 *
 * 🔴 EL CÓDIGO NO SE BORRA (patrón `mayor_lineas`, `csv-export.ts`,
 * `cxc_favorites`). Tres archivos quedan rotulados y SIN LECTORES, porque en
 * ellos está escrito por qué este camino no pasa por `xlsx-js-style` (leer y
 * reescribir con SheetJS pierde el macro del archivo de Daniel):
 *   · app/productos/cargar/MiExcelFotosClient.tsx
 *   · app/productos/cargar/excel-propio-archivo.ts
 *   · lib/depurador/excel-propio.ts
 *
 * ⚠️ LO COMPARTIDO SE QUEDA VIVO Y NO SE TOCÓ — lo usa el pedido de Reebok,
 * que sí se usa: `lib/depurador/fotos-excel.ts` (el emparejador),
 * `lib/depurador/fotos-xlsx.ts` (el armador del zip) y
 * `app/productos/cargar/fotos-carpeta.ts` (`prepararFotos` → `compressImage`).
 * Si se separaran, dos pantallas pegarían fotos distintas para el mismo código.
 *
 * 🔴 Y `?tab=misfotos` NO SE ROMPE: sigue en `TAB_VIEJO_A_NUEVO` y aterriza en
 * «Tallas por bulto», que es lo que existe.
 *
 * 🔄 La pestaña quedó con UNA sola vista, así que su rótulo pasó de «Tallas y
 * catálogo» a «Tallas por bulto» (el «y catálogo» era justamente la vista que
 * se fue). El id `tallas` NO cambió: `?tab=tallas` sigue sirviendo.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import {
  PESTANAS,
  VISTAS_POR_TAB,
  TAB_VIEJO_A_NUEVO,
  resolverTab,
} from "@/app/productos/cargar/pestanas";

const RAIZ = process.cwd();
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
/** El código sin comentarios: las historias nombran a propósito lo retirado. */
const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

/** Todo `src/`, menos los tests (que nombran lo retirado para vigilarlo). */
function fuentes(): string[] {
  const out: string[] = [];
  const caminar = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === "__tests__" || e === "node_modules") continue;
      const full = path.join(dir, e);
      if (statSync(full).isDirectory()) caminar(full);
      else if (/\.(ts|tsx)$/.test(e)) out.push(full);
    }
  };
  caminar(path.join(RAIZ, "src"));
  return out;
}

const RETIRADOS = [
  "src/app/productos/cargar/MiExcelFotosClient.tsx",
  "src/app/productos/cargar/excel-propio-archivo.ts",
  "src/lib/depurador/excel-propio.ts",
];

describe("🔴 la vista no existe en ninguna pestaña", () => {
  it("«Tallas por bulto» quedó con UNA sola vista, y es `curvas`", () => {
    expect(VISTAS_POR_TAB.tallas.map((v) => v.id)).toEqual(["curvas"]);
  });

  it("ninguna pestaña ofrece «misfotos» ni el rótulo «Fotos a mi Excel»", () => {
    for (const vistas of Object.values(VISTAS_POR_TAB)) {
      for (const v of vistas) {
        expect(v.id, "volvió la vista misfotos").not.toBe("misfotos");
        expect(v.label, "volvió el rótulo «Fotos a mi Excel»").not.toContain("Fotos a mi Excel");
      }
    }
    expect(PESTANAS.map((p) => p.label).join(" ")).not.toContain("Fotos a mi Excel");
  });

  it("la pestaña se llama «Tallas por bulto» y su id NO cambió", () => {
    const t = PESTANAS.find((p) => p.id === "tallas");
    expect(t?.label).toBe("Tallas por bulto");
    // El «y catálogo» era la vista que se fue: el rótulo dejaría de ser cierto.
    expect(t?.label).not.toContain("catálogo");
  });
});

describe("🔴 el enlace guardado no se rompe", () => {
  it("`?tab=misfotos` sigue mapeado y aterriza en algo que EXISTE", () => {
    expect(TAB_VIEJO_A_NUEVO.misfotos).toEqual({ tab: "tallas", vista: "curvas" });
    const destino = TAB_VIEJO_A_NUEVO.misfotos;
    expect(VISTAS_POR_TAB[destino.tab].some((v) => v.id === destino.vista)).toBe(true);
  });

  it("y resolverTab lo lleva ahí, marcándolo como redirección", () => {
    expect(resolverTab("misfotos", "", false)).toEqual({
      tab: "tallas",
      vista: "curvas",
      redirigido: true,
    });
    // Un `?vista=misfotos` suelto cae a la primera vista de la pestaña.
    expect(resolverTab("tallas", "misfotos", false).vista).toBe("curvas");
    expect(resolverTab("tallas", "misfotos", true).vista).toBe("curvas");
  });

  it("TODO destino de TAB_VIEJO_A_NUEVO apunta a una vista que existe", () => {
    for (const [viejo, d] of Object.entries(TAB_VIEJO_A_NUEVO)) {
      expect(VISTAS_POR_TAB[d.tab].some((v) => v.id === d.vista), `${viejo} → ${d.tab}/${d.vista}`)
        .toBe(true);
    }
  });
});

describe("🔴 los tres archivos se quedan, rotulados y SIN LECTORES", () => {
  it("siguen ahí, con la fecha del retiro y el porqué de no usar `xlsx-js-style`", () => {
    for (const rel of RETIRADOS) {
      expect(existsSync(path.join(RAIZ, rel)), rel).toBe(true);
      const src = leer(rel);
      expect(src, `${rel} perdió el rótulo del retiro`).toContain("RETIRADO DE LA PANTALLA EL 22-sep-2026");
      expect(src, `${rel} perdió el porqué`).toContain("xlsx-js-style");
    }
  });

  it("🔴 y NADIE los importa desde `src/` (fuera de ellos mismos)", () => {
    const propios = new Set(RETIRADOS.map((r) => path.join(RAIZ, r)));
    for (const marca of ["MiExcelFotosClient", "excel-propio-archivo", "depurador/excel-propio"]) {
      const importadores = fuentes().filter((f) => {
        if (propios.has(f)) return false;
        return sinComentarios(readFileSync(f, "utf8")).includes(marca);
      });
      expect(importadores.map((f) => path.relative(RAIZ, f)), `volvió ${marca}`).toEqual([]);
    }
  });

  it("la página de Plantilla Switch no lo monta ni lo importa", () => {
    const page = sinComentarios(leer("src/app/productos/cargar/page.tsx"));
    expect(page).not.toContain("MiExcelFotosClient");
    expect(page).not.toContain("misfotos");
  });
});

describe("⚠️ CONTROL — lo COMPARTIDO sigue vivo y lo usa el pedido de Reebok", () => {
  it("el emparejador, el compresor y el armador del zip siguen ahí", () => {
    for (const rel of [
      "src/lib/depurador/fotos-excel.ts",
      "src/lib/depurador/fotos-xlsx.ts",
      "src/app/productos/cargar/fotos-carpeta.ts",
    ]) {
      expect(existsSync(path.join(RAIZ, rel)), rel).toBe(true);
    }
  });

  it("🔴 y ReebokClient los sigue usando: si se separaran, dos pantallas pegarían fotos distintas", () => {
    const reebok = sinComentarios(leer("src/app/productos/cargar/ReebokClient.tsx"));
    expect(reebok).toContain("@/lib/depurador/fotos-excel");
    expect(reebok).toContain("@/lib/depurador/fotos-xlsx");
    expect(reebok).toContain("prepararFotos");
  });

  it("⚠️ «Tallas por bulto» NO se tocó: sigue montada y sigue anotando su descarga", () => {
    expect(existsSync(path.join(RAIZ, "src/app/productos/cargar/CurvasView.tsx"))).toBe(true);
    expect(leer("src/app/productos/cargar/page.tsx")).toContain("<CurvasView");
    expect(sinComentarios(leer("src/app/productos/cargar/CurvasView.tsx")))
      .toContain('"descarga_tallas"');
  });

  it("CONTROL de que el barrido no mira una carpeta vacía", () => {
    expect(fuentes().length).toBeGreaterThan(500);
    // Y sabe encontrar algo que SÍ está: el módulo de las pestañas.
    const conPestanas = fuentes().filter((f) =>
      sinComentarios(readFileSync(f, "utf8")).includes("VISTAS_POR_TAB"),
    );
    expect(conPestanas.length).toBeGreaterThan(0);
  });
});
