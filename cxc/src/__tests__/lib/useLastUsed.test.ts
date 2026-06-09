// Regresión del bug D3 (#101): el filtro por empresa "no recordaba". Causa: el
// useState lazy-initializer leía localStorage en el render del server (App
// Router) → caía al default y se quedaba pegado tras hidratar. El fix lee en un
// useEffect tras montar. Aquí verificamos el contrato: un montaje FRESCO (volver
// a la página) aplica el valor previamente guardado, y setValue persiste.
//
// Nota de entorno: Node 25 expone un `localStorage` global stub (sin métodos)
// que pisa al de jsdom, así que instalamos un polyfill in-memory propio sobre
// globalThis antes de cada test — el mismo store que lee el hook (`localStorage`
// pelado) y que aserta el test.
// Sin JSX (el include de vitest es *.test.ts): React.createElement.

import { describe, it, expect, beforeEach } from "vitest";
import { createElement } from "react";
import { render, act } from "@testing-library/react";
import { useLastUsed } from "@/lib/hooks/useLastUsed";

function makeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

let captured: { value: string; setValue: (v: string) => void };
function Probe({ k, def }: { k: string; def: string }) {
  const [value, setValue] = useLastUsed(k, def);
  captured = { value, setValue };
  return null;
}
const probe = (k: string, def: string) => createElement(Probe, { k, def });

let store: Storage;
beforeEach(() => {
  store = makeStorage();
  Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true, writable: true });
});

describe("useLastUsed", () => {
  it("arranca en el default cuando no hay nada guardado", () => {
    render(probe("cxc_empresa", "all"));
    expect(captured.value).toBe("all");
  });

  it("persiste el valor y un montaje fresco lo recuerda (volver a la página)", () => {
    const first = render(probe("cxc_empresa", "all"));
    act(() => captured.setValue("vistana_international"));
    expect(captured.value).toBe("vistana_international");
    expect(store.getItem("fg_last_cxc_empresa")).toBe("vistana_international");
    first.unmount();

    // Nuevo montaje (como volver a CXC desde otro módulo): debe leer lo guardado.
    render(probe("cxc_empresa", "all"));
    expect(captured.value).toBe("vistana_international");
  });

  it("no persiste valores vacíos", () => {
    render(probe("cxc_empresa", "all"));
    act(() => captured.setValue(""));
    expect(store.getItem("fg_last_cxc_empresa")).toBeNull();
  });

  it("usa la key con prefijo fg_last_", () => {
    render(probe("prestamos_empresa", "all"));
    act(() => captured.setValue("fashion_wear"));
    expect(store.getItem("fg_last_prestamos_empresa")).toBe("fashion_wear");
  });
});
