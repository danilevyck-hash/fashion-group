// ─────────────────────────────────────────────────────────────────────────────
// LA CELDA QUE DANIEL MIRA, PINTADA — y el Excel que baja de esa misma vista.
//
// 🩸 POR QUÉ ESTE TEST EXISTE (24-ago-2026). Que el endpoint devuelva el neto no
// prueba que la pantalla lo dibuje, y que la pantalla lo dibuje no prueba que el
// Excel baje lo mismo: el Excel de "Por empresa" arma su propia hoja con el
// arreglo de vendedores, así que puede bajar un número que nadie vio. Acá se
// monta la vista REAL, se leen las celdas y se dispara el Excel REAL.
//
// El caso: REINALDO ESPINOSA en Fashion Shoes, julio-2026.
//     subtotal   $2.859,65
//     descuentos −$1.573,08   (1.400,00 + 173,08)
//     a pagar     $1.286,57   ← esto es lo que tiene que salir en los dos lados
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";

const excelRecibido: { vendedores?: { vendedor: string; comision_total: number }[] } = {};

vi.mock("@/lib/ventas/comisionExcel", () => ({
  exportComisionesResumen: async (r: { vendedores: { vendedor: string; comision_total: number }[] }) => {
    excelRecibido.vendedores = r.vendedores;
  },
}));

import { ComisionesPorEmpresaView } from "@/components/ventas/ComisionesPorEmpresaView";
import { ComisionesConsolidadoView } from "@/components/ventas/ComisionesConsolidadoView";
import type { ExcelApi } from "@/components/ventas/ComisionesView";

const REINALDO = "REINALDO ESPINOSA";

/** Lo que la ruta REAL devuelve hoy: `comision_total` YA NETO + `descuento`. */
const RESPUESTA = {
  empresa_key: "fashion_shoes",
  year: 2026,
  mes: 7,
  vendedores: [
    {
      vendedor: REINALDO,
      base: 90276, tasa: 0.01, comision: 902.76,
      base_cobro: 195688.53, tasa_cobro: 0.01, comision_cobro: 1956.89,
      comision_total: 1286.57,
      descuento: 1573.08,
    },
    {
      vendedor: "EDWIN",
      base: 1000, tasa: 0.005, comision: 5,
      base_cobro: 200, tasa_cobro: 0.005, comision_cobro: 1,
      comision_total: 6,
      descuento: 0,
    },
  ],
};

beforeEach(() => {
  delete excelRecibido.vendedores;
  try { localStorage.setItem("fg_last_comision_empresa", "fashion_shoes"); } catch {}
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify(RESPUESTA), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** La fila de la tabla de escritorio (en jsdom se montan los dos layouts). */
async function filaDe(vendedor: string) {
  const tabla = await screen.findByRole("table");
  const fila = within(tabla)
    .getAllByRole("row")
    .find((r) => within(r).queryByText(vendedor));
  expect(fila, `no encontré la fila de ${vendedor}`).toBeTruthy();
  return within(fila!);
}

describe("🔴 la pantalla muestra el NETO, no el subtotal", () => {
  it("Com. total de Reinaldo dice $1,286.57", async () => {
    render(<ComisionesPorEmpresaView year={2026} mes={7} />);
    const fila = await filaDe(REINALDO);
    expect(fila.getByText("$1,286.57")).toBeTruthy();
    expect(fila.queryByText("$2,859.65")).toBeNull(); // el inflado NO se dibuja
  });

  it("dice por qué el total no es la suma de las dos comisiones", async () => {
    render(<ComisionesPorEmpresaView year={2026} mes={7} />);
    const fila = await filaDe(REINALDO);
    expect(fila.getByText(/en descuentos/)).toBeTruthy();
    expect(fila.getByText(/1,573\.08/)).toBeTruthy();
  });

  it("a quien no tiene descuento no se le dibuja la línea", async () => {
    render(<ComisionesPorEmpresaView year={2026} mes={7} />);
    const fila = await filaDe("EDWIN");
    expect(fila.queryByText(/en descuentos/)).toBeNull();
  });

  it("el total del pie ya viene neteado (suma de lo que se ve)", async () => {
    render(<ComisionesPorEmpresaView year={2026} mes={7} />);
    const tabla = await screen.findByRole("table");
    // 1286.57 + 6 = 1292.57
    expect(within(tabla).getByText("$1,292.57")).toBeTruthy();
  });

  it("dice que los descuentos ya están restados, igual que la otra pestaña", async () => {
    render(<ComisionesPorEmpresaView year={2026} mes={7} />);
    await screen.findByRole("table");
    expect(screen.getByText(/Toca para ver el detalle/)).toBeTruthy();
  });
});

describe("🔴 la tarjeta del celular dice lo mismo que la fila", () => {
  // En jsdom se montan los DOS layouts (no hay Tailwind que esconda uno), así
  // que la tarjeta se puede leer acá. Es la vista REAL del iPhone y del iPad
  // vertical: si solo se arreglara la tabla, el celular seguiría mintiendo.
  it("muestra el NETO arriba y la línea de descuentos adentro", async () => {
    render(<ComisionesPorEmpresaView year={2026} mes={7} />);
    await screen.findByRole("table");
    const tarjeta = document.querySelector("[data-comision-card]");
    expect(tarjeta, "no se montó ninguna tarjeta").toBeTruthy();
    const t = tarjeta!.textContent ?? "";
    expect(t).toContain("$1,286.57");
    expect(t).not.toContain("$2,859.65");
    expect(t).toContain("Descuentos");
    expect(t).toContain("1,573.08");
  });
});

describe('🔴 "Todas las empresas" NO vuelve a restar lo ya restado', () => {
  // 🩸 El servidor manda el neto. Si la vista consolidada volviera a restar
  // —que es donde vivía la resta hasta el 24-ago-2026— el descuento se cobraría
  // DOS veces y la celda diría $-286,51 en vez de $1.286,57.
  it("pinta la celda tal como llegó del servidor", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(
        JSON.stringify({
          empresas: [
            {
              empresa_key: "fashion_shoes",
              vendedores: [
                {
                  vendedor: REINALDO,
                  base: 90276, base_cobro: 195688.53,
                  comision_total: 1286.57, descuento: 1573.08,
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    render(<ComisionesConsolidadoView year={2026} mes={7} />);
    const tabla = await screen.findByRole("table");
    const texto = tabla.textContent ?? "";
    expect(texto).toContain("$1,286.57");
    expect(texto).not.toContain("-286.51"); // la doble resta
    expect(texto).not.toContain("$2,859.65"); // el subtotal
  });
});

describe("🔴 el Excel de ESTA vista baja el mismo número que la pantalla", () => {
  it("exporta $1.286,57, no el subtotal", async () => {
    let api: ExcelApi | null = null;
    render(
      <ComisionesPorEmpresaView
        year={2026}
        mes={7}
        onExcel={(a) => { if (a) api = a; }}
      />,
    );
    await screen.findByRole("table");
    await waitFor(() => expect(api).not.toBeNull());
    api!.run();
    await waitFor(() => expect(excelRecibido.vendedores).toBeTruthy());

    const fila = excelRecibido.vendedores!.find((v) => v.vendedor === REINALDO);
    expect(fila?.comision_total).toBe(1286.57);
  });
});
