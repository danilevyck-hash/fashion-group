/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA — EL PAPEL QUE SE FIRMA PASA DE OCHO COLUMNAS A CINCO (20-sep-2026).
 *
 * 🩸 Medido contra producción (77 recibos vivos, 3 períodos):
 *   · la NOTA (antes «Descripción») es opcional desde hoy y no imprimiría ni
 *     una — decía «Comida» en 38 de 77, con la categoría al lado diciendo
 *     «Alimentación»;
 *   · el ITBMS lo tienen 9 de 77, y en el período Nº3 las 26 filas van en
 *     $0.00 con el Sub-total idéntico al Total;
 *   · el encabezado decía «Apertura: 2 sept 2026» y la primera fila de ese
 *     mismo papel es del 23 de junio: 36 de 77 recibos caen fuera de la
 *     ventana de su período.
 *
 * 🔴 Una columna vacía no se dibuja, y si mañana vuelve a haber notas o ITBMS,
 * las columnas vuelven solas: la regla mira los DATOS.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import PrintView from "@/app/caja/components/PrintView";
import type { CajaGasto, CajaPeriodo } from "@/app/caja/components/types";
import { columnasDelPapel, encabezadoDelPapel } from "@/lib/caja/papel-caja";

afterEach(() => cleanup());

/** El período Nº3 tal como está: sin notas, sin ITBMS, con recibos de antes. */
const GASTOS_P3: CajaGasto[] = [
  { id: "g1", periodo_id: "p-3", fecha: "2026-06-23", descripcion: "", proveedor: "Super 99",
    nro_factura: "196854200", categoria: "Alimentación", subtotal: 10.59, itbms: 0, total: 10.59 },
  { id: "g2", periodo_id: "p-3", fecha: "2026-09-02", descripcion: "", proveedor: "La Parrillada",
    nro_factura: "", categoria: "Alimentación", subtotal: 5, itbms: 0, total: 5 },
];
const P3: CajaPeriodo = {
  id: "p-3", numero: 3, fecha_apertura: "2026-09-02", fecha_cierre: null,
  fondo_inicial: 200, estado: "abierto", total_gastado: 15.59,
  responsable_empleado_codigo: "7", responsable_nombre: "Angela Garcia",
  caja_gastos: GASTOS_P3,
};

function montar(periodo: CajaPeriodo) {
  render(<PrintView current={periodo} onBack={vi.fn()} />);
  return document.getElementById("print-document")!;
}
const encabezados = (doc: HTMLElement) =>
  Array.from(doc.querySelectorAll("th")).map((th) => th.textContent?.trim());

describe("🔴 CINCO COLUMNAS CUANDO NO HAY NOTAS NI ITBMS", () => {
  it("el papel del período Nº3 sale con Fecha · Proveedor · Categoría · N° Factura · Total", () => {
    const doc = montar(P3);
    expect(encabezados(doc)).toEqual(["Fecha", "Proveedor", "Categoría", "N° Factura", "Total"]);
  });

  it("🩸 no se dibuja la columna de la NOTA…", () => {
    const doc = montar(P3);
    expect(within(doc).queryByText("Nota")).toBeNull();
  });

  it("🩸 …ni Sub-total ni ITBMS, que repetían el Total en las 26 filas", () => {
    const doc = montar(P3);
    expect(within(doc).queryByText("Sub-total")).toBeNull();
    expect(within(doc).queryByText("ITBMS")).toBeNull();
    // El total sigue estando, una sola vez y con el número de siempre.
    expect(doc.textContent).toContain("$15.59");
  });
});

describe("🔴 CONTROL: la columna vuelve sola cuando hay dato", () => {
  it("con una sola nota, la columna Nota aparece", () => {
    const conNota = {
      ...P3,
      caja_gastos: [{ ...GASTOS_P3[0], descripcion: "Era para la visita" }, GASTOS_P3[1]],
    };
    const doc = montar(conNota);
    expect(encabezados(doc)).toContain("Nota");
    expect(doc.textContent).toContain("Era para la visita");
  });

  it("con un solo recibo con ITBMS, vuelven Sub-total e ITBMS", () => {
    const conItbms = {
      ...P3,
      caja_gastos: [{ ...GASTOS_P3[0], itbms: 0.74, total: 11.33 }, GASTOS_P3[1]],
    };
    const doc = montar(conItbms);
    expect(encabezados(doc)).toEqual(["Fecha", "Proveedor", "Categoría", "N° Factura", "Sub-total", "ITBMS", "Total"]);
  });

  it("la regla, en el módulo puro", () => {
    expect(columnasDelPapel(GASTOS_P3)).toEqual(["fecha", "proveedor", "categoria", "factura", "total"]);
    expect(columnasDelPapel([{ descripcion: "algo", itbms: 0 }])).toContain("nota");
    expect(columnasDelPapel([{ descripcion: "", itbms: 0.74 }])).toContain("itbms");
    // Un ITBMS de cero no es un ITBMS.
    expect(columnasDelPapel([{ descripcion: "", itbms: 0 }])).not.toContain("itbms");
  });
});

describe("🔴 EL ENCABEZADO DICE EL RANGO REAL DE LOS RECIBOS", () => {
  it("«Recibos del 23 jun al 2 sept 2026 · Período Nº 3, abierto»", () => {
    const doc = montar(P3);
    expect(doc.textContent).toContain("Recibos del 23 jun al 2 sept 2026 · Período Nº 3, abierto");
    // 🩸 Ya no dice la apertura, que mentía por 71 días.
    expect(doc.textContent).not.toContain("Apertura:");
  });

  it("un período cerrado lo dice con su fecha de cierre", () => {
    const texto = encabezadoDelPapel(
      { numero: 2, estado: "cerrado", fecha_cierre: "2026-09-02" },
      [{ fecha: "2026-07-08" }, { fecha: "2026-08-30" }],
    );
    expect(texto).toBe("Recibos del 8 jul al 30 ago 2026 · Período Nº 2, cerrado el 2 sept 2026");
  });

  it("un solo recibo no dice «del X al X», y sin recibos no inventa un rango", () => {
    expect(encabezadoDelPapel({ numero: 3, estado: "abierto" }, [{ fecha: "2026-09-02" }]))
      .toBe("Recibos del 2 sept 2026 · Período Nº 3, abierto");
    expect(encabezadoDelPapel({ numero: 4, estado: "abierto" }, []))
      .toBe("Sin recibos · Período Nº 4, abierto");
  });

  it("un rango que cruza el año lleva los DOS años", () => {
    expect(encabezadoDelPapel({ numero: 5, estado: "abierto" }, [{ fecha: "2025-12-28" }, { fecha: "2026-01-05" }]))
      .toBe("Recibos del 28 dic 2025 al 5 ene 2026 · Período Nº 5, abierto");
  });
});

describe("CONTROL: lo que el papel NO perdió", () => {
  it("sigue el saldo, «A reponer», la responsable y las firmas", () => {
    const doc = montar(P3);
    expect(doc.textContent).toContain("Saldo Final");
    expect(doc.textContent).toContain("$184.41");
    expect(doc.textContent).toContain("A reponer");
    expect(doc.textContent).toContain("Responsable del período: Angela Garcia");
    expect(doc.textContent).toContain("Fondo Inicial");
    expect(doc.textContent).toContain("Preparado por");
    expect(doc.textContent).toContain("Aprobado por");
  });

  it("🩸 la plata negativa se escribe «−$1.50», no «$-1.50»", () => {
    // El papel era la última pantalla de Caja que no pasaba por
    // `montoEnPantalla`. El número no cambia; la forma de escribirlo, sí.
    const pasado = {
      ...P3,
      caja_gastos: [{ ...GASTOS_P3[0], subtotal: 201.5, total: 201.5 }],
    };
    const doc = montar(pasado);
    expect(doc.textContent).toContain("\u2212$1.50");
    expect(doc.textContent).not.toContain("$-1.50");
  });

  it("el recibo sin factura sigue sin inventar un número", () => {
    const doc = montar(P3);
    expect(within(doc).getByText("196854200")).toBeTruthy();
    expect(doc.textContent).toContain("—");
  });
});
