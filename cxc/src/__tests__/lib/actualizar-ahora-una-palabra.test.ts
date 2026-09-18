/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 UNA SOLA PALABRA PARA «TRAER DATOS FRESCOS» (18-sep-2026)
 *
 * Daniel, viendo el botón que Etiquetas estrenó el 17-sep: *«¿no prefieres
 * Actualizar ahora?»*.
 *
 * 🩸 Había TRES textos para la MISMA acción:
 *   · «Actualizar ahora» — CXC, Catálogos, Proveedores, Referencia y
 *     Multifashion (`SyncNowButton`), o sea la mayoría del sistema;
 *   · «Buscar otra vez» — Guías, en el selector de facturas de Nueva guía;
 *   · «Traer de Switch ahora» — Etiquetas.
 *
 * 🔴 LO QUE ESTE CANDADO PROTEGE:
 *   A. los dos textos viven en UN solo lugar (`lib/ui/actualizar-ahora.ts`);
 *   B. los tres botones lo leen de ahí, ninguno lo teclea;
 *   C. las dos palabras viejas no vuelven a aparecer en `src/**`;
 *   D. ⚠️ «Traer ahora» de Asistencia NO es esto y NO se tocó: ése le pide a
 *      una PC concreta que empuje las marcaciones de SU reloj;
 *   E. la frase de Daniel de Etiquetas («¿No aparece la factura de hoy? Tráela
 *      de Switch») sigue letra por letra.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { TEXTO_ACTUALIZANDO, TEXTO_ACTUALIZAR_AHORA } from "@/lib/ui/actualizar-ahora";
import { TEXTO_TRAER_DE_SWITCH } from "@/lib/guias/etiquetas";

const RAIZ = path.join(process.cwd(), "src");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

/** El archivo sin comentarios: lo que se DIBUJA, no lo que se cuenta. */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

const BOTON = "src/components/shared/SyncNowButton.tsx";
const FACTURAS = "src/app/guias/components/FacturasDelCliente.tsx";
const ETIQUETAS = "src/app/guias/components/EtiquetasView.tsx";

/** Todo `src/**` menos los tests y el módulo que define las palabras. */
function fuentesDeLaApp(): string[] {
  const out: string[] = [];
  const saltar = new Set(["__tests__", "node_modules"]);
  (function caminar(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (saltar.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) caminar(p);
      else if (/\.tsx?$/.test(e.name)) out.push(p);
    }
  })(RAIZ);
  return out.filter((p) => !p.endsWith(path.join("lib", "ui", "actualizar-ahora.ts")));
}

// ─── A · las palabras, en un solo lugar ──────────────────────────────────────

describe("🔴 A. la casa dice «Actualizar ahora»", () => {
  it("las dos palabras, letra por letra", () => {
    expect(TEXTO_ACTUALIZAR_AHORA).toBe("Actualizar ahora");
    expect(TEXTO_ACTUALIZANDO).toBe("Actualizando…");
  });

  it("el módulo explica POR QUÉ, para que nadie estrene una cuarta", () => {
    const src = leer("lib/ui/actualizar-ahora.ts");
    expect(src).toContain("Buscar otra vez");
    expect(src).toContain("Traer de Switch ahora");
    expect(src).toContain("Traer ahora");
  });
});

// ─── B · los tres botones lo leen de ahí ─────────────────────────────────────

describe("🔴 B. ningún botón teclea el texto", () => {
  for (const [nombre, rel] of [
    ["el de los cinco módulos", BOTON],
    ["el selector de facturas de Nueva guía", FACTURAS],
    ["el de Etiquetas", ETIQUETAS],
  ] as const) {
    it(`${nombre} importa las dos palabras`, () => {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(src).toContain('from "@/lib/ui/actualizar-ahora"');
      expect(src).toContain("TEXTO_ACTUALIZAR_AHORA");
      expect(src).toContain("TEXTO_ACTUALIZANDO");
      // Y no la vuelve a escribir a mano (los comentarios sí la nombran: son
      // los que cuentan de dónde viene).
      expect(sinComentarios(src)).not.toContain('"Actualizar ahora"');
    });
  }
});

// ─── C · las dos palabras viejas no vuelven ──────────────────────────────────

describe("🔴 C. «Buscar otra vez» y «Traer de Switch ahora» se fueron de la app", () => {
  it("no quedan en ningún texto que se dibuje", () => {
    const culpables: string[] = [];
    for (const p of fuentesDeLaApp()) {
      // Los comentarios cuentan la historia («decía Buscar otra vez»): lo que
      // no puede volver es el TEXTO que se dibuja.
      if (/Buscar otra vez|Traer de Switch ahora/.test(sinComentarios(fs.readFileSync(p, "utf8")))) {
        culpables.push(path.relative(process.cwd(), p));
      }
    }
    expect(culpables).toEqual([]);
  });
});

// ─── D · la excepción de Asistencia ──────────────────────────────────────────

describe("⚠️ D. «Traer ahora» de Asistencia NO se tocó", () => {
  it("el botón del reloj sigue diciendo lo suyo", () => {
    const src = leer("app/asistencia/EstadoReloj.tsx");
    expect(src).toContain('"Traer ahora"');
    // Y NO se lo hizo colgar de la palabra de la casa: es otra acción — le deja
    // un pedido a una PC para que EMPUJE las marcaciones de su reloj.
    expect(src).not.toContain("actualizar-ahora");
  });
});

// ─── E · la frase de Daniel, intacta ─────────────────────────────────────────

describe("🔴 E. la frase de Etiquetas es la de Daniel, y no cambió", () => {
  it("letra por letra", () => {
    expect(TEXTO_TRAER_DE_SWITCH).toBe("¿No aparece la factura de hoy? Tráela de Switch");
  });

  it("la pantalla la sigue DIBUJANDO de la constante, no solo importándola", () => {
    // Importarla y no usarla no cuenta: lo que se ve es el `<span>`.
    expect(leer("app/guias/components/EtiquetasView.tsx")).toContain(
      "<span>{TEXTO_TRAER_DE_SWITCH}</span>",
    );
  });

  it("CONTROL: el botón de Etiquetas sigue usando la MISMA ruta de siempre", () => {
    const src = leer("app/guias/components/EtiquetasView.tsx");
    expect(src).toContain('fetch("/api/guias/facturas-hoy", { method: "POST" })');
  });

  it("CONTROL: el de Nueva guía también, y sigue recargando la lista", () => {
    const src = leer("app/guias/components/FacturasDelCliente.tsx");
    expect(src).toContain('fetch("/api/guias/facturas-hoy", { method: "POST" })');
    expect(src).toContain("await cargarFacturas(cliente.codigo);");
  });
});
