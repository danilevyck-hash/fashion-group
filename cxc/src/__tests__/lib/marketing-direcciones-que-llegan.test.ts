// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — MARKETING: SUS DIRECCIONES LLEGAN, Y NINGUNA CONTESTA «Esa marca no
// existe en Marketing.» (20-sep-2026).
//
// 🩸 Medido antes del arreglo: `/marketing/reportes` TUVO pantalla propia
// (`src/app/marketing/reportes/page.tsx`, viva hasta el commit 69ae4cee del
// 21-abr-2026, que reestructuró el módulo). Desde entonces Reportes es una
// VISTA de la misma página (`/marketing?vista=reportes`) y la dirección vieja
// quedó cayendo en el segmento `[marca]`, que no adivina: contestaba «Esa marca
// no existe en Marketing.» — un mensaje sobre marcas a quien buscaba un
// reporte. Ese mismo commit borró otras siete direcciones (papelera, cobranzas
// ×3, facturas, proyectos ×2) con el mismo destino.
//
// Lo que este candado exige:
//   1. Las OCHO direcciones redirigen, todas 307 (temporal).
//   2. 🔑 Reportes e Impulsadoras EXISTEN: van a SU vista, no al Inicio. Las
//      pantallas retiradas van a `/marketing`, y un proyecto a `?proyecto=<id>`.
//   3. 🔴 FUENTE EXACTA: ni un comodín que se coma `/marketing/<marca>`,
//      `/marketing/mobiliario` ni `/marketing/galeria/<cliente>`.
//   4. `/marketing/proyectos/nuevo` va ANTES que `/marketing/proyectos/:id`.
//   5. La página raíz redirige `?vista=` y `?proyecto=`: la dirección llega a
//      algún lado.
//   6. Ninguna de las direcciones redirigidas tiene además un `page.tsx`: un
//      redirect le ganaría y la pantalla quedaría inalcanzable.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { MARCAS_BLOQUE } from "@/lib/marketing/bloques";
import { slugDeMarca } from "@/lib/marketing/slugs";

const RAIZ = process.cwd();
const nextConfig = readFileSync(path.join(RAIZ, "next.config.js"), "utf8");
const bloqueRedirects = nextConfig.slice(
  nextConfig.indexOf("async redirects()"),
  nextConfig.indexOf("experimental:"),
);

const ESPERADOS: ReadonlyArray<[fuente: string, destino: string]> = [
  ["/marketing/reportes", "/marketing?vista=reportes"],
  ["/marketing/impulsadoras", "/marketing?vista=impulsadoras"],
  ["/marketing/papelera", "/marketing"],
  ["/marketing/cobranzas", "/marketing"],
  ["/marketing/cobranzas/:path*", "/marketing"],
  ["/marketing/facturas/:id", "/marketing"],
  ["/marketing/proyectos/nuevo", "/marketing"],
  ["/marketing/proyectos/:id", "/marketing?proyecto=:id"],
];

describe("🔴 las direcciones viejas de Marketing llegan a algún lado", () => {
  it.each(ESPERADOS)("%s → %s", (fuente, destino) => {
    expect(bloqueRedirects).toContain(
      `{ source: "${fuente}", destination: "${destino}", permanent: false }`,
    );
  });

  it("todas temporales (307), como el resto del archivo", () => {
    for (const [fuente] of ESPERADOS) {
      const linea = bloqueRedirects
        .split("\n")
        .find((l) => l.includes(`source: "${fuente}"`)) as string;
      expect(linea, `falta el redirect de ${fuente}`).toBeTruthy();
      expect(linea).toContain("permanent: false");
      expect(linea).not.toContain("permanent: true");
    }
  });

  it("🔑 Reportes e Impulsadoras van a SU vista, no al Inicio pelado", () => {
    const reportes = bloqueRedirects
      .split("\n")
      .find((l) => l.includes('source: "/marketing/reportes"')) as string;
    expect(reportes).toContain('destination: "/marketing?vista=reportes"');
    const impulsadoras = bloqueRedirects
      .split("\n")
      .find((l) => l.includes('source: "/marketing/impulsadoras"')) as string;
    expect(impulsadoras).toContain('destination: "/marketing?vista=impulsadoras"');
  });

  it("`/marketing/proyectos/nuevo` va ANTES que `:id`", () => {
    const iNuevo = bloqueRedirects.indexOf('source: "/marketing/proyectos/nuevo"');
    const iId = bloqueRedirects.indexOf('source: "/marketing/proyectos/:id"');
    expect(iNuevo).toBeGreaterThan(-1);
    expect(iId).toBeGreaterThan(-1);
    expect(iNuevo).toBeLessThan(iId);
  });
});

describe("🔴 ninguna dirección que hoy funciona deja de funcionar", () => {
  it("sin comodines que se coman el módulo entero", () => {
    expect(bloqueRedirects).not.toContain('source: "/marketing"');
    expect(bloqueRedirects).not.toContain('source: "/marketing/:path*"');
    expect(bloqueRedirects).not.toMatch(/source:\s*"\/marketing\/:(marca|slug)\b/);
    expect(bloqueRedirects).not.toContain('source: "/marketing/mobiliario"');
    expect(bloqueRedirects).not.toContain('source: "/marketing/galeria');
  });

  it("ninguna marca se llama como una de las fuentes redirigidas", () => {
    const fuentes = new Set(
      ESPERADOS.map(([f]) => f.split("/")[2]).filter((s) => !s.startsWith(":")),
    );
    const slugs = [
      ...MARCAS_BLOQUE.map((m) => slugDeMarca(m.key)),
      ...MARCAS_BLOQUE.map((m) => String(m.key).toLowerCase()),
      "multifashion",
      "sin-marca",
    ];
    for (const slug of slugs) expect(fuentes.has(slug)).toBe(false);
  });

  it("las pantallas vivas del módulo siguen en su archivo", () => {
    for (const ruta of [
      "src/app/marketing/page.tsx",
      "src/app/marketing/[marca]/page.tsx",
      "src/app/marketing/[marca]/[periodo]/page.tsx",
      "src/app/marketing/mobiliario/page.tsx",
      "src/app/marketing/galeria/[cliente]/page.tsx",
    ]) {
      expect(existsSync(path.join(RAIZ, ruta)), `falta ${ruta}`).toBe(true);
    }
  });

  it("y las redirigidas NO tienen página propia (el redirect la taparía)", () => {
    for (const carpeta of [
      "src/app/marketing/reportes",
      "src/app/marketing/impulsadoras",
      "src/app/marketing/papelera",
      "src/app/marketing/cobranzas",
      "src/app/marketing/facturas",
      "src/app/marketing/proyectos",
    ]) {
      expect(existsSync(path.join(RAIZ, carpeta)), `sobra ${carpeta}`).toBe(false);
    }
  });
});

// 8-oct-2026 · La portada vieja (`MarketingPageDeAntes`, `InicioMarketing`,
// Reportes, el overlay del proyecto) se borró. `?vista=` y `?proyecto=<id>`
// siguen llegando a algún lado: la página raíz los REDIRIGE.
describe("🔑 lo que la dirección promete, existe", () => {
  const raiz = readFileSync(
    path.join(RAIZ, "src/app/marketing/page.tsx"),
    "utf8",
  );

  it("la página raíz redirige `?vista=` (Reportes, Impulsadoras, papelera)", () => {
    expect(raiz).toContain('searchParams.get("vista")');
    expect(raiz).toContain("destinoDeVistaVieja(vistaRaw)");
  });

  it("y un `?proyecto=` viejo va a la ficha de la tienda de ese proyecto", () => {
    expect(raiz).toContain('searchParams.get("proyecto")');
    expect(raiz).toContain("useRedirigirProyectoViejo(");
  });
});
