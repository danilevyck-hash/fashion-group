/**
 * Error n.º 36 de los videos — Vista general › alertas (16-nov-2026).
 *
 * (a) «Reclamos sin cobrar» contaba desde 30 días con una constante propia;
 *     Reclamos tiene UN solo corte, `DIAS_RECLAMO_VIEJO` (120). Vista general
 *     lee ESA constante, en el servidor y en el título.
 * (b) Cada fila de alerta abría el módulo sin filtrar: el cliente lleva a
 *     Cuentas por cobrar buscando ESE cliente en SU empresa, y el proveedor a
 *     Proveedores con SU empresa abierta.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { enlaceClienteCxc, enlaceProveedor } from "@/lib/vista-general-enlaces";

const raiz = join(__dirname, "..", "..", "..");
const plano = (rel: string) =>
  readFileSync(join(raiz, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const RUTA = "src/app/api/dashboard/vista-general/route.ts";
const PAGINA = "src/app/vista-general/page.tsx";

describe("#36 (a) — un solo corte de reclamo viejo", () => {
  it("el servidor filtra con DIAS_RECLAMO_VIEJO y no con un número propio", () => {
    const src = plano(RUTA);
    expect(src).toMatch(/import\s*\{[^}]*DIAS_RECLAMO_VIEJO[^}]*\}\s*from\s*"@\/lib\/reclamos\/viejos"/);
    expect(src).toMatch(/r\.dias\s*>=\s*DIAS_RECLAMO_VIEJO/);
    expect(src).not.toMatch(/RECLAMO_ANTIGUO_DIAS/);
  });
  it("el título dice el mismo corte (no «+30 días»)", () => {
    const src = plano(PAGINA);
    expect(src).not.toMatch(/\+30 días/);
    expect(src).toMatch(/Reclamos sin cobrar \(\+\$\{DIAS_RECLAMO_VIEJO\} días\)/);
  });
});

describe("#36 (b) — cada alerta lleva a donde dice", () => {
  it("el cliente abre Cuentas por cobrar buscándolo, en su empresa", () => {
    expect(enlaceClienteCxc({ nombre: "Almacén El Sol, S.A.", empresaKey: "vistana" }))
      .toBe("/cxc?search=Almac%C3%A9n+El+Sol%2C+S.A.&empresa=vistana");
    expect(enlaceClienteCxc({ nombre: "—" })).toBe("/cxc");
  });
  it("el proveedor abre Proveedores con su empresa desplegada", () => {
    expect(enlaceProveedor({ empresaKey: "fashion_wear" })).toBe("/proveedores?empresa=fashion_wear");
    expect(enlaceProveedor({})).toBe("/proveedores");
  });
  it("las filas de la pantalla usan esos enlaces, no el módulo pelado", () => {
    const src = plano(PAGINA);
    expect(src).toMatch(/href=\{enlaceClienteCxc\(c\)\}/);
    expect(src).toMatch(/href=\{enlaceProveedor\(p\)\}/);
  });
  it("el servidor manda la llave de la empresa con cada fila", () => {
    const src = plano(RUTA);
    expect(src).toMatch(/empresaKey:\s*r\.company_key/);
    expect(src).toMatch(/empresaKey:\s*r\.empresa_key/);
  });
});
