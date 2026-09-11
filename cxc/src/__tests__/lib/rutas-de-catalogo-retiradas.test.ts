// ─────────────────────────────────────────────────────────────────────────────
// CUATRO RUTAS DE CATÁLOGOS QUE SE RETIRARON, Y NO PUEDEN VOLVER (6-sep-2026)
//
// Ninguna de las cuatro tenía un solo llamador desde `src/`. Se verificó una por
// una antes de tocarlas, y este candado exige las dos mitades: que el archivo
// NO exista, y que nadie vuelva a llamarlas desde el navegador.
//
// 🔴 1. `POST /api/catalogo/joybees/seed` — LA MÁS URGENTE.
//    Reescribía **precio, existencia, regalía y visibilidad** de los productos
//    de Joybees desde una lista ESCRITA A MANO dentro del código (82 SKUs,
//    10.065 piezas inventadas). Medido contra producción el 6-sep-2026:
//    `joybees_products` tiene **83 productos, 8.927 piezas, 6 regalías y 2
//    escondidos a mano**. Correrla habría pisado los precios que manda Switch,
//    reemplazado la existencia real por la de la lista y, con su `active: true`,
//    **vuelto a MOSTRAR los 2 productos escondidos**. No tenía botón en ninguna
//    pantalla: la disparaba cualquier admin o secretaria que supiera la
//    dirección. Con la ruta se fue `src/lib/joybees-seed.ts`, que no tenía otro
//    consumidor.
//
// 🔴 2. `GET /api/catalogo/[marca]/pedidos-unificado` — la lista VIEJA de
//    administrar, reemplazada el 25-ago-2026 por `/catalogo/<marca>/pedidos`.
//    Además calculaba mal la plata (hasta **$680 de diferencia en un pedido**:
//    no pasaba las piezas por el bulto — el mismo defecto documentado en
//    `src/lib/catalogo/fila-comprobante.ts`). ⚠️ Las VISTAS que leía
//    (`<marca>_pedidos_unificado_vw`) **no se tocaron**: las sigue usando
//    `pedidos-export`, que está vivo.
//
// 3. `GET /api/catalogo/reebok/stats` y 4. `POST /api/catalogo/reebok/inventory/bulk`.
//    ⚠️ `reebok/inventory` (sin `/bulk`) **sigue viva** y no se tocó.
//
// 🔴 LAS TABLAS NO SE TOCARON. Se retiran RUTAS, y solo rutas — el patrón de la
// casa (`mayor_lineas`, `cxc_favorites`): lo que se queda sin lectores se queda.
//
// 🔴 5. `POST /api/catalogo/joybees/import` — LA QUINTA (11-sep-2026). Este
//    candado CAMBIÓ DE DIRECCIÓN: hasta hoy la usaba como CONTROL de que no
//    mira una carpeta vacía, y por eso quedó fuera de la poda del 6-sep. Era la
//    gemela de `seed`: reescribía precio, nombre, categoría, etiqueta y
//    visibilidad de los 83 productos desde un cuerpo JSON, ponía `stock 0 /
//    active false` a todo SKU que no viniera, y calculaba `active = stock > 0`
//    SIN pasar por `esVisibleEnCatalogo` — los 2 escondidos de Joybees tienen
//    stock 1 y habrían vuelto al catálogo público. Sin un solo llamador desde
//    `src/` (la pantalla de importar por plantilla se retiró el 6-sep). El
//    CONTROL pasa a `reebok/inventory`, `pedidos-export` y `orders`, que siguen
//    vivas.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const RAIZ = process.cwd();

/** Las cinco rutas retiradas: la carpeta que no puede volver a existir y el
 *  texto que ninguna pantalla puede volver a pedir. */
const RETIRADAS = [
  { carpeta: "src/app/api/catalogo/joybees/seed", url: "/api/catalogo/joybees/seed" },
  { carpeta: "src/app/api/catalogo/joybees/import", url: "/api/catalogo/joybees/import" },
  { carpeta: "src/app/api/catalogo/[marca]/pedidos-unificado", url: "pedidos-unificado" },
  { carpeta: "src/app/api/catalogo/reebok/stats", url: "/api/catalogo/reebok/stats" },
  { carpeta: "src/app/api/catalogo/reebok/inventory/bulk", url: "/api/catalogo/reebok/inventory/bulk" },
] as const;

/** Lo que se retiró con la ruta de Joybees: la lista escrita a mano. */
const ARCHIVOS_RETIRADOS = ["src/lib/joybees-seed.ts"] as const;

/** Lo que NO se retiró y tiene que seguir existiendo — el CONTROL de que este
 *  candado no está simplemente mirando una carpeta vacía. */
const SIGUEN_VIVAS = [
  "src/app/api/catalogo/reebok/inventory/route.ts",
  "src/app/api/catalogo/[marca]/pedidos-export/route.ts",
  "src/app/api/catalogo/[marca]/orders/route.ts",
] as const;

function fuentesDeApp(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === "__tests__" || e === "node_modules") continue;
      const full = path.join(dir, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(e)) out.push(full);
    }
  };
  walk(path.join(RAIZ, "src"));
  return out;
}

/** El archivo sin sus comentarios: una ruta NOMBRADA en una nota histórica no
 *  es una llamada. Mismo criterio que el barrido de voseo. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("las cinco rutas de catálogos retiradas (6-sep-2026 · 11-sep-2026)", () => {
  for (const { carpeta } of RETIRADAS) {
    it(`no existe el archivo de ${carpeta}`, () => {
      expect(existsSync(path.join(RAIZ, carpeta, "route.ts"))).toBe(false);
      expect(existsSync(path.join(RAIZ, carpeta))).toBe(false);
    });
  }

  for (const archivo of ARCHIVOS_RETIRADOS) {
    it(`no vuelve ${archivo}`, () => {
      expect(existsSync(path.join(RAIZ, archivo))).toBe(false);
    });
  }

  it("nadie las vuelve a llamar desde src/ (fuera de comentarios)", () => {
    const culpables: string[] = [];
    for (const archivo of fuentesDeApp()) {
      const código = sinComentarios(readFileSync(archivo, "utf8"));
      for (const { url } of RETIRADAS) {
        if (código.includes(url)) culpables.push(`${path.relative(RAIZ, archivo)} → ${url}`);
      }
    }
    expect(culpables).toEqual([]);
  });

  it("CONTROL: las rutas vecinas que NO se retiraron siguen ahí", () => {
    for (const vive of SIGUEN_VIVAS) {
      expect(existsSync(path.join(RAIZ, vive)), vive).toBe(true);
    }
  });

  it("CONTROL: el barrido SÍ vería una llamada de verdad", () => {
    const falso = `const r = await fetch("/api/catalogo/joybees/seed", { method: "POST" });`;
    expect(sinComentarios(falso).includes("/api/catalogo/joybees/seed")).toBe(true);
    // …y NO ve la misma ruta escrita dentro de un comentario.
    expect(sinComentarios(`// se retiró /api/catalogo/joybees/seed`)).not.toContain("seed");
  });

  it("las TABLAS no se tocaron: ninguna migración dropea lo que estas rutas leían", () => {
    const dir = path.join(RAIZ, "supabase/migrations");
    const prohibido = /drop\s+(table|view|materialized\s+view)[\s\S]{0,80}?(joybees_products|inventory|reebok_pedidos_unificado_vw|joybees_pedidos_unificado_vw|tommy_pedidos_unificado_vw|calvin_pedidos_unificado_vw)/i;
    const culpables = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => prohibido.test(readFileSync(path.join(dir, f), "utf8")));
    expect(culpables).toEqual([]);
  });
});
