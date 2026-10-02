// 🔴 UN SOLO AVISO (Daniel, 2-oct-2026). El proveedor `useToast` pintaba el
// éxito verde y el `<Toast>` de `ui.tsx` lo pintaba negro. Los dos dibujan
// ahora `CajaAviso`: éxito negro, error rojo, aviso ámbar.
import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
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

  it("los avisos sueltos de antes entran a la pila", () => {
    for (const f of [
      "src/components/ToastSystem.tsx", "src/components/ui.tsx", "src/components/UndoToast.tsx",
      "src/app/guias/components/GuiaForm.tsx", "src/components/shared/SyncNowButton.tsx",
      "src/components/shared/CatalogoSyncNow.tsx", "src/app/catalogos/admin/[marca]/categorias/CategoriasRubroClient.tsx",
      "src/app/asistencia/ReporteTab.tsx", "src/app/catalogos/admin/[marca]/AdminCatalogoClient.tsx",
    ]) {
      expect(readFileSync(f, "utf8"), f).toContain("EnLaPilaDeAvisos");
    }
    expect(readFileSync("src/lib/hooks/useAuth.ts", "utf8")).toContain("pilaDeAvisos()");
  });

  // 🔴 BARRIDO: ningún archivo de `src/` (menos los tests y `CajaAviso`) vuelve
  // a darle posición propia a un aviso. Un aviso suelto era siempre una caja
  // `fixed` centrada con `left-1/2` (abajo) o en la esquina `top-4 right-4`
  // (un panel pegado al borde, `top-0 right-0`, no es un aviso).
  // Lo que necesite avisar entra con `EnLaPilaDeAvisos` + `CajaAviso`.
  it("nadie vuelve a posicionar un aviso por su cuenta (barre src/)", () => {
    const archivos: string[] = [];
    const andar = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== "__tests__") andar(p); }
        else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.test\./.test(e.name)) archivos.push(p);
      }
    };
    andar("src");
    expect(archivos.length).toBeGreaterThan(500);
    const culpables: string[] = [];
    for (const f of archivos) {
      if (f.endsWith(join("components", "CajaAviso.tsx"))) continue;
      const src = readFileSync(f, "utf8");
      // Solo dentro de una misma cadena de clases (sin cruzar comillas).
      for (const m of src.matchAll(/["'`][^"'`\n]*\bfixed\b[^"'`\n]*["'`]/g)) {
        const clases = m[0];
        if (/left-1\/2/.test(clases) || /\btop-[1-9]\d* right-[1-9]\d*\b|\bright-[1-9]\d* top-[1-9]\d*\b/.test(clases)) {
          culpables.push(`${f}: ${clases.slice(0, 80)}`);
        }
      }
      if (/\btoastBg\b/.test(src)) culpables.push(`${f}: toastBg`);
    }
    expect(culpables).toEqual([]);
  });

  it("nadie vuelve a escribir el color del aviso a mano", () => {
    for (const f of ["src/components/ToastSystem.tsx", "src/components/ui.tsx", "src/components/CajaAviso.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toContain("bg-green-600");
      expect(src).not.toContain("bg-red-900");
    }
  });
});
