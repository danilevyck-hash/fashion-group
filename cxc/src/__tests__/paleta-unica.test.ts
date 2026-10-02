// 🔴 UNA PALETA (Daniel aprobó el estándar el 2-oct-2026; regla en
// `docs/diseno.md` › «Detalles aprendidos»). Fase 2 (2-oct-2026): los módulos
// pasaron a la paleta y el techo bajó de 1189 a 0. Lo que queda fuera vive en
// EXCEPCIONES, archivo por archivo y con su porqué; esos topes solo bajan.
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

const PROHIBIDA = /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|from|to|via|divide|outline|decoration|fill|stroke|accent)-(?:(?:stone|slate|zinc|neutral|teal|green|rose|sky|indigo|violet|purple|fuchsia|lime|yellow|cyan|orange|pink)-\d{2,3}|\[#[0-9a-fA-F]{3,8}\])/g;
// No se barren: el mapa de acentos y lo que lleva colores de MARCA para el cliente externo.
const PERMITIDOS = ["lib/moduleColors.ts", "components/catalogo/", "app/catalogo/", "app/catalogo-publico/", "app/pedido-", "components/reebok/", "components/ui/Avatar.tsx"];
// Fuera de esta lista: CERO. Cada número es el tope de ese archivo y solo baja.
const EXCEPCIONES: Record<string, number> = {
  // Colores que llevan información (semáforo, ▲ verde / ▼ rojo): no se tocan.
  "src/app/vista-general/RentabilidadPorEmpresa.tsx": 4, // semáforo «Rentable» y el signo de la rentabilidad
  "src/app/vista-general/page.tsx": 1, // ▲ verde del «vs año pasado»
  "src/app/prestamos/components/types.ts": 6, // semáforo de avance (verde ≥ 75 %) y el chip del concepto «Terceros»
  "src/app/prestamos/PrestamosClient.tsx": 1, // semáforo de avance (verde ≥ 75 %)
  "src/components/ui.tsx": 4, // `Badge` de estados: «En revisión» (morado) y «En proceso/Preparando/En camino» (naranja)
  // Colores de MARCA dentro de Catálogos › Administrar (el azul, el rojo y el crema del tema de la marca).
  "src/app/catalogos/admin/[marca]/BultoSelector.tsx": 2,
  "src/app/catalogos/admin/[marca]/VariantePicker.tsx": 2,
  // Cajas de error en naranja: pasarlas a ámbar choca con `aviso-en-linea` (techo por
  // archivo de cajas `bg-amber-50` con borde). Se van cuando se pasen a <Aviso tono="error">.
  "src/app/multifashion/MultifashionShell.tsx": 3,
  "src/components/ventas/ResumenView.tsx": 3,
  "src/components/ventas/ClientesView.tsx": 3,
  "src/components/marketing/EntregaForm.tsx": 3,
  "src/components/multifashion/MultifashionResumenView.tsx": 3,
  "src/components/multifashion/BonosSection.tsx": 4,
  "src/components/multifashion/ClientesMultifashionSubtab.tsx": 8,
  "src/components/multifashion/VendedorasSubtab.tsx": 4,
  "src/components/multifashion/ProductosSubtab.tsx": 4,
};

function* archivos(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (!/(__tests__|app\/api)$/.test(p)) yield* archivos(p); }
    else if (/\.tsx?$/.test(n) && !n.includes(".test.")) yield p;
  }
}

describe("paleta única", () => {
  const conteo = new Map<string, number>();
  for (const raiz of ["src/app", "src/components"])
    for (const f of archivos(raiz)) {
      if (PERMITIDOS.some((x) => f.includes(x))) continue;
      const n = (readFileSync(f, "utf8").match(PROHIBIDA) ?? []).length;
      if (n > 0) conteo.set(f, n);
    }

  it("fuera de las excepciones no queda ni una clase de color fuera de la paleta", () => {
    const sucios = [...conteo].filter(([f]) => !(f in EXCEPCIONES)).map(([f, n]) => `${f}: ${n}`);
    expect(sucios).toEqual([]);
  });

  it("cada excepción no crece (su tope solo baja)", () => {
    const pasados = Object.entries(EXCEPCIONES)
      .filter(([f, tope]) => (conteo.get(f) ?? 0) > tope)
      .map(([f, tope]) => `${f}: ${conteo.get(f)} (tope ${tope})`);
    expect(pasados).toEqual([]);
  });
});
