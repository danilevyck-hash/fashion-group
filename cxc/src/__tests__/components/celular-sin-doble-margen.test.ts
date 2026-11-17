// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — EL CELULAR NO SUMA EL MARGEN DOS VECES (17-nov-2026).
//
// 🩸 Ventas › Clientes y Ventas › Resumen, en el celular: el lienzo gris
// (`PantallaCel`) vivía dentro del `<main>` del módulo (`px-4`) y la tarjeta
// (`GrupoCel`, `mx-4`) ponía su propio margen encima. Medido a 390 · 375 ·
// 360 px: fondo a 16 px del borde y tarjeta a 32 px (debía ser 16).
//
// Regla: el lienzo cancela el `px-4` del `<main>` UNA vez (`-mx-4`), y nadie
// más lo vuelve a cancelar (Comisiones lo hacía en su página).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PantallaCel, GrupoCel } from "@/components/celular/Piezas";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const clasesDe = (html: string) => (/class="([^"]*)"/.exec(html)?.[1] ?? "").split(/\s+/);

describe("el celular no suma el margen dos veces", () => {
  it("el lienzo cancela el px-4 del <main> (y solo en el celular)", () => {
    const c = clasesDe(renderToStaticMarkup(createElement(PantallaCel, null, "x")));
    expect(c).toContain("-mx-4");
    expect(c).toContain("md:mx-0");
  });

  it("la tarjeta pone su margen de 16 px, uno solo", () => {
    const c = clasesDe(renderToStaticMarkup(createElement(GrupoCel, null, "x")));
    expect(c).toContain("mx-4");
  });

  it("los <main> donde vive el lienzo traen px-4 en el celular", () => {
    expect(leer("src/app/ventas/VentasShell.tsx")).toMatch(/<main className=\{`[^`]*\bpx-4\b/);
    expect(leer("src/app/comisiones/ComisionesPageClient.tsx")).toMatch(/<main className="[^"]*\bpx-4\b/);
  });

  it("nadie vuelve a cancelar el margen por encima del lienzo", () => {
    expect(leer("src/app/comisiones/ComisionesPageClient.tsx")).not.toMatch(/className=\{barra \? "[^"]*-mx-4/);
    expect(leer("src/app/ventas/VentasShell.tsx")).not.toMatch(/<TabsContent[^>]*-mx-4/);
  });

  it("Marketing › marca (dentro de un <main> con px-4) también va de borde a borde", () => {
    expect(leer("src/app/marketing/[marca]/page.tsx")).toMatch(/<main className="[^"]*\bpx-4\b/);
    expect(leer("src/app/marketing/components/celular/PaginaMarcaCelular.tsx")).toMatch(
      /<div className="-mx-4 sm:mx-0">\s*<PantallaCelular>/,
    );
  });
});
