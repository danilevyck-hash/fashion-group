// ============================================================================
// 🔴 EN EL CELULAR, LA BARRA DE ARRIBA SE ESCONDE AL BAJAR — Y SE FUERON LA
// CAMPANA Y LA LUPA (24-sep-2026).
//
// 🩸 QUÉ VINO A ARREGLAR. Medido sobre las fotos de Daniel del 24-sep en un
// iPhone de 844 px: 62 px de franja del reloj + 46 px de barra = 108 px de
// blanco fijo arriba, en las 22 pantallas, para siempre. Y de los tres botones
// de esa barra, Daniel usa uno: *«no uso ni notificaciones ni buscar»*.
//
// Lo que este candado congela:
//   1. Hasta `sm` la barra queda con FG · el nombre del módulo · ☰. Nada de
//      campana ni de lupa, para TODOS los roles.
//   2. Se esconde al deslizar hacia abajo y vuelve al deslizar hacia arriba.
//   3. Arriba del todo está SIEMPRE: si no, una pantalla corta podía dejarla
//      escondida sin forma de traerla de vuelta.
//   4. 🔴 `--fg-altura-encabezado` SIGUE A LA BARRA. Las barras pegajosas de
//      contenido se cuelgan de esa medida: si se queda en 46 con el encabezado
//      escondido, la barra de filtros de la pantalla flota con una franja
//      blanca encima.
//   5. Con «reducir movimiento» no se anima nada.
//   6. Con el interruptor apagado vuelve la barra de hoy, campana y lupa
//      incluidas.
//
// Mutaciones que caza: (a) esconder mirando la POSICIÓN en vez del sentido del
// dedo · (b) dejar la variable de altura quieta al esconderse · (c) esconder
// también arriba del todo · (d) animar con «reducir movimiento» prendido ·
// (e) escribir `false` a mano en la campana en vez de derivarlo del
// interruptor · (f) que el interruptor apagado no devuelva los dos botones.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const nav = vi.hoisted(() => ({ push: vi.fn(), ruta: "/asistencia" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  usePathname: () => nav.ruta,
  useSearchParams: () => new URLSearchParams(""),
}));

// El interruptor se lee en cada render y en cada corrida del gancho, así que un
// getter alcanza para probar las dos caras sin duplicar el componente.
const interruptor = vi.hoisted(() => ({ prendido: true }));
vi.mock("@/lib/navegacion/barra-celular", async (original) => {
  const real = await original<typeof import("@/lib/navegacion/barra-celular")>();
  return {
    ...real,
    get BARRA_QUE_SE_ESCONDE() { return interruptor.prendido; },
    campanaYLupaEnElCelular: () => !interruptor.prendido,
  };
});

// La CAMPANA se dibuja de verdad —es justo lo que se mira—. `SearchBar` no: el
// de la computadora también se llama «Buscar», así que dejarlo montado taparía
// al botón del celular, que es el que tiene que desaparecer.
vi.mock("@/components/SearchBar", async (original) => ({
  ...(await original<typeof import("@/components/SearchBar")>()),
  default: () => null,
}));
vi.mock("@/components/NovedadesAviso", () => ({ default: () => null }));

import AppHeader from "@/components/AppHeader";
import { VAR_ALTURA_ENCABEZADO } from "@/lib/ui/barra-pegajosa";

const ALTO_BARRA = 46;

/** El `matchMedia` que jsdom no trae. */
function medioDe(opciones: { celular: boolean; sinMovimiento: boolean }) {
  window.matchMedia = ((consulta: string) => ({
    matches: consulta.includes("prefers-reduced-motion") ? opciones.sinMovimiento : opciones.celular,
    media: consulta,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function deslizarHasta(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, writable: true, configurable: true });
  fireEvent.scroll(window);
}

function montarComoAdmin(ruta = "/asistencia") {
  nav.ruta = ruta;
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_user_name", "daniel");
  return render(<AppHeader module="Asistencia y Planilla" />);
}

function encabezado(): HTMLElement {
  const el = document.querySelector("[data-encabezado]");
  if (!el) throw new Error("no se dibujó el encabezado");
  return el as HTMLElement;
}

function alturaPublicadaAhora(): string {
  return document.documentElement.style.getPropertyValue(VAR_ALTURA_ENCABEZADO);
}

describe("barra-celular · la regla sola", () => {
  it("el interruptor está PRENDIDO y la campana y la lupa se DERIVAN de él", async () => {
    const real = await vi.importActual<typeof import("@/lib/navegacion/barra-celular")>(
      "@/lib/navegacion/barra-celular",
    );
    expect(real.BARRA_QUE_SE_ESCONDE).toBe(true);
    // 🔴 No es un `false` escrito a mano: apagar el interruptor devuelve los
    // dos botones sin tocar una segunda línea.
    expect(real.campanaYLupaEnElCelular()).toBe(false);
  });

  it("arriba del todo la barra está SIEMPRE, aunque venga escondida", async () => {
    const { siguienteEstadoBarra } = await vi.importActual<
      typeof import("@/lib/navegacion/barra-celular")
    >("@/lib/navegacion/barra-celular");
    const escondida = { visible: false, ultimoY: 400 };
    expect(siguienteEstadoBarra(escondida, 0, ALTO_BARRA).visible).toBe(true);
    expect(siguienteEstadoBarra(escondida, ALTO_BARRA, ALTO_BARRA).visible).toBe(true);
    // iOS deja llegar a números negativos al rebotar en el tope.
    expect(siguienteEstadoBarra(escondida, -120, ALTO_BARRA).visible).toBe(true);
  });

  it("manda el SENTIDO del dedo, no la posición", async () => {
    const { siguienteEstadoBarra } = await vi.importActual<
      typeof import("@/lib/navegacion/barra-celular")
    >("@/lib/navegacion/barra-celular");

    // Bajar esconde…
    const bajando = siguienteEstadoBarra({ visible: true, ultimoY: 200 }, 400, ALTO_BARRA);
    expect(bajando).toEqual({ visible: false, ultimoY: 400 });
    // …y subir la devuelve, a 1.200 px del tope: la posición no decide nada.
    const subiendo = siguienteEstadoBarra({ visible: false, ultimoY: 1200 }, 1150, ALTO_BARRA);
    expect(subiendo).toEqual({ visible: true, ultimoY: 1150 });
  });

  it("un temblor de dos píxeles no mueve nada, y no pierde el punto de medición", async () => {
    const { siguienteEstadoBarra } = await vi.importActual<
      typeof import("@/lib/navegacion/barra-celular")
    >("@/lib/navegacion/barra-celular");
    const quieta = { visible: true, ultimoY: 300 };
    expect(siguienteEstadoBarra(quieta, 302, ALTO_BARRA)).toBe(quieta);
    expect(siguienteEstadoBarra(quieta, 298, ALTO_BARRA)).toBe(quieta);
    // 🔑 Como el punto no se movió, un deslizamiento lento igual suma y decide.
    expect(siguienteEstadoBarra(quieta, 309, ALTO_BARRA).visible).toBe(false);
  });

  it("la altura publicada y el corrimiento siguen a la barra", async () => {
    const real = await vi.importActual<typeof import("@/lib/navegacion/barra-celular")>(
      "@/lib/navegacion/barra-celular",
    );
    expect(real.alturaPublicada(true, ALTO_BARRA)).toBe(ALTO_BARRA);
    // 🔴 Escondida, CERO: si no, la barra de filtros queda con 46 px de aire.
    expect(real.alturaPublicada(false, ALTO_BARRA)).toBe(0);
    expect(real.corrimientoDeLaBarra(true, ALTO_BARRA)).toBe(0);
    expect(real.corrimientoDeLaBarra(false, ALTO_BARRA)).toBe(-ALTO_BARRA);
  });

  it("con «reducir movimiento» no se anima nada", async () => {
    const real = await vi.importActual<typeof import("@/lib/navegacion/barra-celular")>(
      "@/lib/navegacion/barra-celular",
    );
    expect(real.transicionDeLaBarra(true)).toBe("none");
    expect(real.transicionDeLaBarra(false)).toContain("transform");
  });
});

describe("AppHeader · la barra del celular", () => {
  let rectOriginal: typeof Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    nav.push.mockClear();
    interruptor.prendido = true;
    sessionStorage.clear();
    medioDe({ celular: true, sinMovimiento: false });
    deslizarHasta(0);
    document.documentElement.style.removeProperty(VAR_ALTURA_ENCABEZADO);
    // jsdom no calcula layout: sin esto el encabezado mediría 0 y el candado
    // no distinguiría «escondida» de «no se midió».
    rectOriginal = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return { height: ALTO_BARRA, width: 390, top: 0, left: 0, right: 390, bottom: ALTO_BARRA, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = rectOriginal;
    cleanup();
  });

  it("hasta `sm` no hay campana ni lupa — solo FG, el módulo y ☰", async () => {
    montarComoAdmin();
    await screen.findByLabelText("Abrir menú de módulos");
    // 🔴 Los dos botones del celular no existen. La campana de la computadora
    // vive dentro de un `hidden sm:block`, así que se la reconoce por ahí.
    expect(screen.queryByLabelText("Buscar")).toBeNull();
    // La campana de la computadora vive dentro de un `hidden sm:block`; la del
    // celular vivía dentro de un `sm:hidden`. Esa segunda ya no existe.
    const campanas = [...document.querySelectorAll("[aria-label='Notificaciones']")];
    expect(campanas.length).toBe(1);
    expect(campanas[0].closest(".sm\\:hidden")).toBeNull();
    // El nombre del módulo sigue en la barra del teléfono.
    expect(screen.getAllByText("Asistencia y Planilla").length).toBeGreaterThan(0);
  });

  it("se esconde al bajar, vuelve al subir, y la altura publicada la sigue", async () => {
    montarComoAdmin();
    await screen.findByLabelText("Abrir menú de módulos");

    await waitFor(() => expect(alturaPublicadaAhora()).toBe(`${ALTO_BARRA}px`));
    expect(encabezado().getAttribute("data-barra-visible")).toBe("si");

    deslizarHasta(420);
    await waitFor(() => {
      expect(encabezado().getAttribute("data-barra-visible")).toBe("no");
    });
    expect(encabezado().style.transform).toBe(`translateY(-${ALTO_BARRA}px)`);
    // 🔴 La barra de filtros de la pantalla sube con ella.
    await waitFor(() => expect(alturaPublicadaAhora()).toBe("0px"));

    deslizarHasta(380);
    await waitFor(() => {
      expect(encabezado().getAttribute("data-barra-visible")).toBe("si");
    });
    expect(encabezado().style.transform).toBe("translateY(0px)");
    await waitFor(() => expect(alturaPublicadaAhora()).toBe(`${ALTO_BARRA}px`));
  });

  it("volviendo arriba del todo la barra reaparece sola", async () => {
    montarComoAdmin();
    await screen.findByLabelText("Abrir menú de módulos");
    deslizarHasta(600);
    await waitFor(() => expect(encabezado().getAttribute("data-barra-visible")).toBe("no"));
    deslizarHasta(0);
    await waitFor(() => expect(encabezado().getAttribute("data-barra-visible")).toBe("si"));
  });

  it("en la computadora no se esconde nunca", async () => {
    medioDe({ celular: false, sinMovimiento: false });
    montarComoAdmin();
    await screen.findByLabelText("Abrir menú de módulos");
    deslizarHasta(900);
    await waitFor(() => expect(encabezado().style.transform).toBe("translateY(0px)"));
    expect(encabezado().getAttribute("data-barra-visible")).toBe("si");
  });

  it("con «reducir movimiento» la barra se mueve sin animación", async () => {
    medioDe({ celular: true, sinMovimiento: true });
    montarComoAdmin();
    await screen.findByLabelText("Abrir menú de módulos");
    await waitFor(() => expect(encabezado().style.transition).toBe("none"));
  });

  it("con el interruptor apagado vuelve la barra de hoy, con campana y lupa", async () => {
    interruptor.prendido = false;
    montarComoAdmin();
    // Los dos botones del celular están de vuelta.
    await screen.findByLabelText("Buscar");
    expect(document.querySelectorAll("[aria-label='Notificaciones']").length).toBe(2);
    deslizarHasta(700);
    // Quieta: ni se esconde ni toca la medida del encabezado.
    await waitFor(() => expect(encabezado().style.transform).toBe("translateY(0px)"));
    expect(encabezado().getAttribute("data-barra-visible")).toBe("si");
  });
});
