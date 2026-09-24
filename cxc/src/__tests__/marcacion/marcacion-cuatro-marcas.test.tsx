/**
 * CUATRO MARCAS TAMBIÉN EN EL TELÉFONO — el candado (24-sep-2026).
 *
 * Daniel, textual: *«Cuatro marcas también en el teléfono»* · *«sí el botón va
 * solo en orden, y sí va foto en las cuatro»*.
 *
 * Hasta hoy el teléfono era de DOS marcas y el reloj físico de cuatro: quien
 * dejó el reloj perdía el almuerzo. Lo que se mide acá:
 *
 *   1. EL BOTÓN VA SOLO EN ORDEN — los cuatro rótulos, en su orden, en el
 *      MISMO cajón fijo de abajo y sin moverse un píxel.
 *   2. TRAS LA CUARTA QUEDA GRIS en «Listo por hoy», y sin acción.
 *   3. FOTO EN LA ENTRADA Y EN LA SALIDA; EL ALMUERZO, UN SOLO TOQUE — la 1.ª
 *      y la 4.ª pasan por la cámara y mandan su selfie; la 2.ª y la 3.ª marcan
 *      al tocar el botón, sin abrirla. 🔴 LA UBICACIÓN VIAJA EN LAS CUATRO, y
 *      quién pide foto lo decide el SERVIDOR por el orden del día.
 *   4. «DESHACER» ES SOBRE LA ÚLTIMA y la nombra bien: «la salida a almuerzo»,
 *      «la vuelta de almuerzo».
 *   5. APAGADO = LAS DOS MARCAS DE SIEMPRE, byte a byte: cada pieza nueva
 *      cuelga del interruptor y el camino viejo sigue escrito.
 *   6. 🔴 NADA DE LO QUE SE GUARDA CAMBIA: el `tipo` sigue siendo `entrada` o
 *      `salida` —lo único que el servidor acepta— alternado por el orden, y el
 *      payload sigue siendo el de siempre.
 *   7. LA COLA SIN SEÑAL aguanta las cuatro del día.
 *   8. EL SERVIDOR FRENA LA QUINTA con la MISMA regla del botón, nunca con un
 *      número escrito a mano.
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
vi.mock("@/lib/OnlineContext", () => ({
  useOnlineContext: () => ({ isOnline: true, wasOffline: false }),
  useOnline: () => true,
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
import {
  MARCACION_CUATRO_MARCAS,
  MARCAS_POR_DIA_CUATRO,
  NOMBRES_DE_LA_MARCA,
  ROTULOS_CORTOS,
  ROTULOS_DEL_BOTON,
  avisoDeshechaDeLaMarca,
  avisoDiaCompleto,
  botonCuatroMarcas,
  MARCAS_CON_FOTO,
  pideFoto,
  estadoDelBotonHoy,
  horasDelDia,
  marcasPorDia,
  nombreDeLaMarca,
  resumenDelDia,
  rotuloDeshacerDeLaMarca,
  tipoDeLaMarca,
  tipoDeLaMarcaHoy,
} from "@/lib/marcacion/cuatro-marcas";
import { botonUnToque, TEXTO_LISTO_POR_HOY } from "@/lib/marcacion/un-toque";
import { estadoDelBoton, validarPayloadMarca } from "@/lib/marcacion/marcacion";
import { queSePuedeDeshacer } from "@/lib/marcacion/deshacer";

const RAIZ = join(process.cwd(), "src");
const FUENTE_REGLA = readFileSync(join(RAIZ, "lib/marcacion/cuatro-marcas.ts"), "utf8");
const FUENTE_PANTALLA = readFileSync(join(RAIZ, "app/marcacion/PantallaUnToque.tsx"), "utf8");
const FUENTE_RUTA = readFileSync(join(RAIZ, "app/api/marcacion/route.ts"), "utf8");
const FUENTE_UN_TOQUE = readFileSync(join(RAIZ, "lib/marcacion/un-toque.ts"), "utf8");

/** Jueves 24 de septiembre de 2026, 8:58 a. m. de Panamá. */
const AHORA_SERVIDOR = "2026-09-24T13:58:00.000Z";
/** Las cuatro marcas del día, en orden: 8:00 · 12:00 · 1:00 · 6:00. */
const ENTRADA = "2026-09-24T13:00:00.000Z";
const A_ALMUERZO = "2026-09-24T17:00:00.000Z";
const DE_ALMUERZO = "2026-09-24T18:00:00.000Z";
const SALIDA = "2026-09-24T23:00:00.000Z";
const LAS_CUATRO = [ENTRADA, A_ALMUERZO, DE_ALMUERZO, SALIDA];

function semilla(marcas: string[] = [], deshacer: { ocurrioEn: string; tipo: "entrada" | "salida" } | null = null) {
  return {
    codigo: "2",
    nombre: "ANA TREJOS",
    ahora: AHORA_SERVIDOR,
    hoy: "2026-09-24",
    quincena: { desde: "2026-09-16", hasta: "2026-09-30" },
    rotuloQuincena: "16 – 30 sep",
    deshacer,
    marcas: marcas.map((m) => ({ ocurrioEn: m })),
  };
}

const posts: FormData[] = [];

beforeEach(() => {
  cola = [];
  posts.length = 0;
  sessionStorage.setItem("cxc_role", "marcacion");
  sessionStorage.setItem("fg_user_name", "Ana Trejos");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        // Sin señal, un POST no sale: el teléfono lo guarda en su cola.
        if (!navigator.onLine) throw new TypeError("sin señal");
        posts.push(init.body as FormData);
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
      }
      return { ok: true, status: 200, json: async () => semilla() } as Response;
    }),
  );
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(AHORA_SERVIDOR));
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (ok: (p: unknown) => void) =>
        ok({ coords: { latitude: 8.9824, longitude: -79.5199, accuracy: 12 } }),
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

/** El botón principal, el del cajón fijo de abajo. */
function botonPrincipal(contenedor: HTMLElement): HTMLButtonElement {
  const cajon = contenedor.querySelector("[data-boton-fijo]");
  expect(cajon).not.toBeNull();
  return cajon!.querySelector("button") as HTMLButtonElement;
}

/** «Acepta la foto»: el input escondido la recibe, y eso ES marcar. */
async function aceptarLaFoto(contenedor: HTMLElement) {
  const input = contenedor.querySelector('input[type="file"]') as HTMLInputElement;
  const foto = new File([new Uint8Array([1, 2, 3])], "foto.jpg", { type: "image/jpeg" });
  await act(async () => {
    fireEvent.change(input, { target: { files: [foto] } });
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe("1 · el botón va SOLO en orden, como el reloj", () => {
  it("🔴 los cuatro rótulos, en su orden, según cuántas marcas lleva el día", () => {
    const vistos: string[] = [];
    for (let n = 0; n <= 4; n += 1) {
      const { container, unmount } = render(<MarcacionClient inicial={semilla(LAS_CUATRO.slice(0, n))} />);
      vistos.push(botonPrincipal(container).textContent ?? "");
      unmount();
    }
    expect(vistos).toEqual([
      "Marcar entrada",
      "Marcar salida a almuerzo",
      "Marcar vuelta de almuerzo",
      "Marcar salida",
      TEXTO_LISTO_POR_HOY,
    ]);
    // Y esos rótulos salen de UNA lista, no de un `if` por estado.
    expect([...ROTULOS_DEL_BOTON]).toEqual(vistos.slice(0, 4));
  });

  it("🔴 y no se mueve un píxel entre los cinco estados: mismo cajón, mismas clases", () => {
    const cajones = new Set<string>();
    const topes = new Set<number>();
    for (let n = 0; n <= 4; n += 1) {
      const { container, unmount } = render(<MarcacionClient inicial={semilla(LAS_CUATRO.slice(0, n))} />);
      cajones.add((container.querySelector("[data-boton-fijo]") as HTMLElement).className);
      topes.add(botonPrincipal(container).getBoundingClientRect().top);
      unmount();
    }
    expect(cajones.size).toBe(1);
    expect(topes.size).toBe(1);
  });

  it("🔴 la persona NUNCA elige cuál marca es: hay UN solo botón en la pantalla", () => {
    const { container } = render(<MarcacionClient inicial={semilla([ENTRADA])} />);
    const botones = Array.from(container.querySelectorAll("button")).map((b) => b.textContent ?? "");
    expect(botones.filter((t) => t.startsWith("Marcar"))).toEqual(["Marcar salida a almuerzo"]);
    // Ni un selector, ni una lista de tipos de marca.
    expect(container.querySelectorAll("select")).toHaveLength(0);
  });

  it("la regla pura: 0 → entrada · 1 → a almuerzo · 2 → vuelta · 3 → salida", () => {
    expect(botonCuatroMarcas(0)).toEqual({ tipo: "entrada", texto: "Marcar entrada", apagado: false });
    expect(botonCuatroMarcas(1)).toEqual({ tipo: "salida", texto: "Marcar salida a almuerzo", apagado: false });
    expect(botonCuatroMarcas(2)).toEqual({ tipo: "entrada", texto: "Marcar vuelta de almuerzo", apagado: false });
    expect(botonCuatroMarcas(3)).toEqual({ tipo: "salida", texto: "Marcar salida", apagado: false });
    expect(botonCuatroMarcas(4).apagado).toBe(true);
    expect(botonCuatroMarcas(4).tipo).toBeNull();
    // Un número imposible no rompe nada ni deja el botón vivo de más.
    expect(botonCuatroMarcas(9).apagado).toBe(true);
    expect(botonCuatroMarcas(-3).texto).toBe("Marcar entrada");
    expect(botonCuatroMarcas(Number.NaN).texto).toBe("Marcar entrada");
  });
});

describe("2 · tras la cuarta queda gris", () => {
  it("🔴 «Listo por hoy», apagado y sin el negro del botón vivo", () => {
    const { container } = render(<MarcacionClient inicial={semilla(LAS_CUATRO)} />);
    const b = botonPrincipal(container);
    expect(b.textContent).toBe(TEXTO_LISTO_POR_HOY);
    expect(b.disabled).toBe(true);
    expect(b.className).toContain("text-gray-400");
    expect(b.className).not.toContain("bg-black");
  });

  it("🔴 con TRES marcas todavía NO está gris: falta la salida", () => {
    const { container } = render(<MarcacionClient inicial={semilla(LAS_CUATRO.slice(0, 3))} />);
    const b = botonPrincipal(container);
    expect(b.disabled).toBe(false);
    expect(b.textContent).toBe("Marcar salida");
  });

  it("`botonUnToque` sigue siendo el único que rebautiza el estado apagado", () => {
    expect(botonUnToque(3)).toEqual({ tipo: "salida", texto: "Marcar salida", apagado: false });
    expect(botonUnToque(4)).toEqual({ tipo: null, texto: TEXTO_LISTO_POR_HOY, apagado: true });
    expect(MARCAS_POR_DIA_CUATRO).toBe(4);
    expect(marcasPorDia()).toBe(4);
  });
});

describe("3 · foto en la entrada y en la salida; el almuerzo, un solo toque", () => {
  it("🔴 la 1.ª y la 4.ª piden foto; la 2.ª y la 3.ª, no", () => {
    expect([...MARCAS_CON_FOTO]).toEqual([true, false, false, true]);
    expect([0, 1, 2, 3].map(pideFoto)).toEqual([true, false, false, true]);
    // Ante la duda, la foto: fuera de las cuatro se pide.
    expect(pideFoto(7)).toBe(true);
    expect(pideFoto(-1)).toBe(true);
  });

  it("🔴 la ENTRADA y la SALIDA pasan por la cámara y mandan su selfie", async () => {
    for (const n of [0, 3]) {
      posts.length = 0;
      const { container, unmount } = render(<MarcacionClient inicial={semilla(LAS_CUATRO.slice(0, n))} />);
      // Tocar el botón NO manda nada: primero hay que aceptar la foto.
      fireEvent.click(botonPrincipal(container));
      expect(posts).toHaveLength(0);
      await aceptarLaFoto(container);
      await waitFor(() => expect(posts).toHaveLength(1));
      const selfie = posts[0].get("selfie") as File;
      expect(selfie).toBeTruthy();
      expect(selfie.size).toBeGreaterThan(0);
      expect(posts[0].get("tipo")).toBe(tipoDeLaMarca(n));
      expect(posts[0].get("sinSenal")).toBe("0");
      unmount();
    }
  });

  it("🔴 el ALMUERZO marca de un solo toque: sin cámara y sin foto", async () => {
    for (const n of [1, 2]) {
      posts.length = 0;
      const { container, unmount } = render(<MarcacionClient inicial={semilla(LAS_CUATRO.slice(0, n))} />);
      fireEvent.click(botonPrincipal(container));
      await waitFor(() => expect(posts).toHaveLength(1));
      // Ni foto ni pantalla intermedia: el toque ES la marca.
      expect(posts[0].get("selfie")).toBeNull();
      expect(screen.queryByRole("button", { name: "Enviar" })).toBeNull();
      // 🔴 Y TODO LO DEMÁS VIAJA IGUAL: la ubicación, las dos horas y el tipo.
      expect(posts[0].get("lat")).toBe("8.9824");
      expect(posts[0].get("lng")).toBe("-79.5199");
      expect(posts[0].get("precisionM")).toBe("12");
      expect(String(posts[0].get("horaTelefono") ?? "")).not.toBe("");
      expect(String(posts[0].get("eventoId") ?? "")).not.toBe("");
      expect(posts[0].get("tipo")).toBe(tipoDeLaMarca(n));
      expect(posts[0].get("sinSenal")).toBe("0");
      unmount();
    }
  });

  it("🔴 sin foto, la ENTRADA no se manda: ahí sigue siendo obligatoria", async () => {
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

  it("🔴 y lo decide el SERVIDOR, no el teléfono", () => {
    const base = {
      eventoId: "11111111-2222-3333-4444-555555555555",
      tipo: "entrada",
      lat: 8.9824,
      lng: -79.5199,
      precisionM: 12,
    };
    // Sin foto: entra donde no se pide, se rechaza donde sí.
    expect(validarPayloadMarca({ ...base, selfie: null }, false)).toBeNull();
    expect(validarPayloadMarca({ ...base, selfie: null }, true)).toMatch(/Falta la selfie/);
    // Y por omisión se sigue pidiendo: nadie se salta la foto por olvido.
    expect(validarPayloadMarca({ ...base, selfie: null })).toMatch(/Falta la selfie/);
    // La foto que SÍ viene se revisa igual, se pida o no.
    expect(validarPayloadMarca({ ...base, selfie: { tipo: "text/plain", bytes: 10 } }, false))
      .toMatch(/no es una foto/);
    // La ubicación sigue siendo obligatoria en las cuatro.
    expect(validarPayloadMarca({ ...base, lat: null, lng: null, selfie: null }, false))
      .toMatch(/Falta la ubicación/);
    // Y la ruta pregunta por el ORDEN del día, nunca por lo que diga el cuerpo.
    expect(FUENTE_RUTA).toContain("validarPayloadMarca(loQueLlego, pideFoto(yaTiene))");
    expect(FUENTE_RUTA).toContain("if (esArchivo(selfie)) {");
  });

  it("la cámara sigue siendo la normal, no la de selfie", () => {
    const { container } = render(<MarcacionClient inicial={semilla()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.getAttribute("capture")).toBe("environment");
  });
});

describe("4 · la pastilla y el «Deshacer» nombran la marca correcta", () => {
  it("🔴 la pastilla dice cada marca con su nombre, no la primera y la última", () => {
    render(<MarcacionClient inicial={semilla([ENTRADA, A_ALMUERZO])} />);
    expect(screen.getByText(/✓ Entrada 8:00 a\. m\. · Almuerzo 12:00 p\. m\./)).toBeTruthy();
    // 🩸 Lo que decía antes: «Entrada 8:00 a. m. · Salida 12:00 p. m.» — a
    // mediodía se lee como que ya salió del trabajo.
    expect(screen.queryByText(/Salida 12:00 p\. m\./)).toBeNull();
  });

  it("la pastilla con el día completo dice las cuatro", () => {
    render(<MarcacionClient inicial={semilla(LAS_CUATRO)} />);
    expect(
      screen.getByText(
        /Entrada 8:00 a\. m\. · Almuerzo 12:00 p\. m\. · Vuelta 1:00 p\. m\. · Salida 6:00 p\. m\./,
      ),
    ).toBeTruthy();
  });

  it("🔴 «Deshacer» es sobre la ÚLTIMA y la nombra bien", () => {
    // La ventana son 2 minutos: la marca deshacible es la recién puesta.
    const RECIEN = "2026-09-24T13:57:30.000Z";
    const casos: [string[], "entrada" | "salida", string][] = [
      [[ENTRADA], "entrada", "Deshacer la entrada"],
      [[ENTRADA, A_ALMUERZO], "salida", "Deshacer la salida a almuerzo"],
      [[ENTRADA, A_ALMUERZO, DE_ALMUERZO], "entrada", "Deshacer la vuelta de almuerzo"],
      [LAS_CUATRO, "salida", "Deshacer la salida"],
    ];
    for (const [marcas, tipo, rotulo] of casos) {
      const { container, unmount } = render(
        <MarcacionClient inicial={semilla(marcas, { ocurrioEn: RECIEN, tipo })} />,
      );
      const pastilla = container.querySelector("[data-pastilla]") as HTMLElement;
      const boton = pastilla.querySelector("button") as HTMLButtonElement;
      expect(boton.textContent).toContain(rotulo);
      unmount();
    }
  });

  it("el servidor sabe qué número de marca es, y de ahí sale su nombre", () => {
    const tel = (id: string, iso: string) => ({ id, ocurrioEn: iso, dispositivo: "telefono" });
    const r = queSePuedeDeshacer(
      [
        tel("m1", "2026-09-24T12:00:00.000Z"),
        tel("m2", "2026-09-24T13:00:00.000Z"),
        tel("m3", "2026-09-24T13:57:30.000Z"),
      ],
      AHORA_SERVIDOR,
    );
    expect(r).toMatchObject({ id: "m3", indice: 2, tipo: "entrada" });
    expect(avisoDeshechaDeLaMarca(r!.indice, r!.tipo)).toBe(
      "Listo, se deshizo la vuelta de almuerzo. Puedes marcar de nuevo.",
    );
  });

  it("los cuatro nombres, en una sola lista", () => {
    expect([...NOMBRES_DE_LA_MARCA]).toEqual([
      "entrada",
      "salida a almuerzo",
      "vuelta de almuerzo",
      "salida",
    ]);
    expect([...ROTULOS_CORTOS]).toEqual(["Entrada", "Almuerzo", "Vuelta", "Salida"]);
    expect(rotuloDeshacerDeLaMarca(1, "salida")).toBe("Deshacer la salida a almuerzo");
    // Fuera de las cuatro se dice lo de siempre, nunca «Marca 7».
    expect(nombreDeLaMarca(9, "salida")).toBe("salida");
    expect(nombreDeLaMarca(-1, "entrada")).toBe("entrada");
  });

  it("las horas de hoy salen de la MISMA lista con la que se cuenta el botón", () => {
    const marcas = LAS_CUATRO.map((m) => ({ ocurrioEn: m }));
    expect(horasDelDia(marcas, "2026-09-24")).toEqual(["08:00", "12:00", "13:00", "18:00"]);
    // Otro día no se mezcla, y una hora rota no rompe la lista.
    expect(horasDelDia(marcas, "2026-09-23")).toEqual([]);
    expect(horasDelDia([{ ocurrioEn: "no es una hora" }], "2026-09-24")).toEqual([]);
    expect(resumenDelDia(["08:00", "12:00"])).toBe("Entrada 8:00 a. m. · Almuerzo 12:00 p. m.");
  });
});

describe("5 · apagado = las dos marcas de siempre", () => {
  it("🔴 está prendido, y la regla cae en la de antes cuando se apaga", () => {
    expect(MARCACION_CUATRO_MARCAS).toBe(true);
    expect(FUENTE_REGLA).toContain("export const MARCACION_CUATRO_MARCAS = true;");
    // `estadoDelBotonHoy` no reescribe la regla vieja: la LLAMA.
    expect(FUENTE_REGLA).toContain(
      "return MARCACION_CUATRO_MARCAS ? botonCuatroMarcas(marcasHoy) : estadoDelBoton(marcasHoy);",
    );
    // Los nombres, el tipo por orden y el aviso del día completo, los tres.
    expect(FUENTE_REGLA).toContain("if (!MARCACION_CUATRO_MARCAS) return tipo;");
    expect(FUENTE_REGLA).toContain(
      'if (!MARCACION_CUATRO_MARCAS) return Math.floor(indice) <= 0 ? "entrada" : "salida";',
    );
    expect(FUENTE_REGLA).toContain('MARCACION_CUATRO_MARCAS ? "sus cuatro marcas" : "su entrada y su salida"');
    // Y la foto: apagado, la piden las dos marcas de siempre.
    expect(FUENTE_REGLA).toContain("if (!MARCACION_CUATRO_MARCAS) return true;");
  });

  it("🔴 y la pantalla de dos marcas sigue escrita, detrás del interruptor", () => {
    expect(FUENTE_PANTALLA).toContain("MARCACION_CUATRO_MARCAS");
    // La pastilla de antes, intacta.
    expect(FUENTE_PANTALLA).toContain(
      "`Entrada ${enDoceHoras(hoyMarcado.entrada)} · Salida ${enDoceHoras(hoyMarcado.salida)}`",
    );
    // Y el rótulo de «Deshacer» de antes, intacto.
    expect(FUENTE_PANTALLA).toContain("rotuloDeshacer(sePuedeDeshacer.tipo)");
    // `un-toque` sigue siendo quien decide la pantalla nueva: no se fusionaron.
    expect(FUENTE_UN_TOQUE).toContain("export const MARCACION_UN_TOQUE = true;");
  });

  it("la regla vieja, la de dos marcas, no se tocó", () => {
    expect(estadoDelBoton(0)).toEqual({ tipo: "entrada", texto: "Marcar entrada", apagado: false });
    expect(estadoDelBoton(1)).toEqual({ tipo: "salida", texto: "Marcar salida", apagado: false });
    expect(estadoDelBoton(2)).toEqual({ tipo: null, texto: "Ya marcaste hoy", apagado: true });
  });
});

describe("6 · lo que se guarda NO cambia", () => {
  it("🔴 el `tipo` sigue siendo `entrada` o `salida`, y alterna por el orden", () => {
    expect([0, 1, 2, 3].map(tipoDeLaMarca)).toEqual(["entrada", "salida", "entrada", "salida"]);
    expect([0, 1, 2, 3].map(tipoDeLaMarcaHoy)).toEqual(["entrada", "salida", "entrada", "salida"]);
    for (const i of [0, 1, 2, 3]) {
      expect(["entrada", "salida"]).toContain(tipoDeLaMarca(i));
    }
  });

  it("🔴 el servidor no aprendió un valor nuevo: solo acepta entrada o salida", () => {
    const base = {
      eventoId: "11111111-2222-3333-4444-555555555555",
      lat: 8.9824,
      lng: -79.5199,
      precisionM: 12,
      selfie: { tipo: "image/jpeg", bytes: 40_000 },
    };
    expect(validarPayloadMarca({ ...base, tipo: "entrada" })).toBeNull();
    expect(validarPayloadMarca({ ...base, tipo: "salida" })).toBeNull();
    for (const inventado of ["almuerzo", "salida_almuerzo", "vuelta", "salida a almuerzo"]) {
      expect(validarPayloadMarca({ ...base, tipo: inventado })).toMatch(/entrada o salida/);
    }
  });

  it("⚠️ lo ÚNICO distinto en la base: el almuerzo cae con `foto_path` en NULL", () => {
    // La columna nació NULLABLE y así están TODAS las marcas del reloj físico.
    const ddl = readFileSync(
      join(process.cwd(), "supabase/migrations/20261127120000_marcacion_telefono.sql"),
      "utf8",
    );
    expect(ddl).toContain("ADD COLUMN IF NOT EXISTS foto_path      text,");
    expect(ddl).not.toMatch(/foto_path[^,]*NOT NULL/);
    // Y el reporte de la contadora ya sabía leer una marca sin foto.
    const reporte = readFileSync(join(RAIZ, "lib/marcacion/en-el-reporte.ts"), "utf8");
    expect(reporte).toContain('tieneFoto: Boolean(String(f.foto_path ?? "").trim())');
  });

  it("🔴 y el motor del reporte sigue sin leer esa columna: asigna por ORDEN", () => {
    const reporte = readFileSync(join(RAIZ, "app/api/asistencia/reporte/route.ts"), "utf8");
    expect(reporte).toContain('.select("id, empleado_codigo, empleado_nombre, ocurrio_en, dispositivo"');
    expect(reporte).not.toContain("ocurrio_en, tipo");
  });
});

describe("7 · la cola sin señal aguanta las cuatro", () => {
  it("🔴 sin señal, las cuatro se guardan y ninguna pisa a la otra", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const { container } = render(<MarcacionClient inicial={semilla()} />);
    for (let n = 0; n < 4; n += 1) {
      fireEvent.click(botonPrincipal(container));
      // La entrada y la salida pasan por la cámara; el almuerzo ya marcó.
      if (pideFoto(n)) await aceptarLaFoto(container);
      await waitFor(() => expect(cola).toHaveLength(n + 1));
    }
    // Y con las cuatro esperando señal, el botón ya está en «Listo por hoy».
    await waitFor(() => expect(botonPrincipal(container).textContent).toBe(TEXTO_LISTO_POR_HOY));
    expect(cola).toHaveLength(4);
    expect(cola.map((m) => m.tipo)).toEqual(["entrada", "salida", "entrada", "salida"]);
    // 🔴 Dos con foto y dos sin ella, la misma regla que con señal.
    expect(cola.map((m) => m.selfie !== null)).toEqual([...MARCAS_CON_FOTO]);
    // La ubicación viaja en las cuatro.
    expect(cola.every((m) => m.lat === 8.9824 && m.lng === -79.5199)).toBe(true);
    // Cuatro `eventoId` distintos: la llave de la cola no colisiona.
    expect(new Set(cola.map((m) => m.eventoId)).size).toBe(4);
    expect(posts).toHaveLength(0);
  });

  it("no hay ningún tope de dos marcas escrito en la cola", () => {
    const fuente = readFileSync(join(RAIZ, "lib/marcacion/cola-offline.ts"), "utf8");
    expect(fuente).not.toMatch(/MARCAS_POR_DIA|slice\(0,\s*2\)|length\s*>=\s*2/);
  });
});

describe("8 · el servidor frena la quinta, con la MISMA regla", () => {
  it("🔴 la ruta pregunta por el botón, no por un número escrito a mano", () => {
    expect(FUENTE_RUTA).toContain("if (!estadoDelBotonHoy(yaTiene).tipo)");
    expect(FUENTE_RUTA).toContain("avisoDiaCompleto()");
    // Ni un 2 ni un 4 sueltos decidiendo el tope.
    expect(FUENTE_RUTA).not.toMatch(/yaTiene\s*[><=]=?\s*\d/);
  });

  it("con las cuatro puestas ya no hay tipo que marcar, y se dice por qué", () => {
    expect(estadoDelBotonHoy(3).tipo).not.toBeNull();
    expect(estadoDelBotonHoy(4).tipo).toBeNull();
    expect(avisoDiaCompleto()).toBe(
      "Ese día ya tiene sus cuatro marcas. Si algo está mal, avísale a Roxana.",
    );
  });

  it("y el estado que arma el servidor usa esa misma regla", () => {
    const fuente = readFileSync(join(RAIZ, "lib/marcacion/estado-server.ts"), "utf8");
    expect(fuente).toContain("boton: estadoDelBotonHoy(marcasHoy),");
  });
});
