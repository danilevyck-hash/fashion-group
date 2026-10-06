// 🔴 CALENDARIO_SIMPLE_2026_10 PRENDIDO en RangoFechas: la guía de arriba, los
// dos toques que aplican y cierran, y los atajos de un toque.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/ui/calendario-simple", async (orig) => ({
  ...(await orig<typeof import("@/lib/ui/calendario-simple")>()),
  CALENDARIO_SIMPLE_2026_10: true,
}));
vi.mock("@/lib/fecha-panama", () => ({ hoyPanama: () => "2026-10-05" }));

import RangoFechas from "@/components/ui/RangoFechas";

const abrir = (onChange: (d: string, h: string) => void) => {
  render(<RangoFechas desde="2026-10-01" hasta="2026-10-05" label={null} onChange={onChange} />);
  fireEvent.click(screen.getAllByRole("button", { name: /oct/ })[0]);
};
const dia = async (n: number) =>
  (await screen.findAllByRole("button", { name: new RegExp(`^${n} de octubre de 2026`) }))[0];

describe("rango en dos toques", () => {
  it("guía, ordena solo, aplica y cierra", async () => {
    const onChange = vi.fn();
    abrir(onChange);
    expect(screen.getByText("Toca el primer día")).toBeTruthy();
    fireEvent.click(await dia(20));
    expect(screen.getByText("Ahora el último día")).toBeTruthy();
    fireEvent.click(await dia(8));
    expect(onChange).toHaveBeenCalledWith("2026-10-08", "2026-10-20");
    await waitFor(() => expect(screen.queryByText("Ahora el último día")).toBeNull());
    expect(screen.queryByText("Toca el primer día")).toBeNull();
  });

  it("el mismo día dos veces es ese día solo", async () => {
    const onChange = vi.fn();
    abrir(onChange);
    fireEvent.click(await dia(14));
    fireEvent.click(await dia(14));
    expect(onChange).toHaveBeenCalledWith("2026-10-14", "2026-10-14");
  });

  it("un atajo aplica y cierra al instante", async () => {
    const onChange = vi.fn();
    abrir(onChange);
    // 🔄 6-oct-2026: «Mes pasado» se fue (lo hacen las ‹ ›); «Ayer» queda.
    expect(screen.queryByRole("button", { name: "Mes pasado" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ayer" }));
    expect(onChange).toHaveBeenCalledWith("2026-10-04", "2026-10-04");
    await waitFor(() => expect(screen.queryByText("Toca el primer día")).toBeNull());
  });
});

describe("el botón de la barra", () => {
  it("vacío dice «Rango de fechas»; con rango, «15–30 sep» y el ✕ vuelve al mes", () => {
    const onQuitar = vi.fn();
    const { rerender } = render(<RangoFechas enBarra vacio desde="" hasta="" label={null} onChange={() => {}} onQuitar={onQuitar} />);
    expect(screen.getAllByRole("button", { name: /Rango de fechas/ }).length).toBeGreaterThan(0);
    rerender(<RangoFechas enBarra desde="2026-09-15" hasta="2026-09-30" label={null} onChange={() => {}} onQuitar={onQuitar} />);
    expect(screen.getAllByText("15–30 sep").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Quitar el rango y volver al mes" })[0]);
    expect(onQuitar).toHaveBeenCalled();
  });
});

describe("sin futuro (ventas)", () => {
  it("los días después de hoy se ven apagados y tocarlos no hace nada", async () => {
    const onChange = vi.fn();
    render(<RangoFechas sinFuturo desde="2026-10-01" hasta="2026-10-05" label={null} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole("button", { name: /oct/ })[0]);
    const seis = await dia(6);
    expect(seis.hasAttribute("disabled")).toBe(true);
    fireEvent.click(await dia(3));
    fireEvent.click(seis);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Ahora el último día")).toBeTruthy();
  });
});

describe("el rango compara contra el mismo período del año pasado", () => {
  it("15–30 sep 2026 → 15–30 sep 2025; el 29-feb cae al 28-feb", async () => {
    const { periodoAnterior } = await import("@/lib/comisiones/vendedores-rango");
    expect(periodoAnterior({ desde: "2026-09-15", hasta: "2026-09-30", atajo: null })).toEqual({ desde: "2025-09-15", hasta: "2025-09-30" });
    expect(periodoAnterior({ desde: "2028-02-01", hasta: "2028-02-29", atajo: null })).toEqual({ desde: "2027-02-01", hasta: "2027-02-28" });
  });
});
