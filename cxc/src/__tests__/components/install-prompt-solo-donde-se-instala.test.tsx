// ─────────────────────────────────────────────────────────────────────────────
// La barra «Instala Fashion Group» aparece SOLO donde el navegador de verdad
// puede instalar la app.
//
// 🔴 25-ago-2026 — SE FUE EL CAMINO DE iOS. Safari NO dispara
// `beforeinstallprompt`, así que ahí la barra nunca instaló nada: lo único que
// hacía era un párrafo explicando cómo hacerlo a mano ("Toca Compartir y luego
// Agregar a inicio"), fijo al borde de abajo de la pantalla. Daniel ya tiene la
// app en su inicio y aprobó sacarla.
//
// ⚠️ LA OTRA MITAD ES LA QUE IMPORTA MÁS: en Android y escritorio, donde SÍ hay
// botón de instalar, la barra se queda. Este archivo lo prueba RENDERIZANDO el
// componente y disparando el evento real — un barrido de texto sobre el .tsx no
// puede ver que el botón siga llegando a la pantalla, y encima se cumpliría con
// el propio comentario que explica el cambio (este repo ya lo pagó cuatro
// veces).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import InstallPrompt from "@/components/InstallPrompt";

vi.mock("next/navigation", () => ({
  usePathname: () => "/home",
}));

/** El evento tal como lo manda Chromium: cancelable y con `prompt()`. */
function dispararBeforeInstallPrompt() {
  const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt?: () => Promise<void>;
    userChoice?: Promise<{ outcome: string }>;
  };
  e.prompt = () => Promise.resolve();
  e.userChoice = Promise.resolve({ outcome: "accepted" });
  act(() => {
    window.dispatchEvent(e);
  });
}

/** Safari en iPhone. Lo que lo define acá es que NUNCA dispara el evento. */
function ponerUserAgentIphone() {
  Object.defineProperty(navigator, "userAgent", {
    value:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    configurable: true,
  });
}

const uaOriginal = navigator.userAgent;

/** En este arnés `localStorage` es un objeto pelado sin métodos: se dobla. */
function almacenEnMemoria(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as unknown as Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", almacenEnMemoria());
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  Object.defineProperty(navigator, "userAgent", { value: uaOriginal, configurable: true });
});

describe("🔴 Android y escritorio: la barra SIGUE VIVA y con su botón", () => {
  it("cuando el navegador ofrece instalar, aparece la barra y el botón «Instalar app»", () => {
    render(<InstallPrompt />);
    // Antes del evento no hay nada: la barra no se adelanta al navegador.
    expect(screen.queryByText("Instala Fashion Group")).toBeNull();

    dispararBeforeInstallPrompt();

    expect(screen.getByText("Instala Fashion Group")).toBeTruthy();
    const boton = screen.getByRole("button", { name: "Instalar app" });
    expect(boton).toBeTruthy();
    // Regla de la casa: lo que se toca mide 44 px.
    expect(boton.className).toContain("min-h-[44px]");
  });

  it("el botón llama al prompt REAL del navegador (no es decorativo)", async () => {
    render(<InstallPrompt />);
    const prompt = vi.fn(() => Promise.resolve());
    const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
      prompt?: () => Promise<void>;
      userChoice?: Promise<{ outcome: string }>;
    };
    e.prompt = prompt;
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    act(() => {
      window.dispatchEvent(e);
    });

    await act(async () => {
      screen.getByRole("button", { name: "Instalar app" }).click();
    });
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("una vez descartada no vuelve a molestar (la key legacy no cambió)", () => {
    localStorage.setItem("fg_modoviaje_install_dismissed", String(Date.now()));
    render(<InstallPrompt />);
    dispararBeforeInstallPrompt();
    expect(screen.queryByText("Instala Fashion Group")).toBeNull();
  });
});

describe("🔴 iPhone: no se dibuja NADA", () => {
  it("en Safari de iPhone (sin `beforeinstallprompt`) la barra no existe", () => {
    ponerUserAgentIphone();
    const { container } = render(<InstallPrompt />);
    expect(container.innerHTML).toBe("");
    expect(screen.queryByText("Instala Fashion Group")).toBeNull();
  });

  it("no queda ni rastro del instructivo manual en la pantalla", () => {
    ponerUserAgentIphone();
    const { container } = render(<InstallPrompt />);
    for (const frase of ["Compartir", "Agregar a inicio", "abrirla como una app"]) {
      expect(container.textContent ?? "").not.toContain(frase);
    }
  });

  it("tampoco se dibuja algo escondido con una clase: el árbol está VACÍO", () => {
    ponerUserAgentIphone();
    const { container } = render(<InstallPrompt />);
    expect(container.querySelectorAll("*").length).toBe(0);
  });
});

describe("barrido: el detector de iOS no puede volver", () => {
  // Se borran los comentarios primero — este archivo y el componente CITAN lo
  // que prohíben, y un candado que se cumple con su propia explicación da
  // permiso para romper.
  const sinComentarios = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const COMPONENTE = sinComentarios(
    readFileSync(path.join(process.cwd(), "src/components/InstallPrompt.tsx"), "utf8"),
  );

  it("`isIosSafari` y sus señales de detección ya no están en el código", () => {
    for (const señal of ["isIosSafari", "iosHint", "showIosHint", "CriOS", "MacIntel", "iPad|iPhone"]) {
      expect(COMPONENTE).not.toContain(señal);
    }
  });

  it("el instructivo manual no está escrito en ninguna parte del componente", () => {
    expect(COMPONENTE).not.toContain("Agregar a inicio");
    expect(COMPONENTE).not.toMatch(/Toca\s*<?span/);
  });

  it("el camino de instalación de verdad SIGUE cableado", () => {
    // Si esto se cae, la barra dejó de aparecer también en Android.
    expect(COMPONENTE).toContain("beforeinstallprompt");
    expect(COMPONENTE).toContain("deferred.prompt()");
    expect(COMPONENTE).toContain("Instalar app");
  });
});
