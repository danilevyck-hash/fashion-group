// El bug que reportó Daniel, congelado como test.
//
//   > "al poner clic en n chequees, me deja poner un digito cada clic"
//   > "no me deja escribir el nombre del cliente"
//
// Los dos eran el MISMO defecto: robo de foco. El efecto del autofocus del
// `Drawer` tenía `onClose` entre sus dependencias; los llamadores la pasan
// inline, así que su identidad cambiaba en cada render y el efecto —con su
// `setTimeout` de 50 ms— se volvía a montar después de CADA tecla. 50 ms más
// tarde el foco saltaba al primer elemento enfocable del panel, que no era un
// campo sino el botón ✕.
//
// Este archivo cubre las dos mitades del arreglo (que el efecto no dependa de
// `onClose`, y que se enfoque un CAMPO y no un botón) en los dos lugares donde
// viven: el `Drawer` compartido y el formulario de cheques.
//
// Sobre los tiempos: se usan timers falsos porque el defecto ERA un timer. Sin
// avanzar el reloj, el test pasaría con el bug puesto.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { useState } from "react";
import Drawer from "@/components/Drawer";
import ChequeFormModal, { chequeFormVacio, type ChequeFormValues } from "@/app/cheques/components/ChequeFormModal";
import { primerCampoEnfocable } from "@/lib/hooks/useAutofocusPrimerCampo";

vi.mock("next/navigation", () => ({
  usePathname: () => "/cheques",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

/** Deja pasar el reloj lo suficiente para que cualquier autofocus diferido corra. */
function pasarElTiempo(ms = 300) {
  act(() => { vi.advanceTimersByTime(ms); });
}

/**
 * En este arnés `localStorage`/`sessionStorage` son objetos pelados (`{}`) sin
 * los métodos de Storage, así que hay que darles una implementación de verdad:
 * el borrador y la lista de vendedores del navegador los usan.
 */
function almacenFalso(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => { m.clear(); },
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubGlobal("localStorage", almacenFalso());
  vi.stubGlobal("sessionStorage", almacenFalso());
  // Todas las listas del formulario salen por fetch. Sin red en el test:
  // vendedores por defecto y sin chips.
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true,
    json: async () =>
      String(url).includes("/vendedores")
        ? { vendedores: ["Rey", "Edwin"], fuente: "db" }
        : { clientes: [] },
  })));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. La causa raíz, en el Drawer compartido
// ─────────────────────────────────────────────────────────────────────────────

/** Reproduce la forma EXACTA en que Cheques usaba el Drawer: `onClose` inline. */
function DrawerConOnCloseInline() {
  const [texto, setTexto] = useState("");
  return (
    <Drawer
      open
      // ⚠️ A propósito: función nueva en cada render. Es lo que hacía
      // `ChequesClient.tsx:662` y lo que disparaba el bug.
      onClose={() => { /* inline */ }}
      title="Nuevo Cheque"
      footer={<button>Guardar</button>}
    >
      <input aria-label="N° Cheque" value={texto} onChange={(e) => setTexto(e.target.value)} />
    </Drawer>
  );
}

describe("Drawer — el foco no se roba (causa raíz del dígito por clic)", () => {
  it("el autofocus cae en el primer CAMPO, nunca en el botón Cerrar", () => {
    render(<DrawerConOnCloseInline />);
    pasarElTiempo();
    expect(document.activeElement).toBe(screen.getByLabelText("N° Cheque"));
    expect(document.activeElement).not.toBe(screen.getByLabelText("Cerrar"));
  });

  it("escribir seis dígitos seguidos deja los seis, con re-render de por medio", () => {
    render(<DrawerConOnCloseInline />);
    pasarElTiempo();
    const input = screen.getByLabelText("N° Cheque") as HTMLInputElement;
    input.focus();

    // Tecla por tecla, dejando correr el reloj entre una y otra: es justo la
    // ventana en la que el efecto viejo se re-montaba y robaba el foco.
    for (const d of "246001") {
      fireEvent.change(input, { target: { value: input.value + d } });
      pasarElTiempo(120);
      expect(document.activeElement).toBe(input);
    }

    expect(input.value).toBe("246001");
  });

  it("cerrado, sus campos salen del recorrido del Tab", () => {
    const { container } = render(
      <Drawer open={false} onClose={() => {}} title="Nuevo Cheque">
        <input aria-label="N° Cheque" />
      </Drawer>,
    );
    const panel = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(panel.className).toContain("invisible");
    expect(panel.className).toContain("pointer-events-none");
    expect(panel.getAttribute("aria-hidden")).toBe("true");
  });

  it("el pie respeta la barra de gestos del iPhone", () => {
    const { container } = render(
      <Drawer open onClose={() => {}} title="X" footer={<button>Guardar</button>}>
        <input aria-label="a" />
      </Drawer>,
    );
    const footer = container.querySelector("footer") as HTMLElement;
    expect(footer.style.paddingBottom).toContain("safe-area-inset-bottom");
  });
});

describe("primerCampoEnfocable", () => {
  it("saltea los botones y devuelve el primer campo", () => {
    const root = document.createElement("div");
    root.innerHTML = `<button id="cerrar">x</button><input id="uno"><input id="dos">`;
    expect(primerCampoEnfocable(root)?.id).toBe("uno");
  });

  it("saltea campos deshabilitados u ocultos", () => {
    const root = document.createElement("div");
    root.innerHTML = `<input type="hidden" id="h"><input id="d" disabled><textarea id="ok"></textarea>`;
    expect(primerCampoEnfocable(root)?.id).toBe("ok");
  });

  it("sin campos NO devuelve el botón de cerrar: devuelve null", () => {
    const root = document.createElement("div");
    root.innerHTML = `<button aria-label="Cerrar">x</button><a href="#">link</a>`;
    expect(primerCampoEnfocable(root)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. El formulario de cheques ya en ventana centrada
// ─────────────────────────────────────────────────────────────────────────────

const CHEQUE_VIEJO: ChequeFormValues = {
  cliente: "PLAZA LOS ANGELES",
  empresa: "vistana",
  numero_cheque: "18835",
  monto: "11069.32",
  fecha_deposito: "2026-04-30",
  cliente_codigo: "D-126",
  notas: "",
  vendedor: "Rey",
};

async function montarFormulario(over: Partial<Parameters<typeof ChequeFormModal>[0]> = {}) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const props = {
    open: true,
    editingId: null as string | null,
    initial: chequeFormVacio(),
    onClose,
    onSave,
    saving: false,
    isOnline: true,
    error: null as string | null,
    ...over,
  };
  const utils = render(<ChequeFormModal {...props} />);
  // Las listas (vendedores, más usados) llegan por fetch: hay que dejar correr
  // las microtareas DENTRO de act o React avisa que hubo un update sin envolver.
  await act(async () => { await Promise.resolve(); vi.advanceTimersByTime(300); });
  return { ...utils, onSave, onClose };
}

describe("Formulario de cheques — ventana centrada", () => {
  it("el autofocus cae en el campo Cliente, no en el botón Cerrar", async () => {
    await montarFormulario();
    const cliente = document.querySelector("#cheque-cliente") as HTMLInputElement;
    expect(document.activeElement).toBe(cliente);
    expect(document.activeElement).not.toBe(screen.getByLabelText("Cerrar"));
  });

  it("se puede escribir el nombre del cliente de corrido", async () => {
    await montarFormulario();
    const cliente = document.querySelector("#cheque-cliente") as HTMLInputElement;
    fireEvent.focus(cliente);
    for (const ch of "XTREME") {
      fireEvent.change(cliente, { target: { value: cliente.value + ch } });
      pasarElTiempo(120);
      expect(document.activeElement).toBe(cliente);
    }
    expect(cliente.value).toBe("XTREME");
  });

  it("seis dígitos de N° de cheque quedan los seis (el reporte de Daniel)", async () => {
    await montarFormulario();
    const numero = screen.getByLabelText("N° Cheque") as HTMLInputElement;
    numero.focus();
    for (const d of "246001") {
      fireEvent.change(numero, { target: { value: numero.value + d } });
      pasarElTiempo(120);
      expect(document.activeElement).toBe(numero);
    }
    expect(numero.value).toBe("246001");
  });

  it("Enter en un campo no cierra la ventana ni borra lo escrito", async () => {
    const { onClose, onSave } = await montarFormulario();
    const numero = screen.getByLabelText("N° Cheque") as HTMLInputElement;
    fireEvent.change(numero, { target: { value: "246001" } });
    fireEvent.keyDown(numero, { key: "Enter", code: "Enter" });
    pasarElTiempo();
    expect(onClose).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect((screen.getByLabelText("N° Cheque") as HTMLInputElement).value).toBe("246001");
  });

  it("Escape con el formulario ya escrito tampoco lo borra", async () => {
    const { onClose } = await montarFormulario();
    const numero = screen.getByLabelText("N° Cheque") as HTMLInputElement;
    fireEvent.change(numero, { target: { value: "246001" } });
    pasarElTiempo();
    fireEvent.keyDown(document, { key: "Escape" });
    pasarElTiempo();
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText("N° Cheque") as HTMLInputElement).value).toBe("246001");
  });

  it("el formulario NO es un <form>: no hay submit implícito que guarde solo", async () => {
    const { container } = await montarFormulario();
    expect(container.querySelector("form")).toBeNull();
  });
});

describe("Formulario de cheques — editar uno viejo", () => {
  it("muestra el cliente y el vendedor guardados y los guarda sin perderlos", async () => {
    const { onSave } = await montarFormulario({ editingId: "abc", initial: CHEQUE_VIEJO });

    // Al editar NO se roba el foco: si el selector de cliente se enfocara, se
    // convertiría en un buscador vacío y el nombre guardado se vería BORRADO.
    const cliente = document.querySelector("#cheque-cliente") as HTMLInputElement;
    expect(document.activeElement).not.toBe(cliente);
    expect(cliente.value).toBe("PLAZA LOS ANGELES");
    expect((screen.getByLabelText("N° Cheque") as HTMLInputElement).value).toBe("18835");
    expect((screen.getByLabelText("Vendedor") as HTMLInputElement).value).toBe("Rey");

    fireEvent.click(screen.getByText("Guardar Cheque"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      cliente: "PLAZA LOS ANGELES",
      vendedor: "Rey",
      numero_cheque: "18835",
      fecha_deposito: "2026-04-30",
    });
  });

  it("un vendedor viejo que ya no está en la lista sigue estando disponible", async () => {
    await montarFormulario({ editingId: "abc", initial: { ...CHEQUE_VIEJO, vendedor: "Julio" } });
    // "Julio" no viene ni de la base ni de los valores por defecto: entra
    // porque el cheque lo tenía guardado. Si no, editar y guardar el cheque le
    // habría borrado quién lo entregó.
    expect((screen.getByLabelText("Vendedor") as HTMLInputElement).value).toBe("Julio");
  });

  it("el borrador NO se ofrece cuando se está editando un cheque existente", async () => {
    localStorage.setItem(
      "fg_draft_cheque_anon",
      JSON.stringify({ data: { cliente: "OTRO", empresa: "", numero: "1", monto: "5", fecha: "2026-01-01" }, savedAt: Date.now() }),
    );
    await montarFormulario({ editingId: "abc", initial: CHEQUE_VIEJO });
    expect(screen.queryByText("Restaurar")).toBeNull();
  });
});
