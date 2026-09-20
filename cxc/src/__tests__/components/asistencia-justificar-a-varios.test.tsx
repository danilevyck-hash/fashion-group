/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 JUSTIFICAR A VARIOS DESDE EL REPORTE (19-sep-2026).
 *
 * 🩸 El día de lluvia del **17-ago-2026** son **13 justificaciones cargadas una
 * por una con la misma nota** — 13 de las 29 de toda la historia del módulo.
 *
 * Daniel eligió **seleccionar varias filas del Reporte** y justificarlas de una
 * vez (no la opción del formulario con selector de personas).
 *
 * Lo que este candado exige:
 *   A. La regla pura: la intersección de motivos, los textos y el resumen.
 *   B. La selección en la pantalla, y que se derive de lo que SE VE.
 *   C. 🔴 Misma ruta y misma validación: una petición por persona, con el
 *      cuerpo de siempre. Lo que no entra SE DICE, con nombre.
 *   D. 🔴 La lista de motivos sigue CERRADA: no nace ninguno.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  MOTIVOS_JUSTIFICACION, MOTIVO_DIA_LIBRE_EMPRESA, motivosParaElegir,
} from "@/lib/asistencia/motivos";
import {
  JUSTIFICAR_A_VARIOS, QUITAR_LA_SELECCION, hayAQuienJustificar,
  motivosParaVarios, resumenDelLote, textoDeLaSeleccion,
} from "@/lib/asistencia/justificar-a-varios";
import { ROTULO_SOLO_A_REVISAR } from "@/lib/asistencia/solo-a-revisar";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(""),
}));

import ReporteTab from "@/app/asistencia/ReporteTab";

const RAIZ = process.cwd();
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

type Llamada = { url: string; init?: RequestInit };
function servir(
  respuestas: Array<[string, unknown]>,
  llamadas: Llamada[] = [],
  fallaCodigo?: string,
) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    llamadas.push({ url: u, init });
    if (fallaCodigo && u.includes("/justificaciones") && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      if (body.codigo === fallaCodigo) {
        return { ok: false, status: 400, json: async () => ({ error: "Ese motivo ya no se usa" }) } as Response;
      }
    }
    const par = respuestas.find(([frag]) => u.includes(frag));
    return { ok: true, status: 200, json: async () => par?.[1] ?? {} } as Response;
  }));
  return llamadas;
}
const montar = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const persona = (codigo: string, nombre: string, empresa: string) => ({
  codigo, nombre, empresa, salida: "17:00", almuerzoMin: 30,
  dias: [{
    fecha: "2026-08-17", marcas: [], marcasIds: [], entrada: null, salida: null,
    tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
    revisar: false, ausente: true, justificado: null, feriado: null, habil: true,
    correcciones: [], repetidas: [],
  }],
  resumen: {
    diasTrabajados: 0, ausenciasSinJustificar: 1, ausenciasJustificadas: 0, diasTrabajandoFuera: 0,
    vecesTarde: 0, minutosTarde: 0, minutosTardeDeDiasARevisar: 0,
    excesoAlmuerzoMin: 0, salidaTempranaMin: 0, tiempoNoTrabajadoMin: 0, extraMin: 0,
    diasARevisar: 0, diasCorregidos: 0,
  },
});

const GENTE = [
  persona("8", "BRICEIDA MONTERO", "vistana"),
  persona("16", "ANDREA PEREZ", "fashion_wear"),
  persona("301", "JENIFER GOMEZ", "american_classic"),
];

const base = (): Array<[string, unknown]> => [
  ["/api/asistencia/reloj", { relojes: [] }],
  ["/api/asistencia/justificaciones", { justificaciones: [], personas: [], motivos: MOTIVOS_JUSTIFICACION }],
  ["/correcciones/motivos", { motivos: [] }],
  ["/api/asistencia/reporte", {
    personas: GENTE, sinHorario: 0, reglas: REGLAS_DEFAULT, correccionesDisponible: true,
  }],
];

const marcar = async (nombre: string) => {
  fireEvent.click(await screen.findByRole("checkbox", { name: `Seleccionar ${nombre}` }));
};

// ─────────────────────────────────────────────────────────────────────────────
// A. LA REGLA PURA
// ─────────────────────────────────────────────────────────────────────────────

describe("A · la regla pura", () => {
  it("🔴 los motivos de varios son la INTERSECCIÓN, nunca la unión", () => {
    // Multifashion no tiene «Día libre de la empresa» (Daniel: «ese día se les
    // regala»): con alguien de ahí adentro, a nadie se le ofrece.
    const conMulti = motivosParaVarios(["vistana", "american_classic"]);
    expect(conMulti).not.toContain(MOTIVO_DIA_LIBRE_EMPRESA);
    expect(conMulti.length).toBe(motivosParaElegir("american_classic").length);
    // Sin Multifashion, los siete de siempre.
    const sinMulti = motivosParaVarios(["vistana", "fashion_wear"]);
    expect(sinMulti).toEqual([...motivosParaElegir("vistana")]);
  });

  it("sin empresa conocida se ofrecen todos: el servidor decide con la ficha", () => {
    expect(motivosParaVarios([])).toEqual([...motivosParaElegir(null)]);
    expect(motivosParaVarios([null, null])).toEqual([...motivosParaElegir(null)]);
  });

  it("los textos de la selección, con el singular solo para el 1", () => {
    expect(textoDeLaSeleccion(1)).toBe("1 colaborador seleccionado");
    expect(textoDeLaSeleccion(13)).toBe("13 colaboradores seleccionados");
    expect(hayAQuienJustificar(0)).toBe(false);
    expect(hayAQuienJustificar(1)).toBe(true);
  });

  it("🔴 lo que NO se guardó se NOMBRA, y el toast va en rojo", () => {
    expect(resumenDelLote(13, [])).toEqual({ texto: "Listo, 13 justificados", tipo: "success" });
    expect(resumenDelLote(1, [])).toEqual({ texto: "Listo, 1 justificado", tipo: "success" });
    const conFallo = resumenDelLote(11, [
      { etiqueta: "Andrea Perez", error: "x" },
      { etiqueta: "Jenifer Gomez", error: "y" },
    ]);
    expect(conFallo.tipo).toBe("error");
    expect(conFallo.texto).toBe("Se guardaron 11 de 13. Faltó: Andrea Perez · Jenifer Gomez.");
    const ninguno = resumenDelLote(0, [{ etiqueta: "Andrea Perez", error: "Ese motivo ya no se usa" }]);
    expect(ninguno.tipo).toBe("error");
    expect(ninguno.texto).toContain("No se guardó ninguno");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. LA SELECCIÓN EN LA PANTALLA
// ─────────────────────────────────────────────────────────────────────────────

describe("B · seleccionar varias filas", () => {
  it("sin nada marcado no hay barra: un control permanente se vuelve ruido", async () => {
    servir(base());
    montar(<ReporteTab />);
    await screen.findByText("Briceida Montero");
    expect(screen.queryByRole("button", { name: JUSTIFICAR_A_VARIOS })).toBeNull();
  });

  it("🔴 cada fila tiene SU casilla, y se puede tocar", async () => {
    servir(base());
    montar(<ReporteTab />);
    await screen.findByText("Briceida Montero");
    const casillas = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(casillas).toHaveLength(GENTE.length);
    expect(casillas.every((c) => !c.disabled)).toBe(true);
    fireEvent.click(casillas[0]);
    expect((screen.getAllByRole("checkbox")[0] as HTMLInputElement).checked).toBe(true);
  });

  it("🔴 marcar varias filas prende la barra y dice a cuántos", async () => {
    servir(base());
    montar(<ReporteTab />);
    await marcar("Briceida Montero");
    await marcar("Andrea Perez");
    expect(screen.getByText(textoDeLaSeleccion(2))).toBeTruthy();
    expect(screen.getByRole("button", { name: JUSTIFICAR_A_VARIOS })).toBeTruthy();
  });

  it("«Quitar la selección» la suelta entera", async () => {
    servir(base());
    montar(<ReporteTab />);
    await marcar("Briceida Montero");
    fireEvent.click(screen.getByRole("button", { name: QUITAR_LA_SELECCION }));
    await waitFor(() => expect(screen.queryByRole("button", { name: JUSTIFICAR_A_VARIOS })).toBeNull());
  });

  it("🔴 la selección se deriva de lo que SE VE: quien sale de la tabla sale de la selección", async () => {
    // Nadie tiene días a revisar en este cuadro, así que el filtro deja la
    // tabla vacía. Lo marcado NO se puede justificar a escondidas.
    servir(base());
    montar(<ReporteTab />);
    await marcar("Briceida Montero");
    expect(screen.getByRole("button", { name: JUSTIFICAR_A_VARIOS })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: ROTULO_SOLO_A_REVISAR }));
    await waitFor(() => expect(screen.queryByRole("button", { name: JUSTIFICAR_A_VARIOS })).toBeNull());
  });

  it("🔴 la ventana dice POR NOMBRE a quiénes les va a caer", async () => {
    servir(base());
    montar(<ReporteTab />);
    await marcar("Briceida Montero");
    await marcar("Jenifer Gomez");
    fireEvent.click(screen.getByRole("button", { name: JUSTIFICAR_A_VARIOS }));
    const lista = await screen.findByRole("list");
    expect(lista.textContent).toContain("Briceida Montero");
    expect(lista.textContent).toContain("Jenifer Gomez");
    expect(lista.textContent).not.toContain("Andrea Perez");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. LA MISMA RUTA Y LA MISMA VALIDACIÓN
// ─────────────────────────────────────────────────────────────────────────────

describe("C · misma ruta, una petición por persona", () => {
  it("🔴 se manda el cuerpo de SIEMPRE, uno por persona, a la MISMA ruta", async () => {
    const llamadas = servir(base());
    montar(<ReporteTab />);
    await marcar("Briceida Montero");
    await marcar("Andrea Perez");
    fireEvent.click(screen.getByRole("button", { name: JUSTIFICAR_A_VARIOS }));
    fireEvent.click(await screen.findByRole("button", { name: "Agregar" }));

    await waitFor(() => {
      const posts = llamadas.filter((l) => l.url.includes("/justificaciones") && l.init?.method === "POST");
      expect(posts).toHaveLength(2);
    });
    const posts = llamadas.filter((l) => l.url.includes("/justificaciones") && l.init?.method === "POST");
    expect(posts.every((p) => p.url === "/api/asistencia/justificaciones")).toBe(true);
    const cuerpos = posts.map((p) => JSON.parse(String(p.init?.body)));
    expect(cuerpos.map((c) => c.codigo).sort()).toEqual(["16", "8"]);
    // Mismo motivo y mismos días para todos, y el cuerpo de siempre.
    expect(new Set(cuerpos.map((c) => c.motivo)).size).toBe(1);
    expect(new Set(cuerpos.map((c) => `${c.desde}|${c.hasta}`)).size).toBe(1);
    // 🔴 UN DÍA, NUNCA EL PERÍODO ENTERO. El Reporte abre con un rango de 14
    // días; justificar los 14 por defecto sería regalar media quincena.
    expect(cuerpos[0].desde).toBe(cuerpos[0].hasta);
    expect(Object.keys(cuerpos[0]).sort()).toEqual(
      ["desde", "codigo", "hasta", "horaDesde", "horaHasta", "motivo", "nota"].sort(),
    );
  });

  it("🔴 si uno falla, se dice CUÁL y los otros igual entran", async () => {
    servir(base(), [], "16");
    montar(<ReporteTab />);
    await marcar("Briceida Montero");
    await marcar("Andrea Perez");
    fireEvent.click(screen.getByRole("button", { name: JUSTIFICAR_A_VARIOS }));
    fireEvent.click(await screen.findByRole("button", { name: "Agregar" }));
    expect(await screen.findByText(/Se guardaron 1 de 2\. Faltó: Andrea Perez\./)).toBeTruthy();
  });

  it("🔴 con alguien de Multifashion no se ofrece «Día libre de la empresa»", async () => {
    servir(base());
    montar(<ReporteTab />);
    await marcar("Briceida Montero");
    await marcar("Jenifer Gomez");
    fireEvent.click(screen.getByRole("button", { name: JUSTIFICAR_A_VARIOS }));
    const select = (await screen.findAllByRole("combobox"))[0] as HTMLSelectElement;
    const opciones = Array.from(select.options).map((o) => o.value);
    expect(opciones).not.toContain(MOTIVO_DIA_LIBRE_EMPRESA);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. CONTROL — la lista sigue cerrada y no nace una ruta «en lote»
// ─────────────────────────────────────────────────────────────────────────────

describe("D · control", () => {
  const puro = (f: string) =>
    fs.readFileSync(path.join(RAIZ, "src", f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

  it("🔴 NO existe una ruta «en lote» con reglas propias", () => {
    expect(fs.existsSync(path.join(RAIZ, "src/app/api/asistencia/justificaciones/lote"))).toBe(false);
    const modulo = puro("lib/asistencia/justificar-a-varios.ts");
    expect(modulo).not.toContain("fetch(");
    expect(modulo).not.toContain("supabase");
  });

  it("🔴 la ventana monta el MISMO formulario, no uno nuevo", () => {
    const modal = puro("app/asistencia/JustificarVariosModal.tsx");
    expect(modal).toContain('import JustificarForm from "./JustificarForm"');
    // Y no tiene un segundo POST propio.
    expect(modal).not.toMatch(/fetch\(/);
  });

  it("🔴 la lista de motivos sigue CERRADA: no nace ninguno", () => {
    const modulo = puro("lib/asistencia/justificar-a-varios.ts");
    // Se DERIVA de `motivosParaElegir`; no hay una segunda lista escrita a mano.
    expect(modulo).toContain("motivosParaElegir");
    for (const inventado of ["Vacaciones", "Permiso", "Luto", "Otro"]) {
      expect(modulo).not.toContain(`"${inventado}"`);
    }
    expect(motivosParaVarios(["vistana"]).every((m) => MOTIVOS_JUSTIFICACION.includes(m))).toBe(true);
  });

  it("la ficha y la fila del día siguen justificando a UNA persona, como siempre", () => {
    const seccion = puro("app/asistencia/colaboradores/SeccionJustificaciones.tsx");
    const ventanaDia = puro("app/asistencia/JustificarDiaModal.tsx");
    expect(seccion).not.toContain("codigos=");
    expect(ventanaDia).not.toContain("codigos=");
  });
});
