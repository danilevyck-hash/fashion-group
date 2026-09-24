// ============================================================================
// 🔴 EN EL CELULAR, UNA PESTAÑA ES UNA PANTALLA (24-sep-2026).
//
// Daniel: «si entro a Multifashion, después a Clientes, y hago slide hacia
// atrás, debería estar en el home de Multifashion. Pero me manda al Inicio.
// Eso pasa en todos lados». Las pestañas cambiaban la URL con `replace`; con
// el dedo, la pestaña se abre como pantalla y el gesto de volver se saltaba la
// entrada. `useUrlState` decide ahora por el aparato: las claves de pantalla
// (`tab` · `subtab` · `vista` · `ver` · `modo` · `mfCel`) hacen `push` en el
// celular y `replace` en la computadora; un filtro sigue en `replace` en los
// dos; un `push` o `replace` explícito manda siempre.
//
// Mutaciones cazadas: (1) `CLAVES_DE_PANTALLA` sin «tab» · (2) «pantalla» →
// siempre replace · (3) «pantalla» → siempre push · (4) el filtro `q` en push
// en el celular · (5) ignorar el `history` explícito.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, cleanup } from "@testing-library/react";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(""),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => "/multifashion",
  useSearchParams: () => nav.params,
}));

const aparato = vi.hoisted(() => ({ actual: "computadora" as "celular" | "computadora" }));
vi.mock("@/lib/aparato", () => ({ aparatoDeQuienMira: () => aparato.actual }));

import { useUrlState, CLAVES_DE_PANTALLA, modoDeHistorial } from "@/lib/hooks/useUrlState";

function montar(key: string, opts?: { history?: "push" | "replace" | "pantalla" }) {
  let setter: ((v: string) => void) | null = null;
  function Sonda() {
    const [, set] = useUrlState(key, "inicio", opts);
    setter = set;
    return null;
  }
  render(<Sonda />);
  return (v: string) => act(() => setter!(v));
}

describe("useUrlState · en el celular una pestaña es una pantalla", () => {
  beforeEach(() => { nav.push.mockClear(); nav.replace.mockClear(); });
  afterEach(() => cleanup());

  it("las claves de pantalla son las seis, con «tab» adentro", () => {
    expect([...CLAVES_DE_PANTALLA]).toEqual(["tab", "subtab", "vista", "ver", "modo", "mfCel"]);
  });

  it("puro: «pantalla» es push con el dedo y replace con el mouse; lo explícito manda", () => {
    expect(modoDeHistorial("tab", undefined, "celular")).toBe("push");
    expect(modoDeHistorial("tab", undefined, "computadora")).toBe("replace");
    expect(modoDeHistorial("mfCel", "pantalla", "celular")).toBe("push");
    expect(modoDeHistorial("q", undefined, "celular")).toBe("replace");
    expect(modoDeHistorial("q", "push", "computadora")).toBe("push");
    expect(modoDeHistorial("tab", "replace", "celular")).toBe("replace");
  });

  it("celular: cambiar «tab» hace push (Atrás vuelve al home del módulo)", () => {
    aparato.actual = "celular";
    montar("tab")("clientes");
    expect(nav.push).toHaveBeenCalledWith("/multifashion?tab=clientes", { scroll: false });
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("computadora: cambiar «tab» sigue en replace (Atrás no cicla pestañas)", () => {
    aparato.actual = "computadora";
    montar("tab")("clientes");
    expect(nav.replace).toHaveBeenCalledWith("/multifashion?tab=clientes", { scroll: false });
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("celular: un filtro («q») sigue en replace", () => {
    aparato.actual = "celular";
    montar("q")("nova");
    expect(nav.replace).toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("un history explícito manda: replace en «tab» aun con el dedo, push en «q» aun con el mouse", () => {
    aparato.actual = "celular";
    montar("tab", { history: "replace" })("x");
    expect(nav.push).not.toHaveBeenCalled();
    nav.replace.mockClear();
    aparato.actual = "computadora";
    montar("q", { history: "push" })("y");
    expect(nav.push).toHaveBeenCalled();
  });
});
