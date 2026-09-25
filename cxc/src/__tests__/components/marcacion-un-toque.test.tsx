/**
 * MARCACIÓN «UN TOQUE» — el candado de la pantalla (24-sep-2026).
 *
 * Lo que se mide acá es lo que Daniel aprobó en el mockup `cel-marcacion.html`
 * (columna «Recomendación»), contra lo medido el 24-sep-2026 en producción:
 * el botón SALTABA 142 px entre estados (202 → 344), marcar eran CUATRO toques
 * y «Deshacer» caía 15 px encima de donde estaba el botón de marcar.
 *
 *  1. UN BOTÓN, UN LUGAR — el mismo cajón y las mismas clases en TODOS los
 *     estados del día; con el día completo queda gris en «Listo por hoy».
 *     🔴 «El día completo» son CUATRO marcas desde el 24-sep-2026
 *     (`cuatro-marcas.ts`), y dos con ese interruptor apagado: acá se mide lo
 *     que el interruptor diga, nunca un número escrito a mano.
 *  2. ACEPTAR LA FOTO ES MARCAR — no existe «Enviar» ni «Volver a tomarla»:
 *     al volver de la cámara la marca sale sola.
 *  3. CÁMARA NORMAL — `capture="environment"`, no la de selfie.
 *  4. LA UBICACIÓN SE PIDE AL ABRIR, y negada se dice con la salida de iOS.
 *  5. UNA SOLA CONFIRMACIÓN — la pastilla con «Deshacer» adentro; sin la nota
 *     «Acuérdate de marcar la salida» y sin la lista «Mis marcas».
 *  6. EL ENCABEZADO DICE «Marcación» (con tilde) y quien solo marca no ve
 *     campana, lupa ni menú.
 *  7. SIN SEÑAL — la línea bajo el título, y la franja naranja del sistema no
 *     se dibuja en esta pantalla.
 *
 * ⚠️ EL INTERRUPTOR EN `false` = LA PANTALLA DE ANTES, y eso lo prueban los
 * candados que ya existían —`marcacion-pantalla`, `marcacion-deshacer-pantalla`
 * y `marcacion-sin-blanco`—, que desde hoy corren con `MARCACION_UN_TOQUE`
 * puesto en `false`: ahí siguen «Enviar», «Mis marcas» y la nota, intactos.
 * Acá, además, se comprueba que cada pieza nueva esté GUARDADA por el
 * interruptor en el código.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Lo que no se está probando, quieto ───────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/marcacion",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/NotificationCenter", () => ({
  default: () => <button aria-label="Notificaciones">🔔</button>,
}));
vi.mock("@/components/NovedadesAviso", () => ({ default: () => null }));
vi.mock("@/components/SearchBar", () => ({
  default: () => <div data-testid="lupa" />,
  SEARCH_ROLES: ["admin", "secretaria", "vendedor", "bodega", "contabilidad"],
}));
vi.mock("@/lib/marcacion/selfie-telefono", () => ({
  achicarEnElTelefono: async (b: Blob) => b,
}));
// 🔑 SIN SEÑAL DE VERDAD. La franja del sistema solo se dibuja estando caída:
// si el contexto dijera «en línea», el candado de abajo pasaría aunque la
// franja volviera a taparle el encabezado a quien marca.
vi.mock("@/lib/OnlineContext", () => ({
  useOnlineContext: () => ({ isOnline: false, wasOffline: true }),
  useOnline: () => false,
  OnlineProvider: ({ children }: { children: React.ReactNode }) => children,
}));

let cola: Record<string, unknown>[] = [];
vi.mock("@/lib/marcacion/cola-offline", () => ({
  guardarPendiente: async (m: Record<string, unknown>) => {
    cola = [...cola.filter((x) => x.eventoId !== m.eventoId), m];
  },
  leerPendientes: async () => cola,
  borrarPendiente: async (id: string) => {
    cola = cola.filter((x) => x.eventoId !== id);
  },
  contarPendientes: async () => cola.length,
  anotarIntento: async () => undefined,
}));

import MarcacionClient from "@/app/marcacion/MarcacionClient";
import { BloquesDelEsqueleto } from "@/app/marcacion/EsqueletoMarcacion";
import OfflineBanner from "@/components/OfflineBanner";
import {
  CLASES_BOTON_UN_TOQUE,
  CLASES_CAJON_BOTON,
  MARCACION_UN_TOQUE,
  TEXTO_LISTO_POR_HOY,
  TEXTO_SIN_SENAL,
  AVISO_UBICACION_NEGADA,
  botonUnToque,
  faltoLaSalidaDeAyer,
  diaAnterior,
  textoAvisarA,
} from "@/lib/marcacion/un-toque";
// 🔴 DESDE EL 24-sep-2026 LAS MARCAS DEL DÍA SON CUATRO (`cuatro-marcas.ts`).
// Este candado sigue midiendo lo mismo —un botón, un lugar, y gris cuando ya no
// hay nada que marcar—, pero «ya no hay nada que marcar» son las marcas que el
// interruptor diga: con él prendido, cuatro; apagado, las dos de antes.
import {
  MARCACION_CUATRO_MARCAS,
  ROTULOS_DEL_BOTON,
  marcasPorDia,
} from "@/lib/marcacion/cuatro-marcas";

const RAIZ = join(process.cwd(), "src");
const FUENTE_PANTALLA = readFileSync(join(RAIZ, "app/marcacion/MarcacionClient.tsx"), "utf8");
const FUENTE_ENCABEZADO = readFileSync(join(RAIZ, "components/AppHeader.tsx"), "utf8");
const FUENTE_FRANJA = readFileSync(join(RAIZ, "components/OfflineBanner.tsx"), "utf8");

/** 8:58 a. m. de Panamá, jueves 24 de septiembre de 2026. */
const AHORA_SERVIDOR = "2026-09-24T13:58:00.000Z";
/** 12:00 p. m. y 1:00 p. m. — el almuerzo, cuando las marcas son cuatro. */
const A_ALMUERZO = "2026-09-24T17:00:00.000Z";
const DE_ALMUERZO = "2026-09-24T18:00:00.000Z";
/** 6:00 p. m. del mismo día. */
const SALIDA = "2026-09-24T23:00:00.000Z";
/** El día del teléfono, marca por marca, hasta quedar completo. */
const DIA_COMPLETO = MARCACION_CUATRO_MARCAS
  ? [AHORA_SERVIDOR, A_ALMUERZO, DE_ALMUERZO, SALIDA]
  : [AHORA_SERVIDOR, SALIDA];
/** Lo que dice el botón en cada paso, hasta apagarse. */
const ROTULOS_EN_ORDEN = MARCACION_CUATRO_MARCAS
  ? [...ROTULOS_DEL_BOTON]
  : ["Marcar entrada", "Marcar salida"];
/** La entrada de AYER, sin salida detrás. */
const AYER_ENTRADA = "2026-09-23T13:58:00.000Z";

function semilla(marcas: string[] = []) {
  return {
    codigo: "2",
    nombre: "ANA TREJOS",
    ahora: AHORA_SERVIDOR,
    hoy: "2026-09-24",
    quincena: { desde: "2026-09-16", hasta: "2026-09-30" },
    rotuloQuincena: "16 – 30 sep",
    deshacer: null as { ocurrioEn: string; tipo: "entrada" | "salida" } | null,
    marcas: marcas.map((m) => ({ ocurrioEn: m })),
  };
}

let respuesta: ReturnType<typeof semilla> = semilla();
const posts: FormData[] = [];
let pedidosDeUbicacion = 0;
let ubicacionNegada = false;

beforeEach(() => {
  cola = [];
  posts.length = 0;
  pedidosDeUbicacion = 0;
  ubicacionNegada = false;
  respuesta = semilla();
  sessionStorage.setItem("cxc_role", "marcacion");
  sessionStorage.setItem("fg_user_name", "Ana Trejos");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(init.body as FormData);
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
      }
      return { ok: true, status: 200, json: async () => respuesta } as Response;
    }),
  );
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(AHORA_SERVIDOR));
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (ok: (p: unknown) => void, err?: (e: unknown) => void) => {
        pedidosDeUbicacion += 1;
        if (ubicacionNegada) err?.({ code: 1 });
        else ok({ coords: { latitude: 8.9824, longitude: -79.5199, accuracy: 12 } });
      },
    },
  });
  if (!("createObjectURL" in URL)) {
    Object.defineProperty(URL, "createObjectURL", { value: () => "blob:x", configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: () => undefined, configurable: true });
  }
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Toca el botón principal y «acepta la foto»: el input escondido la recibe. */
async function aceptarLaFoto(contenedor: HTMLElement) {
  const input = contenedor.querySelector('input[type="file"]') as HTMLInputElement;
  const foto = new File([new Uint8Array([1, 2, 3])], "foto.jpg", { type: "image/jpeg" });
  await act(async () => {
    fireEvent.change(input, { target: { files: [foto] } });
  });
}

/** El botón principal, el que vive en el cajón fijo de abajo. */
function botonPrincipal(contenedor: HTMLElement): HTMLButtonElement {
  const cajon = contenedor.querySelector("[data-boton-fijo]");
  expect(cajon).not.toBeNull();
  const b = cajon!.querySelector("button");
  expect(b).not.toBeNull();
  return b as HTMLButtonElement;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("1 · un botón, un lugar", () => {
  it("🔴 el botón vive en el MISMO cajón y con las MISMAS clases en TODOS los estados", () => {
    const estados = DIA_COMPLETO.map((_, i) => DIA_COMPLETO.slice(0, i)).concat([DIA_COMPLETO]);
    const vistos: { cajon: string; geometria: boolean; top: number; texto: string }[] = [];
    for (const marcas of estados) {
      const { container, unmount } = render(<MarcacionClient inicial={semilla(marcas)} />);
      const cajon = container.querySelector("[data-boton-fijo]") as HTMLElement;
      const b = botonPrincipal(container);
      vistos.push({
        cajon: cajon.className,
        geometria: CLASES_BOTON_UN_TOQUE.split(" ").every((c) => b.className.split(/\s+/).includes(c)),
        top: b.getBoundingClientRect().top,
        texto: b.textContent ?? "",
      });
      unmount();
    }
    // Son todos los estados del día, no una muestra.
    expect(vistos.length).toBe(marcasPorDia() + 1);
    // El cajón es EL MISMO en todos — y es el fijo de abajo.
    expect(new Set(vistos.map((v) => v.cajon)).size).toBe(1);
    expect(vistos[0].cajon).toBe(CLASES_CAJON_BOTON);
    // La geometría del botón sale de la constante, en todos.
    expect(vistos.every((v) => v.geometria)).toBe(true);
    // Y el borde de arriba es el mismo: el botón no salta (antes 202 → 344 px).
    expect(new Set(vistos.map((v) => v.top)).size).toBe(1);
    // Lo único que cambia es lo que dice.
    expect(vistos.map((v) => v.texto)).toEqual([...ROTULOS_EN_ORDEN, TEXTO_LISTO_POR_HOY]);
  });

  it("🔴 con el día completo el botón queda GRIS y sin acción", () => {
    const { container } = render(<MarcacionClient inicial={semilla(DIA_COMPLETO)} />);
    const b = botonPrincipal(container);
    expect(b.textContent).toBe(TEXTO_LISTO_POR_HOY);
    expect(b.disabled).toBe(true);
    expect(b.className).toContain("text-gray-400");
    expect(b.className).not.toContain("bg-black");
  });

  it("el cajón respeta la barra del iPhone (`safe-area-inset-bottom`)", () => {
    const { container } = render(<MarcacionClient inicial={semilla()} />);
    const cajon = container.querySelector("[data-boton-fijo]") as HTMLElement;
    expect(cajon.style.paddingBottom).toContain("safe-area-inset-bottom");
    expect(cajon.className).toContain("fixed");
    expect(cajon.className).toContain("bottom-0");
  });

  it("la regla del texto es la de siempre, con un rótulo distinto al final", () => {
    ROTULOS_EN_ORDEN.forEach((texto, i) => {
      expect(botonUnToque(i)).toEqual({
        tipo: i % 2 === 0 ? "entrada" : "salida",
        texto,
        apagado: false,
      });
    });
    expect(botonUnToque(marcasPorDia())).toEqual({
      tipo: null,
      texto: TEXTO_LISTO_POR_HOY,
      apagado: true,
    });
    // Y una marca antes del final, el botón SIGUE vivo.
    expect(botonUnToque(marcasPorDia() - 1).apagado).toBe(false);
  });
});

describe("2 · aceptar la foto es marcar", () => {
  it("🔴 no hay pantalla de «Enviar» ni «Volver a tomarla»: la marca sale sola", async () => {
    const { container } = render(<MarcacionClient inicial={semilla()} />);
    fireEvent.click(botonPrincipal(container));
    await aceptarLaFoto(container);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(screen.queryByRole("button", { name: "Enviar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Volver a tomarla" })).toBeNull();
    expect(posts[0].get("tipo")).toBe("entrada");
    expect(posts[0].get("sinSenal")).toBe("0");
  });

  it("mientras viaja, el botón dice «Marcando…» EN EL MISMO LUGAR", async () => {
    const { container } = render(<MarcacionClient inicial={semilla()} />);
    const cajonAntes = (container.querySelector("[data-boton-fijo]") as HTMLElement).className;
    fireEvent.click(botonPrincipal(container));
    const b = botonPrincipal(container);
    expect(b.textContent).toBe("Marcando…");
    expect(b.disabled).toBe(true);
    expect((container.querySelector("[data-boton-fijo]") as HTMLElement).className).toBe(cajonAntes);
  });

  it("«Deshacer» es la única red, y vive DENTRO de la pastilla verde", () => {
    const conDeshacer = {
      ...semilla([AHORA_SERVIDOR]),
      deshacer: { ocurrioEn: AHORA_SERVIDOR, tipo: "entrada" as const },
    };
    const { container } = render(<MarcacionClient inicial={conDeshacer} />);
    const pastilla = container.querySelector("[data-pastilla]");
    expect(pastilla).not.toBeNull();
    const deshacer = pastilla!.querySelector("button");
    expect(deshacer).not.toBeNull();
    expect(deshacer!.textContent).toContain("Deshacer la entrada");
    // 🩸 Y NO está en el cajón del botón de marcar: es donde caía antes.
    expect(container.querySelector("[data-boton-fijo]")!.contains(deshacer!)).toBe(false);
  });
});

describe("3 · cámara normal, no selfie", () => {
  it("🔴 el input abre la cámara de atrás (`environment`)", () => {
    const { container } = render(<MarcacionClient inicial={semilla()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.getAttribute("capture")).toBe("environment");
    expect(input.getAttribute("capture")).not.toBe("user");
    expect(input.getAttribute("accept")).toBe("image/*");
  });

  it("y la foto sigue siendo obligatoria: sin archivo no se manda nada", async () => {
    const { container } = render(<MarcacionClient inicial={semilla()} />);
    fireEvent.click(botonPrincipal(container));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [] } });
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(posts).toHaveLength(0);
    expect(cola).toHaveLength(0);
  });
});

describe("4 · la ubicación se pide al abrir", () => {
  it("🔴 se pide sin que nadie toque nada", async () => {
    render(<MarcacionClient inicial={semilla()} />);
    await waitFor(() => expect(pedidosDeUbicacion).toBeGreaterThan(0));
  });

  it("🔴 negada, se dice ANTES de abrir la cámara y con la salida de iOS", async () => {
    ubicacionNegada = true;
    const { container } = render(<MarcacionClient inicial={semilla()} />);
    expect(await screen.findByText(AVISO_UBICACION_NEGADA)).toBeTruthy();
    expect(AVISO_UBICACION_NEGADA).toContain("Ajustes › Safari › Ubicación");
    // Nadie tocó el botón todavía: el aviso llegó antes de gastar la foto.
    expect(posts).toHaveLength(0);
    // Y el botón SIGUE funcionando: se vuelve a pedir al marcar.
    expect(botonPrincipal(container).disabled).toBe(false);
  });

  it("negada, marcar no rompe nada: no se manda ni se inventa una ubicación", async () => {
    ubicacionNegada = true;
    const { container } = render(<MarcacionClient inicial={semilla()} />);
    await screen.findByText(AVISO_UBICACION_NEGADA);
    fireEvent.click(botonPrincipal(container));
    await aceptarLaFoto(container);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(posts).toHaveLength(0);
    expect(cola).toHaveLength(0);
    expect(screen.getByText(AVISO_UBICACION_NEGADA)).toBeTruthy();
    // El botón vuelve a quedar disponible, no atascado en «Marcando…».
    expect(botonPrincipal(container).textContent).toBe("Marcar entrada");
  });
});

describe("5 · una sola confirmación", () => {
  it("🔴 la pastilla verde, y NADA más: sin la nota y sin «Mis marcas»", () => {
    render(<MarcacionClient inicial={semilla([AHORA_SERVIDOR])} />);
    expect(screen.getByText(/✓ Entrada 8:58 a\. m\./)).toBeTruthy();
    expect(screen.queryByText("Acuérdate de marcar la salida.")).toBeNull();
    expect(screen.queryByText("Mañana acuérdate de marcar la entrada.")).toBeNull();
    expect(screen.queryByText("Mis marcas")).toBeNull();
    expect(screen.queryByText(/Si algo está mal, avísale a/)).toBeNull();
    expect(screen.queryByText("16 – 30 sep")).toBeNull();
  });

  it("🔴 lo de AYER se dice solo cuando faltó la salida", () => {
    const { unmount } = render(<MarcacionClient inicial={semilla([AHORA_SERVIDOR])} />);
    expect(screen.queryByText(/Ayer faltó la salida/)).toBeNull();
    unmount();

    render(<MarcacionClient inicial={semilla([AYER_ENTRADA, AHORA_SERVIDOR])} />);
    expect(screen.getByText(/Ayer faltó la salida/)).toBeTruthy();
    expect(screen.getByText(textoAvisarA())).toBeTruthy();
  });

  it("la regla de «ayer» mira el día anterior y nada más", () => {
    const dias = [
      { fecha: "2026-09-23", entrada: "08:58", salida: null, faltaSalida: true },
      { fecha: "2026-09-21", entrada: "08:58", salida: null, faltaSalida: true },
    ];
    expect(diaAnterior("2026-09-24")).toBe("2026-09-23");
    expect(faltoLaSalidaDeAyer(dias, "2026-09-24")).toBe(true);
    // El hueco del 21 no se dice el 23: solo ayer.
    expect(faltoLaSalidaDeAyer([dias[1]], "2026-09-24")).toBe(false);
    // Un ayer completo tampoco avisa.
    expect(
      faltoLaSalidaDeAyer(
        [{ fecha: "2026-09-23", entrada: "08:58", salida: "18:00", faltaSalida: false }],
        "2026-09-24",
      ),
    ).toBe(false);
  });

  it("sin nombre de quien corrige, se avisa sin nombre — nunca se inventa", () => {
    expect(textoAvisarA("Roxana")).toBe("Avísale a Roxana ›");
    expect(textoAvisarA("  ")).toBe("Avísale ›");
  });
});

describe("6 · el encabezado dice «Marcación»", () => {
  it("🩸 con tilde y con mayúscula, no la key «marcacion»", () => {
    const { container } = render(<MarcacionClient inicial={semilla()} />);
    const barra = container.querySelector("header, div");
    expect(barra).not.toBeNull();
    expect(screen.getAllByText("Marcación").length).toBeGreaterThan(0);
    expect(screen.queryByText("marcacion")).toBeNull();
  });

  it("🔴 quien SOLO marca no ve campana, lupa ni menú", async () => {
    render(<MarcacionClient inicial={semilla()} />);
    await waitFor(() => expect(screen.getAllByText("Marcación").length).toBeGreaterThan(0));
    expect(screen.queryAllByLabelText("Notificaciones")).toHaveLength(0);
    expect(screen.queryByLabelText("Buscar")).toBeNull();
    expect(screen.queryByLabelText(/^Abrir menú/)).toBeNull();
  });

  it("y a un admin no se le quita nada: la regla es por ROL", async () => {
    sessionStorage.setItem("cxc_role", "admin");
    render(<MarcacionClient inicial={semilla()} />);
    expect(await screen.findByLabelText(/^Abrir menú/)).toBeTruthy();
    // La campana sale dos veces (escritorio y celular): las dos se quedan.
    expect(screen.getAllByLabelText("Notificaciones").length).toBeGreaterThan(0);
  });
});

describe("7 · sin señal", () => {
  it("🔴 la línea bajo el título dice lo que de verdad pasa", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const { container } = render(<MarcacionClient inicial={semilla()} />);
    await waitFor(() => expect(container.querySelector("[data-sin-senal]")).not.toBeNull());
    expect(screen.getByText(TEXTO_SIN_SENAL)).toBeTruthy();
    expect(TEXTO_SIN_SENAL).toContain("señal");
    // 🔴 Y el botón sigue vivo: sin señal se marca igual.
    expect(botonPrincipal(container).disabled).toBe(false);
  });

  it("🔴 la franja naranja del sistema NO se dibuja en esta pantalla", () => {
    // El contexto dice que NO hay señal: sin el freno de `/marcacion`, la
    // franja se dibujaría y taparía el encabezado entero.
    const { container } = render(<OfflineBanner />);
    expect(container.textContent ?? "").toBe("");
    expect(container.textContent ?? "").not.toContain("Sin conexion");
    // Y la razón está escrita donde se decide.
    expect(FUENTE_FRANJA).toContain("RUTA_MARCACION");
  });
});

describe("8 · el interruptor guarda cada pieza", () => {
  it("está prendido, y cada cambio cuelga de él", () => {
    expect(MARCACION_UN_TOQUE).toBe(true);
    // La cámara, el encabezado, el aire del botón y la pantalla nueva.
    expect(FUENTE_PANTALLA).toContain("capture={MARCACION_UN_TOQUE ? CAPTURE_CAMARA : \"user\"}");
    expect(FUENTE_PANTALLA).toContain("MARCACION_UN_TOQUE ? ROTULO_MARCACION : \"marcacion\"");
    expect(FUENTE_PANTALLA).toContain("MARCACION_UN_TOQUE && estado?.codigo");
    // Y la pantalla de antes sigue entera, detrás del interruptor apagado.
    expect(FUENTE_PANTALLA).toContain("!MARCACION_UN_TOQUE && estado?.codigo");
    expect(FUENTE_PANTALLA).toContain("<PantallaDeAntes");
    expect(FUENTE_ENCABEZADO).toContain("MARCACION_UN_TOQUE && esRolMarcacion(userRole)");
  });
});

describe("9 · el esqueleto mide lo que va a reemplazar", () => {
  it("🔴 son TRES bloques y el botón está en el cajón fijo, no en medio del texto", () => {
    const { container } = render(<BloquesDelEsqueleto />);
    const raiz = container.querySelector('[data-esqueleto="marcacion"]') as HTMLElement;
    expect(raiz).not.toBeNull();
    const hijos = Array.from(raiz.children);
    // saludo · reloj · fecha · el cajón fijo del botón
    expect(hijos.length).toBe(4);
    expect(hijos[1].className).toContain("h-[56px]"); // el reloj nuevo
    expect(raiz.textContent ?? "").not.toMatch(/Cargando/i);
    const cajon = raiz.querySelector("[data-boton-fijo]") as HTMLElement;
    expect(cajon).not.toBeNull();
    expect(cajon.className).toBe(CLASES_CAJON_BOTON);
    expect((cajon.lastElementChild!.firstElementChild as HTMLElement).className).toContain("min-h-[52px]");
  });
});
