/**
 * La línea de "hasta dónde llegó la contadora", PINTADA.
 *
 * Existe por una razón que un test de función pura no puede ver: el indicador
 * sirve **si se lee de un vistazo**, y eso significa que tiene que estar en las
 * DOS formas de la lista —tarjetas por debajo de `lg`, tabla desde `lg`— y en
 * TODAS las empresas, no solo cuando el mes elegido está vacío. Una línea que
 * `armarFilas` calcula y ningún JSX dibuja pasa cualquier barrido de texto.
 *
 * 🩸 EL CASO REAL, medido en producción el 13-ago-2026 sobre los 441 renglones
 * de `egresos_varios`: vistana julio · fashion_wear mayo · fashion_shoes abril ·
 * active_wear abril · active_shoes, joystep y american_classic sin una sola fila.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

import ResumenEgresos, { fraseAlDia } from "@/app/gastos-contabilidad/components/ResumenEgresos";
import type { EmpresaEgresosResumen } from "@/app/gastos-contabilidad/components/tipos";
import type { ResumenEgresosMes } from "@/lib/egresos/reglas";
import type { AlDia } from "@/lib/egresos/al-dia";

afterEach(cleanup);

function resumen(totalCent: number, estado: ResumenEgresosMes["estado"]): ResumenEgresosMes {
  return {
    mes: "2026-03",
    estado,
    totalSalidaCent: totalCent,
    totalGastoCent: totalCent,
    totalNoGastoCent: 0,
    cuentasGasto: [],
    cuentasNoGasto: [],
    renglones: totalCent > 0 ? 1 : 0,
    documentos: totalCent > 0 ? 1 : 0,
  };
}

function empresa(
  empresaKey: string,
  nombre: string,
  alDia: AlDia,
  opts: { totalCent?: number; estado?: ResumenEgresosMes["estado"]; descargaAutomatica?: boolean } = {},
): EmpresaEgresosResumen {
  const totalCent = opts.totalCent ?? 0;
  return {
    empresaKey,
    nombre,
    resumen: resumen(totalCent, opts.estado ?? (totalCent > 0 ? "con_movimientos" : "sin_datos")),
    ultimoMesConMovimientos: alDia.estado === "sin_nada" ? null : alDia.mes,
    alDia,
    descargaAutomatica: opts.descargaAutomatica ?? true,
  };
}

/** El estado REAL de producción, empresa por empresa. */
const PRODUCCION: EmpresaEgresosResumen[] = [
  empresa("vistana", "Vistana International", { estado: "al_dia", mes: "2026-07" }, { totalCent: 3_740_428 }),
  empresa(
    "fashion_wear",
    "Fashion Wear",
    { estado: "quizas_incompleto", mes: "2026-05", gastoCent: 25_743, habitualCent: 248_205 },
    { totalCent: 270_129 },
  ),
  empresa("fashion_shoes", "Fashion Shoes", { estado: "al_dia", mes: "2026-04" }, { totalCent: 300_000 }),
  empresa(
    "active_wear",
    "Active Wear",
    { estado: "quizas_incompleto", mes: "2026-04", gastoCent: 0, habitualCent: 41_695 },
    { totalCent: 21_935 },
  ),
  empresa("active_shoes", "Active Shoes", { estado: "sin_nada" }),
  empresa("joystep", "Joystep", { estado: "sin_nada" }),
  empresa("american_classic", "Multifashion", { estado: "sin_nada" }),
  // Boston NO se baja sola: su vacío es una decisión, no un atraso.
  empresa("confecciones_boston", "Confecciones Boston", { estado: "sin_nada" }, { descargaAutomatica: false }),
];

/** La fila de una empresa, en la forma que el DOM haya montado. */
function filaDe(nombre: string): HTMLElement {
  const etiqueta = screen.getAllByText(nombre)[0];
  // La tarjeta puede ser un <button> (mes con monto) o un <div> (sin monto), así
  // que se busca por CLASE y no por etiqueta: con `div.rounded-lg` el candado
  // no encontraba la fila y fallaba por el motivo equivocado.
  const cont = etiqueta.closest("tr") ?? etiqueta.closest(".rounded-lg");
  if (!cont) throw new Error(`no se encontró la fila de ${nombre}`);
  return cont as HTMLElement;
}

describe("🩸 el avance de la contadora se ve, empresa por empresa", () => {
  it("cada empresa dice hasta dónde llegó, en su propia fila", () => {
    render(<ResumenEgresos empresas={PRODUCCION} onAbrir={() => {}} />);
    expect(within(filaDe("Vistana International")).getAllByText(/Cargado hasta julio 2026/).length).toBeGreaterThan(0);
    expect(within(filaDe("Fashion Shoes")).getAllByText(/Cargado hasta abril 2026/).length).toBeGreaterThan(0);
  });

  it("🔴 la que no tiene nada dice que NO HAY, y NUNCA $0.00", () => {
    // Un cero le diría a Daniel que esas empresas no gastaron. Gastan: lo que
    // falta es que la contadora las cargue.
    render(<ResumenEgresos empresas={PRODUCCION} onAbrir={() => {}} />);
    for (const nombre of ["Active Shoes", "Joystep", "Multifashion"]) {
      const fila = filaDe(nombre);
      expect(within(fila).getAllByText("Todavía no hay gastos registrados").length).toBeGreaterThan(0);
      expect(fila.textContent).not.toMatch(/\$0\.00/);
    }
  });

  it("🔴 el mes dudoso se marca CON LOS DOS NÚMEROS a la vista, no con un semáforo", () => {
    // Sin el monto y lo habitual, "puede estar a medio cargar" sería una opinión.
    render(<ResumenEgresos empresas={PRODUCCION} onAbrir={() => {}} />);
    const fila = filaDe("Fashion Wear");
    const linea = within(fila).getAllByText(/Cargado hasta mayo 2026/)[0];
    expect(linea.textContent).toContain("$257.43");
    expect(linea.textContent).toContain("$2,482.05");
    expect(linea.textContent).toContain("puede estar a medio cargar");
  });

  it("la sospecha va en ÁMBAR y el hecho en gris — el color es la mitad del mensaje", () => {
    render(<ResumenEgresos empresas={PRODUCCION} onAbrir={() => {}} />);
    const dudosa = within(filaDe("Fashion Wear")).getAllByText(/Cargado hasta mayo 2026/)[0];
    const cierta = within(filaDe("Vistana International")).getAllByText(/Cargado hasta julio 2026/)[0];
    expect(dudosa.className).toMatch(/amber/);
    expect(cierta.className).not.toMatch(/amber/);
  });

  it("🔴 Boston NO se acusa de un atraso que no tiene", () => {
    // Su vacío es una decisión de Daniel (no se baja sola) y su explicación ya
    // lo dice entera. Decirle "todavía no hay gastos registrados" sería otra cosa.
    render(<ResumenEgresos empresas={PRODUCCION} onAbrir={() => {}} />);
    const fila = filaDe("Confecciones Boston");
    expect(within(fila).queryByText("Todavía no hay gastos registrados")).toBeNull();
    expect(fila.textContent).toMatch(/no se traen solos de Switch/);
  });

  it("🔴 la línea está en las DOS formas de la lista (tarjetas Y tabla)", () => {
    // El corte es CSS: las dos se montan siempre. Si la línea viviera en una
    // sola, media pantalla quedaría sin el indicador según el ancho.
    const { container } = render(<ResumenEgresos empresas={PRODUCCION} onAbrir={() => {}} />);
    const tarjetas = container.querySelector("div.lg\\:hidden");
    const tabla = container.querySelector("div.lg\\:block");
    expect(tarjetas?.textContent).toContain("Cargado hasta julio 2026");
    expect(tabla?.textContent).toContain("Cargado hasta julio 2026");
  });

  it("la línea aparece SIEMPRE, no solo cuando el mes elegido está vacío", () => {
    // Vistana tiene movimientos en el mes que se está mirando y aun así dice
    // hasta dónde llegó: es la pregunta "¿por dónde va la contadora?", que no
    // depende del mes que uno esté navegando.
    render(<ResumenEgresos empresas={PRODUCCION} onAbrir={() => {}} />);
    const fila = filaDe("Vistana International");
    expect(fila.textContent).toContain("$37,404.28");
    expect(fila.textContent).toContain("Cargado hasta julio 2026");
  });

  it("no dice DOS VECES el mismo mes: la coletilla vieja se retiró", () => {
    render(<ResumenEgresos empresas={PRODUCCION} onAbrir={() => {}} />);
    expect(screen.queryByText(/Lo último que hay es de/)).toBeNull();
  });
});

describe("fraseAlDia — los bordes", () => {
  it("sin dato no inventa una línea", () => {
    // SWR sirve el payload cacheado de la visita anterior mientras revalida, y
    // ese payload puede venir de una versión sin este campo.
    expect(fraseAlDia(undefined, true)).toBeNull();
  });

  it("una fila sin `alDia` no rompe la pantalla", () => {
    const sinCampo = { ...PRODUCCION[0] } as EmpresaEgresosResumen & { alDia?: AlDia };
    delete sinCampo.alDia;
    render(<ResumenEgresos empresas={[sinCampo as EmpresaEgresosResumen]} onAbrir={() => {}} />);
    expect(screen.getAllByText("Vistana International").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Cargado hasta/)).toBeNull();
  });

  it("el mes en curso lo dice como calendario, no como sospecha", () => {
    expect(fraseAlDia({ estado: "mes_en_curso", mes: "2026-08" }, true)).toBe(
      "Cargado hasta agosto 2026, que todavía va corriendo",
    );
  });

  it("🔴 no dice \"Al día hasta\": esa frase ya la usa la píldora para otra cosa", () => {
    // La píldora de la MISMA fila dice "Al día" cuando el mes que estás mirando
    // tuvo movimientos. Dos frases parecidas diciendo cosas distintas en el
    // mismo renglón es el defecto que este repo ya pagó con los módulos de gastos.
    for (const a of [
      { estado: "al_dia", mes: "2026-07" },
      { estado: "mes_en_curso", mes: "2026-08" },
      { estado: "quizas_incompleto", mes: "2026-05", gastoCent: 1, habitualCent: 100 },
    ] as AlDia[]) {
      expect(fraseAlDia(a, true)).not.toMatch(/Al día/);
    }
  });
});
