/**
 * CANDADO — LA FOTO QUE CARGÓ ANTES DE HIDRATAR SE VE (19-nov-2026)
 *
 * 🩸 En el catálogo público de Tommy (iPhone) las primeras tarjetas se quedaban
 * GRISES para siempre: llegan en el HTML del servidor con carga inmediata, la
 * foto termina ANTES de que React hidrate, `onLoad` nunca llega y el esqueleto
 * (`.shimmer`, absolute inset-0) queda encima. Medido en producción con WebKit:
 * `complete = true`, `naturalWidth = 600` y el shimmer seguía ahí.
 *
 * Arreglo: al montar la <img>, `estadoAlMontar` pregunta cómo quedó.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, cleanup } from "@testing-library/react";
import CatalogoProductCard from "@/components/catalogo/CatalogoProductCard";
import type { CatalogoProducto } from "@/components/catalogo/types";
import { estadoAlMontar } from "@/lib/image-thumb";

vi.mock("@/lib/hooks/useModalDismiss", () => ({ useEscapeClose: () => {} }));

const URL_FOTO =
  "https://x.supabase.co/storage/v1/object/public/product-images/tommy/a/1.jpg";

const restaurar: Array<() => void> = [];
function imagenYaTerminada(naturalWidth: number) {
  const proto = HTMLImageElement.prototype;
  for (const [k, v] of [["complete", true], ["naturalWidth", naturalWidth], ["currentSrc", URL_FOTO]] as const) {
    const previo = Object.getOwnPropertyDescriptor(proto, k);
    Object.defineProperty(proto, k, { configurable: true, get: () => v });
    restaurar.push(() => (previo ? Object.defineProperty(proto, k, previo) : delete (proto as unknown as Record<string, unknown>)[k]));
  }
}
afterEach(() => {
  cleanup();
  while (restaurar.length) restaurar.pop()!();
});

const pintar = () =>
  render(
    <CatalogoProductCard
      marca="tommy"
      priority
      product={{ id: "p1", sku: "EN0EN020840K4", name: "Women-Sneakers", price: 34, image_url: URL_FOTO, category: "sneakers" } as CatalogoProducto}
      qty={0}
      onQtyChange={() => {}}
    />,
  );

describe("la foto ya cargada antes de hidratar", () => {
  it("se ve: sin esqueleto encima", () => {
    imagenYaTerminada(600);
    const { container } = pintar();
    expect(container.querySelector("img[alt='Women-Sneakers']")).not.toBeNull();
    expect(container.querySelector(".shimmer"), "la foto quedó tapada por el esqueleto").toBeNull();
  });

  it("si ya había fallado, prueba la URL original y luego ofrece «Reintentar» (no se queda gris)", () => {
    imagenYaTerminada(0); // reducida Y original rotas
    const { container } = pintar();
    expect(container.querySelector(".shimmer")).toBeNull();
    expect(container.textContent).toContain("Reintentar");
  });

  it("una foto que todavía no termina sigue esperando su evento", () => {
    expect(estadoAlMontar(null)).toBeNull();
    expect(estadoAlMontar({ complete: false, naturalWidth: 0, currentSrc: "" } as HTMLImageElement)).toBeNull();
    expect(estadoAlMontar({ complete: true, naturalWidth: 0, currentSrc: "" } as HTMLImageElement)).toBeNull();
  });

  it("las DOS tarjetas preguntan al montar", () => {
    for (const f of ["CatalogoProductCard.tsx", "CatalogoGroupedCard.tsx"]) {
      const src = fs.readFileSync(path.join(process.cwd(), "src/components/catalogo", f), "utf8");
      expect(src, f).toMatch(/ref=\{\(img\) => \{[\s\S]{0,200}estadoAlMontar\(img\)/);
    }
  });
});
