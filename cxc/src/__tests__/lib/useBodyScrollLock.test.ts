// Prueba del lock compartido con contador de referencias. Simula el apilamiento
// real (BottomSheet con un ConfirmModal encima, como Préstamos → Pago Quincenal):
// el body se bloquea al abrir el primero y SOLO se restaura al cerrar el último.
// Sin JSX (el include de vitest es *.test.ts): usamos React.createElement.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { render } from "@testing-library/react";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";

function Locker({ locked }: { locked: boolean }) {
  useBodyScrollLock(locked);
  return null;
}
const locker = (locked: boolean) => createElement(Locker, { locked });

describe("useBodyScrollLock", () => {
  beforeEach(() => {
    document.body.style.cssText = "";
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true, writable: true });
  });

  it("bloquea al montar y restaura al desmontar", () => {
    const { unmount } = render(locker(true));
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.position).toBe("");
    expect(document.body.style.overflow).toBe("");
  });

  it("apilado: NO restaura hasta que se cierra el último (ref-count)", () => {
    // Abre el sheet de fondo (BottomSheet).
    const sheet = render(locker(true));
    expect(document.body.style.position).toBe("fixed");

    // Abre un modal ENCIMA (ConfirmModal) — el body sigue bloqueado.
    const modal = render(locker(true));
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.overflow).toBe("hidden");

    // Cierra el modal de encima: el body DEBE seguir bloqueado (el sheet sigue abierto).
    modal.unmount();
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.overflow).toBe("hidden");

    // Cierra el sheet: ahora sí se restaura el scroll.
    sheet.unmount();
    expect(document.body.style.position).toBe("");
    expect(document.body.style.overflow).toBe("");
  });

  it("preserva y restaura la posición de scroll", () => {
    Object.defineProperty(window, "scrollY", { value: 420, configurable: true, writable: true });
    const scrollSpy = vi.spyOn(window, "scrollTo");
    const { unmount } = render(locker(true));
    expect(document.body.style.top).toBe("-420px");
    unmount();
    expect(scrollSpy).toHaveBeenCalledWith(0, 420);
  });

  it("locked=false no toca el body", () => {
    render(locker(false));
    expect(document.body.style.position).toBe("");
    expect(document.body.style.overflow).toBe("");
  });
});
