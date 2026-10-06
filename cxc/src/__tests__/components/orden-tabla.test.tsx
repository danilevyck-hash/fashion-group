// 🔴 CANDADO — ORDENAR TOCANDO EL ENCABEZADO, UNA SOLA REGLA (Daniel, 6-oct-2026,
// Multifashion › Productos: «Quiero poder ordenar por Descripción, Unidades,
// Venta, Margen y Stock. No solo en esta pantalla, sino en todo lo que tenga
// sentido»).
//
//   · tocar ordena; tocar otra vez invierte; ▲/▼ chico al lado del rótulo;
//   · números de mayor a menor la primera vez, texto de la A a la Z;
//   · sin dato va al final en los dos sentidos; el orden es estable;
//   · el orden se recuerda (localStorage `fg_orden_<tabla>`);
//   · las tablas de la lista de abajo usan el núcleo común, y las que Daniel
//     decidió que NO se ordenan siguen sin ordenarse.

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { alTocar, flecha, leerOrden, ordenarFilas } from "@/lib/orden-tabla";
import { PantallaProductos } from "@/components/productos/FiltrosProductos";
import type { ArticuloVendido } from "@/lib/productos/filtros";

describe("la regla", () => {
  it("la primera vez: texto A→Z, números de mayor a menor; otra vez invierte", () => {
    expect(alTocar(null, "nombre", true)).toEqual({ col: "nombre", dir: "asc" });
    expect(alTocar(null, "venta", false)).toEqual({ col: "venta", dir: "desc" });
    expect(alTocar({ col: "venta", dir: "desc" }, "venta", false)).toEqual({ col: "venta", dir: "asc" });
    expect(alTocar({ col: "venta", dir: "asc" }, "nombre", true)).toEqual({ col: "nombre", dir: "asc" });
  });

  it("▲ de menor a mayor, ▼ de mayor a menor, nada en otra columna", () => {
    expect(flecha({ col: "a", dir: "asc" }, "a")).toBe("▲");
    expect(flecha({ col: "a", dir: "desc" }, "a")).toBe("▼");
    expect(flecha({ col: "a", dir: "desc" }, "b")).toBe("");
    expect(flecha(null, "a")).toBe("");
  });

  it("sin dato va al final en los dos sentidos y el empate respeta el orden de llegada", () => {
    const filas = [
      { n: "b", v: 2 }, { n: "x", v: null }, { n: "a", v: 2 }, { n: "c", v: 5 }, { n: "y", v: Number.NaN },
    ];
    const val = (f: (typeof filas)[number]) => f.v;
    expect(ordenarFilas(filas, { col: "v", dir: "desc" }, val).map((f) => f.n)).toEqual(["c", "b", "a", "x", "y"]);
    expect(ordenarFilas(filas, { col: "v", dir: "asc" }, val).map((f) => f.n)).toEqual(["b", "a", "c", "x", "y"]);
    expect(ordenarFilas(filas, null, val)).toEqual(filas);
  });

  it("el texto compara en español, sin mayúsculas y con números naturales", () => {
    const filas = ["Zapato 10", "árbol", "Zapato 9", "", "Bolso"];
    expect(ordenarFilas(filas, { col: "t", dir: "asc" }, (f) => f)).toEqual(["árbol", "Bolso", "Zapato 9", "Zapato 10", ""]);
  });

  it("lo guardado se valida contra las columnas de la tabla", () => {
    expect(leerOrden("venta:asc", ["venta"])).toEqual({ col: "venta", dir: "asc" });
    expect(leerOrden("otra:asc", ["venta"])).toBeNull();
    expect(leerOrden("venta:raro", ["venta"])).toBeNull();
    expect(leerOrden(null, ["venta"])).toBeNull();
  });
});

const art = (codigo: string, descripcion: string, unidades: number, venta: number, costo: number, existencia: number | null): ArticuloVendido => ({
  codigo, descripcion, unidades, venta, costo, existencia, campos: { descripcion },
});
const ARTS = [
  art("A1", "Men-Bags", 2, 300, 150, 4),
  art("A2", "Men-Bags", 9, 100, 80, 1),
  art("B1", "Belts", 5, 200, 50, null),
  art("C1", "Caps", 20, 50, 40, 30),
];

function filas() {
  const tabla = document.querySelector('[data-vista="tabla"] tbody') as HTMLElement;
  return within(tabla).getAllByRole("row").map((r) => r.querySelector("td")!.textContent!.replace(/\d+$/, "").trim());
}

// Un almacén propio: Node 26 tapa el `localStorage` de jsdom con uno que no guarda.
function almacenDePrueba(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}

describe("Productos (Ventas y Multifashion)", () => {
  let localStorage: Storage;
  beforeEach(() => {
    localStorage = almacenDePrueba();
    Object.defineProperty(window, "localStorage", { value: localStorage, configurable: true });
  });
  const pantalla = () => render(
    <PantallaProductos articulos={ARTS} cargando={false} error={null} onReintentar={() => {}} chips={[]} conInventario />,
  );

  it("abre por venta como siempre, sin flecha", () => {
    pantalla();
    expect(filas()).toEqual(["Men-Bags", "Belts", "Caps"]);
    expect(document.querySelector("[aria-sort]")).toBeNull();
  });

  it("Descripción, Unidades, Venta, Margen y Stock se ordenan tocando el encabezado", () => {
    pantalla();
    const th = (n: string) => within(document.querySelector('[data-vista="tabla"] thead') as HTMLElement).getByRole("button", { name: new RegExp(n) });
    fireEvent.click(th("Unidades"));
    expect(filas()).toEqual(["Caps", "Men-Bags", "Belts"]);
    expect(th("Unidades").textContent).toContain("▼");
    fireEvent.click(th("Unidades"));
    expect(filas()).toEqual(["Belts", "Men-Bags", "Caps"]);
    expect(th("Unidades").textContent).toContain("▲");
    fireEvent.click(th("Descripción"));
    expect(filas()).toEqual(["Belts", "Caps", "Men-Bags"]);
    fireEvent.click(th("Margen"));
    expect(filas()).toEqual(["Belts", "Men-Bags", "Caps"]);
    fireEvent.click(th("Stock"));
    expect(filas()).toEqual(["Caps", "Men-Bags", "Belts"]);
    expect(localStorage.getItem("fg_orden_productos")).toBe("stock:desc");
  });

  it("los artículos de una descripción abierta siguen el mismo orden", () => {
    pantalla();
    const thead = document.querySelector('[data-vista="tabla"] thead') as HTMLElement;
    fireEvent.click(within(thead).getByRole("button", { name: /Unidades/ }));
    fireEvent.click(screen.getAllByText("Men-Bags")[0]);
    const arts = [...document.querySelectorAll('[data-vista="tabla"] tr[data-articulo]')].map((r) => r.textContent);
    expect(arts[0]).toContain("A2");
    expect(arts[1]).toContain("A1");
  });

  it("el orden se recuerda", () => {
    localStorage.setItem("fg_orden_productos", "descripcion:asc");
    pantalla();
    expect(filas()).toEqual(["Belts", "Caps", "Men-Bags"]);
  });

  it("en el celular, «Ordenar ▾» abre una hoja con las mismas opciones", () => {
    pantalla();
    fireEvent.click(document.querySelector("[data-ordenar-barra]") as HTMLElement);
    const opciones = [...document.querySelectorAll("[data-ordenar-opcion]")].map((b) => b.getAttribute("data-ordenar-opcion"));
    expect(opciones).toEqual(["descripcion", "unidades", "venta", "margen", "stock"]);
    fireEvent.click(document.querySelector('[data-ordenar-opcion="unidades"]') as HTMLElement);
    expect(filas()).toEqual(["Caps", "Men-Bags", "Belts"]);
  });
});

// ── Dónde se aplica y dónde Daniel decidió que no ──────────────────────────
const RAIZ = path.resolve(__dirname, "../../..");
const leer = (f: string) => readFileSync(path.join(RAIZ, f), "utf8");
const USA_EL_NUCLEO = /@\/components\/ui\/OrdenTabla|@\/lib\/orden-tabla/;

/** Las tablas que ordenan con el núcleo común. Quitar una de aquí es una decisión. */
const CON_ORDEN: readonly string[] = [
  "src/app/admin/usuarios/VisitasTab.tsx",
  "src/app/asistencia/JustificacionesTab.tsx",
  "src/app/asistencia/MovimientosQuincenaTab.tsx",
  "src/app/asistencia/PrestamosTab.tsx",
  "src/app/asistencia/ReporteTab.tsx",
  "src/app/caja/components/GastoTable.tsx",
  "src/app/clientes/ClientesListClient.tsx",
  "src/app/cxc/components/CarteraBoston.tsx",
  "src/app/cxc/components/PanelCxcCelular.tsx",
  "src/app/cxc/page.tsx",
  "src/app/gastos-contabilidad/components/ResumenEgresos.tsx",
  "src/app/guias/components/EtiquetasPorEnvio.tsx",
  "src/app/guias/components/PedidosView.tsx",
  "src/app/marketing/mobiliario/page.tsx",
  "src/app/productos/cargar/HistorialView.tsx",
  "src/app/proveedores/ProveedoresListClient.tsx",
  "src/components/catalogo/ComprobantesPanel.tsx",
  "src/components/comisiones/ComisionesConsolidadoView.tsx",
  "src/components/comisiones/ComisionesDetalleModal.tsx",
  "src/components/comisiones/ComisionesPorEmpresaView.tsx",
  "src/components/comisiones/ComisionesVendedoresRango.tsx",
  "src/components/multifashion/VendedorasSubtab.tsx",
  "src/components/multifashion/VendedorasTablaOrdenada.tsx",
  "src/components/productos/FiltrosProductos.tsx",
  "src/components/ventas/ClientesView.tsx",
  "src/components/ventas/UtilidadView.tsx",
  "src/lib/clientes/lista.ts",
  "src/lib/reclamos/orden.ts",
];

/** Las que NO se ordenan por decisión de Daniel (con su porqué en el archivo). */
const SIN_ORDEN_POR_DECISION: readonly string[] = [
  // «una vendedora no ordena: abre y baja» (16-sep-2026).
  "src/components/multifashion/ListaSeguimientoClientes.tsx",
  // Guías: «Siempre ordenado por fecha», pendientes arriba.
  "src/app/guias/components/GuiasList.tsx",
  // Consulta de artículos: su orden propio de tres pasos y colores por stock.
  "src/components/referencia/ReferenciaModelo.tsx",
  // Marketing › ficha de la tienda: «UNA tabla por fecha».
  "src/app/marketing/tienda/[codigo]/FichaTienda.tsx",
  // Estado de cuenta: el orden de Switch (fecha, ccte_id) no se mueve.
  "src/app/cxc/cliente/[codigo]/ClienteCxc.tsx",
];

describe("dónde se ordena", () => {
  it.each(CON_ORDEN)("%s usa el núcleo común", (f) => {
    expect(leer(f)).toMatch(USA_EL_NUCLEO);
  });
  it.each(SIN_ORDEN_POR_DECISION)("%s sigue sin ordenarse", (f) => {
    expect(leer(f)).not.toMatch(USA_EL_NUCLEO);
  });
});
