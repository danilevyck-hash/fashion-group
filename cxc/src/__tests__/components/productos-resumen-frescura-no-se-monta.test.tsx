// ─────────────────────────────────────────────────────────────────────────────
// CANDADO: en el celular, «Actualizado 3:15 pm ↻» no se dibuja ENCIMA de
// «Venta $…» en el resumen de Productos (n.º 42 de los videos, 16-nov-2026).
//
// Medido a 390 px en Multifashion › Productos con datos de ejemplo: la frescura
// ocupaba x 216,9–374 y «Venta $44,798.67» x 123,6–245,5 en el mismo renglón:
// 28 px montados. La causa: cada `Par` («833 unidades», «Venta $44,798.67») es
// `whitespace-nowrap` y entre ellos no había NINGÚN espacio ni punto de corte,
// así que la línea de la izquierda era un solo bloque que no podía partirse y
// se desbordaba por debajo de la frescura (`shrink-0`).
//
// jsdom no mide, así que se prueba la ESTRUCTURA: entre el par de unidades y el
// de venta tiene que haber un `<wbr>` (el único punto de corte posible). La
// pantalla es la COMPARTIDA (`PantallaProductos`): Ventas › Productos y
// Multifashion › Productos arreglados a la vez.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PantallaProductos } from "@/components/productos/FiltrosProductos";
import type { ArticuloVendido } from "@/lib/productos/filtros";

const ARTICULOS: ArticuloVendido[] = [
  { codigo: "AC-1001", descripcion: "TH MENSWEAR POLO M", unidades: 400, venta: 22_000, costo: 12_760, campos: { marca: "Tommy", departamento: "Menswear", genero: "Hombre", descripcion: "TH MENSWEAR POLO M" } },
  { codigo: "AC-1002", descripcion: "CK JEANS MEN SHORT L", unidades: 433, venta: 22_798.67, costo: 13_223, campos: { marca: "Calvin", departamento: "Jeans", genero: "Hombre", descripcion: "CK JEANS MEN SHORT L" } },
];

afterEach(cleanup);

describe("Productos › resumen del celular: la frescura no se monta sobre «Venta»", () => {
  it("entre «N unidades» y «Venta $…» hay un punto de corte (<wbr>) para que la línea se parta y no se desborde bajo la frescura", () => {
    render(
      <PantallaProductos
        articulos={ARTICULOS}
        cargando={false}
        error={null}
        onReintentar={() => {}}
        chips={[]}
        conInventario={false}
        frescuraCelular={<span data-frescura>Actualizado 3:15 pm ↻</span>}
      />,
    );
    const resumen = document.querySelector("[data-totales-productos]");
    expect(resumen, "el resumen de totales tiene que estar dibujado").not.toBeNull();

    // El renglón del celular: la frescura es hermana del bloque de la izquierda.
    const frescura = resumen!.querySelector("[data-frescura]");
    expect(frescura, "la frescura va dentro del resumen").not.toBeNull();
    const renglon = frescura!.parentElement!.parentElement!;
    const izquierda = renglon.firstElementChild as HTMLElement;
    expect(izquierda.textContent).toMatch(/^833 unidades·Venta \$44,798\.67/);

    // Entre los dos pares, el separador trae su <wbr>: ahí la línea puede partirse.
    const pares = Array.from(izquierda.querySelectorAll("span.whitespace-nowrap"));
    const unidades = pares.find(s => /unidades$/.test(s.textContent ?? ""));
    const venta = pares.find(s => /^Venta /.test(s.textContent ?? ""));
    expect(unidades, "el par de unidades").toBeDefined();
    expect(venta, "el par de venta").toBeDefined();
    let hayCorte = false;
    for (let n = unidades!.nextSibling; n && n !== venta; n = n.nextSibling) {
      if (n.nodeName === "WBR") hayCorte = true;
    }
    expect(hayCorte, "sin <wbr> entre «unidades» y «Venta» la línea no puede partirse y se dibuja debajo de la frescura").toBe(true);

    // Y la frescura sigue sin poder partirse ni encogerse: cierra el primer renglón.
    expect(frescura!.parentElement!.className).toContain("shrink-0");
    expect(frescura!.parentElement!.className).toContain("whitespace-nowrap");
  });
});
