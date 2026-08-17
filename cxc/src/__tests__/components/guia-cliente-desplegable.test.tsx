/**
 * El desplegable de CLIENTE, renderizado de verdad.
 *
 * 🩸 EL BUG (30-jul-2026). Daniel, textual: *"trato de hacer una guia de
 * despacho y cuando coloco el nombre del cliente se borra"*, y después, mirando
 * su propia captura: *"no es que se borra, sino que se esconde como en la foto
 * que te mande, es problema mas de ux"*.
 *
 * La lista se dibujaba `absolute` DENTRO de la fila, y la fila vive en un
 * `ScrollableTable` = `overflow-x-auto`. `overflow-x: auto` con `overflow-y:
 * visible` computa `overflow-y: auto`: ese contenedor recorta Y se vuelve
 * scrolleable cuando el contenido lo pasa. Medido en el navegador a 1440×900:
 *
 *   cerrado  → scrollHeight 114 == clientHeight 114
 *   abierto  → scrollHeight 397 vs clientHeight 114 → 283 px scrolleables,
 *              y 76 de los 81 px de la lista recortados (se veía una tira de 5)
 *   al scrollear esos 283 px la fila se iba de y=612 a y=329, por debajo del
 *   `thead` sticky, y en el hueco quedaba un pedazo de la lista encima de donde
 *   estaban DIRECCIÓN / EMPRESA / FACTURA(S)
 *
 * Lo que se congela acá es la CAUSA, que sí es medible en jsdom: que la lista NO
 * sea descendiente de la fila ni de ningún contenedor con overflow. La posición
 * en píxeles se prueba aparte (`lib/posicion-desplegable.test.ts`, aritmética
 * pura) y se mide en el navegador (`scripts/_medir-guia-cliente.mjs`).
 *
 * Ojo: subir el z-index NO era el arreglo. El recorte de un ancestro con
 * overflow no lo gana ningún apilamiento — la lista tiene que salir del flujo.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import ClientePicker from "@/components/ClientePicker";

const CLIENTES = [
  { codigo: "D-101", nombre: "CIA ALIMENTOS DE ANIMALES S.A" },
  { codigo: "D-170", nombre: "C.I.A.D.S.A" },
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ clientes: CLIENTES }) })),
  );
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  cleanup();
});

/** Deja pasar el debounce de 250 ms del hook y resolver el fetch. */
async function dejarBuscar() {
  await act(async () => {
    vi.advanceTimersByTime(400);
    await Promise.resolve();
  });
}

/**
 * El picker DENTRO de la misma jaula que lo rompía: un contenedor con
 * `overflow-x-auto` (el ScrollableTable) y una tabla. Si la lista vuelve a ser
 * hija de la fila, este arnés lo delata.
 */
function EnLaTabla({ inicial = "", codigoInicial = "" }: { inicial?: string; codigoInicial?: string }) {
  const [cliente, setCliente] = useState(inicial);
  const [codigo, setCodigo] = useState(codigoInicial);
  const [direccion, setDireccion] = useState("");
  return (
    <div data-testid="scroller" style={{ overflowX: "auto" }}>
      <table>
        <tbody>
          <tr data-testid="fila">
            <td data-testid="celda-cliente">
              <ClientePicker
                id="cliente-uid-d"
                value={cliente}
                codigo={codigo}
                onChange={(n, c) => { setCliente(n); setCodigo(c); }}
                topClientes={[{ codigo: "D-999", nombre: "El Machetazo" }]}
              />
            </td>
            <td>
              <input
                aria-label="Dirección"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const campo = () => screen.getByRole("combobox") as HTMLInputElement;
// Desde el 30-jul-2026 el portal lo dibuja `DesplegableFlotante`, compartido
// por los seis desplegables del sistema; la marca del control va en
// `data-desplegable` y hacia dónde se abrió, en `data-hacia`.
const lista = () => document.querySelector('[data-desplegable="cliente"]');

async function escribir(texto: string) {
  fireEvent.focus(campo());
  fireEvent.change(campo(), { target: { value: texto } });
  await dejarBuscar();
}

describe("Abrir la lista NO puede meterse en el flujo de la fila", () => {
  it("la lista NO es descendiente de la fila ni de la celda", async () => {
    render(<EnLaTabla />);
    await escribir("CI");
    const l = lista();
    expect(l).toBeTruthy();
    expect(screen.getByTestId("fila").contains(l!)).toBe(false);
    expect(screen.getByTestId("celda-cliente").contains(l!)).toBe(false);
  });

  it("la lista NO es descendiente del contenedor con overflow que la recortaba", async () => {
    render(<EnLaTabla />);
    await escribir("CI");
    expect(screen.getByTestId("scroller").contains(lista()!)).toBe(false);
  });

  it("vive en <body>: ningún ancestro con overflow puede recortarla", async () => {
    render(<EnLaTabla />);
    await escribir("CI");
    let n = lista()!.parentElement;
    const conOverflow: string[] = [];
    while (n && n !== document.body) {
      const ov = (n as HTMLElement).style.overflowX || (n as HTMLElement).style.overflowY;
      if (ov && ov !== "visible") conOverflow.push(n.tagName);
      n = n.parentElement;
    }
    expect(conOverflow).toEqual([]);
  });

  it("se posiciona en coordenadas de viewport (fixed), no relativo a la fila", async () => {
    render(<EnLaTabla />);
    await escribir("CI");
    expect((lista() as HTMLElement).style.position).toBe("fixed");
  });

  it("cerrar la lista la saca del DOM — no deja una caja fantasma", async () => {
    render(<EnLaTabla />);
    await escribir("CI");
    expect(lista()).toBeTruthy();
    fireEvent.keyDown(campo(), { key: "Escape" });
    expect(lista()).toBeNull();
  });
});

describe("Lo que se escribió sigue A LA VISTA mientras se elige", () => {
  it("el campo muestra lo tecleado, no un placeholder gris", async () => {
    render(<EnLaTabla />);
    await escribir("CI");
    expect(campo().value).toBe("CI");
  });

  it("enfocar un cliente ya puesto NO vacía el campo", async () => {
    // Era la otra mitad del "se esconde": el onFocus limpiaba la búsqueda, así
    // que el nombre puesto desaparecía y quedaba de placeholder gris.
    render(<EnLaTabla inicial="CIA ALIMENTOS DE ANIMALES S.A" codigoInicial="D-101" />);
    fireEvent.focus(campo());
    expect(campo().value).toBe("CIA ALIMENTOS DE ANIMALES S.A");
  });

  it("la lista no arranca encima del campo: se ancla por debajo o por arriba", async () => {
    render(<EnLaTabla />);
    await escribir("CI");
    expect(["abajo", "arriba"]).toContain(lista()!.getAttribute("data-hacia"));
  });
});

describe("Elegir de la lista deja el cliente VINCULADO", () => {
  it("tocar un resultado guarda nombre y código D-XXX", async () => {
    render(<EnLaTabla />);
    await escribir("CI");
    fireEvent.mouseDown(screen.getByText("C.I.A.D.S.A"));
    expect(campo().value).toBe("C.I.A.D.S.A");
    expect(screen.getByTitle("Vinculado al directorio (D-170)").textContent).toBe("D-170");
  });

  it("el chip del código es VERDE (vinculado)", async () => {
    render(<EnLaTabla />);
    await escribir("CI");
    fireEvent.mouseDown(screen.getByText("C.I.A.D.S.A"));
    expect(screen.getByTitle("Vinculado al directorio (D-170)").className).toContain("emerald");
  });

  it("la salida a mano guarda el texto con el chip ÁMBAR, y se llama con todas las letras", async () => {
    render(<EnLaTabla />);
    await escribir("Cliente nuevo");
    // 🔑 Se toca el RÓTULO NUEVO. Decía "Otro", y "Otro" se lee como un cliente
    // más de la lista: alguien la tocaba sin buscar primero.
    fireEvent.mouseDown(screen.getByText(/No está en la lista — escribir a mano/));
    expect(campo().value).toBe("Cliente nuevo");
    const chip = screen.getByTitle("Escrito a mano — no está en el directorio");
    expect(chip.textContent).toBe("A mano");
    expect(chip.className).toContain("amber");
  });

  it("🔴 la salida a mano NO puede volver a llamarse solo \"Otro\"", async () => {
    render(<EnLaTabla />);
    await escribir("Cliente nuevo");
    const lista = document.querySelector('[data-desplegable="cliente"]')!;
    expect(lista.textContent).toContain("No está en la lista — escribir a mano");
    // El texto tecleado se sigue viendo: es lo que se va a guardar.
    expect(lista.textContent).toContain("Cliente nuevo");
    // Y en ningún lado queda un "Otro" pelado que se lea como un cliente.
    expect(lista.textContent).not.toMatch(/(^|[^a-zA-ZáéíóúñÁÉÍÓÚÑ])Otro([^a-zA-ZáéíóúñÁÉÍÓÚÑ]|$)/);
  });

  it("los MÁS USADOS siguen apareciendo sin teclear — Daniel los usa", async () => {
    render(<EnLaTabla />);
    fireEvent.focus(campo());
    await dejarBuscar();
    expect(screen.getByText("Más usados")).toBeTruthy();
    expect(screen.getByText("El Machetazo")).toBeTruthy();
  });
});

describe("Un cliente ya elegido no se borra al seguir llenando la fila", () => {
  it("tocar Dirección después de elegir deja el cliente y su código", async () => {
    render(<EnLaTabla />);
    await escribir("CI");
    fireEvent.mouseDown(screen.getByText("C.I.A.D.S.A"));

    fireEvent.mouseDown(screen.getByLabelText("Dirección"));
    fireEvent.focus(screen.getByLabelText("Dirección"));
    fireEvent.change(screen.getByLabelText("Dirección"), { target: { value: "Calle 19" } });

    expect(campo().value).toBe("C.I.A.D.S.A");
    expect(screen.getByTitle("Vinculado al directorio (D-170)")).toBeTruthy();
  });

  it("cerrar sin elegir NO ensucia la fila con lo tecleado a medias", async () => {
    // La regla del #326 se mantiene: la fila solo cambia al elegir. Lo que
    // cambió es que ahora se VE lo que se escribe mientras se elige.
    render(<EnLaTabla inicial="C.I.A.D.S.A" codigoInicial="D-170" />);
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: "otra cosa a medias" } });
    await dejarBuscar();
    fireEvent.mouseDown(document.body);
    expect(campo().value).toBe("C.I.A.D.S.A");
    expect(screen.getByTitle("Vinculado al directorio (D-170)")).toBeTruthy();
  });

  it("tocar una opción NO se lo come el cierre por click de afuera", async () => {
    // La lista vive en un portal, o sea FUERA del wrapper: si el handler de
    // "click afuera" solo mirara el wrapper, el primer toque cerraría la lista
    // y nunca se podría elegir nada.
    render(<EnLaTabla />);
    await escribir("CI");
    fireEvent.mouseDown(lista()!);
    expect(lista()).toBeTruthy();
  });
});
