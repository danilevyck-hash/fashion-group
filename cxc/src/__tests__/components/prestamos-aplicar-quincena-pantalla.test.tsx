/**
 * El diálogo de «Aplicar quincena», PINTADO y TOCADO.
 *
 * 🩸 EL CASO REAL: el botón viejo aplicaba con la fecha de HOY y nadie lo usó
 * en 90 días — contabilidad registra 1–4 días después del pago (el 1-sep
 * registró la quincena del 30-ago) y seguía a mano: 6 pasos × 13 personas,
 * 15 minutos por quincena. Lo que se amarra acá es lo que tiene que VERSE:
 *
 *  1. Los atajos proponen el día de pago que acaba de pasar (el 1-sep, eso es
 *     «31 de agosto», no la fecha de hoy ni el 30 de septiembre).
 *  2. Quien ya tiene el descuento de la quincena elegida SE DICE en pantalla
 *     y el conteo del botón lo excluye («Aplicar a las N» sin duplicados).
 *  3. Cambiar la fecha recalcula el resumen.
 *  4. Aplicar manda la fecha ELEGIDA, no la de hoy.
 *
 * Fechas FIJAS: `hoy` es un prop inyectado, nunca `new Date()`.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import AplicarQuincenaModal from "@/app/prestamos/components/AplicarQuincenaModal";
import type { PersonaQuincena } from "@/lib/prestamos-quincena";

// En este arnés `localStorage` es un objeto pelado sin los métodos de Storage
// (el Modal lo lee vía useSidebarCollapsed): se le da una implementación real,
// igual que en cheque-form-foco.test.tsx.
function almacenFalso(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => void m.clear(),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", almacenFalso());
  vi.stubGlobal("sessionStorage", almacenFalso());
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** El escenario medido: 1-sep, registrando la quincena que se pagó el 31-ago. */
const HOY = "2026-09-01";

const PERSONAS: PersonaQuincena[] = [
  // Ya se le registró el descuento de la quincena 16–31 de agosto.
  { nombre: "MARIA BETHANCOURTH", deduccion: 25, saldo: 100, fechasPagos: ["2026-08-30"] },
  { nombre: "KEVIN LUBO", deduccion: 50, saldo: 300, fechasPagos: ["2026-08-15"] },
  { nombre: "LUZ BOSQUEZ", deduccion: 25, saldo: 20, fechasPagos: [] },
];

function pintar(onAplicar = vi.fn(), personas = PERSONAS) {
  render(
    <AplicarQuincenaModal
      open
      onClose={vi.fn()}
      onAplicar={onAplicar}
      aplicando={false}
      personas={personas}
      hoy={HOY}
    />,
  );
  return onAplicar;
}

describe("AplicarQuincenaModal", () => {
  it("propone el día de pago que acaba de pasar: el 1-sep, «31 de agosto» y «15 de agosto»", () => {
    pintar();
    expect(screen.getByRole("button", { name: "31 de agosto" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "15 de agosto" })).toBeTruthy();
    // El campo de fecha arranca en el atajo más reciente, no en hoy.
    const input = screen.getByLabelText("Otra fecha de pago") as HTMLInputElement;
    expect(input.value).toBe("2026-08-31");
  });

  it("dice quién ya tiene el descuento y el botón cuenta solo a los demás", () => {
    pintar();
    // MARIA ya tiene (30-ago ∈ quincena 16–31): se dice y no se le vuelve a aplicar.
    expect(screen.getByText(/1 persona ya tiene el descuento de esta quincena/)).toBeTruthy();
    // KEVIN (pagó el 15, quincena anterior) y LUZ entran: 2 personas.
    expect(screen.getByText(/2 personas/)).toBeTruthy();
    // Total = 50 (KEVIN) + 20 (LUZ, capeada al saldo) = 70.
    expect(screen.getByText(/\$70\.00/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aplicar a las 2" })).toBeTruthy();
  });

  it("cambiar la fecha recalcula: para la quincena de septiembre nadie tiene el descuento todavía", () => {
    pintar();
    fireEvent.change(screen.getByLabelText("Otra fecha de pago"), { target: { value: "2026-09-15" } });
    expect(screen.queryByText(/ya tiene el descuento/)).toBeNull();
    expect(screen.getByRole("button", { name: "Aplicar a las 3" })).toBeTruthy();
  });

  it("aplicar manda la fecha ELEGIDA, no la de hoy", () => {
    const onAplicar = pintar();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar a las 2" }));
    expect(onAplicar).toHaveBeenCalledTimes(1);
    expect(onAplicar).toHaveBeenCalledWith("2026-08-31");
    expect(onAplicar).not.toHaveBeenCalledWith(HOY);
  });

  it("tocar un atajo cambia la fecha y lo que se manda", () => {
    const onAplicar = pintar();
    fireEvent.click(screen.getByRole("button", { name: "15 de agosto" }));
    // Para la quincena 1–15 de ago, KEVIN (pagó el 15) ya tiene → entran 2.
    fireEvent.click(screen.getByRole("button", { name: "Aplicar a las 2" }));
    expect(onAplicar).toHaveBeenCalledWith("2026-08-15");
  });

  it("si con la fecha elegida no hay a quién aplicar, lo dice y el botón queda apagado", () => {
    pintar(vi.fn(), [
      { nombre: "MARIA", deduccion: 25, saldo: 100, fechasPagos: ["2026-08-30"] },
      { nombre: "RAMON", deduccion: 30, saldo: 0, fechasPagos: [] },
    ]);
    expect(screen.getByText(/No hay a quién aplicar con esta fecha/)).toBeTruthy();
    const btn = screen.getByRole("button", { name: "Aplicar" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
