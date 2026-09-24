/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — LA VENTANA DE COBRO ABRE CON EL MONTO PUESTO Y SIN EL N° DE NOTA
 * DE CRÉDITO A LA VISTA (20-sep-2026, aprobado por Daniel).
 *
 * Medido contra producción sobre los 14 reclamos cobrados:
 *
 *   · 14 de 14 cobros fueron **el total exacto del reclamo, al centavo**.
 *   ·  0 de 14 tienen escrito el **N° de nota de crédito**.
 *
 * O sea: se tecleaba 14 de 14 veces un número que el sistema ya sabía, y se
 * miraba 14 de 14 veces un campo que nadie llenó nunca.
 *
 * 🔴 LO QUE NO CAMBIA, Y POR ESO ESTE CANDADO LO REPITE:
 *   · el monto viene puesto pero es EDITABLE, y la línea «Reclamado: $X · puede
 *     ser parcial» sigue arriba — el cobro parcial sigue siendo posible, solo
 *     deja de ser el caso por el que se diseña;
 *   · el campo del N° de nota de crédito **no se borró**: se abre de un toque y
 *     se guarda exactamente igual que antes;
 *   · el comprobante obligatorio, la fecha y el botón no se tocaron.
 * ────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import SettlementModal from "@/app/reclamos/components/SettlementModal";
import { MARCAR_COBRADO } from "@/lib/reclamos/rotulos";

const almacen = () => {
  const datos = new Map<string, string>();
  return { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => { datos.set(k, String(v)); }, removeItem: (k: string) => { datos.delete(k); }, clear: () => datos.clear(), key: (i: number) => [...datos.keys()][i] ?? null, get length() { return datos.size; } } as unknown as Storage;
};
beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: almacen(), configurable: true, writable: true });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** REC-2026-0026, el reclamo de los mockups: $443,32. */
const RECLAMADO = 443.32;

function pintar(over: Partial<React.ComponentProps<typeof SettlementModal>> = {}) {
  const onSubmit = vi.fn();
  render(
    <SettlementModal
      open reclamado={RECLAMADO} submitting={false} onClose={() => {}} onSubmit={onSubmit} {...over} />,
  );
  return { onSubmit };
}

const campoMonto = () => screen.getByLabelText(/Monto recuperado/) as HTMLInputElement;

describe("🔴 el monto del cobro viene puesto", () => {
  it("abre con el total exacto del reclamo escrito", () => {
    pintar();
    expect(campoMonto().value).toBe("443.32");
  });

  it("y el total recuperado ya cuadra al abrir, sin tocar nada", () => {
    pintar();
    expect(document.body.textContent).toContain("$443.32");
  });

  it("🔴 es EDITABLE: un cobro parcial se escribe encima y es lo que se guarda", () => {
    const { onSubmit } = pintar();
    fireEvent.change(campoMonto(), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: new RegExp(MARCAR_COBRADO, "i") }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0][0].monto).toBe(200);
  });

  it("⚠️ la línea «puede ser parcial» se queda: el parcial sigue existiendo", () => {
    pintar();
    expect(document.body.textContent).toContain("puede ser parcial");
    expect(document.body.textContent).toContain("Reclamado: $443.32");
  });

  it("sin monto reclamado NO se inventa un cero: el campo va vacío", () => {
    pintar({ reclamado: undefined });
    expect(campoMonto().value).toBe("");
  });

  it("la SEGUNDA nota de crédito nace vacía (es el resto, no otro total)", () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: /Agregar otra nota de crédito/ }));
    const montos = screen.getAllByLabelText(/Monto recuperado/) as HTMLInputElement[];
    expect(montos.map((m) => m.value)).toEqual(["443.32", ""]);
  });
});

describe("🔴 el N° de nota de crédito se pliega, pero no se fue", () => {
  it("al abrir NO se ve el campo, se ve el enlace", () => {
    pintar();
    expect(screen.queryByLabelText(/N° nota de crédito/)).toBeNull();
    expect(screen.getByRole("button", { name: "Agregar el N° de nota de crédito" })).toBeTruthy();
  });

  it("un toque lo abre, y lo que se escribe se guarda igual que antes", () => {
    const { onSubmit } = pintar();
    fireEvent.click(screen.getByRole("button", { name: "Agregar el N° de nota de crédito" }));
    fireEvent.change(screen.getByLabelText(/N° nota de crédito/), { target: { value: "4020000422" } });
    fireEvent.click(screen.getByRole("button", { name: new RegExp(MARCAR_COBRADO, "i") }));
    expect(onSubmit.mock.calls[0][0][0].nota_credito).toBe("4020000422");
  });

  it("sin abrirlo, el cobro se guarda con el número vacío (no se rompe nada)", () => {
    const { onSubmit } = pintar();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(MARCAR_COBRADO, "i") }));
    expect(onSubmit.mock.calls[0][0][0]).toEqual({ monto: RECLAMADO, nota_credito: "", fecha: expect.any(String) });
  });
});

describe("⚠️ CONTROL: lo demás de la ventana no se tocó", () => {
  it("la fecha sigue viniendo con el hoy de Panamá", () => {
    pintar();
    const fecha = screen.getByLabelText(/Fecha/) as HTMLInputElement;
    expect(fecha.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("el comprobante sigue siendo obligatorio cuando el reclamo no lo tiene", () => {
    const { onSubmit } = pintar({ requireComprobante: true });
    fireEvent.click(screen.getByRole("button", { name: new RegExp(MARCAR_COBRADO, "i") }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("obligatorio para marcar cobrado");
  });

  it("un monto borrado a mano se sigue rechazando", () => {
    const { onSubmit } = pintar();
    fireEvent.change(campoMonto(), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: new RegExp(MARCAR_COBRADO, "i") }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("monto recuperado mayor a 0");
  });
});
