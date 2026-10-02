// 🔴 UN SOLO AVISO (Daniel, 2-oct-2026). El proveedor `useToast` pintaba el
// éxito verde y el `<Toast>` de `ui.tsx` lo pintaba negro. Los dos dibujan
// ahora `CajaAviso`: éxito negro, error rojo, aviso ámbar.
import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { readFileSync } from "fs";
import { ToastProvider, useToast } from "@/components/ToastSystem";
import { COLOR_AVISO, ABAJO_DE_LOS_AVISOS_CSS, ATRIBUTO_PILA_AVISOS } from "@/components/CajaAviso";
import { Toast } from "@/components/ui";

function Disparar({ tipo }: { tipo: "success" | "error" | "warning" }) {
  const { toast } = useToast();
  return <button onClick={() => toast("hola", tipo)}>disparar</button>;
}

const claseDe = (el: HTMLElement) => el.closest("[data-aviso]")!.getAttribute("class")!;

describe("aviso único", () => {
  it("éxito negro, error rojo, aviso ámbar", () => {
    expect(COLOR_AVISO.success).toContain("bg-black");
    expect(COLOR_AVISO.error).toContain("bg-red-600");
    expect(COLOR_AVISO.warning).toContain("bg-amber-600");
  });

  for (const tipo of ["success", "error"] as const) {
    it(`useToast y <Toast> pintan el mismo ${tipo}`, () => {
      const { unmount } = render(<ToastProvider><Disparar tipo={tipo} /></ToastProvider>);
      act(() => screen.getByText("disparar").click());
      const delProveedor = claseDe(screen.getByText("hola"));
      unmount();
      render(<Toast message="hola" type={tipo} />);
      const delComponente = claseDe(screen.getByText("hola"));
      expect(delProveedor).toContain(COLOR_AVISO[tipo]);
      expect(delComponente).toContain(COLOR_AVISO[tipo]);
    });
  }

  // 🔴 TODOS ABAJO AL CENTRO (Daniel, 2-oct-2026). `useToast` salía arriba a
  // la derecha y `<Toast>` abajo al centro: ahora entran en la MISMA pila.
  it("useToast y <Toast> salen en la misma pila, y se apilan sin taparse", () => {
    render(<ToastProvider><Disparar tipo="success" /><Toast message="otro" type="error" /></ToastProvider>);
    act(() => screen.getByText("disparar").click());
    act(() => screen.getByText("disparar").click());
    const pilas = document.querySelectorAll(`[${ATRIBUTO_PILA_AVISOS}]`);
    expect(pilas).toHaveLength(1);
    const pila = pilas[0] as HTMLElement;
    expect(pila.className).toContain("fixed");
    expect(pila.className).toContain("flex-col");
    expect(pila.className).toContain("items-center");
    expect(pila.className).toContain("gap-2");
    expect(pila.querySelectorAll("[data-aviso]")).toHaveLength(3);
    for (const el of pila.querySelectorAll("[data-aviso]")) {
      expect(el.getAttribute("class")).not.toMatch(/\bfixed\b|top-4|right-4|bottom-6/);
    }
  });

  it("la pila se sienta encima del ☰, de la barra fija y de la franja de iOS", () => {
    expect(ABAJO_DE_LOS_AVISOS_CSS).toContain("var(--fg-alto-barra-fija, 0px)");
    expect(ABAJO_DE_LOS_AVISOS_CSS).toContain("env(safe-area-inset-bottom)");
  });

  it("nadie vuelve a posicionar un aviso por su cuenta", () => {
    for (const f of ["src/components/ToastSystem.tsx", "src/components/ui.tsx", "src/components/UndoToast.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src).toContain("EnLaPilaDeAvisos");
      expect(src).not.toContain("top-4 right-4");
      expect(src).not.toMatch(/fixed bottom-6 left-1\/2/);
    }
  });

  it("nadie vuelve a escribir el color del aviso a mano", () => {
    for (const f of ["src/components/ToastSystem.tsx", "src/components/ui.tsx", "src/components/CajaAviso.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toContain("bg-green-600");
      expect(src).not.toContain("bg-red-900");
    }
  });
});
