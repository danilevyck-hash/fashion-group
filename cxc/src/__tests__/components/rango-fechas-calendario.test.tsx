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
    expect(etiquetaRango("", "")).toBe("Elige el período");
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
        desde="2026-08-01" hasta="2026-08-15"
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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL MODO «ABIERTO EN LÍNEA» (4-sep-2026)
//
// Daniel, sobre el desplegable: *«no veo lo de poner las fechas, sigue igual
// pero no cortado»*. Ensancharlo no alcanzó: seguía siendo un menucito que hay
// que descubrir. En la Planilla, elegir el período ES el primer paso, así que
// el calendario va a la vista — como el de Copa Airlines.
//
// 🩸 Acá NO se tocan días: `next/dynamic` no resuelve bajo vitest y el
// calendario se queda en su `loading`. Lo que se prueba es lo que decide el
// CONTROL: que no haya nada que abrir, que el resumen esté a la vista y que la
// acción que le pasan se dibuje. La máquina de toques se prueba arriba, sobre
// `CalendarioRango` importado directo.
describe("🔴 el calendario en línea", () => {
  it("no hay botón que abrir: el rango se dice ahí mismo", () => {
    render(<RangoFechas desde="2026-10-28" hasta="2026-11-10" onChange={vi.fn()} inline />);
    // El resumen, con los días contados.
    expect(screen.getByText("28 oct – 10 nov 2026 · 14 días")).toBeTruthy();
    // Y NO el botón-píldora que abre el desplegable.
    expect(screen.queryByRole("button", { name: /28 oct – 10 nov/ })).toBeNull();
  });

  it("sin período elegido, invita a elegir el PRIMER día (y no afirma un rango)", () => {
    render(<RangoFechas desde="2026-10-28" hasta="2026-11-10" onChange={vi.fn()} inline vacio />);
    expect(screen.getByText("Elige el primer día")).toBeTruthy();
    expect(screen.queryByText(/14 días/)).toBeNull();
  });

  it("la acción que le pasan va en el pie, al lado del resumen", () => {
    render(
      <RangoFechas
        desde="2026-10-28" hasta="2026-11-10" onChange={vi.fn()} inline
        accion={<button type="button">Generar</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Generar" })).toBeTruthy();
  });

  it("🔴 el modo desplegable NO cambió: sin `inline` sigue habiendo píldora", () => {
    render(<RangoFechas desde="2026-08-01" hasta="2026-08-15" onChange={vi.fn()} />);
    // Las dos caras (escritorio y móvil) se montan en jsdom: por eso `getAll`.
    expect(screen.getAllByRole("button", { name: /1 ago – 15 ago 2026 · 15 días/ }).length).toBeGreaterThan(0);
  });

  it("y en línea no se traba el scroll de la página (no es un modal)", () => {
    render(<RangoFechas desde="2026-08-01" hasta="2026-08-15" onChange={vi.fn()} inline />);
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL PRIMER TOQUE ES LA FECHA EN QUE EMPIEZA. SIEMPRE. (4-sep-2026)
//
// Daniel, textual: *«al hacer clic, selecciona la fecha que corta, no me está
// dejando seleccionar la fecha que empieza»*.
//
// 🩸 REPRODUCIDO ANTES DE ARREGLAR, y no era la máquina de toques: era que el
// calendario PINTABA un rango que nadie había elegido. La pantalla decía «Elige
// el período» y abajo se veía la quincena en curso ya marcada de punta a punta,
// así que el primer toque parecía estar CORTANDO ese rango en lugar de empezar
// uno nuevo. El segundo caso, más feo, es un ancla que quedó viva de antes: ahí
// el toque siguiente sí se interpretaba como FIN de verdad.
describe("🔴 el primer toque es el día en que EMPIEZA", () => {
  const dia = (iso: string) => {
    const b = document.querySelector(`[data-day="${iso}"] button`);
    if (!b) throw new Error(`no hay día ${iso} en la grilla`);
    return b as HTMLElement;
  };

  it("🩸 con `vacio` no se pinta NADA: no hay rango que cortar", () => {
    const { container } = render(
      <CalendarioRango desde="2026-08-01" hasta="2026-08-15" vacio onRango={vi.fn()} />,
    );
    expect(container.querySelectorAll('[aria-selected="true"]').length).toBe(0);
  });

  it("y sin `vacio` sí se pinta: el rango elegido se ve", () => {
    const { container } = render(
      <CalendarioRango desde="2026-08-01" hasta="2026-08-15" onRango={vi.fn()} />,
    );
    expect(container.querySelectorAll('[aria-selected="true"]').length).toBeGreaterThan(0);
  });

  it("con `vacio`, el primer toque fija el INICIO y no cierra nada", () => {
    const onRango = vi.fn(); const onAncla = vi.fn();
    render(
      <CalendarioRango desde="2026-08-01" hasta="2026-08-15" vacio
        onRango={onRango} onAncla={onAncla} />,
    );
    fireEvent.click(dia("2026-08-10"));
    expect(onAncla).toHaveBeenCalledWith("2026-08-10");
    expect(onRango).not.toHaveBeenCalled();
    // Y el segundo cierra contra ÉL: 10 es el inicio, no el fin.
    fireEvent.click(dia("2026-08-24"));
    expect(onRango).toHaveBeenCalledWith("2026-08-10", "2026-08-24");
  });

  it("🔴 un rango que llega de AFUERA borra la elección a medias", () => {
    const onRango = vi.fn(); const onAncla = vi.fn();
    const { rerender } = render(
      <CalendarioRango desde="2026-08-01" hasta="2026-08-15" onRango={onRango} onAncla={onAncla} />,
    );
    fireEvent.click(dia("2026-08-10"));           // ancla a medias, y se abandona
    rerender(
      <CalendarioRango desde="2026-09-01" hasta="2026-09-15" onRango={onRango} onAncla={onAncla} />,
    );
    onAncla.mockClear();
    fireEvent.click(dia("2026-09-03"));
    // Si el ancla vieja hubiera sobrevivido, esto habría CERRADO un rango.
    expect(onRango).not.toHaveBeenCalled();
    expect(onAncla).toHaveBeenCalledWith("2026-09-03");
  });

  it("el encabezado dice cuál fecha se está eligiendo, en tuteo", () => {
    render(<RangoFechas desde="2026-08-01" hasta="2026-08-15" onChange={vi.fn()} inline vacio />);
    expect(screen.getByText("Elige el primer día")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/elegí/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 UN SOLO MES, también en escritorio", () => {
  it("el calendario dibuja una sola grilla", () => {
    const { container } = render(
      <CalendarioRango desde="2026-08-01" hasta="2026-08-15" onRango={vi.fn()} />,
    );
    expect(container.querySelectorAll("table").length).toBe(1);
  });

  it("y el control en línea monta UN calendario, no dos vistas", () => {
    render(<RangoFechas desde="2026-08-01" hasta="2026-08-15" onChange={vi.fn()} inline />);
    // 🩸 En jsdom no hay Tailwind: si hubiera una vista de escritorio y otra de
    // teléfono, se montarían las dos y este número sería 2.
    expect(document.querySelectorAll('[data-testid="calendario-inline"]').length).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el día SUGERIDO se marca, pero no se elige solo", () => {
  // 🩸 La clase del modificador va en la CELDA (`<td data-day>`), no en el
  // botón: el botón ya trae un `focus-visible:ring-2` de la casa y mirarlo ahí
  // daba verde en cualquier día.
  const celda = (iso: string) => document.querySelector(`[data-day="${iso}"]`) as HTMLElement;

  it("el aro está en el día sugerido y en ningún otro", () => {
    render(
      <CalendarioRango desde="2026-08-16" hasta="2026-08-16" vacio sugerido="2026-08-16"
        onRango={vi.fn()} />,
    );
    expect(celda("2026-08-16").className).toMatch(/ring-blue-400/);
    expect(celda("2026-08-17").className).not.toMatch(/ring-blue-400/);
  });

  it("🔴 marcado NO es elegido: nada se aplica hasta que alguien toque", () => {
    const onRango = vi.fn();
    const { container } = render(
      <CalendarioRango desde="2026-08-16" hasta="2026-08-16" vacio sugerido="2026-08-16"
        onRango={onRango} />,
    );
    expect(onRango).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[aria-selected="true"]').length).toBe(0);
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
