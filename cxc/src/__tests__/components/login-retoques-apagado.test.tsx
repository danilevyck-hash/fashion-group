// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — `LOGIN_RETOQUES_2026_10` APAGADO = EL INICIO DE SESIÓN DE HOY,
// BYTE POR BYTE (9-oct-2026).
//
// Monta `/` en cuatro estados (vacío, contraseña escrita y visible, contraseña
// incorrecta, «recuperar» abierto) y compara el HTML entero contra
// `__snapshots__/login-retoques-apagado…`. La foto se sacó con el `page.tsx` de
// `origin/main` ANTES de los retoques: apagado, un byte distinto pone esto rojo.
//
// El segundo bloque cuida lo que NO se podía tocar: prendido o apagado, al
// servidor le llega lo mismo y su mensaje de error se muestra tal cual.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const interruptor = vi.hoisted(() => ({ prendido: false }));
vi.mock("@/lib/login-retoques-2026-10", () => ({
  get LOGIN_RETOQUES_2026_10() { return interruptor.prendido; },
}));
const ROUTER = vi.hoisted(() => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, cleanup, act, fireEvent, waitFor } from "@testing-library/react";
import LoginPage from "@/app/page";

const llamadas: { url: string; init?: RequestInit }[] = [];

/** Sin sesión vigente (401) y, al enviar, lo que contesta el servidor por contraseña incorrecta. */
beforeEach(() => {
  llamadas.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url, init });
    return { ok: false, status: 401, json: async () => ({ error: "Contraseña incorrecta" }) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); interruptor.prendido = false; });

async function montar() {
  let vista: ReturnType<typeof render> | undefined;
  await act(async () => { vista = render(<LoginPage />); });
  const c = vista!.container;
  await waitFor(() => expect(c.querySelector("form")).not.toBeNull());
  return c;
}
const campo = (c: HTMLElement) => c.querySelector("input")!;
const botones = (c: HTMLElement) => [...c.querySelectorAll("button")];

async function enviarMala(c: HTMLElement) {
  fireEvent.change(campo(c), { target: { value: "no-es-esta" } });
  await act(async () => { fireEvent.submit(c.querySelector("form")!); });
  await waitFor(() => expect(c.textContent).toContain("Contraseña incorrecta"));
}

describe("Inicio de sesión — interruptor APAGADO = la pantalla de hoy", () => {
  it("vacío: HTML idéntico al de origin/main", async () => {
    expect((await montar()).innerHTML).toMatchSnapshot();
  });
  it("con contraseña escrita y visible: idéntico", async () => {
    const c = await montar();
    fireEvent.change(campo(c), { target: { value: "abc123" } });
    fireEvent.click(botones(c)[0]);
    expect(c.innerHTML).toMatchSnapshot();
  });
  it("contraseña incorrecta: idéntico", async () => {
    const c = await montar();
    await enviarMala(c);
    expect(c.innerHTML).toMatchSnapshot();
  });
  it("«¿Olvidaste tu contraseña?» abierto: idéntico", async () => {
    const c = await montar();
    fireEvent.click(botones(c).at(-1)!);
    expect(c.innerHTML).toMatchSnapshot();
  });
});

describe("Inicio de sesión — interruptor PRENDIDO = los 4 retoques", () => {
  beforeEach(() => { interruptor.prendido = true; });

  it("1 · rótulo «Contraseña» atado al campo, sin repetirlo adentro", async () => {
    const c = await montar();
    const rotulo = c.querySelector("label")!;
    expect(rotulo.textContent).toBe("Contraseña");
    expect(rotulo.getAttribute("for")).toBe(campo(c).id);
    expect(campo(c).getAttribute("placeholder")).toBeNull();
  });
  it("2 · «Recuperar contraseña», sin pregunta, y abre la misma ayuda", async () => {
    const c = await montar();
    const b = botones(c).at(-1)!;
    expect(b.textContent).toBe("Recuperar contraseña");
    expect(c.textContent).not.toContain("¿");
    fireEvent.click(b);
    expect(c.textContent).toContain("Contacta al administrador para restablecer tu contraseña.");
  });
  it("3 · «Mostrar» / «Ocultar», con su nombre accesible", async () => {
    const c = await montar();
    const b = botones(c)[0];
    expect(b.textContent).toBe("Mostrar");
    expect(b.getAttribute("aria-label")).toBe("Mostrar contraseña");
    expect(b.className).not.toContain("text-gray-300");
    fireEvent.click(b);
    expect(b.textContent).toBe("Ocultar");
    expect(b.getAttribute("aria-label")).toBe("Ocultar contraseña");
    expect(campo(c).type).toBe("text");
  });
  it("4 · el botón dice «Iniciar sesión»", async () => {
    const c = await montar();
    expect(c.querySelector('button[type="submit"]')!.textContent).toBe("Iniciar sesión");
  });
});

describe("Inicio de sesión — lo que NO cambia, prendido o apagado", () => {
  for (const prendido of [false, true]) {
    it(`${prendido ? "prendido" : "apagado"}: mismo envío al servidor y su error tal cual`, async () => {
      interruptor.prendido = prendido;
      const c = await montar();
      await enviarMala(c);
      const envio = llamadas.find((l) => l.url === "/api/auth")!;
      expect(envio.init).toEqual({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "no-es-esta" }),
      });
      expect(c.querySelector("p.text-red-600")!.textContent).toBe("Contraseña incorrecta");
    });
  }
});
