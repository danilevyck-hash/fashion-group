/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LOS BUSCADORES DE ASISTENCIA (11-sep-2026).
 *
 * Daniel: *«pon buscador en módulos o tabs que lo ameriten, como colaboradores
 * por ejemplo»* → *«sí a buscadores»*.
 *
 * Cuatro listas que no tenían cómo llegar a una persona: **Colaboradores** (42
 * filas), **Planilla** (19 por empresa, y se usa con prisa), **Préstamos** (12) y
 * **Aprobaciones › Colaborador** (15).
 *
 * 🔴 LO QUE ESTE ARCHIVO SOSTIENE, y por qué cada cosa:
 *
 *   1. Filtra por NOMBRE y por CÓDIGO — el código es lo que el reloj manda.
 *   2. Ignora acentos y mayúsculas: nadie teclea «Camaño» con la ñ.
 *   3. 🔴 NUNCA POR PARECIDO. Es la regla de la casa: un typo no encuentra a
 *      nadie, y está bien que no encuentre. Una distancia de edición junta
 *      personas distintas, y acá lo que se decide es plata.
 *   4. 🔴 EL TEXTO VIAJA EN LA URL (`?buscar=`, `replace`): se comparte el
 *      enlace y no se pierde al cambiar de pestaña.
 *   5. 🔴 LOS TOTALES NO CAMBIAN DE SIGNIFICADO. En las cuatro listas el pie
 *      sigue sumando TODO y quien dice cuántos se ven es el buscador («1 de 3
 *      colaboradores»). ⚠️ Es al revés que en Cuentas por Cobrar —allá la tira
 *      de totales suma lo filtrado— y es a propósito: acá el total es la plata
 *      de la quincena, no la de lo que se está mirando.
 *   6. 🔴 EN PLANILLA NO TOCA LA PLATA. El Excel y el PDF salen con TODAS las
 *      líneas aunque en pantalla quede una. Filtrar la descarga sería pagar una
 *      quincena a medias porque alguien dejó un nombre escrito en el campo.
 *   7. 🔴 EN APROBACIONES, «Sí a todo lo pendiente» SIGUE SIENDO DE TODO. Un
 *      botón que dijera «todo» y decidiera solo lo filtrado dejaría horas sin
 *      resolver sin que nadie se entere.
 *   8. Sin resultados se dice con palabras y se ofrece la salida.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

// ── El doble del router: el texto del buscador vive en la URL ────────────────
// `RUTAS` guarda lo que el `replace` escribió; `URL_ACTUAL` es lo que la página
// LEE al montar (así se prueba que el enlace compartido llega ya filtrado).
const RUTAS: string[] = [];
let URL_ACTUAL = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (u: string) => RUTAS.push(u),
    replace: (u: string) => RUTAS.push(u),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(URL_ACTUAL),
}));

// 🩸 El control de rango carga el calendario con `dynamic()` y bajo vitest eso
// no resuelve: sin doble, la Planilla no llega nunca a pedir el cuadro.
vi.mock("@/components/ui/RangoFechas", () => ({
  __esModule: true,
  default: ({ desde, hasta, vacio, onChange, accion }: {
    desde: string; hasta: string; vacio?: boolean;
    onChange: (d: string, h: string) => void;
    accion?: React.ReactNode;
  }) => (
    <div>
      <button type="button" onClick={() => onChange(desde, hasta)}>
        {vacio ? "Elige el período" : `${desde} – ${hasta}`}
      </button>
      {accion}
    </div>
  ),
  ultimoRango: () => null,
}));

// 🔴 Los dos generadores de la Planilla, espiados: lo que importa no es que se
// bajen, sino CUÁNTAS líneas reciben.
const excelRecibio = vi.fn();
const pdfRecibio = vi.fn();
vi.mock("@/lib/asistencia/planilla-exportar", () => ({
  construirExcelPlanilla: (arg: { lineas: unknown[] }) => { excelRecibio(arg); return {}; },
  construirPdfPlanilla: (arg: { lineas: unknown[] }) => { pdfRecibio(arg); return { save: vi.fn() }; },
  nombreArchivo: () => "planilla.xlsx",
}));
vi.mock("@/lib/excel-export", () => ({ downloadWorkbook: vi.fn() }));

import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  HORAS_CERO, MANUALES_CERO, TOTALES_CERO, quincena, periodoDeQuincena,
  type LineaPlanilla,
} from "@/lib/asistencia/planilla";
import {
  LIMPIAR_BUSQUEDA, PARAM_BUSCAR, PLACEHOLDER_COLABORADOR, VACIO_BUSQUEDA,
  filtrarPorTexto, textoDeConteo,
} from "@/lib/buscar-en-lista";
import ConfiguracionTab from "@/app/asistencia/ConfiguracionTab";
import PlanillaTab from "@/app/asistencia/PlanillaTab";
import PrestamosTab from "@/app/asistencia/PrestamosTab";
import AprobacionesTab from "@/app/asistencia/AprobacionesTab";

beforeEach(() => { RUTAS.length = 0; URL_ACTUAL = ""; excelRecibio.mockClear(); pdfRecibio.mockClear(); vi.unstubAllGlobals(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const montar = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const buscador = () => screen.getAllByPlaceholderText(PLACEHOLDER_COLABORADOR)[0] as HTMLInputElement;
const teclear = (texto: string) => fireEvent.change(buscador(), { target: { value: texto } });

function servir(respuestas: Array<[string, unknown]>, llamadas?: Array<{ url: string; body: unknown }>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    llamadas?.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : null });
    const par = respuestas.find(([frag]) => u.includes(frag));
    return { ok: true, status: 200, json: async () => par?.[1] ?? {} } as Response;
  }));
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. LA REGLA, EN EL MÓDULO PURO
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 la regla de búsqueda: nombre, código, sin acentos y NUNCA por parecido", () => {
  const gente = [
    { nombre: "ALEJANDRA CAMAÑO", codigo: "22" },
    { nombre: "ANDREA PEREZ", codigo: "16" },
    { nombre: "JULIO MONTERO", codigo: "303" },
  ];
  const buscar = (q: string) => filtrarPorTexto(gente, q, (p) => [p.nombre, p.codigo]);

  it("por NOMBRE", () => {
    expect(buscar("andrea").map((p) => p.codigo)).toEqual(["16"]);
  });

  it("por CÓDIGO — es lo que manda el reloj y lo que la planilla descuenta", () => {
    expect(buscar("303").map((p) => p.nombre)).toEqual(["JULIO MONTERO"]);
  });

  it("ignora acentos y mayúsculas: «camano» encuentra a «CAMAÑO»", () => {
    expect(buscar("camano").map((p) => p.codigo)).toEqual(["22"]);
    expect(buscar("CaMaÑo").map((p) => p.codigo)).toEqual(["22"]);
  });

  it("🔴 NUNCA POR PARECIDO: un typo no encuentra a nadie", () => {
    // Una distancia de edición de 1 devolvería a ANDREA. Acá no.
    expect(buscar("andrez")).toEqual([]);
    expect(buscar("camanio")).toEqual([]);
    // Y tampoco por iniciales ni por palabras sueltas fuera de orden.
    expect(buscar("perez andrea")).toEqual([]);
  });

  it("texto vacío = la lista ENTERA, sin copiar ni reordenar", () => {
    expect(buscar("")).toBe(gente);
    expect(buscar("   ")).toBe(gente);
  });

  it("el conteo solo existe mientras hay búsqueda escrita", () => {
    expect(textoDeConteo(1, 3, "")).toBe("");
    expect(textoDeConteo(1, 3, "andrea")).toBe("1 de 3 colaboradores");
    expect(textoDeConteo(1, 1, "andrea")).toBe("1 de 1 colaborador");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. COLABORADORES
// ═════════════════════════════════════════════════════════════════════════════

const baseP = {
  jornadaSemanal: 48, configurado: true, faltaSalario: false, servicioProfesional: false,
  pagaSeguros: true, baseSeguros: null, noMarcaReloj: false, marcaciones: 100,
  ultimaMarca: "2026-09-10", rataHora: 4.09, valorMinuto: 0.07, fechaSalida: null,
  motivoSalida: null, activo: true, baja: null, marcoDespuesDeLaBaja: false,
  tieneHorario: true, saldoVacacionesCorte: null, posicion: "Vendedora",
  cedula: "8-111-222", fechaIngreso: "2023-05-02", saldoVacacionesDias: 0,
};
const DATOS_CONFIG = {
  personas: [
    { ...baseP, codigo: "22", nombre: "ALEJANDRA CAMAÑO", salarioMensual: 523.47, empresa: "confecciones_boston" },
    { ...baseP, codigo: "16", nombre: "ANDREA PEREZ", salarioMensual: 700, empresa: "vistana" },
    { ...baseP, codigo: "303", nombre: "JULIO MONTERO", salarioMensual: 800, empresa: "vistana" },
  ],
  ignorados: [], reglas: REGLAS_DEFAULT,
  resumen: { total: 3, sinConfigurar: 0, sinSalario: 0, conMarcaciones: 3, bajas: 0, servicioProfesional: 0, noMarcaReloj: 0 },
  faltaMigracion: false, avisoMigracion: null, avisoMigracionBajas: null, puedeDarDeBaja: true, avisoBajas: null,
  avisoMigracionServicioProfesional: null, puedeMarcarServicioProfesional: true,
};

async function abrirColaboradores(esperar: RegExp = /Alejandra Camaño/) {
  servir([["/api/asistencia/configuracion", DATOS_CONFIG], ["/api/asistencia/vacaciones", { saldos: [] }]]);
  montar(<ConfiguracionTab personaEnElCentro />);
  await screen.findAllByText(esperar);
}

describe("🔴 Colaboradores: el buscador de las 42 filas", () => {
  it("escribir un nombre deja SOLO a esa persona", async () => {
    await abrirColaboradores();
    teclear("andrea");
    await waitFor(() => expect(screen.queryAllByText(/Alejandra Camaño/).length).toBe(0));
    expect(screen.getAllByText(/Andrea Perez/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Julio Montero/).length).toBe(0);
  });

  it("y un código también", async () => {
    await abrirColaboradores();
    teclear("303");
    await waitFor(() => expect(screen.getAllByText(/Julio Montero/).length).toBeGreaterThan(0));
    expect(screen.queryAllByText(/Andrea Perez/).length).toBe(0);
  });

  it("dice «N de M colaboradores» — el conteo no se escribe a mano", async () => {
    await abrirColaboradores();
    teclear("andrea");
    await waitFor(() => expect(screen.getByTestId("conteo-busqueda").textContent).toBe("1 de 3 colaboradores"));
  });

  it("🔴 el texto viaja en la URL con `buscar=`", async () => {
    await abrirColaboradores();
    teclear("andrea");
    await waitFor(() => expect(RUTAS.some((r) => r.includes(`${PARAM_BUSCAR}=andrea`))).toBe(true));
  });

  it("🔴 y un enlace compartido llega YA filtrado", async () => {
    URL_ACTUAL = `${PARAM_BUSCAR}=julio`;
    await abrirColaboradores(/Julio Montero/);
    expect(screen.getAllByText(/Julio Montero/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Andrea Perez/).length).toBe(0);
  });

  it("sin resultados se DICE con palabras, y se ofrece la salida", async () => {
    await abrirColaboradores();
    teclear("zzzz");
    await waitFor(() => expect(screen.getByText(new RegExp(VACIO_BUSQUEDA))).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: LIMPIAR_BUSQUEDA }));
    await waitFor(() => expect(screen.getAllByText(/Andrea Perez/).length).toBeGreaterThan(0));
  });

  it("el campo tiene su `aria-label`: el placeholder se va al escribir", async () => {
    await abrirColaboradores();
    expect(buscador().getAttribute("aria-label")).toBe("Buscar colaborador por nombre o código");
    expect(String(buscador().className)).toContain("min-h-[44px]");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. PLANILLA — el buscador NO toca la plata
// ═════════════════════════════════════════════════════════════════════════════

const Q = quincena(2026, 8, 1);
const linea = (over: Partial<LineaPlanilla>): LineaPlanilla => ({
  codigo: "0", etiqueta: "—", nombre: null, empresa: "vistana",
  empresaEtiqueta: "Vistana International", salarioMensual: 800, jornadaSemanal: 40,
  horas: { ...HORAS_CERO }, faltaConfigurar: [], fueraDePlanilla: false, pagaSeguros: true,
  decidirAMano: null, quincenalReferencia: null, dinero: null,
  manuales: { ...MANUALES_CERO }, ...over,
});
const dineroDe = (neto: number) => ({
  rataHora: 4.62, valorMinuto: 0.077, salarioQuincenal: neto,
  extraDiurno: 0, extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0,
  ausencias: 0, ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 0, vacacionesYaPagadas: 0,
  tardanzas: 0, totalBruto: neto, seguroSocial: 0, seguroEducativo: 0, isr: 0,
  prestamo: 0, terceros: 0, mercancia: 0, totalDeducciones: 0, otrosServicios: 0, netoPagar: neto,
});
const RESPUESTA_PLANILLA = {
  quincena: Q, periodo: periodoDeQuincena(Q), empresa: "vistana", empresaEtiqueta: "Vistana International",
  lineas: [
    linea({ codigo: "22", etiqueta: "ALEJANDRA CAMAÑO", dinero: dineroDe(300) }),
    linea({ codigo: "16", etiqueta: "ANDREA PEREZ", dinero: dineroDe(400) }),
    linea({ codigo: "303", etiqueta: "JULIO MONTERO", dinero: dineroDe(500) }),
  ],
  totales: { ...TOTALES_CERO, ...dineroDe(1200), personas: 3 },
  reglas: REGLAS_DEFAULT,
  avisos: {
    faltaMigracionConfiguracion: null, faltaMigracionManual: null, faltaMigracionBajas: null,
    faltaMigracionServicioProfesional: null, faltaMigracionVacaciones: null,
    fueraPorBaja: 0, marcoDespuesDeIrse: 0, sinHorario: 0, salidaAsumida: "17:00",
    horasAusenciaDefault: 8, conSabado: 0, periodoAbierto: null, sinFicha: [], avisoSinFicha: null,
    rangoLibre: false, factorBase: 1, diasCalendario: 15, correcciones: 0,
    vacacionesNoPagadas: [], avisoVacacionesNoPagadas: null,
  },
  marcaciones: 100,
};

async function abrirPlanilla() {
  servir([["/api/asistencia/planilla", RESPUESTA_PLANILLA]]);
  montar(<PlanillaTab />);
  fireEvent.click(screen.getAllByRole("button", { name: /Elige el período/ })[0]);
  fireEvent.click(screen.getAllByRole("button", { name: /^Generar$/ })[0]);
  await screen.findAllByText(/Andrea Perez/);
}

describe("🔴 Planilla: el buscador tacha renglones y NADA MÁS", () => {
  it("filtra las filas de la tabla", async () => {
    await abrirPlanilla();
    teclear("andrea");
    await waitFor(() => expect(screen.queryAllByText(/Julio Montero/).length).toBe(0));
    expect(screen.getAllByText(/Andrea Perez/).length).toBeGreaterThan(0);
  });

  it("🔴 EL TOTAL NO CAMBIA: sigue siendo el de la quincena entera", async () => {
    await abrirPlanilla();
    const antes = screen.getAllByText(/TOTAL · 3 colaboradores/).length;
    expect(antes).toBeGreaterThan(0);
    teclear("andrea");
    await waitFor(() => expect(screen.queryAllByText(/Julio Montero/).length).toBe(0));
    // Ni el número de personas ni el neto se mueven.
    expect(screen.getAllByText(/TOTAL · 3 colaboradores/).length).toBe(antes);
    expect(document.body.textContent).toContain("1,200.00");
  });

  it("🔴 y la pantalla lo DICE, para que nadie lea el pie como un subtotal", async () => {
    await abrirPlanilla();
    teclear("andrea");
    await waitFor(() =>
      expect(screen.getByText(/El total de abajo y lo que se descarga siguen siendo la quincena completa/)).toBeTruthy(),
    );
  });

  it("🔴 EL EXCEL SALE COMPLETO aunque en pantalla quede una sola fila", async () => {
    await abrirPlanilla();
    teclear("andrea");
    await waitFor(() => expect(screen.queryAllByText(/Julio Montero/).length).toBe(0));
    fireEvent.click(screen.getByRole("button", { name: /Descargar/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Excel" }));
    await waitFor(() => expect(excelRecibio).toHaveBeenCalled());
    const arg = excelRecibio.mock.calls[0][0] as { lineas: unknown[]; totales: { personas: number } };
    expect(arg.lineas).toHaveLength(3);
    expect(arg.totales.personas).toBe(3);
  });

  it("🔴 Y EL PDF TAMBIÉN", async () => {
    await abrirPlanilla();
    teclear("andrea");
    await waitFor(() => expect(screen.queryAllByText(/Julio Montero/).length).toBe(0));
    fireEvent.click(screen.getByRole("button", { name: /Descargar/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "PDF" }));
    await waitFor(() => expect(pdfRecibio).toHaveBeenCalled());
    expect((pdfRecibio.mock.calls[0][0] as { lineas: unknown[] }).lineas).toHaveLength(3);
  });

  it("sin resultados lo dice, y el total sigue ahí", async () => {
    await abrirPlanilla();
    teclear("zzzz");
    await waitFor(() => expect(screen.getByText(new RegExp(VACIO_BUSQUEDA))).toBeTruthy());
    expect(screen.getAllByText(/TOTAL · 3 colaboradores/).length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. PRÉSTAMOS
// ═════════════════════════════════════════════════════════════════════════════

const FICHAS = {
  puedeAnotar: true,
  fichas: [
    { id: "a", codigo: "22", nombre: "ALEJANDRA CAMAÑO", saldo: 100, saldoPrestamo: 100, saldoDano: 0, empresa: "vistana", cuota: 25, cuotaDano: 0, yaDescontado: 0 },
    { id: "b", codigo: "16", nombre: "ANDREA PEREZ", saldo: 200, saldoPrestamo: 200, saldoDano: 0, empresa: "vistana", cuota: 50, cuotaDano: 0, yaDescontado: 0 },
  ],
};

async function abrirPrestamos() {
  servir([["/api/asistencia/prestamos-deuda", FICHAS]]);
  montar(<PrestamosTab />);
  await screen.findAllByText(/Andrea Perez/);
}

describe("🔴 Préstamos: el buscador no mueve la deuda", () => {
  it("filtra la lista", async () => {
    await abrirPrestamos();
    teclear("alejandra");
    await waitFor(() => expect(screen.queryAllByText(/Andrea Perez/).length).toBe(0));
    expect(screen.getAllByText(/Alejandra Camaño/).length).toBeGreaterThan(0);
  });

  it("🔴 el TOTAL sigue siendo el de todos: $300.00 con uno solo a la vista", async () => {
    await abrirPrestamos();
    teclear("alejandra");
    await waitFor(() => expect(screen.queryAllByText(/Andrea Perez/).length).toBe(0));
    expect(document.body.textContent).toContain("$300.00");
    expect(document.body.textContent).toContain("2 colaboradores con deuda");
  });

  it("sin resultados lo dice y ofrece volver", async () => {
    await abrirPrestamos();
    teclear("zzzz");
    await waitFor(() => expect(screen.getByText(new RegExp(VACIO_BUSQUEDA))).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: LIMPIAR_BUSQUEDA }));
    await waitFor(() => expect(screen.getAllByText(/Andrea Perez/).length).toBeGreaterThan(0));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. APROBACIONES › COLABORADOR
// ═════════════════════════════════════════════════════════════════════════════

const diaAprob = (fecha: string, etiqueta: string, gente: Array<{ codigo: string; etiqueta: string; minutos: number }>) => ({
  fecha, etiqueta, semana: "2026-08-03", minutos: gente.reduce((a, g) => a + g.minutos, 0),
  gente: gente.map((g) => ({
    codigo: g.codigo, etiqueta: g.etiqueta, empresa: "vistana", empresaEtiqueta: "Vistana International",
    minutos: g.minutos, tipo: "diurna", salida: null, decision: null, por: null, cuando: null,
    minutosVistos: null, cambio: false,
  })),
});

const APROBACIONES = {
  puedeAprobar: true,
  avisos: { faltaMigracionAprobaciones: null, faltaMigracionAprobador: null },
  aprobaciones: [
    diaAprob("2026-08-05", "mié 5 ago", [
      { codigo: "22", etiqueta: "ALEJANDRA CAMAÑO", minutos: 60 },
      { codigo: "16", etiqueta: "ANDREA PEREZ", minutos: 120 },
    ]),
  ],
};

async function abrirAprobaciones(llamadas?: Array<{ url: string; body: unknown }>) {
  servir([["/api/asistencia/planilla", APROBACIONES], ["/api/asistencia/aprobaciones", { ok: true }]], llamadas);
  montar(<AprobacionesTab />);
  await screen.findAllByText(/ALEJANDRA CAMAÑO|Alejandra Camaño/i);
}

describe("🔴 Aprobaciones › Colaborador: el buscador no decide por nadie", () => {
  it("filtra los renglones de personas", async () => {
    await abrirAprobaciones();
    teclear("andrea");
    await waitFor(() => expect(screen.queryAllByText(/Alejandra Camaño/i).length).toBe(0));
    expect(screen.getAllByText(/Andrea Perez/i).length).toBeGreaterThan(0);
  });

  it("🔴 el contador «por decidir» sigue contando A TODOS", async () => {
    await abrirAprobaciones();
    teclear("andrea");
    await waitFor(() => expect(screen.queryAllByText(/Alejandra Camaño/i).length).toBe(0));
    expect(screen.getByTestId("por-decidir").textContent).toContain("2");
  });

  it("🔴 «Sí a todo lo pendiente» manda LAS DOS personas, no solo la filtrada", async () => {
    const llamadas: Array<{ url: string; body: unknown }> = [];
    await abrirAprobaciones(llamadas);
    teclear("andrea");
    await waitFor(() => expect(screen.queryAllByText(/Alejandra Camaño/i).length).toBe(0));
    fireEvent.click(screen.getByRole("button", { name: /Sí a todo lo pendiente/ }));
    await waitFor(() => expect(llamadas.some((l) => l.url.includes("/api/asistencia/aprobaciones"))).toBe(true));
    const post = llamadas.find((l) => l.url.includes("/api/asistencia/aprobaciones"))!;
    const dias = (post.body as { dias: Array<{ codigo: string }> }).dias;
    expect(dias.map((d) => d.codigo).sort()).toEqual(["16", "22"]);
  });

  it("sin resultados lo dice, sin apagar el botón de arriba", async () => {
    await abrirAprobaciones();
    teclear("zzzz");
    await waitFor(() => expect(screen.getByText(new RegExp(VACIO_BUSQUEDA))).toBeTruthy());
    expect((screen.getByRole("button", { name: /Sí a todo lo pendiente/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
