/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PODA DE TEXTOS DE ASISTENCIA — el candado de que "pasar a ⓘ" no fue borrar.
 *
 * 🔴 EL RIESGO QUE ESTE ARCHIVO EXISTE PARA CAZAR. Asistencia concentraba 47
 * textos explicativos, el 25% de toda la prosa del sistema. Al podarlos, la
 * metodología —la fórmula del neto, qué son las horas del mes, los minutos de
 * gracia, cómo se arma la quincena— pasó detrás de un ⓘ que se toca. Que el
 * archivo COMPILE no prueba nada: un `<Ayuda>` sin contenido, un ⓘ que nunca
 * se pinta o un texto que se quedó en un comentario compilan igual de bien y
 * dejan a la contable sin la explicación para siempre.
 *
 * Por eso acá se RENDERIZA cada pestaña de verdad y se TOCA el ⓘ:
 *
 *   1. cerrado, el texto NO está en pantalla  (si estuviera, no se podó nada)
 *   2. al tocarlo, el texto APARECE           (si no, se borró con otro nombre)
 *
 * Y el otro lado, que pesa más: 🔴 LOS AVISOS NO SE ESCONDEN. Todo lo que
 * cambia una decisión —sobre todo lo de PLATA— tiene que seguir visible SIN
 * tocar nada: días sin las 4 marcas, gente que quedó fuera del total, la
 * salida que se asume, el reloj que no recogió el pedido, la baja que sigue
 * marcando y los avisos de migración pendiente. Un aviso detrás de un toque es
 * exactamente igual que un aviso borrado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";

import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { FORMULA_NETO } from "@/lib/asistencia/planilla";

import HorariosTab from "@/app/asistencia/HorariosTab";
import FeriadosTab from "@/app/asistencia/FeriadosTab";
import JustificacionesTab from "@/app/asistencia/JustificacionesTab";
import ReporteTab from "@/app/asistencia/ReporteTab";
import PlanillaTab from "@/app/asistencia/PlanillaTab";
import ConfiguracionTab from "@/app/asistencia/ConfiguracionTab";

// ─────────────────────────────────────────────────────────────────────────────
// Arnés: un `fetch` que responde por URL. Cada pestaña consulta al montarse.

type Respuestas = Array<[string, unknown]>;

function servir(respuestas: Respuestas) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      const par = respuestas.find(([frag]) => u.includes(frag));
      return {
        ok: true,
        json: async () => par?.[1] ?? {},
      } as Response;
    }),
  );
}

function montar(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

/** Toca el ⓘ cuyo nombre accesible es `titulo`. */
function abrirAyuda(titulo: string) {
  fireEvent.click(screen.getByRole("button", { name: titulo }));
}

/**
 * El contrato de la poda, verificado sobre la pantalla ya montada:
 * cerrado no está, tocado aparece.
 */
function esperaDetrasDelInfo(titulo: string, texto: RegExp) {
  expect(screen.queryByText(texto)).toBeNull();
  abrirAyuda(titulo);
  expect(screen.getByText(texto)).toBeTruthy();
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Horarios — el porqué pasó al ⓘ; lo que hay que confirmar se queda", () => {
  const datos = {
    sinConfirmar: 3,
    personas: [
      {
        codigo: "6", nombre: "Ángela García", configurado: true,
        salida: "16:30", almuerzoMinutos: 30, guardado: false,
        sugerida: "17:04", diasMedidos: 11,
      },
    ],
  };

  it("«manda sobre lo que diga el reloj» sigue alcanzable de un toque", async () => {
    servir([["/api/asistencia/horarios", datos]]);
    montar(<HorariosTab />);
    await screen.findByText(/Ángela García/);
    esperaDetrasDelInfo(
      "De dónde sale la hora sugerida",
      /Lo que fijes acá manda sobre lo que diga el reloj/,
    );
  });

  it("🔴 «N sin confirmar» NO se esconde: pide que alguien las fije", async () => {
    servir([["/api/asistencia/horarios", datos]]);
    montar(<HorariosTab />);
    expect(await screen.findByText(/sin confirmar\. Están usando la sugerencia/)).toBeTruthy();
  });

  it("🔴 la sugerencia por persona sigue en la fila, sin tocar nada", async () => {
    servir([["/api/asistencia/horarios", datos]]);
    montar(<HorariosTab />);
    expect(await screen.findByText(/Sugerido · sale 17:04 en 11 días/)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Feriados", () => {
  it("para qué sirven queda en el ⓘ", async () => {
    servir([["/api/asistencia/feriados", { feriados: [{ fecha: "2026-11-03", nombre: "Separación de Colombia" }] }]]);
    montar(<FeriadosTab />);
    await screen.findByText("Separación de Colombia");
    esperaDetrasDelInfo("Para qué sirven los feriados", /Los feriados de Panamá ya/);
  });

  it("el empty state genérico se fue — no describía nada que no se viera", async () => {
    servir([["/api/asistencia/feriados", { feriados: [] }]]);
    montar(<FeriadosTab />);
    await waitFor(() => expect(screen.queryByText(/Cargando/)).toBeNull());
    expect(screen.queryByText(/No hay feriados cargados/)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Justificaciones", () => {
  it("cuándo cargarlas queda en el ⓘ", async () => {
    servir([[
      "/api/asistencia/justificaciones",
      { justificaciones: [], motivos: ["Vacaciones"], personas: [] },
    ]]);
    montar(<JustificacionesTab />);
    await screen.findByRole("button", { name: "Cuándo cargar una justificación" });
    esperaDetrasDelInfo("Cuándo cargar una justificación", /Márcalas el día que pasan/);
  });

  it("🔴 el aviso del rango («se guarda como una sola») NO es metodología: se queda", async () => {
    servir([[
      "/api/asistencia/justificaciones",
      { justificaciones: [], motivos: ["Vacaciones"], personas: [] },
    ]]);
    montar(<JustificacionesTab />);
    const hoy = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
    const fechas = await screen.findAllByDisplayValue(hoy);
    fireEvent.change(fechas[1], { target: { value: "2030-01-05" } }); // «Hasta»
    expect(screen.getByText(/se guarda como una sola/)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Reporte — la metodología al ⓘ, el estado del reloj en pantalla", () => {
  const persona = {
    codigo: "6", nombre: "Ángela García", salida: "16:30",
    resumen: {
      diasTrabajados: 10, ausenciasSinJustificar: 0, vecesTarde: 2, minutosTarde: 30,
      minutosTardeDeDiasARevisar: 25, excesoAlmuerzoMin: 0, salidaTempranaMin: 0,
      tiempoNoTrabajadoMin: 30, extraMin: 0, diasARevisar: 2,
    },
    dias: [],
  };
  const base: Respuestas = [
    ["/api/asistencia/reloj", {
      relojes: [{
        dispositivo: "reloj cboston", salud: "callado",
        titulo: "El reloj lleva 3 horas sin mandar nada", detalle: null,
        pedidoPendiente: false, pedidoSinRespuesta: true, leidoHasta: null,
      }],
    }],
    ["/api/asistencia/reporte", { personas: [persona], sinHorario: 4, reglas: REGLAS_DEFAULT }],
  ];

  it("«todo en minutos / qué es a revisar» queda detrás del ⓘ", async () => {
    servir(base);
    montar(<ReporteTab />);
    await screen.findByText(/Ángela García/);
    expect(screen.queryByText(/Todo en minutos/)).toBeNull();
    abrirAyuda("Cómo se leen estos números");
    expect(screen.getByText(/Todo en minutos/)).toBeTruthy();
    // 🔴 Dice "TERMINADO" desde el 13-ago-2026, y no es un adorno: es la
    // diferencia entre un día mal marcado y un día que sigue corriendo. Sin esa
    // palabra, el ⓘ contradice lo que la tabla hace.
    expect(screen.getByText(/es un día TERMINADO sin las 4 marcas/)).toBeTruthy();
    // El texto va partido por un <b>hoy</b>, así que se busca el trozo que vive
    // entero en un solo nodo.
    expect(screen.getByText(/nunca entra ahí/)).toBeTruthy();
  });

  it("🔴 «se asume 5:00 p.m.» sigue en pantalla — es plata", async () => {
    servir(base);
    montar(<ReporteTab />);
    expect(await screen.findByText(/Mientras tanto se asume 5:00 p\.m\./)).toBeTruthy();
  });

  it("🔴 el reloj que no recogió el pedido se ve sin tocar nada", async () => {
    servir(base);
    montar(<ReporteTab />);
    expect(
      await screen.findByText(/La PC de la oficina no ha recogido el pedido/),
    ).toBeTruthy();
  });

  it("🔴 «de los N tarde, M vienen de días sin las 4 marcas» se queda al abrir la fila", async () => {
    servir(base);
    montar(<ReporteTab />);
    fireEvent.click(await screen.findByText(/Ángela García/));
    expect(screen.getByText(/vienen/)).toBeTruthy();
    expect(screen.getByText(/Míralos antes de descontar/)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Planilla — la fórmula al ⓘ, los avisos de plata en pantalla", () => {
  const dinero = {
    rataHora: 3.02, salarioQuincenal: 300, extraDiurno: 0, ausencias: 0, tardanzas: 0,
    extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0, totalBruto: 300,
    seguroSocial: 0, seguroEducativo: 0, totalDeducciones: 0, otrosServicios: 0,
    netoPagar: 300,
  };
  const horas = {
    extraDiurnoMin: 0, extraNocturnoMin: 0, excedenteMin: 0, domingoMin: 0, feriadoMin: 0,
    ausenciaMin: 0, ausenciaDias: 0, tardanzaMin: 40, tardanzaDeDiasARevisarMin: 25,
    diasARevisar: 2, sabadoMin: 0,
  };
  const manuales = { isr: 0, prestamo: 0, terceros: 0, mercancia: 0, otrosServicios: 0 };

  const respuesta = {
    quincena: { clave: "2026-08-1", etiqueta: "1 al 15 de agosto", desde: "2026-08-01", hasta: "2026-08-15" },
    empresa: "vistana", empresaEtiqueta: "Vistana",
    lineas: [
      { codigo: "6", etiqueta: "Ángela García", dinero, horas, manuales, faltaConfigurar: [] },
      { codigo: "49", etiqueta: "Código 49", dinero: null, horas, manuales, faltaConfigurar: ["el salario"] },
    ],
    totales: {
      personas: 1, salarioQuincenal: 300, extraDiurno: 0, ausencias: 0, tardanzas: 0,
      extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0, totalBruto: 300,
      seguroSocial: 0, seguroEducativo: 0, isr: 0, prestamo: 0, terceros: 0, mercancia: 0,
      totalDeducciones: 0, otrosServicios: 0, netoPagar: 300,
    },
    reglas: REGLAS_DEFAULT,
    avisos: {
      faltaMigracionConfiguracion: null,
      faltaMigracionManual: "Falta correr el archivo de la base de datos para guardar los montos a mano.",
      faltaMigracionBajas: null,
      fueraPorBaja: 0, marcoDespuesDeIrse: 1, sinHorario: 4,
      salidaAsumida: "5:00 p.m.", horasAusenciaDefault: 8, conSabado: 1,
    },
  };

  it("la fórmula del neto queda detrás del ⓘ, entera", async () => {
    servir([["/api/asistencia/planilla", respuesta]]);
    montar(<PlanillaTab />);
    await screen.findAllByText(/Ángela García/);
    // Se compara contra la CONSTANTE de `lib/asistencia/planilla.ts`: si algún
    // día la fórmula cambia, la que se enseña cambia con ella y no queda una
    // segunda redacción viviendo en la pantalla.
    expect(document.body.textContent).not.toContain(FORMULA_NETO);
    abrirAyuda("Cómo se calcula el neto");
    expect(screen.getByRole("dialog").textContent).toContain(FORMULA_NETO);
    expect(screen.getByText(/se escriben a mano acá/)).toBeTruthy();
  });

  it("🔴 los 5 avisos de plata siguen en pantalla, sin tocar nada", async () => {
    servir([["/api/asistencia/planilla", respuesta]]);
    montar(<PlanillaTab />);
    await screen.findAllByText(/Ángela García/);
    // migración pendiente (patrón cols-opcionales)
    expect(screen.getByText(/Falta correr el archivo de la base de datos/)).toBeTruthy();
    // dada de baja y sigue marcando
    expect(screen.getByText(/alguien más está usando su huella/)).toBeTruthy();
    // se asume la salida
    expect(screen.getByText(/su hora de/)).toBeTruthy();
    // sábado que no se paga acá
    expect(screen.getByText(/no se pagan acá/)).toBeTruthy();
    // quedó fuera del total, NO vale $0
    expect(screen.getByText(/fuera del total/)).toBeTruthy();
  });

  it("🔴 «N días sin las 4 marcas — míralos antes de descontar» se queda en la tarjeta", async () => {
    servir([["/api/asistencia/planilla", respuesta]]);
    montar(<PlanillaTab />);
    const tarjeta = await screen.findByRole("button", { name: /ver detalle/ });
    fireEvent.click(tarjeta);
    expect(screen.getByText(/Míralos antes de descontar/)).toBeTruthy();
  });

  it("cada monto a mano sigue diciendo para qué lado va (suma / resta)", async () => {
    servir([["/api/asistencia/planilla", respuesta]]);
    montar(<PlanillaTab />);
    fireEvent.click(await screen.findByRole("button", { name: /ver detalle/ }));
    expect(screen.getAllByText("(resta)").length).toBe(4);
    expect(screen.getAllByText("(suma)").length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Configuración — metodología al ⓘ, pendientes y bajas en pantalla", () => {
  const activo = {
    codigo: "6", nombre: "Ángela García", salarioMensual: 850, jornadaSemanal: 48,
    empresa: "vistana", configurado: true, faltaSalario: false, marcaciones: 120,
    ultimaMarca: "2026-08-09", rataHora: 4.09, valorMinuto: 0.07,
    fechaIngreso: null, fechaSalida: null, motivoSalida: null,
    activo: true, baja: null, marcoDespuesDeLaBaja: false,
  };
  const baja = {
    ...activo, codigo: "12", nombre: "Luis Pérez", activo: false,
    fechaSalida: "2026-07-31", motivoSalida: "renuncia",
    baja: "Renunció el 31 de julio de 2026", marcoDespuesDeLaBaja: false,
  };
  const datos = {
    personas: [activo, baja],
    reglas: REGLAS_DEFAULT,
    resumen: { total: 1, sinConfigurar: 2, sinSalario: 1, conMarcaciones: 2, bajas: 1 },
    faltaMigracion: false,
    avisoMigracion: null,
    avisoMigracionBajas: "Falta correr el archivo de la base de datos de las bajas.",
    puedeDarDeBaja: true,
    avisoBajas: {
      titulo: "1 persona dada de baja siguió marcando",
      detalle: ["Luis Pérez marcó el 2 de agosto"],
    },
  };

  /** Monta la pestaña y espera a que llegue la lista. El nombre aparece dos
   *  veces a propósito (la fila del escritorio y la tarjeta del celular). */
  async function abrirConfiguracion() {
    servir([["/api/asistencia/configuracion", datos]]);
    montar(<ConfiguracionTab />);
    await screen.findAllByText(/Ángela García/);
  }

  /** Abre la ficha de la persona: es el botón que despliega su fila. */
  function abrirFicha() {
    fireEvent.click(screen.getAllByRole("button", { name: /Ángela García/ })[0]);
  }

  it("cómo se llena la lista de personas queda detrás del ⓘ", async () => {
    await abrirConfiguracion();
    esperaDetrasDelInfo("Cómo se llena esta lista", /El reloj solo manda un número por persona/);
  });

  it("🔴 el aviso de pendientes y el ROJO de «se dio de baja y sigue marcando» NO se esconden", async () => {
    await abrirConfiguracion();
    expect(screen.getByText(/todavía no salen en la planilla/)).toBeTruthy();
    expect(screen.getByText(/1 persona dada de baja siguió marcando/)).toBeTruthy();
    expect(screen.getByText(/Falta correr el archivo de la base de datos de las bajas/)).toBeTruthy();
  });

  it("«el sueldo de la quincena no se reparte por días» sigue alcanzable en la ficha", async () => {
    await abrirConfiguracion();
    abrirFicha();
    esperaDetrasDelInfo(
      "Empezó a trabajar",
      /El sueldo de la quincena no se reparte por días/,
    );
  });

  it("«déjalo vacío si no lo sabes» pasó al propio campo del salario", async () => {
    await abrirConfiguracion();
    abrirFicha();
    expect(screen.getByPlaceholderText(/vacío si no lo sabes/)).toBeTruthy();
  });

  it("qué pasa al dar de baja, y por qué se guarda el motivo, quedan detrás de su ⓘ", async () => {
    await abrirConfiguracion();
    abrirFicha();
    esperaDetrasDelInfo(
      "Qué pasa al dar de baja",
      /Sigue apareciendo entera en las quincenas en que trabajó/,
    );
    esperaDetrasDelInfo(
      "¿Por qué salió?",
      /La planilla se calcula igual en los tres casos/,
    );
  });

  it("🩸 «el salario mensual se divide entre estas horas» — el texto que costó la confusión de «Divisores» — sigue vivo", async () => {
    await abrirConfiguracion();
    fireEvent.click(screen.getByText("Reglas del cálculo"));
    // La ETIQUETA que reemplazó a «Divisores» sigue a la vista, sin tocar nada.
    expect(screen.getByText("Horas que se trabajan al mes")).toBeTruthy();
    esperaDetrasDelInfo(
      "Horas que se trabajan al mes",
      /El salario mensual se divide entre estas horas/,
    );
  });

  it("las ayudas de los campos de reglas siguen alcanzables una por una", async () => {
    await abrirConfiguracion();
    fireEvent.click(screen.getByText("Reglas del cálculo"));
    const casos: Array<[string, RegExp]> = [
      ["Tolerancia de tardanza", /Minutos de gracia a la entrada/],
      ["Mínimo para contar hora extra", /Quedarse menos de esto no cuenta como extra/],
      ["Hora extra de día", /1\.25 es la hora y cuarto/],
      ["Hora extra de noche", /Aplica pasada la hora de corte/],
      ["Hora de corte de la tarde", /la misma frontera que marca la jornada nocturna/],
      ["40 horas por semana", /Total de horas al mes de quien trabaja 40/],
      ["48 horas por semana", /Total de horas al mes de quien trabaja 48/],
      ["Desde cuántas horas extra al día", /aplica desde la cuarta hora extra/],
      ["Recargo del excedente", /2\.625, que es 1\.5 × 1\.75/],
    ];
    for (const [titulo, texto] of casos) esperaDetrasDelInfo(titulo, texto);
  });

  it("🔴 «se guarda pero TODAVÍA NO SE USA» sigue en pantalla y en ámbar — es una advertencia, no metodología", async () => {
    await abrirConfiguracion();
    fireEvent.click(screen.getByText("Reglas del cálculo"));
    const nota = screen.getByText(/TODAVÍA NO SE USA/);
    expect(nota.className).toContain("text-amber-800");
  });

  it("las reglas que no se pueden cambiar siguen a la vista; solo el porqué pasó al ⓘ", async () => {
    await abrirConfiguracion();
    fireEvent.click(screen.getByText("Reglas del cálculo"));
    expect(screen.getByText(/La quincena va del 1 al 15 y del 16 al 30/)).toBeTruthy();
    // 🔴 El almuerzo pasó de ser una CASILLA a ser una regla declarada: es lo
    // que impide que vuelva a haber dos lugares diciendo cuánto dura.
    expect(screen.getByText(/El almuerzo es de 30 minutos, igual para todos/)).toBeTruthy();
    expect(screen.queryByText("Almuerzo por defecto")).toBeNull();
    esperaDetrasDelInfo("Por qué no se pueden cambiar", /es la forma del cálculo/);
  });

  it("el empty state genérico del filtro se fue", async () => {
    await abrirConfiguracion();
    fireEvent.click(screen.getByText(/^Falta configurar \(/));
    expect(screen.queryByText(/No hay nadie en este filtro/)).toBeNull();
  });

  it("🔴 la lista de «ya no trabajan acá» conserva el nombre, el motivo y el botón de reactivar", async () => {
    await abrirConfiguracion();
    const detalle = screen.getByText(/Ya no trabajan acá/).closest("details")!;
    expect(within(detalle).getByText(/Renunció el 31 de julio de 2026/)).toBeTruthy();
    expect(within(detalle).getByRole("button", { name: "Volvió a trabajar acá" })).toBeTruthy();
    esperaDetrasDelInfo(
      "Qué pasa con quien ya no trabaja acá",
      /Sigue apareciendo entera en las quincenas en que trabajó/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Barrido estático: lo que se PODÓ no puede volver como párrafo suelto, y el
// componente de la casa es el único ⓘ (nada de un desplegable escrito a mano).

const RAIZ = join(process.cwd(), "src/app/asistencia");
const leer = (f: string) => readFileSync(join(RAIZ, f), "utf8");

describe("candado del barrido", () => {
  const ARCHIVOS = [
    "ConfiguracionTab.tsx", "HorariosTab.tsx", "FeriadosTab.tsx",
    "JustificacionesTab.tsx", "PlanillaTab.tsx", "ReporteTab.tsx",
    "ComoFuncionaTab.tsx",
  ];

  it("los textos de clase 3 no vuelven", () => {
    const todo = ARCHIVOS.map(leer).join("\n");
    for (const muerto of [
      "No hay nadie en este filtro",
      "No hay feriados cargados",
      "En por ciento",
      "También es un factor",
      "pegarlo al lado del reloj",
    ]) {
      expect(todo).not.toContain(muerto);
    }
  });

  it("el ⓘ es SIEMPRE el componente compartido — nunca uno escrito a mano", () => {
    for (const f of ARCHIVOS) {
      const src = leer(f);
      if (!src.includes("<Ayuda")) continue;
      expect(src).toContain('from "@/components/shared/Ayuda"');
    }
  });

  it("ComoFuncionaTab NO se vació: sigue siendo el destino, no el origen", () => {
    const src = leer("ComoFuncionaTab.tsx");
    // Las 7 reglas, de dónde salen los datos, la quincena y el antes de descontar.
    expect(src).toContain("Se marca 4 veces al día");
    expect(src).toContain("De dónde salen los datos");
    expect(src).toContain("Cómo sale la planilla quincenal");
    expect(src).toContain("Antes de descontarle a alguien");
    // Y no gana un ⓘ propio: la pestaña ENTERA ya es el ⓘ del módulo.
    expect(src).not.toContain("<Ayuda");
  });
});
