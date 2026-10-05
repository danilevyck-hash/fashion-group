// 🔴 CANDADO de CALENDARIO_SIMPLE_2026_10 (Daniel, 5-oct-2026: «no sé cómo
// usarlo»). Apagado = el `<input type="date">` de siempre. Prendido: un mes,
// un toque elige el día (o dos el rango), aplica y cierra.

import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CampoFecha from "@/components/ui/CampoFecha";
import {
  CALENDARIO_SIMPLE_2026_10, rangoDeAtajoFecha, ordenarRango, ATAJOS_FECHA,
} from "@/lib/ui/calendario-simple";

describe("el interruptor", () => {
  it("nace apagado hasta el «sí» de Daniel", () => {
    expect(CALENDARIO_SIMPLE_2026_10).toBe(false);
  });
});

describe("los atajos", () => {
  it("son los cinco aprobados, en orden", () => {
    expect(ATAJOS_FECHA.map((a) => a.rotulo)).toEqual(["Hoy", "Ayer", "7 días", "Este mes", "Mes pasado"]);
  });
  it("cuentan desde hoy", () => {
    const hoy = "2026-10-05";
    expect(rangoDeAtajoFecha("hoy", hoy)).toEqual({ desde: hoy, hasta: hoy });
    expect(rangoDeAtajoFecha("ayer", hoy)).toEqual({ desde: "2026-10-04", hasta: "2026-10-04" });
    expect(rangoDeAtajoFecha("7d", hoy)).toEqual({ desde: "2026-09-29", hasta: hoy });
    expect(rangoDeAtajoFecha("mes", hoy)).toEqual({ desde: "2026-10-01", hasta: hoy });
    expect(rangoDeAtajoFecha("mes_pasado", hoy)).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
  });
  it("cruzan el año sin romperse", () => {
    expect(rangoDeAtajoFecha("ayer", "2027-01-01")).toEqual({ desde: "2026-12-31", hasta: "2026-12-31" });
    expect(rangoDeAtajoFecha("mes_pasado", "2027-01-15")).toEqual({ desde: "2026-12-01", hasta: "2026-12-31" });
    expect(rangoDeAtajoFecha("mes_pasado", "2028-03-10")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
  });
});

describe("dos toques", () => {
  it("al revés se ordenan solos; el mismo día dos veces es ese día", () => {
    expect(ordenarRango("2026-10-28", "2026-10-10")).toEqual(["2026-10-10", "2026-10-28"]);
    expect(ordenarRango("2026-10-10", "2026-10-10")).toEqual(["2026-10-10", "2026-10-10"]);
  });
});

describe("CampoFecha", () => {
  it("apagado ES el input nativo, con las mismas props", () => {
    const { container } = render(<CampoFecha value="2026-10-05" onChange={() => {}} max="2026-10-31" className="x" aria-label="Fecha" />);
    const i = container.querySelector("input")!;
    expect(i.type).toBe("date");
    expect(i.value).toBe("2026-10-05");
    expect(i.max).toBe("2026-10-31");
    expect(i.className).toBe("x");
  });

  it("prendido: un toque elige el día, aplica y cierra", async () => {
    const onChange = vi.fn();
    render(<CampoFecha simple value="2026-10-05" onChange={onChange} aria-label="Fecha" />);
    fireEvent.click(screen.getByRole("button", { name: "Fecha" }));
    expect(screen.getAllByText("Toca el día").length).toBeGreaterThan(0);
    const dia = await screen.findAllByRole("button", { name: /12 de octubre de 2026/ });
    fireEvent.click(dia[0]);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ target: { value: "2026-10-12" } }));
    await waitFor(() => expect(screen.queryByText("Toca el día")).toBeNull());
  });
});

describe("🔴 ningún `<input type=\"date\">` suelto", () => {
  it("todos pasan por CampoFecha (salvo el respaldo apagado de la Planilla)", () => {
    const raiz = path.join(__dirname, "../..");
    const sueltos: string[] = [];
    const recorrer = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = path.join(d, n);
        if (statSync(p).isDirectory()) { if (n !== "__tests__") recorrer(p); continue; }
        if (!p.endsWith(".tsx") || p.endsWith("CampoFecha.tsx")) continue;
        const veces = (readFileSync(p, "utf8").match(/type="date"/g) ?? []).length;
        if (veces) sueltos.push(`${path.relative(raiz, p)}:${veces}`);
      }
    };
    recorrer(raiz);
    // GastoForm: su `TextInput type="date"` ya rinde CampoFecha.
    expect(sueltos).toEqual(["app/asistencia/PlanillaTab.tsx:1", "app/caja/components/GastoForm.tsx:1"]);
  });
});

describe("el botón «Rango de fechas» con un rango", () => {
  it("dice el rango corto", async () => {
    const { etiquetaRangoCorta } = await import("@/lib/ui/calendario-simple");
    expect(etiquetaRangoCorta("2026-09-15", "2026-09-30")).toBe("15–30 sep");
    expect(etiquetaRangoCorta("2026-09-28", "2026-10-10")).toBe("28 sep – 10 oct");
    expect(etiquetaRangoCorta("2026-12-28", "2027-01-05")).toBe("28 dic 2026 – 5 ene 2027");
    expect(etiquetaRangoCorta("2026-09-15", "2026-09-15")).toBe("15 sep");
  });
});
