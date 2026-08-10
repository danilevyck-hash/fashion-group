/**
 * La ventana de "Atar cliente", RENDERIZADA de verdad.
 *
 * 🔴 EL RIESGO QUE ESTE ARCHIVO EXISTE PARA CAZAR NO ES LA MATEMÁTICA — esa ya
 * la cubre `lib/clientes-sugerencias.test.ts`. Es que la sugerencia se CONVIERTA
 * en un atado: que tocarla llame a guardar, o que el botón Guardar quede
 * disparado sin que nadie lo apriete. Una línea atada al cliente equivocado
 * conserva el texto escrito y no deja rastro: no hay forma de darse cuenta
 * después salvo que el cliente reclame mercancía que nunca pidió.
 *
 * Un test de la función pura NO puede ver eso. Hay que tocar el botón.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import AtarClienteModal from "@/app/guias/components/AtarClienteModal";

const DIRECTORIO = [
  { codigo: "D-71", nombre: "Hanna Calzados" },
  { codigo: "D-142", nombre: "Sporting Shoes N 4" },
  { codigo: "D-143", nombre: "Sportsam" },
];

/**
 * En este arnés `localStorage` es un objeto pelado sin los métodos de Storage.
 * `ModalOverlay` lee la barra lateral al montar, así que necesita uno de verdad.
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
  vi.stubGlobal("localStorage", almacenFalso());
  vi.stubGlobal("sessionStorage", almacenFalso());
  // El selector de abajo pide el directorio al enfocarse; acá no se enfoca,
  // pero se dobla igual para que ningún fetch real se escape del test.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ clientes: DIRECTORIO, total: DIRECTORIO.length }),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function abrir(props: Partial<React.ComponentProps<typeof AtarClienteModal>> = {}) {
  const onGuardar = vi.fn();
  render(
    <AtarClienteModal
      open
      clienteTexto="Hanna Calzado"
      codigoActual=""
      topClientes={[]}
      clientesDelGrupo={DIRECTORIO}
      guardando={false}
      error={null}
      onClose={() => {}}
      onGuardar={onGuardar}
      {...props}
    />,
  );
  return { onGuardar };
}

describe("🔴 la sugerencia NO ata", () => {
  it("tocar una sugerencia no guarda nada", () => {
    const { onGuardar } = abrir();
    fireEvent.click(screen.getByRole("button", { name: /Hanna Calzados/ }));
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it("recién al apretar Guardar se escribe, y con el código elegido", () => {
    const { onGuardar } = abrir();
    fireEvent.click(screen.getByRole("button", { name: /Hanna Calzados/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onGuardar).toHaveBeenCalledTimes(1);
    expect(onGuardar).toHaveBeenCalledWith("D-71");
  });

  it("con un solo candidato clavado, abrir la ventana tampoco guarda", () => {
    const { onGuardar } = abrir();
    expect(screen.getByText("Hanna Calzados")).toBeTruthy();
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it("Guardar arranca deshabilitado: sin elegir no hay nada que escribir", () => {
    abrir();
    const guardar = screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);
  });
});

describe("🔴 el aviso de números se VE en pantalla", () => {
  it("Sporting Shoes N7 muestra el candidato con su advertencia", () => {
    abrir({ clienteTexto: "Sporting Shoes N7 " });
    expect(screen.getByText(/Sporting Shoes N 4/)).toBeTruthy();
    expect(screen.getByText(/los números no son los mismos/i)).toBeTruthy();
  });

  it("y aun así no ata: hay que tocar y después Guardar", () => {
    const { onGuardar } = abrir({ clienteTexto: "Sporting Shoes N7 " });
    expect(onGuardar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Sporting Shoes N 4/ }));
    expect(onGuardar).not.toHaveBeenCalled();
  });
});

describe("🔴 cuando no hay parecidos, la pantalla lo DICE", () => {
  it("dice que no hay ninguno y que hay que darlo de alta en Switch", () => {
    abrir({ clienteTexto: "HOTEL GRAN DAVID" });
    expect(screen.getByText(/No hay ningún cliente parecido/i)).toBeTruthy();
    expect(screen.getByText(/darlo de alta en Switch/i)).toBeTruthy();
  });

  it("🩸 SIN directorio se calla: no puede afirmar que no hay nada", () => {
    // Decir "no hay ninguno" sin haber podido mirar mandaría a dar de alta un
    // cliente que quizá ya existe.
    abrir({ clienteTexto: "HOTEL GRAN DAVID", clientesDelGrupo: [] });
    expect(screen.queryByText(/No hay ningún cliente parecido/i)).toBeNull();
    expect(screen.queryByText(/¿Quisiste decir/i)).toBeNull();
  });
});

describe("la ventana sigue haciendo lo de antes", () => {
  it("el texto escrito por bodega se muestra y NO se toca", () => {
    abrir();
    expect(screen.getByText("Hanna Calzado")).toBeTruthy();
  });

  /**
   * 🩸 "Lo que dice la guía no cambia" es lo que hace que alguien se anime a
   * tocar una guía CERRADA. Desde la poda de textos (ago-2026) no está suelto
   * en la ventana: vive dentro del ⓘ "Qué se guarda". Escondido detrás de un
   * toque sigue valiendo; BORRADO, no. Por eso el candado ya no busca el texto
   * a secas —eso volvería a ponerse verde el día que alguien lo dejara en un
   * comentario— sino que ABRE el ⓘ y comprueba que se puede leer.
   */
  it("🩸 el ⓘ dice que la guía no cambia, y se llega tocándolo", () => {
    abrir();
    expect(screen.queryByText(/Lo que dice la guía no cambia/i)).toBeNull();

    const ayuda = screen.getByRole("button", { name: "Qué se guarda" });
    fireEvent.click(ayuda);

    expect(screen.getByText(/Lo que dice la guía no cambia/i)).toBeTruthy();
  });

  it("una línea YA atada no ve sugerencias — ofrecer otras invita a cambiarla", () => {
    abrir({ codigoActual: "D-71", nombreActual: "Hanna Calzados" });
    expect(screen.queryByText(/¿Quisiste decir/i)).toBeNull();
  });

  it("una línea ya atada conserva el botón Quitar", () => {
    const { onGuardar } = abrir({ codigoActual: "D-71", nombreActual: "Hanna Calzados" });
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    expect(onGuardar).toHaveBeenCalledWith(null);
  });
});
