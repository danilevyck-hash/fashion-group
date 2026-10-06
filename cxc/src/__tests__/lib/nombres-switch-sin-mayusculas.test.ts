// Candado (5-oct-2026, Daniel): «los nombres de vendedor como en el resto del
// sistema», no en MAYÚSCULAS de Switch. Cada superficie que dibuja un vendedor
// de Switch pasa por `nombreVendedorEnPantalla` (o `nombreEnPantalla` de
// Multifashion); el buscador muestra el nombre del cliente, no la llave.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { nombreDeVendedor } from "@/lib/catalogo/vendedor-switch";
import { textoVendedor } from "@/lib/catalogos/pedidos-excel";
import { vendedorEnPantalla } from "@/lib/guias/pedidos-bodega";

const leer = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", "..", p), "utf8");

describe("nombres de Switch: nunca en mayúsculas sostenidas en pantalla", () => {
  it("las funciones comunes capitalizan", () => {
    expect(nombreDeVendedor({ id: 7, nombre: "REINALDO ESPINOSA" })).toBe("Reinaldo Espinosa");
    expect(textoVendedor({ vendor: "REY STOUTE AGUAS" } as Parameters<typeof textoVendedor>[0])).toBe("Rey Stoute Aguas");
    expect(vendedorEnPantalla("EDWIN")).toBe("Edwin");
    expect(vendedorEnPantalla("DEFAULT")).toBe("Oficina");
  });

  it("cada superficie llama al formateador", () => {
    const casos: [string, RegExp][] = [
      ["src/components/catalogo/comprobantes/FilaComprobante.tsx", /nombreVendedorEnPantalla\(v\)/],
      ["src/app/admin/usuarios/VendedorSwitchSection.tsx", /\{nombreVendedorEnPantalla\(v\.nombre\)\}/],
      ["src/lib/multifashion/metas-lectura.ts", /nombre: nombreEnPantalla\(p\.nombre\)/],
      ["src/app/guias/components/PedidosView.tsx", /vendedorEnPantalla\(p\.vendedor_nombre\)/],
      ["src/components/SearchBar.tsx", /label: c\.nombre \|\| c\.nombre_normalized/],
    ];
    for (const [archivo, patron] of casos) expect(leer(archivo), archivo).toMatch(patron);
    expect(leer("src/app/guias/components/PedidosView.tsx")).not.toMatch(/\{p\.vendedor_nombre/);
  });
});
