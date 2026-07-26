// La fila transformada: qué muestra y cómo se cierra.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FilaDetalleTr, TOTAL_GRUPO_ID, type FilaDetalle } from "@/components/ventas/FilaDetalle";
import { buildSlotsMetrica, type CeldaBase } from "@/lib/ventas/celda";

afterEach(cleanup);

const celda: CeldaBase = {
  ventas: 112_631,
  ventasPrev: 83_068,
  utilidad: 28_358,
  utilidadPrev: 21_208,
};

function detalle(over: Partial<FilaDetalle> = {}): FilaDetalle {
  return {
    filaId: "fshoes",
    focoCelda: "d:fshoes:6",
    titulo: "Fashion Shoes",
    subtitulo: "JUL 26 vs 25",
    slots: buildSlotsMetrica(celda, "ventas"),
    alto: 48,
    ancho: 900,
    ...over,
  };
}

// FilaDetalleTr devuelve un <tr>: hay que montarlo dentro de una tabla real.
function renderFila(props: Parameters<typeof FilaDetalleTr>[0]) {
  return render(
    <table>
      <tbody>
        <FilaDetalleTr {...props} />
      </tbody>
    </table>,
  );
}

describe("contenido de la fila transformada", () => {
  it("nombre de la empresa y el período tocado, en su mismo lugar", () => {
    renderFila({ detalle: detalle(), colSpan: 10, onClose: () => {} });
    expect(screen.getByText("Fashion Shoes")).toBeTruthy();
    expect(screen.getByText("JUL 26 vs 25")).toBeTruthy();
  });

  it("los 3 datos con su etiqueta, su Δ y el valor del año", () => {
    renderFila({ detalle: detalle(), colSpan: 10, onClose: () => {} });
    for (const label of ["Ventas", "Utilidad", "Margen"]) {
      expect(screen.getByText(new RegExp(label))).toBeTruthy();
    }
    expect(screen.getByText(/\$112,631/)).toBeTruthy();
    expect(screen.getByText(/\$28,358/)).toBeTruthy();
    // Δ de ventas: +36%.
    expect(screen.getByText("▲ +36%")).toBeTruthy();
  });

  it("en desktop el monto del año previo va completo; en celular no aparece", () => {
    const { unmount } = renderFila({ detalle: detalle(), colSpan: 10, onClose: () => {} });
    expect(screen.getByText(/vs \$83,068/)).toBeTruthy();
    unmount();

    renderFila({
      detalle: detalle({ slots: buildSlotsMetrica(celda, "ventas", false) }),
      colSpan: 10,
      onClose: () => {},
      compacto: true,
    });
    expect(screen.queryByText(/vs \$83,068/)).toBeNull();
    // Pero el Δ y el valor siguen ahí: es el dato que importa.
    expect(screen.getByText("▲ +36%")).toBeTruthy();
    expect(screen.getByText(/\$112,631/)).toBeTruthy();
  });
});

describe("el alto no puede saltar", () => {
  it("la celda se fija al alto medido de la fila normal", () => {
    renderFila({ detalle: detalle({ alto: 57 }), colSpan: 10, onClose: () => {} });
    const td = screen.getByTestId("fila-detalle").querySelector("td")!;
    expect(td.style.height).toBe("57px");
    expect(td.colSpan).toBe(10);
  });

  it("sin medición (alto 0) no se fuerza ningún alto inventado", () => {
    renderFila({ detalle: detalle({ alto: 0 }), colSpan: 10, onClose: () => {} });
    const td = screen.getByTestId("fila-detalle").querySelector("td")!;
    expect(td.style.height).toBe("");
  });
});

describe("los 3 datos entran sin scroll horizontal", () => {
  it("el contenido se ancla al ancho visible medido, no al de la tabla", () => {
    renderFila({ detalle: detalle({ ancho: 354 }), colSpan: 10, onClose: () => {}, compacto: true });
    const strip = screen.getByTestId("fila-detalle").querySelector("td > div") as HTMLElement;
    expect(strip.style.width).toBe("354px");
    expect(strip.className).toContain("sticky");
    expect(strip.className).toContain("left-0");
  });
});

describe("cierre y foco", () => {
  it("la × cierra", () => {
    const onClose = vi.fn();
    renderFila({ detalle: detalle(), colSpan: 10, onClose });
    fireEvent.click(screen.getByLabelText("Cerrar detalle"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("el foco se muda a la × (la celda que lo tenía ya no existe)", () => {
    renderFila({ detalle: detalle(), colSpan: 10, onClose: () => {} });
    expect(document.activeElement).toBe(screen.getByLabelText("Cerrar detalle"));
  });
});

describe("fila oscura de totales", () => {
  it("usa el borde indigo claro para que se lea sobre el fondo negro", () => {
    renderFila({
      detalle: detalle({ filaId: TOTAL_GRUPO_ID, titulo: "Total Grupo" }),
      colSpan: 10,
      onClose: () => {},
      oscura: true,
    });
    const td = screen.getByTestId("fila-detalle").querySelector("td")!;
    expect(td.className).toContain("ring-indigo-300");
    expect(screen.getByText("Total Grupo")).toBeTruthy();
  });
});
