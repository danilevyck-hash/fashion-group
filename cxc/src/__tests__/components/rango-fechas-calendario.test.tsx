// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL SELECTOR DE RANGO — la máquina de toques, y los presets que se fueron.
//
// Daniel: su corte de quincena es VARIABLE (a veces del 28 al 10). Los cuatro
// atajos que tenía este control —«Quincena en curso», «Quincena anterior»,
// «Últimos 15 días», «Este mes»— calculaban del 1 al 15 y del 16 a fin de mes,
// o sea que daban el período equivocado casi siempre, con la confianza de un
// botón que dice lo que dice. **Un preset que miente es peor que no tenerlo.**
//
// Lo que se prueba acá es la conducta, no el aspecto: qué pasa con cada toque.
// ─────────────────────────────────────────────────────────────────────────────


import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import RangoFechas, { etiquetaRango } from "@/components/ui/RangoFechas";
import CalendarioRango from "@/components/ui/CalendarioRango";
import { aIso, deIso } from "@/components/ui/rango-fechas-iso";

describe("la etiqueta del control cerrado", () => {
  it("dice el rango y cuántos días son", () => {
    expect(etiquetaRango("2026-10-28", "2026-11-10")).toBe("28 oct – 10 nov 2026 · 14 días");
  });
  it("el año se dice UNA vez cuando es el mismo", () => {
    expect(etiquetaRango("2026-08-01", "2026-08-15")).toBe("1 ago – 15 ago 2026 · 15 días");
  });
  it("un solo día no dice un rango", () => {
    expect(etiquetaRango("2026-08-03", "2026-08-03")).toBe("3 ago 2026 · 1 día");
  });
  it("sin rango, invita en vez de mostrar vacío", () => {
    expect(etiquetaRango("", "")).toBe("Elegí el período");
  });
});

describe("🩸 las fechas no se corren de día en Panamá (UTC−5)", () => {
  it("`aIso` lee campos LOCALES: `toISOString()` daría el día anterior de noche", () => {
    // 23:30 del 3 de agosto en hora local. En UTC ya es el 4.
    expect(aIso(new Date(2026, 7, 3, 23, 30))).toBe("2026-08-03");
  });
  it("`deIso` cae a mediodía, inmune a saltos de huso", () => {
    expect(deIso("2026-08-03").getHours()).toBe(12);
    expect(aIso(deIso("2026-08-03"))).toBe("2026-08-03");
  });
});

describe("🔴 la máquina de toques", () => {
  // 🔑 Por `data-day`, no por el número: el 5 aparece DOS veces en la grilla —el
  // del mes y el del mes de al lado que se dibuja en gris— y el texto no los
  // distingue. `data-day` es la fecha completa.
  const dia = (iso: string) => {
    // ⚠️ El `data-day` vive en el `<td role="gridcell">`; el clickable es el
    // `<button>` de adentro. Tocar el td no dispara nada.
    const b = document.querySelector(`[data-day="${iso}"] button`);
    if (!b) throw new Error(`no hay día ${iso} en la grilla`);
    return b as HTMLElement;
  };

  function montar(onRango = vi.fn(), onAncla = vi.fn()) {
    render(
      <CalendarioRango
        desde="2026-08-01" hasta="2026-08-15" meses={1}
        diasConDatos={null} onRango={onRango} onAncla={onAncla}
      />,
    );
    return { onRango, onAncla };
  }

  it("toque 1 fija el ancla y NO aplica nada todavía", () => {
    const { onRango, onAncla } = montar();
    fireEvent.click(dia("2026-08-05"));
    expect(onAncla).toHaveBeenCalledWith("2026-08-05");
    expect(onRango).not.toHaveBeenCalled();
  });

  it("toque 2 cierra el rango y lo aplica", () => {
    const { onRango } = montar();
    fireEvent.click(dia("2026-08-05"));
    fireEvent.click(dia("2026-08-12"));
    expect(onRango).toHaveBeenCalledWith("2026-08-05", "2026-08-12");
  });

  it("🔑 al revés se ORDENA SOLO — nada de «la inicial debe ser menor»", () => {
    const { onRango } = montar();
    fireEvent.click(dia("2026-08-20"));
    fireEvent.click(dia("2026-08-04"));
    expect(onRango).toHaveBeenCalledWith("2026-08-04", "2026-08-20");
  });

  it("con el rango cerrado, un toque más empieza un ANCLA nueva", () => {
    const { onRango, onAncla } = montar();
    fireEvent.click(dia("2026-08-05"));
    fireEvent.click(dia("2026-08-12"));
    onAncla.mockClear();
    fireEvent.click(dia("2026-08-18"));
    expect(onAncla).toHaveBeenCalledWith("2026-08-18");
    expect(onRango).toHaveBeenCalledTimes(1); // el tercer toque NO aplica
  });

  it("los botones de navegación están en ESPAÑOL", () => {
    montar();
    expect(screen.getByLabelText("Mes anterior")).toBeTruthy();
    expect(screen.getByLabelText("Mes siguiente")).toBeTruthy();
  });

  it("elegir el mismo día dos veces da un rango de un día", () => {
    const { onRango } = montar();
    fireEvent.click(dia("2026-08-07"));
    fireEvent.click(dia("2026-08-07"));
    expect(onRango).toHaveBeenCalledWith("2026-08-07", "2026-08-07");
  });
});

describe("⛔ los presets ya no existen", () => {
  it("el control abierto NO ofrece «Quincena en curso» ni los otros tres", async () => {
    render(<RangoFechas desde="2026-08-01" hasta="2026-08-15" onChange={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: /15 días/ })[0]);
    await waitFor(() => expect(screen.queryAllByRole("dialog").length).toBeGreaterThan(0));
    for (const t of ["Quincena en curso", "Quincena anterior", "Últimos 15 días", "Últimos 30 días", "Este mes"]) {
      expect(screen.queryByText(t), t).toBeNull();
    }
  });

  it("y el archivo del control no los nombra", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/ui/RangoFechas.tsx", "utf-8")
      .replace(/^\s*\/\/.*$/gm, "");   // los comentarios EXPLICAN por qué se fueron
    expect(src).not.toMatch(/Quincena en curso|Últimos 15 días|Últimos 30 días/);
  });
});
