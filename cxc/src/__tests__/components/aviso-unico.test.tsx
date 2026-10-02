// 🔴 UN SOLO AVISO (Daniel, 2-oct-2026). El proveedor `useToast` pintaba el
// éxito verde y el `<Toast>` de `ui.tsx` lo pintaba negro. Los dos dibujan
// ahora `CajaAviso`: éxito negro, error rojo, aviso ámbar.
import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { readFileSync } from "fs";
import { ToastProvider, useToast } from "@/components/ToastSystem";
import { COLOR_AVISO } from "@/components/CajaAviso";
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

  it("nadie vuelve a escribir el color del aviso a mano", () => {
    for (const f of ["src/components/ToastSystem.tsx", "src/components/ui.tsx", "src/components/CajaAviso.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toContain("bg-green-600");
      expect(src).not.toContain("bg-red-900");
    }
  });
});
