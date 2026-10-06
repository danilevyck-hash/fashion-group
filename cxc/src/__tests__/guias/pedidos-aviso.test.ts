import { describe, it, expect } from "vitest";
import { mensajePedidosViejos } from "@/lib/guias/pedidos-aviso";

const HOY = "2026-10-06";
const p = (empresa_key: string, secuencial: string, fecha: string, cliente_nombre: string, estado: "pendiente" | "preparado" = "pendiente") =>
  ({ empresa_key, secuencial, fecha: `${fecha}T10:00:00-05:00`, cliente_nombre, estado });

describe("aviso de pedidos pendientes de más de 7 días", () => {
  it("sin viejos no manda nada (7 días justos no cuentan; preparados tampoco)", () => {
    expect(mensajePedidosViejos([p("joystep", "16-1", "2026-09-29", "A"), p("joystep", "16-2", "2026-08-01", "B", "preparado")], HOY)).toBeNull();
  });

  it("pocos: una línea por pedido con empresa, el más viejo primero", () => {
    const m = mensajePedidosViejos(
      [p("vistana", "11-000000010", "2026-09-20", "Tienda X"), p("joystep", "16-000000072", "2026-08-24", "City Mall Paso Canoa")],
      HOY,
    );
    expect(m).toBe(
      "📦 2 pedidos pendientes de más de 7 días\n" +
        "• Joystep · City Mall Paso Canoa · 16-000000072 · hace 43 d\n" +
        "• Vistana · Tienda X · 11-000000010 · hace 16 d\n" +
        "\nVer: https://www.fashiongr.com/guias?vista=pedidos\n" +
        "Si un pedido está cancelado, anúlalo en Switch para que salga de la lista.",
    );
  });

  it("muchos: agrupa por empresa y corta a 10 con «y N más»", () => {
    const filas = Array.from({ length: 12 }, (_, i) =>
      p(i % 2 ? "joystep" : "vistana", `S-${String(i).padStart(2, "0")}`, `2026-09-${String(10 + i).padStart(2, "0")}`, `C${i}`),
    );
    const m = mensajePedidosViejos(filas, HOY)!;
    expect(m.startsWith("📦 12 pedidos pendientes de más de 7 días\n\nVistana\n• C0 · S-00 · hace 26 d")).toBe(true);
    expect(m).toContain("\nJoystep\n• C1 · S-01 · hace 25 d");
    expect(m.match(/^• /gm)).toHaveLength(10);
    expect(m).toContain("…y 2 más\n\nVer: ");
  });
});
