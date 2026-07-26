// Cierre de modales con clic FUERA del cuadro y con Escape.
//
// Cubre las tres trampas que hacen que "onClick={onClose}" en el backdrop se
// comporte mal en la app real:
//   1. un clic DENTRO del panel burbujea al backdrop y cierra el modal;
//   2. arrastrar para seleccionar texto desde adentro y soltar afuera cierra el
//      modal (y con él, el formulario a medio llenar);
//   3. un formulario ya tocado no debe perderse por un clic accidental.
// Sin JSX (el include de vitest es *.test.ts): usamos React.createElement.

import { describe, it, expect, vi } from "vitest";
import { createElement, useState } from "react";
import { render, fireEvent } from "@testing-library/react";
import {
  useBackdropDismiss,
  useEscapeClose,
  useFormModalDismiss,
} from "@/lib/hooks/useModalDismiss";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";

// Modal simple: backdrop con el panel adentro (el layout real del repo).
function ModalSimple({ onClose, enabled = true }: { onClose: () => void; enabled?: boolean }) {
  const backdrop = useBackdropDismiss(enabled ? onClose : undefined);
  useEscapeClose(true, onClose, enabled);
  return createElement(
    "div",
    { "data-testid": "backdrop", ...backdrop },
    createElement("div", { "data-testid": "panel" }, createElement("button", { "data-testid": "boton" }, "ok")),
  );
}

// Modal con formulario: solo cierra si los campos siguen intactos.
function ModalConForm({ onClose, inicial = "" }: { onClose: () => void; inicial?: string }) {
  const [valor, setValor] = useState(inicial);
  const { panelRef, backdrop } = useFormModalDismiss(true, onClose);
  return createElement(
    "div",
    { "data-testid": "backdrop", ...backdrop },
    createElement(
      "div",
      { "data-testid": "panel", ref: panelRef },
      createElement("input", {
        "data-testid": "campo",
        value: valor,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValor(e.target.value),
      }),
    ),
  );
}

/** Clic completo (mousedown + click) sobre el mismo elemento. */
function clicEn(el: HTMLElement) {
  fireEvent.mouseDown(el);
  fireEvent.click(el);
}

describe("useBackdropDismiss", () => {
  it("cierra al hacer clic en el backdrop", () => {
    const onClose = vi.fn();
    const { getByTestId } = render(createElement(ModalSimple, { onClose }));
    clicEn(getByTestId("backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("NO cierra al hacer clic dentro del panel (aunque burbujee)", () => {
    const onClose = vi.fn();
    const { getByTestId } = render(createElement(ModalSimple, { onClose }));
    clicEn(getByTestId("panel"));
    clicEn(getByTestId("boton"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("NO cierra si el arrastre empieza dentro y termina en el backdrop", () => {
    // Seleccionar texto en un input y soltar afuera: el click llega con target
    // = backdrop. Sin el guard de mousedown esto borraría el formulario.
    const onClose = vi.fn();
    const { getByTestId } = render(createElement(ModalSimple, { onClose }));
    fireEvent.mouseDown(getByTestId("panel"));
    fireEvent.click(getByTestId("backdrop"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("desactivado (enabled=false) no cierra ni por clic ni por Escape", () => {
    const onClose = vi.fn();
    const { getByTestId } = render(createElement(ModalSimple, { onClose, enabled: false }));
    clicEn(getByTestId("backdrop"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("useEscapeClose", () => {
  it("cierra con Escape", () => {
    const onClose = vi.fn();
    render(createElement(ModalSimple, { onClose }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignora otras teclas", () => {
    const onClose = vi.fn();
    render(createElement(ModalSimple, { onClose }));
    fireEvent.keyDown(document, { key: "Enter" });
    fireEvent.keyDown(document, { key: "a" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("deja de escuchar al desmontar", () => {
    const onClose = vi.fn();
    const { unmount } = render(createElement(ModalSimple, { onClose }));
    unmount();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("useFormModalDismiss", () => {
  it("cierra con clic fuera si el formulario está intacto", () => {
    const onClose = vi.fn();
    const { getByTestId } = render(createElement(ModalConForm, { onClose }));
    clicEn(getByTestId("backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("NO cierra con clic fuera si ya se escribió algo", () => {
    const onClose = vi.fn();
    const { getByTestId } = render(createElement(ModalConForm, { onClose }));
    fireEvent.change(getByTestId("campo"), { target: { value: "Cliente nuevo" } });
    clicEn(getByTestId("backdrop"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("NO cierra con Escape si ya se escribió algo", () => {
    const onClose = vi.fn();
    const { getByTestId } = render(createElement(ModalConForm, { onClose }));
    fireEvent.change(getByTestId("campo"), { target: { value: "algo" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("en modo edición, cierra si el valor precargado no cambió", () => {
    // Editar un cliente y salir sin tocar nada: debe cerrar como cualquier modal.
    const onClose = vi.fn();
    const { getByTestId } = render(createElement(ModalConForm, { onClose, inicial: "Juan Pérez" }));
    clicEn(getByTestId("backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("en modo edición, NO cierra si se modificó el valor precargado", () => {
    const onClose = vi.fn();
    const { getByTestId } = render(createElement(ModalConForm, { onClose, inicial: "Juan Pérez" }));
    fireEvent.change(getByTestId("campo"), { target: { value: "Juan Pérez S.A." } });
    clicEn(getByTestId("backdrop"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("vuelve a cerrar si el usuario deshace lo que escribió", () => {
    const onClose = vi.fn();
    const { getByTestId } = render(createElement(ModalConForm, { onClose }));
    fireEvent.change(getByTestId("campo"), { target: { value: "algo" } });
    fireEvent.change(getByTestId("campo"), { target: { value: "" } });
    clicEn(getByTestId("backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Scroll del fondo.
//
// Estos modales pintan su propio backdrop `fixed` (no pasan por ModalOverlay),
// y sin lock el body sigue scrolleando por detrás: en iOS se arrastra el fondo
// con el modal abierto y al cerrar la página quedó en otro lado. El lock vive
// dentro del hook para que los ~14 consumidores lo hereden sin tocarlos.

/** ¿Está el body congelado? El hook usa el patrón iOS: position:fixed. */
function bodyBloqueado() {
  return document.body.style.position === "fixed" && document.body.style.overflow === "hidden";
}

/** Modal cuyo `open` lo maneja el test (para probar abrir/cerrar sin desmontar). */
function ModalControlado({ open }: { open: boolean }) {
  const { panelRef, backdrop } = useFormModalDismiss(open, () => {});
  if (!open) return null;
  return createElement(
    "div",
    { "data-testid": "backdrop", ...backdrop },
    createElement("div", { "data-testid": "panel", ref: panelRef }),
  );
}

/** Consumidor que ADEMÁS bloquea por su cuenta (el caso de los modales de
 *  Marketing). El contador de referencias debe tolerarlo. */
function ModalConLockPropio({ onClose }: { onClose: () => void }) {
  useBodyScrollLock(true);
  const { panelRef, backdrop } = useFormModalDismiss(true, onClose);
  return createElement(
    "div",
    { "data-testid": "backdrop", ...backdrop },
    createElement("div", { "data-testid": "panel", ref: panelRef }),
  );
}

describe("useFormModalDismiss — scroll del fondo", () => {
  it("el body queda libre si no hay ningún modal", () => {
    expect(bodyBloqueado()).toBe(false);
  });

  it("bloquea el body mientras el modal está abierto y lo suelta al cerrar", () => {
    const { rerender, unmount } = render(createElement(ModalControlado, { open: true }));
    expect(bodyBloqueado()).toBe(true);
    rerender(createElement(ModalControlado, { open: false }));
    expect(bodyBloqueado()).toBe(false);
    unmount();
  });

  it("lo suelta también si el modal se desmonta abierto", () => {
    const { unmount } = render(createElement(ModalControlado, { open: true }));
    expect(bodyBloqueado()).toBe(true);
    unmount();
    expect(bodyBloqueado()).toBe(false);
  });

  it("con dos modales apilados, el fondo sigue bloqueado hasta que cierra el último", () => {
    const primero = render(createElement(ModalControlado, { open: true }));
    const segundo = render(createElement(ModalControlado, { open: true }));
    expect(bodyBloqueado()).toBe(true);
    segundo.unmount();
    expect(bodyBloqueado()).toBe(true); // el de abajo sigue abierto
    primero.unmount();
    expect(bodyBloqueado()).toBe(false);
  });

  it("un consumidor que ya llamaba a useBodyScrollLock no deja el body trabado", () => {
    const { unmount } = render(createElement(ModalConLockPropio, { onClose: vi.fn() }));
    expect(bodyBloqueado()).toBe(true);
    unmount();
    expect(bodyBloqueado()).toBe(false);
  });
});
