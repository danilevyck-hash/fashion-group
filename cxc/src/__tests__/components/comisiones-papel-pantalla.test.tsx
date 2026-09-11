// ─────────────────────────────────────────────────────────────────────────────
// EL PAPEL DEL MES Y EL DEL AÑO, MONTADO (9-sep-2026). Lo que solo se ve
// pintando la pantalla: que los DOS botones de arriba están también con «Todo el
// año», y que lo que se le entrega al generador del PDF son las MISMAS filas que
// están en la tabla —incluidos los que NO se pagan, que en pantalla viven
// escondidos detrás de «Ver los que no se pagan» y en el archivo tienen que
// salir igual, con su marca—.
//
// Daniel: *«Los paso a PDF también, para que todo el módulo se comporte igual»*.
//
// Ningún número se mueve: la prueba contra producción está en
// `scripts/_medir-comisiones-papel-mes-anio.mjs`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, act, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/comisiones",
}));

// El generador del PDF se espía: se afirma QUÉ se le entrega, sin escribir un
// archivo en el disco.
const papelBajado = vi.fn();
vi.mock("@/lib/comisiones/pdf-tabla-comisiones", () => ({
  descargarPdfTablaComisiones: (...a: unknown[]) => papelBajado(...a),
  construirPdfTablaComisiones: vi.fn(),
}));
vi.mock("@/lib/ventas/comisionExcel", async (original) => {
  const real = await original<typeof import("@/lib/ventas/comisionExcel")>();
  return {
    ...real,
    exportComisionesConsolidado: vi.fn(() => Promise.resolve()),
    exportComisionesResumen: vi.fn(() => Promise.resolve()),
  };
});

import { ComisionesConsolidadoView } from "@/components/comisiones/ComisionesConsolidadoView";
import { ComisionesPorEmpresaView } from "@/components/comisiones/ComisionesPorEmpresaView";
import { ComisionesView } from "@/components/comisiones/ComisionesView";
import { ROTULO_NO_SE_PAGA } from "@/lib/comisiones/sin-pago";
import { ROTULO_TODO_EL_ANIO } from "@/lib/comisiones/periodo";

const REYNALDO = "REYNALDO ESPINOSA";

/** Con la OFICINA adentro: la fila que en pantalla se esconde y en el papel va. */
const CONSOLIDADO = {
  empresas: [
    {
      empresa_key: "vistana",
      vendedores: [
        { vendedor: REYNALDO, base: 8000, base_cobro: 0, comision_total: 41.77, descuento: 0, se_paga: true },
        { vendedor: "DEFAULT", base: 2000, base_cobro: 0, comision_total: 12.0, descuento: 0, se_paga: false },
        { vendedor: "DANIEL LEVY", base: 1000, base_cobro: 0, comision_total: 5.0, descuento: 0, se_paga: false },
      ],
    },
  ],
};

const POR_EMPRESA = {
  empresa_key: "vistana",
  year: 2026,
  mes: 9,
  vendedores: [
    { vendedor: REYNALDO, base: 8000, tasa: 0.005, comision: 40, base_cobro: 354, tasa_cobro: 0.005, comision_cobro: 1.77, comision_total: 41.77, se_paga: true },
    { vendedor: "DANIEL LEVY", base: 1000, tasa: 0.005, comision: 5, base_cobro: 0, tasa_cobro: 0.005, comision_cobro: 0, comision_total: 5, se_paga: false },
  ],
};

const almacen = () => {
  const datos = new Map<string, string>();
  return {
    getItem: (k: string) => (datos.has(k) ? datos.get(k)! : null),
    setItem: (k: string, v: string) => void datos.set(k, String(v)),
    removeItem: (k: string) => void datos.delete(k),
    clear: () => datos.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
};

beforeEach(() => {
  papelBajado.mockClear();
  vi.stubGlobal("localStorage", almacen());
  vi.stubGlobal("sessionStorage", almacen());
  vi.stubGlobal("print", vi.fn());
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    const cuerpo = url.includes("/consolidado")
      ? CONSOLIDADO
      : url.includes("/api/ventas/comisiones?")
        ? POR_EMPRESA
        : {};
    return Promise.resolve({ ok: true, json: () => Promise.resolve(cuerpo) } as Response);
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ═══ 1 · Los DOS botones están, también con «Todo el año» ══════════════════

describe("🔴 los dos botones de arriba están con el mes Y con el año", () => {
  const abrirShell = async () => {
    render(<ComisionesView availableYears={[2026, 2025]} />);
    // Las vistas cargan con `next/dynamic`: se espera a que la barra exista.
    await screen.findByRole("button", { name: /Descargar el mes en PDF/ });
  };

  it("con un mes: «Descargar el mes en PDF» y «…en Excel»", async () => {
    await abrirShell();
    expect(screen.getByRole("button", { name: /Descargar el mes en PDF/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Descargar el mes en Excel/ })).toBeTruthy();
  });

  it("🔴 y con «Todo el año» los DOS siguen ahí, diciendo «el año»", async () => {
    // 🩸 Acá vivía la regla vieja: con el año elegido el botón de PDF NO se
    // dibujaba, y «Descargar el año» era Excel y nada más.
    await abrirShell();
    // Se abre el selector de período y se elige el año entero.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Período:/ }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: ROTULO_TODO_EL_ANIO }));
    });
    expect(await screen.findByRole("button", { name: /Descargar el año en PDF/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Descargar el año en Excel/ })).toBeTruthy();
    // Y ya no queda ningún botón hablando del mes.
    expect(screen.queryByRole("button", { name: /Descargar el mes/ })).toBeNull();
  });
});

// ═══ 2 · Los que no se pagan SALEN en el papel ═════════════════════════════

describe("🔴 Oficina y Daniel Levy: escondidos en la tabla, presentes en el papel", () => {
  it("la matriz del grupo los lleva, con su marca «no se paga»", async () => {
    let correr: (() => void) | null = null;
    render(
      <ComisionesConsolidadoView
        year={2026}
        mes={9}
        onPdf={(api) => { correr = api ? api.run : null; }}
      />,
    );
    const tabla = await screen.findByRole("table");
    // En PANTALLA están escondidos: la tabla solo dibuja a Reynaldo.
    const visibles = [...tabla.querySelectorAll("tbody tr[data-se-paga]")];
    expect(visibles.length).toBe(1);
    expect(visibles[0].getAttribute("data-se-paga")).toBe("si");

    await waitFor(() => expect(correr).not.toBeNull());
    await act(async () => { correr!(); });

    const [papel] = papelBajado.mock.calls[0] as [
      { filas: { celdas: string[]; apagada?: boolean }[] },
    ];
    // En el PAPEL están los tres.
    expect(papel.filas.length).toBe(3);
    const apagadas = papel.filas.filter((f) => f.apagada);
    expect(apagadas.length).toBe(2);
    for (const f of apagadas) expect(f.celdas[0]).toContain(ROTULO_NO_SE_PAGA);
    expect(apagadas.map((f) => f.celdas[0]).join(" ")).toContain("Oficina (DEFAULT)");
    expect(apagadas.map((f) => f.celdas[0]).join(" ")).toContain("Daniel Levy");
    // Y el pie sigue sumando SOLO lo pagable: $41.77, no $58.77.
    expect(papel.totales.at(-1)).toBe("$41.77");
  });

  it("y la vista de UNA empresa hace lo mismo", async () => {
    let correr: (() => void) | null = null;
    render(
      <ComisionesPorEmpresaView
        empresa="vistana"
        empresaNombre="Vistana"
        year={2026}
        mes={9}
        onPdf={(api) => { correr = api ? api.run : null; }}
      />,
    );
    const tabla = await screen.findByRole("table");
    expect([...tabla.querySelectorAll('tbody tr[data-se-paga="no"]')].length).toBe(0);

    await waitFor(() => expect(correr).not.toBeNull());
    await act(async () => { correr!(); });

    const [papel] = papelBajado.mock.calls[0] as [
      { filas: { celdas: string[]; apagada?: boolean }[]; totales: string[]; titulo: string },
    ];
    expect(papel.titulo).toBe("Comisiones — Vistana");
    expect(papel.filas.length).toBe(2);
    const apagada = papel.filas.find((f) => f.apagada)!;
    expect(apagada.celdas[0]).toContain(ROTULO_NO_SE_PAGA);
    expect(apagada.celdas[0]).toContain("Daniel Levy");
    // El pie: solo lo pagable.
    expect(papel.totales.at(-1)).toBe("$41.77");
  });
});
