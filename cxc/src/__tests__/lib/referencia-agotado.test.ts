import { describe, expect, it } from "vitest";
import { textoQueda, textoStock } from "@/components/referencia/ReferenciaModelo";
import type { LlegadaMedida } from "@/lib/ventas/referencia-llegadas";

describe("n.º 109 · el stock en cero dice «Agotado» en las dos tablas", () => {
  it("Existencias", () => {
    expect(textoStock(0, 16, 16)).toBe("Agotado");
    expect(textoStock(null, 16, 16)).toBe("Agotado"); // Switch ya no lista el artículo cerrado
    expect(textoStock(null, 16, 10)).toBe("—"); // sin dato y con piezas por vender: no se inventa
    expect(textoStock(12, 16, 4)).toBe("12");
  });
  it("Últimas recepciones", () => {
    expect(textoQueda({ quedaPct: 0 } as LlegadaMedida)).toBe("Agotado");
    expect(textoQueda({ quedaPct: 40 } as LlegadaMedida)).toBe("queda 40 %");
  });
});
