/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 EN LA PANTALLA: LAS MARCAS SE VEN TODAS, Y LA QUE SOBRA SE QUITA
 * (18-sep-2026)
 *
 * La contadora, 17-sep-2026: *«el motivo de que no me deja cerrar es porque hay
 * marcaciones de mas y no me deja eliminar»*. Y al día siguiente: *«y como veo
 * quien marco de mas? en el excel solo salen max 4 marcaciones el excel que
 * descargo»*. Daniel: *«las marcaciones del reloj, no las del app que hicimos»*
 * y *«las quincena solo cierran con 4, hay q quitar hasta que llegue a 4
 * maximo. cuando hay 5 o mas es porq es error»*.
 *
 * 🔴 POR QUÉ SE RENDERIZA Y NO SE PRUEBA LA FUNCIÓN PURA SOLA: que
 * `marcasEscondidas(5)` devuelva `[3]` no prueba que la fila del día dibuje las
 * cinco horas. Lo que se sostiene acá es lo que ella ve.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";

vi.hoisted(() => { process.env.NEXT_PUBLIC_PERSONA_EN_EL_CENTRO = "1"; });

let URL_ACTUAL = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(URL_ACTUAL),
}));

import ReporteTab from "@/app/asistencia/ReporteTab";
import CorregirMarcacionModal from "@/app/asistencia/CorregirMarcacionModal";

// ── El arnés ─────────────────────────────────────────────────────────────────

const PEDIDOS: Array<{ url: string; init?: RequestInit }> = [];
function servir(respuestas: Array<[string, unknown]>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    PEDIDOS.push({ url: String(url), init });
    const par = respuestas.find(([frag]) => String(url).includes(frag));
    return { ok: true, json: async () => par?.[1] ?? {} } as Response;
  }));
}
const montar = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

/** El día real de Ramón Miranda (21), 26-ago-2026: la 4.ª no se veía. */
const CINCO = ["08:10:21", "13:58:34", "14:23:38", "14:23:39", "18:00:50"];
const CUATRO = ["08:04:08", "12:06:59", "12:39:52", "16:37:50"];

const dia = (over: Record<string, unknown>) => ({
  fecha: "2026-08-26", marcas: [] as string[], marcasIds: [] as Array<string | null>,
  repetidas: [] as Array<{ hora: string; despuesDe: string; segundosDespues: number; id: string | null }>,
  entrada: null, salida: null,
  tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
  revisar: false, salidaSospechosa: false, enCurso: false, fueraDeVigencia: false,
  ausente: false, vacacion: null, justificado: null, permiso: null, permisoRango: null,
  permisoPerdonaMin: 0, permisoPerdonaSalidaMin: 0, permisoPerdonaAlmuerzoMin: 0,
  feriado: null, habil: true, correcciones: [],
  ...over,
});

const resumen = (over: Record<string, unknown> = {}) => ({
  diasTrabajados: 1, ausenciasSinJustificar: 0, ausenciasJustificadas: 0,
  diasTrabajandoFuera: 0, diasVacaciones: 0, diasVacacionesYaPagadas: 0,
  vecesTarde: 0, minutosTarde: 0, minutosTardeDeDiasARevisar: 0,
  diasConPermiso: 0, minutosPerdonadosPorPermiso: 0,
  minutosPerdonadosTarde: 0, minutosPerdonadosSalidaTemprana: 0, minutosPerdonadosAlmuerzo: 0,
  excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, diasARevisar: 1,
  diasEnCurso: 0, tiempoNoTrabajadoMin: 0, diasCorregidos: 0, correcciones: 0,
  ...over,
});

function respuesta(marcas: string[], over: Record<string, unknown> = {}) {
  return [
    ["/api/asistencia/reloj", { relojes: [] }],
    ["/api/asistencia/reporte", {
      personas: [{
        codigo: "21", nombre: "RAMON MIRANDA", salida: "18:00", almuerzoMin: 30,
        dias: [dia({ marcas, marcasIds: marcas.map((_, i) => `m${i}`), revisar: marcas.length !== 4 })],
        resumen: resumen(),
      }],
      sinHorario: 0, sinHorarioLista: [], reglas: REGLAS_DEFAULT,
      correccionesDisponible: true, decisionesExtra: {},
      ...over,
    }],
  ] as Array<[string, unknown]>;
}

beforeEach(() => {
  URL_ACTUAL = "";
  PEDIDOS.length = 0;
  try { localStorage.clear(); } catch { /* jsdom */ }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** Abre el detalle del colaborador y devuelve su tabla de días. */
async function abrirElDetalle() {
  await waitFor(() => expect(screen.getByText(/RAMON MIRANDA|Ramon Miranda/i)).toBeTruthy());
  fireEvent.click(screen.getByText(/Ramon Miranda/i));
  await waitFor(() => expect(screen.getByText("Entrada")).toBeTruthy());
}

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 1. UN DÍA DE 5 MARCAS MUESTRA LAS CINCO", () => {
  it("🩸 la cuarta —14:23:39, la repetida— aparece en la pantalla", async () => {
    servir(respuesta(CINCO));
    montar(<ReporteTab />);
    await abrirElDetalle();
    // Las CINCO, una por una. La 14:23:39 era la invisible.
    for (const h of CINCO) expect(screen.getByText(h)).toBeTruthy();
    // 🔄 18-sep-2026, más tarde el mismo día: el chip «5 marcas» adentro de la
    // fila se fue. Rompía la grilla —Daniel: *«y aun se ve desordenado»*— y lo
    // reemplazó la línea de abajo, que además dice qué hacer.
    // 🔄 18-sep-2026, otra vez: esa línea decía «Marca de más: 14:23:39» y
    // NOMBRABA una marca elegida por POSICIÓN. En el día de Enrique Sánchez
    // (7-sep) la que sobraba era otra, la contadora quitó la que la línea
    // señalaba y el día quedó igual de mal. Daniel: *«no quiero que me
    // recomiende cuál quitar… la contable decide cómo arreglarlo»*.
    expect(screen.getByText(/El día tiene 5 marcas, y son 4 — quita la que sobra:/)).toBeTruthy();
    expect(screen.queryByText(/Marcas? de más/)).toBeNull();
  });

  it("🔴 LA PEGADA SE SEÑALA A OJO: la 14:23:39 lleva su aviso, la 14:23:38 no", async () => {
    servir(respuesta(CINCO));
    montar(<ReporteTab />);
    await abrirElDetalle();
    const pegada = screen.getByText("14:23:39");
    expect(pegada.getAttribute("title")).toContain("1 segundo después");
    expect(screen.getByText("14:23:38").getAttribute("title")).not.toContain("después");
  });

  it("⚠️ CON 4 MARCAS SE VE COMO SIEMPRE: cuatro celdas, sin el rótulo ni avisos", async () => {
    servir(respuesta(CUATRO));
    montar(<ReporteTab />);
    await abrirElDetalle();
    for (const h of CUATRO) expect(screen.getByText(h)).toBeTruthy();
    expect(screen.queryByText("4 marcas")).toBeNull();
    for (const h of CUATRO) {
      expect(screen.getByText(h).getAttribute("title")).not.toContain("después");
    }
  });

  it("🩸 con 3 marcas la del MEDIO también se ve ahora", async () => {
    servir(respuesta(["08:00:00", "12:00:00", "17:00:00"]));
    montar(<ReporteTab />);
    await abrirElDetalle();
    expect(screen.getByText("12:00:00")).toBeTruthy();
    // 🔄 18-sep-2026: con 3 marcas FALTA una, así que la línea lo dice con esas
    // palabras en vez de un chip que solo contaba.
    // 🔴 CONTROL del cambio de más tarde ese mismo día: acá el texto NO se
    // tocó. Con 3 marcas la afirmación es VERDAD —la del medio es la única que
    // puede ser la salida a almorzar o el regreso—; lo que se fue es la línea
    // que NOMBRABA cuál sobra cuando hay 5 o más.
    expect(screen.getByText(/Otra marca del día:/)).toBeTruthy();
    expect(screen.getByText(/le falta una marca/)).toBeTruthy();
  });

  it("🔴 la hora de esa línea SIGUE SIENDO UN BOTÓN: se borró media frase, no el botón", async () => {
    servir(respuesta(CINCO));
    montar(<ReporteTab />);
    await abrirElDetalle();
    // La 14:23:39 es la que baja a la línea (la que las cuatro columnas
    // escondían). Tocarla abre «Corregir o quitar esta marcación».
    const hora = screen.getByText("14:23:39");
    expect(hora.tagName).toBe("BUTTON");
  });

  it("tocar una hora ofrece corregirla O quitarla, y lo dice el título", async () => {
    servir(respuesta(CINCO));
    montar(<ReporteTab />);
    await abrirElDetalle();
    expect(screen.getByText("08:10:21").getAttribute("title")).toBe("Corregir o quitar esta marcación");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 2. LA VENTANA OFRECE «QUITAR ESTA MARCACIÓN»", () => {
  const MARCA = {
    marcacionId: "m3",
    codigo: "21",
    persona: "Ramón Miranda",
    fecha: "2026-08-26",
    relojHora: "14:23:39",
  };

  it("la tercera opción está, al lado de «Corregir la hora»", () => {
    servir([]);
    montar(<CorregirMarcacionModal marca={MARCA} onCerrar={vi.fn()} onGuardado={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Corregir la hora" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quitar esta marcación" })).toBeTruthy();
  });

  it("⚠️ NO se ofrece al AGREGAR una marcación: no hay nada que quitar", () => {
    servir([]);
    montar(
      <CorregirMarcacionModal
        marca={{ ...MARCA, marcacionId: null, relojHora: null }}
        onCerrar={vi.fn()} onGuardado={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Quitar esta marcación" })).toBeNull();
  });

  it("🔴 al elegirla se va la hora, queda el PORQUÉ, y dice qué va a pasar", () => {
    servir([]);
    montar(<CorregirMarcacionModal marca={MARCA} onCerrar={vi.fn()} onGuardado={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Quitar esta marcación" }));
    expect(screen.getByText("Quitar esta marcación", { selector: "h2" })).toBeTruthy();
    expect(document.querySelector('input[type="time"]')).toBeNull();
    expect(screen.getByPlaceholderText("Escribe el motivo…")).toBeTruthy();
    // 🔴 «Quitada», nunca «borrada»: la fila del reloj se queda.
    expect(screen.getByText(/No se borra nada/)).toBeTruthy();
    expect(screen.getByText(/deja de contar/)).toBeTruthy();
  });

  it("🔴 SIN EL PORQUÉ EL BOTÓN ESTÁ APAGADO, Y DICE QUÉ FALTA", () => {
    servir([]);
    montar(<CorregirMarcacionModal marca={MARCA} onCerrar={vi.fn()} onGuardado={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Quitar esta marcación" }));
    const guardar = screen.getByRole("button", { name: "Quitar la marcación" }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);
    expect(screen.getByText("Falta: el porqué")).toBeTruthy();
  });

  it("🔴 CON EL PORQUÉ MANDA `quita: true`, SIN HORA Y CON SU `marcacionId`", async () => {
    servir([["/api/asistencia/correcciones", { ok: true, id: "c1" }]]);
    const onGuardado = vi.fn();
    montar(<CorregirMarcacionModal marca={MARCA} onCerrar={vi.fn()} onGuardado={onGuardado} />);
    fireEvent.click(screen.getByRole("button", { name: "Quitar esta marcación" }));
    fireEvent.change(screen.getByPlaceholderText("Escribe el motivo…"), {
      target: { value: "marcó dos veces seguidas" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Quitar la marcación" }));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());

    const post = PEDIDOS.find((p) => p.url.includes("/api/asistencia/correcciones") && p.init?.method === "POST");
    const cuerpo = JSON.parse(String(post?.init?.body)) as Record<string, unknown>;
    expect(cuerpo.quita).toBe(true);
    expect(cuerpo.hora).toBeNull();
    expect(cuerpo.marcacionId).toBe("m3");
    expect(cuerpo.motivo).toBe("marcó dos veces seguidas");
  });

  it("⚠️ CORREGIR LA HORA NO CAMBIÓ: manda la hora y NO manda `quita`", async () => {
    servir([["/api/asistencia/correcciones", { ok: true, id: "c1" }]]);
    const onGuardado = vi.fn();
    montar(<CorregirMarcacionModal marca={MARCA} onCerrar={vi.fn()} onGuardado={onGuardado} />);
    fireEvent.change(screen.getByPlaceholderText("Escribe el motivo…"), { target: { value: "se atrasó el reloj" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(onGuardado).toHaveBeenCalled());

    const post = PEDIDOS.find((p) => p.url.includes("/api/asistencia/correcciones") && p.init?.method === "POST");
    const cuerpo = JSON.parse(String(post?.init?.body)) as Record<string, unknown>;
    expect(cuerpo.hora).toBe("14:23:39");
    expect(cuerpo).not.toHaveProperty("quita");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 3. LO QUITADO SE VE, Y EL AVISO DE ARRIBA LO CUENTA", () => {
  it("la fila de abajo dice «quitada» y con qué hora, nunca «borrada»", async () => {
    servir(respuesta(CUATRO, {
      personas: [{
        codigo: "21", nombre: "RAMON MIRANDA", salida: "18:00", almuerzoMin: 30,
        dias: [dia({
          marcas: CUATRO, marcasIds: CUATRO.map((_, i) => `m${i}`),
          correcciones: [{
            id: "c1", hora: "14:23:39", relojHora: "14:23:39",
            agregada: false, quitada: true,
            motivo: "marcó dos veces seguidas", creadaPor: "Yulissa",
            creadaEn: "2026-09-18T14:00:00.000Z",
          }],
        })],
        resumen: resumen(),
      }],
      correcciones: { correcciones: 1, dias: 1, agregadas: 0, quitadas: 1 },
      correccionesDisponible: true,
      sinHorario: 0, sinHorarioLista: [], reglas: REGLAS_DEFAULT, decisionesExtra: {},
    }));
    montar(<ReporteTab />);
    // 🔴 El aviso azul de arriba cuenta las quitadas por lo que son.
    await waitFor(() => expect(screen.getByText(/es una marcación quitada/)).toBeTruthy());
    await abrirElDetalle();
    const fila = screen.getByText(/no cuenta/).closest("td") as HTMLElement;
    expect(within(fila).getByText("quitada")).toBeTruthy();
    expect(fila.textContent).toContain("14:23:39");
    expect(fila.textContent).not.toContain("borrada");
  });
});
