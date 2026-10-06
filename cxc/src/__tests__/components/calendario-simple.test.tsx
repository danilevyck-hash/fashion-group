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
  // Prendido el 5-oct-2026: Daniel aprobó el mockup v5 («aprobado, dale»).
  it("está prendido desde el 5-oct-2026 (Daniel: «aprobado, dale»)", () => {
    expect(CALENDARIO_SIMPLE_2026_10).toBe(true);
  });
});

describe("los atajos", () => {
  // 🔄 6-oct-2026 — Daniel: con las ‹ › del período, «Este mes» y «Mes pasado»
  // sobran. Quedan los tres que las flechas no hacen.
  it("son los tres que las flechas no repiten, en orden", () => {
    expect(ATAJOS_FECHA.map((a) => a.rotulo)).toEqual(["Hoy", "Ayer", "7 días"]);
    for (const t of ["Este mes", "Mes pasado"]) expect(ATAJOS_FECHA.map((a) => a.rotulo)).not.toContain(t);
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
    const { container } = render(<CampoFecha simple={false} value="2026-10-05" onChange={() => {}} max="2026-10-31" className="x" aria-label="Fecha" />);
    const i = container.querySelector("input")!;
    expect(i.type).toBe("date");
    expect(i.value).toBe("2026-10-05");
    expect(i.max).toBe("2026-10-31");
    expect(i.className).toBe("x");
  });

  it("prendido: un toque elige el día, aplica y cierra", async () => {
    const onChange = vi.fn();
    render(<CampoFecha simple value="2026-10-05" onChange={onChange} aria-label="Fecha" />);
    fireEvent.click(screen.getByRole("button", { name: /5 oct 2026/ }));
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

describe("el pie del rango", () => {
  it("«16 días · vs 15–30 sep 2025»", async () => {
    const { pieDelRango } = await import("@/components/comisiones/ComisionesVendedoresRango");
    expect(pieDelRango("2026-09-15", "2026-09-30", { desde: "2025-09-15", hasta: "2025-09-30" })).toBe("16 días · vs 15–30 sep 2025");
  });
});

describe("PanelPeriodo (la lista larga de meses, compacta)", () => {
  it("sin meses ni años futuros; un toque aplica y cierra", async () => {
    const { default: PanelPeriodo } = await import("@/components/ui/PanelPeriodo");
    const onMes = vi.fn(); const onAnio = vi.fn(); const onU3 = vi.fn();
    render(
      <PanelPeriodo rotulo="Octubre 2026" anios={[2025, 2026]}
        mesesDe={(a) => Array.from({ length: a === 2026 ? 10 : 12 }, (_, i) => i + 1)}
        seleccion={{ anio: 2026, mes: 10 }} onMes={onMes}
        todoElAnio={{ activo: null, onElegir: onAnio }}
        ventanas={[{ clave: "u3", rotulo: "Últimos 3 meses", activo: false, onElegir: onU3 }]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Período: Octubre 2026" }));
    expect(screen.queryByRole("button", { name: "Noviembre 2026" })).toBeNull();
    expect(screen.getByRole("button", { name: "Año siguiente" }).className).toContain("invisible");
    fireEvent.click(screen.getByRole("button", { name: "Septiembre 2026" }));
    expect(onMes).toHaveBeenCalledWith(2026, 9);
    expect(screen.queryByRole("button", { name: "Agosto 2026" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Período: Octubre 2026" }));
    fireEvent.click(screen.getByRole("button", { name: "Año anterior" }));
    fireEvent.click(screen.getByRole("button", { name: "Todo el año" }));
    expect(onAnio).toHaveBeenCalledWith(2025);
  });
});

describe("la variación del Total del rango es tienda contra tienda", () => {
  it("cuenta a quien vendía el año pasado aunque hoy no esté", async () => {
    const { ventaDelAmbito } = await import("@/lib/comisiones/vendedores-rango");
    const previo = [
      { empresa_key: "american_classic", vendedor: "JAILINE", ventas: 4500, comision: 0 },
      { empresa_key: "american_classic", vendedor: "YA NO ESTA", ventas: 12000, comision: 0 },
    ];
    expect(ventaDelAmbito(previo)).toBe(16500);
    expect(ventaDelAmbito(previo, "fashion_wear")).toBe(0);
  });
});
