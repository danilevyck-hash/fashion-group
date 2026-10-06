// Candado (5-oct-2026, Daniel): «los nombres de vendedor como en el resto del
// sistema», no en MAYÚSCULAS de Switch. Cada superficie que dibuja un vendedor
// de Switch pasa por `nombreVendedorEnPantalla` (o `nombreEnPantalla` de
// Multifashion); el buscador muestra el nombre del cliente, no la llave.
//
// Candado 2 (5-oct-2026, Daniel): «un solo nombre por persona en todo el
// sistema». `nombreVendedorEnPantalla` aplica también el alias de Comisiones
// (REINALDO → REYNALDO) y ningún .tsx dibuja la grafía cruda de Switch.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { nombreDeVendedor } from "@/lib/catalogo/vendedor-switch";
import { textoVendedor } from "@/lib/catalogos/pedidos-excel";
import { vendedorEnPantalla } from "@/lib/guias/pedidos-bodega";
import { ALIAS_EN_PANTALLA, nombreVendedorEnPantalla } from "@/lib/comisiones/alias";
import { nombreEnPantalla } from "@/lib/multifashion/nombres";

const leer = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", "..", p), "utf8");

describe("nombres de Switch: nunca en mayúsculas sostenidas en pantalla", () => {
  it("las funciones comunes capitalizan", () => {
    expect(nombreDeVendedor({ id: 7, nombre: "REINALDO ESPINOSA" })).toBe("Reynaldo Espinosa");
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

describe("un solo nombre por persona: formato + alias en una función", () => {
  it("todas las grafías de Switch salen con el nombre de Comisiones", () => {
    for (const g of ["REINALDO ESPINOSA", "REINDALDO ESPINOSA ", "Reynaldo Espinosa", "reinaldo espinosa"]) {
      expect(nombreVendedorEnPantalla(g), g).toBe("Reynaldo Espinosa");
      expect(vendedorEnPantalla(g), g).toBe("Reynaldo Espinosa");
      expect(nombreEnPantalla(g), g).toBe("Reynaldo Espinosa");
    }
    expect(nombreVendedorEnPantalla("AGUAS")).toBe("Rey Stoute Aguas");
    expect(textoVendedor({ vendor: "REINDALDO ESPINOSA" } as Parameters<typeof textoVendedor>[0])).toBe("Reynaldo Espinosa");
  });

  it("el espejo de pantalla tiene todas las filas que las migraciones meten en comision_vendedor_alias", () => {
    const dir = path.resolve(__dirname, "../../../supabase/migrations");
    const espejo = new Map(ALIAS_EN_PANTALLA.map((a) => [a.nombre_switch, a.vendedor_canonico]));
    let filas = 0;
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".sql"))) {
      const sql = fs.readFileSync(path.join(dir, f), "utf8");
      for (const m of sql.matchAll(/INSERT INTO comision_vendedor_alias[^;]*?VALUES([^;]*?)(?:ON CONFLICT|;)/gi)) {
        for (const [, a, b] of m[1].matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)) {
          filas++;
          expect(espejo.get(a.trim().toUpperCase()), `${f}: ${a}`).toBe(b);
        }
      }
    }
    expect(filas).toBeGreaterThan(0);
  });

  it("ningún componente dibuja la grafía cruda de Switch", () => {
    // Campos que traen el vendedor TAL CUAL lo manda Switch. Dibujarlos en JSX o
    // en un texto sin `nombreVendedorEnPantalla` es el candado roto.
    const crudo = /(?<![=\w])\{[\w.?]+\.(vendedor_nombre|vendor|vendedor_switch_nombre|nombre_vendedor)\}|\$\{[\w.?]+\.(vendedor_nombre|vendor|vendedor_switch_nombre|nombre_vendedor)\}/;
    const src = path.resolve(__dirname, "../..");
    const malos: string[] = [];
    const recorrer = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== "__tests__") recorrer(p); }
        else if (p.endsWith(".tsx")) {
          fs.readFileSync(p, "utf8").split("\n").forEach((l, i) => { if (crudo.test(l)) malos.push(`${path.relative(src, p)}:${i + 1}`); });
        }
      }
    };
    recorrer(src);
    expect(malos).toEqual([]);
  });
});
