// ─────────────────────────────────────────────────────────────────────────────
// PESO MUERTO DE JAVASCRIPT — lo que se descargaba sin que nadie lo usara
//
// Medido contra el build de producción (12-ago-2026), JS transferido por
// pantalla en una visita fría: **/asistencia 864 KB**, la más pesada del
// sistema, porque importaba `xlsx-js-style`, `jspdf` y `jspdf-autotable` ARRIBA
// del archivo — o sea al ABRIR la pantalla, aunque quien entra a mirar marcas
// no baje ningún archivo.
//
// Y tres avisos de Sentry por CADA carga de pantalla que no eran lo que la
// auditoría creía: se abrieron los paquetes y los tres dicen
// `{"type":"session"}` (510 bytes) — es el Release Health, no Session Replay.
// Replay ni siquiera entra al bundle (`rrweb` aparece 0 veces en los chunks).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const pkg = JSON.parse(leer("package.json")) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 Sentry: el reporte de errores NO se toca", () => {
  const cliente = leer("sentry.client.config.ts");

  it("sigue inicializándose con su DSN", () => {
    expect(cliente).toContain("dsn: process.env.NEXT_PUBLIC_SENTRY_DSN");
  });

  it("el middleware sigue reportando", () => {
    const mw = leer("src/middleware.ts");
    expect(mw).toContain("Sentry.captureException");
    expect(mw).toContain("Sentry.captureMessage");
  });

  it("no se apaga el tracing por error de bulto", () => {
    // `removeTracing` mataría el `tracesSampleRate: 0.1`, que sí se usa.
    expect(cliente).toContain("tracesSampleRate: 0.1");
    expect(leer("next.config.js")).not.toContain("removeTracing");
  });
});

describe("⚠️ Sentry: se poda lo que se mandaba en cada carga", () => {
  const cliente = leer("sentry.client.config.ts");

  it("el Release Health queda fuera (eran 3 peticiones por pantalla)", () => {
    expect(cliente).toContain('defaults.filter((i) => i.name !== "BrowserSession")');
  });

  it("las opciones de Replay INERTES no vuelven", () => {
    // El SDK solo las lee si `replayIntegration()` está puesta, y no lo está.
    // Dejarlas escritas hacía creer que la grabación estaba prendida.
    expect(cliente).not.toContain("replaysSessionSampleRate");
    expect(cliente).not.toContain("replaysOnErrorSampleRate");
  });

  it("y NADIE agrega replayIntegration por el costado", () => {
    for (const rel of [
      "sentry.client.config.ts",
      "sentry.server.config.ts",
      "sentry.edge.config.ts",
    ]) {
      expect(leer(rel), rel).not.toContain("replayIntegration");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 Asistencia: Excel y PDF se bajan al TOCAR el botón", () => {
  const CONSUMIDORES = [
    "src/app/asistencia/ReporteTab.tsx",
    "src/app/asistencia/PlanillaTab.tsx",
  ];

  // 🩸 Se buscan las SENTENCIAS `import` de arriba, no un texto suelto.
  // Verificado por mutación: con `toContain('import from "xlsx-js-style"')` un
  // `import * as XLSX2 from "xlsx-js-style"` volvía a meter la librería entera
  // y el candado pasaba en VERDE — la forma del import no es una sola.
  const importsEstaticos = (rel: string) =>
    readFileSync(path.join(process.cwd(), rel), "utf8")
      .replace(/\/\/.*$/gm, "")
      .split("\n")
      .filter((l) => /^\s*import\s/.test(l) && !/^\s*import\s+type\s/.test(l));

  it.each(CONSUMIDORES)("%s no importa las librerías pesadas arriba", (rel) => {
    // 🩸 Ojo con el indirecto: `lib/asistencia/exportar` y `lib/excel-export`
    // importan xlsx/jspdf de forma ESTÁTICA, así que importarlos a ELLOS ya
    // arrastra las tres librerías. Por eso también tienen que ser dinámicos.
    const PESADOS = [
      "xlsx-js-style",
      "jspdf",
      "jspdf-autotable",
      "@/lib/excel-export",
      "@/lib/asistencia/exportar",
      "@/lib/asistencia/planilla-exportar",
    ];
    for (const linea of importsEstaticos(rel)) {
      for (const pesado of PESADOS) {
        expect(linea, `${rel} → ${pesado}`).not.toContain(`"${pesado}"`);
      }
    }
  });

  it.each(CONSUMIDORES)("%s las carga con await import dentro del handler", (rel) => {
    const src = leer(rel);
    expect(src).toMatch(/async function bajarExcel\(\)/);
    expect(src).toMatch(/async function bajarPdf\(\)/);
    expect((src.match(/await import\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("si el chunk no baja, la persona se entera (no falla en silencio)", () => {
    for (const rel of CONSUMIDORES) {
      expect(leer(rel), rel).toContain("No se pudo armar el Excel");
      expect(leer(rel), rel).toContain("No se pudo armar el PDF");
    }
  });

  it("los archivos siguen saliendo con el mismo nombre y el mismo motor", () => {
    // Cambiar CÓMO se carga la librería no puede cambiar lo que produce.
    const rep = leer("src/app/asistencia/ReporteTab.tsx");
    expect(rep).toContain("construirExcel({ personas, desde, hasta, reglas");
    expect(rep).toContain("construirPdf({ personas, desde, hasta, reglas");
    expect(rep).toContain("`Asistencia ${desde} a ${hasta}.xlsx`");
    const pla = leer("src/app/asistencia/PlanillaTab.tsx");
    expect(pla).toContain("downloadWorkbook(construirExcelPlanilla(exportables), nombreArchivo(exportables, \"xlsx\"))");
    expect(pla).toContain("construirPdfPlanilla(exportables).save(nombreArchivo(exportables, \"pdf\"))");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("⚠️ librerías que nadie importaba", () => {
  it("react-markdown y @hello-pangea/dnd ya no se instalan", () => {
    for (const dep of ["react-markdown", "@hello-pangea/dnd", "remark-gfm"]) {
      expect(pkg.dependencies, dep).not.toHaveProperty(dep);
      expect(pkg.devDependencies, dep).not.toHaveProperty(dep);
    }
  });

  it("papaparse baja a devDependencies: su único uso es un test", () => {
    // Se queda porque `csv-exports.test.ts` la usa para el round-trip de
    // generar → parsear, que es lo que hace valer ese test. Lo que no
    // corresponde es que viaje al runtime de producción.
    expect(pkg.dependencies).not.toHaveProperty("papaparse");
    expect(pkg.devDependencies).toHaveProperty("papaparse");
  });
});
