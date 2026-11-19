// Eloyn y Cuba (bodega) arman pedidos y ven precios; el resto de bodega no (19-nov-2026).
import { describe, expect, it } from "vitest";
import { puedePedir, puedeVerPrecioDePedido, PIDEN_EN_CATALOGO_POR_USUARIO } from "@/lib/catalogo/roles";
import { puedeAgregarAlPedido } from "@/lib/catalogo/modo-pedido";

describe("bodega que pide en el catálogo", () => {
  it("la lista es exactamente eloyn y cuba", () => {
    expect([...PIDEN_EN_CATALOGO_POR_USUARIO].sort()).toEqual(["cuba", "eloyn"]);
  });

  it("bodega eloyn / cuba pide y ve precios (sin importar mayúsculas)", () => {
    for (const userName of ["eloyn", "Eloyn", "CUBA"]) {
      expect(puedePedir({ role: "bodega", userName })).toBe(true);
      expect(puedeVerPrecioDePedido({ role: "bodega", userName })).toBe(true);
      expect(puedeAgregarAlPedido("bodega", userName)).toBe(true);
    }
  });

  it("otra bodega sigue en solo lectura y sin precios", () => {
    for (const userName of ["jorman", "", null, "eloyn2", "cub"]) {
      expect(puedePedir({ role: "bodega", userName })).toBe(false);
      expect(puedeVerPrecioDePedido({ role: "bodega", userName })).toBe(false);
      expect(puedeAgregarAlPedido("bodega", userName)).toBe(false);
    }
  });

  it("el nombre solo abre con rol bodega", () => {
    expect(puedePedir({ role: "gerente_boston", userName: "eloyn" })).toBe(false);
    expect(puedePedir({ role: "contabilidad", userName: "cuba" })).toBe(false);
  });

  it("vendedor, secretaria y admin siguen pidiendo", () => {
    for (const role of ["vendedor", "secretaria", "admin"]) {
      expect(puedePedir({ role, userName: "quien-sea" })).toBe(true);
      expect(puedeVerPrecioDePedido({ role })).toBe(true);
    }
  });
});
