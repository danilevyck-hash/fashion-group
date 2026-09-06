// ─────────────────────────────────────────────────────────────────────────────
// 🩸 UNA COLUMNA MENTÍA, Y NO EN EL NÚMERO: EN EL RÓTULO.
//
// Ventas › Productos. Al desplegar una descripción, la pestaña «Quién lo
// compra» pintaba una última columna con
//
//     fmtParticipacion(participacion(c.venta, total.venta))
//
// —qué PARTE del total se lleva ese cliente— y la tabla no tenía cabecera
// propia, así que heredaba VISUALMENTE la de la tabla de arriba, cuya última
// columna es **«Margen %»**.
//
// MEDIDO en la captura de Daniel (Women-Flip Flops, total $139.795,00):
//     Outlet Duty Free N3   $26.883  → 19,2 %
//     La Frontera           $24.330  → 17,4 %
//     Kheriddine               $432  →  0,3 %
// Son participaciones exactas —suman 100— leídas como si fueran márgenes.
//
// 🔴 EL CÁLCULO ESTABA BIEN. Lo que faltaba era la cabecera. Y un margen por
// cliente NO EXISTE: `switch_factura_lineas` no trae costo, y por eso la tabla
// MADRE ya esconde su columna «Margen %» cuando hay un cliente puesto. Inventar
// un margen por cliente habría sido lo peor de las dos salidas posibles.
//
// LA REGLA QUE ESTE ARCHIVO FIJA, para todo el módulo: **toda tabla hija pone
// su propio `<thead>`**. Que las columnas coincidan por casualidad con las de
// la tabla madre es exactamente lo que hace que nadie note el día que dejan de
// coincidir.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import { ProductosView } from "@/components/ventas/ProductosView";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shared/SyncNowButton", () => ({
  default: () => <button type="button">Actualizar ahora</button>,
}));

const raiz = path.resolve(__dirname, "../../..");
const fuente = readFileSync(path.join(raiz, "src/components/ventas/ProductosView.tsx"), "utf8");

const NIVEL1 = {
  empresa: "fashion_wear",
  year: 2026,
  mes: null,
  periodo: "ytd",
  desde: "2026-01-01",
  hasta: "2026-09-05",
  comparativo: { desde: "2025-01-01", hasta: "2025-09-05" },
  totales: { venta: 139_795, costo: 90_000, margen: 0.3562 },
  productos: [
    { descripcion: "Women-Flip Flops", num_codigos: 12, cantidad: 5_000, venta: 139_795, costo: 90_000, margen: 0.3562 },
  ],
};

// Los tres clientes de la captura, con sus participaciones reales.
const DRILL = {
  codigos: [
    { codigo: "FF-1", descripcion: "Negro", cantidad: 100, venta: 1_000, costo: 600, margen: 0.4 },
  ],
  clientes: [
    // ⚠️ El cuarto NO es relleno: la participación se mide contra la SUMA DE LA
    // LISTA (`totalDeClientes`), no contra la venta de la fila de arriba. Sin
    // él, los tres de la captura sumarían $51.645 y darían otros porcentajes —
    // y este archivo dejaría de reproducir lo que Daniel vio.
    // 26.883 + 24.330 + 432 + 88.150 = 139.795, el total de la fila.
    { cliente_switch_id: 1, cliente_nombre: "Outlet Duty Free N3", cantidad: 900, venta: 26_883 },
    { cliente_switch_id: 4, cliente_nombre: "Resto de la lista", cantidad: 3_288, venta: 88_150 },
    { cliente_switch_id: 2, cliente_nombre: "La Frontera", cantidad: 800, venta: 24_330 },
    { cliente_switch_id: 3, cliente_nombre: "Kheriddine", cantidad: 12, venta: 432 },
  ],
};

beforeEach(() => {
  vi.stubGlobal("fetch", async (url: RequestInfo | URL) => {
    const u = String(url);
    const body = u.includes("/productos/codigos")
      ? DRILL
      : u.includes("previo=1")
        ? { ...NIVEL1, productos: [{ ...NIVEL1.productos[0], venta: 120_000 }] }
        : NIVEL1;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** Despliega la descripción y devuelve la tabla de «Quién lo compra». */
async function abrirQuienLoCompra(): Promise<HTMLElement> {
  render(<ProductosView selectedYear={2026} />);
  await screen.findAllByText("Women-Flip Flops");
  fireEvent.click(document.querySelector('tr[data-fila-producto="Women-Flip Flops"]')!);
  return waitFor(() => {
    const t = document.querySelector("[data-drill-clientes]");
    expect(t, "no se dibujó la lista de clientes").toBeTruthy();
    return t as HTMLElement;
  });
}

/** ⚠️ `:scope >` y no `"thead tr"` a secas: esta tabla vive DENTRO de un `<td>`
 *  de la tabla madre, así que sus filas también son descendientes del `<tbody>`
 *  de arriba y un selector suelto traería las dos tablas mezcladas. */
const propias = (t: HTMLElement, parte: "thead" | "tbody") =>
  [...t.querySelectorAll(`:scope > ${parte} > tr`)];

describe("🔴 la tabla hija NO hereda el encabezado de la madre", () => {
  it("«Quién lo compra» tiene su PROPIA cabecera", async () => {
    const tabla = await abrirQuienLoCompra();
    const cabeceras = propias(tabla, "thead");
    expect(cabeceras, "la tabla de clientes se quedó sin encabezado propio").toHaveLength(1);
  });

  it("🩸 y esa cabecera dice «% del total», NUNCA «Margen»", async () => {
    const tabla = await abrirQuienLoCompra();
    const texto = (propias(tabla, "thead")[0].textContent ?? "").replace(/\s+/g, " ").trim();
    expect(texto).toContain("% del total");
    // El defecto exacto: la palabra que se heredaba de arriba.
    expect(texto).not.toContain("Margen");
    // Y las otras tres columnas quedan nombradas, que era la otra mitad del
    // problema: tres números sin rótulo son tres adivinanzas.
    expect(texto).toContain("Cliente");
    expect(texto).toContain("Venta");
  });

  it("⚠️ los NÚMEROS no se movieron: siguen siendo participaciones exactas", async () => {
    // Es la mitad que importa del arreglo. El cálculo estaba BIEN; lo que se
    // corrigió fue el rótulo. Si esto cambiara, el arreglo habría roto el dato
    // que venía a explicar.
    const tabla = await abrirQuienLoCompra();
    const filas = propias(tabla, "tbody").map((tr) => (tr.textContent ?? "").replace(/\s+/g, " ").trim());
    // 26.883 / 139.795 = 19,2 % → 19 % (sin decimal, diccionario § 0, #5).
    const porNombre = (n: string) => filas.find((f) => f.startsWith(n)) ?? "";
    expect(porNombre("Outlet Duty Free N3")).toContain("19%");   // 26.883 / 139.795
    expect(porNombre("La Frontera")).toContain("17%");           // 24.330 / 139.795
    expect(porNombre("Kheriddine")).toContain("0%");             //    432 / 139.795
  });

  it("🔴 y NO se inventa un margen por cliente: no hay costo por cliente", async () => {
    const tabla = await abrirQuienLoCompra();
    // La celda de participación lleva su propio `data-col`, distinto del
    // `margen` de la tabla madre: dos nombres distintos para dos cosas
    // distintas es lo que impide volver a confundirlas.
    expect(tabla.querySelector('[data-col="participacion"]')).toBeTruthy();
    expect(tabla.querySelector('[data-col="margen"]')).toBeNull();
  });

  it("la tabla de «Códigos» también pone la suya", async () => {
    // Acá las columnas SÍ coinciden de casualidad con las de la tabla madre — y
    // esa casualidad es exactamente lo que hace que nadie note el día que dejan
    // de coincidir.
    render(<ProductosView selectedYear={2026} />);
    await screen.findAllByText("Women-Flip Flops");
    fireEvent.click(document.querySelector('tr[data-fila-producto="Women-Flip Flops"]')!);
    await waitFor(() => expect(document.querySelector("[data-drill-clientes]")).toBeTruthy());
    fireEvent.click(screen.getAllByRole("tab", { name: /Códigos/ })[0]);
    const tabla = await waitFor(() => {
      const t = document.querySelector("[data-drill-codigos]");
      expect(t).toBeTruthy();
      return t as HTMLElement;
    });
    const texto = (propias(tabla, "thead")[0]?.textContent ?? "").replace(/\s+/g, " ").trim();
    expect(texto).toContain("Código");
    expect(texto).toContain("Margen %");
  });
});

describe("barrido: ninguna tabla del módulo se queda sin encabezado propio", () => {
  it("🔴 toda `<table>` de Productos declara su `<thead>`", () => {
    // Un barrido y no tres asserts sueltos: la próxima tabla hija que alguien
    // agregue tiene que traer su cabecera o el build se pone rojo. Es la forma
    // de que la regla sobreviva a este archivo.
    const tablas = [...fuente.matchAll(/<table[^>]*>/g)].length;
    const cabeceras = [...fuente.matchAll(/<thead>/g)].length;
    expect(tablas).toBeGreaterThanOrEqual(3);
    expect(cabeceras, "hay una <table> sin <thead>: heredaría el encabezado de la de arriba")
      .toBe(tablas);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// «DEJÓ DE VENDERSE» EN PANTALLA — el reverso de «Nuevo» (5-sep-2026).
//
// La aritmética vive en `ventas-dejo-de-venderse.test.ts`, sin DOM. Acá se
// verifica que el bloque llegue a la pantalla, diga lo que se midió y NO se
// dibuje cuando no hay nada que decir.
// ─────────────────────────────────────────────────────────────────────────────

describe("«Dejó de venderse» — lo que el año pasado vendía y este año no", () => {
  it("🔴 se dibuja, con cuántos son y cuánta plata era", async () => {
    vi.stubGlobal("fetch", async (url: RequestInfo | URL) => {
      const u = String(url);
      const body = u.includes("/productos/codigos")
        ? DRILL
        : u.includes("previo=1")
          // El año pasado se vendían DOS descripciones más, que este año no
          // aparecen. Ésa es la lista.
          ? {
              ...NIVEL1,
              productos: [
                { ...NIVEL1.productos[0], venta: 120_000 },
                { descripcion: "Women-Sandals", num_codigos: 4, cantidad: 800, venta: 22_400, costo: 14_000, margen: 0.375 },
                { descripcion: "Men-Slippers", num_codigos: 2, cantidad: 200, venta: 3_100, costo: 2_000, margen: 0.35 },
              ],
            }
          : NIVEL1;
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    render(<ProductosView selectedYear={2026} />);
    await screen.findAllByText("Women-Flip Flops");
    const bloque = document.querySelector("[data-dejo-de-venderse]")!;
    expect(bloque, "el bloque no se dibujó").toBeTruthy();
    expect(bloque.textContent).toContain("Dejó de venderse");
    expect(bloque.textContent).toContain("2 descripciones");
    // 22.400 + 3.100 — la plata que este período no entró por esos productos.
    expect(bloque.textContent).toContain("$25,500.00");
    // De MAYOR a menor: es el orden en el que se decide qué mirar primero.
    const filas = [...bloque.querySelectorAll("tbody tr")].map((tr) => tr.textContent ?? "");
    expect(filas[0]).toContain("Women-Sandals");
    expect(filas[1]).toContain("Men-Slippers");
  });

  it("⚠️ si no dejó de venderse nada, NO se dibuja nada", async () => {
    // Un cartel que dice «sin novedad» es ruido, y enseña a no leer los avisos.
    render(<ProductosView selectedYear={2026} />);
    await screen.findAllByText("Women-Flip Flops");
    expect(document.querySelector("[data-dejo-de-venderse]")).toBeNull();
  });
});
