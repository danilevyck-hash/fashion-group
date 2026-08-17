/**
 * 🔑 LA RED DE SEGURIDAD DEL SELECTOR, RENDERIZADA DE VERDAD.
 *
 * Daniel vio una guía donde alguien **escribió a mano el nombre de un cliente
 * que SÍ estaba en la lista** y el renglón quedó sin atar. Su propuesta, textual:
 * *"que se escriba como un buscador los clientes y solo texto libre si ponen la
 * opción de otros"* — *"sin hacer fricción ni complicarlo"*.
 *
 * Acá se prueba la mitad que un test de función pura NO puede ver: que el
 * selector OFREZCA el cliente parecido, que tocarlo lo ate de un toque, y —lo
 * que más importa— que **NUNCA ate solo**. Una línea atada al cliente
 * equivocado conserva el texto escrito y no deja rastro: nadie se entera hasta
 * que el cliente reclama mercancía que nunca pidió.
 *
 * El selector es UNO solo (`ClientePicker`), así que esta conducta es la misma
 * en Guías, en Cheques y en Marketing. Por eso se prueba sobre el componente
 * compartido y no pantalla por pantalla.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ClientePicker from "@/components/ClientePicker";

/** Clientes REALES del directorio del grupo. */
const DIRECTORIO = [
  { codigo: "D-25", nombre: "City Mall Paso Canoa" },
  { codigo: "D-24", nombre: "City Mall David" },
  { codigo: "D-142", nombre: "Sporting Shoes N 4" },
  // 🩸 El duplicado sin respaldo en Switch: existe, pero NO se recomienda.
  { codigo: "D-201", nombre: "American Classics" },
  { codigo: "D-108", nombre: "American Classics Store" },
];

beforeEach(() => {
  // El selector solo sale a la red al buscar; acá el directorio va por prop.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ clientes: [], total: 0 }) })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * El selector dentro de la MISMA jaula de una fila de guía: un contenedor con
 * `overflow-x-auto` y una tabla. Si la red creciera de lado, acá se vería.
 */
function EnLaFila({
  inicial = "",
  codigoInicial = "",
  directorio = DIRECTORIO,
  permitirOtro = true,
  onChange,
}: {
  inicial?: string;
  codigoInicial?: string;
  directorio?: typeof DIRECTORIO;
  permitirOtro?: boolean;
  onChange?: (nombre: string, codigo: string) => void;
}) {
  const [cliente, setCliente] = useState(inicial);
  const [codigo, setCodigo] = useState(codigoInicial);
  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <tbody>
          <tr>
            <td>
              <ClientePicker
                value={cliente}
                codigo={codigo}
                clientesDelGrupo={directorio}
                permitirOtro={permitirOtro}
                onChange={(n, c) => {
                  setCliente(n);
                  setCodigo(c);
                  onChange?.(n, c);
                }}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

describe("Escribir a mano algo que SÍ está en la lista se atrapa ahí mismo", () => {
  it('pregunta "¿Es City Mall Paso Canoa (D-25)?" con el nombre y el código', () => {
    render(<EnLaFila inicial="City Mal Paso Canoas" />);
    expect(screen.getByText(/¿Es City Mall Paso Canoa/)).toBeTruthy();
    expect(screen.getByText(/D-25/)).toBeTruthy();
  });

  it("un toque en Sí lo deja ATADO al código, sin volver a buscar", () => {
    const onChange = vi.fn();
    render(<EnLaFila inicial="City Mal Paso Canoas" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Sí, es City Mall Paso Canoa/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("City Mall Paso Canoa", "D-25");
  });

  it('"No, es otro" deja el texto a mano y no vuelve a preguntar por ESE nombre', () => {
    const onChange = vi.fn();
    render(<EnLaFila inicial="City Mal Paso Canoas" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "No, es otro" }));
    expect(screen.queryByText(/¿Es City Mall Paso Canoa/)).toBeNull();
    // Descartar NO guarda nada: la fila queda exactamente como estaba.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("con varios parecidos ofrece la lista, sin elegir por nadie", () => {
    render(<EnLaFila inicial="City Mall" />);
    expect(screen.getByText(/¿Es alguno de estos/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /City Mall Paso Canoa/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /City Mall David/ })).toBeTruthy();
  });
});

describe("🔴 la sugerencia NUNCA ata sola", () => {
  it("con UN solo candidato clavado, dibujarla no cambia la fila", () => {
    const onChange = vi.fn();
    render(<EnLaFila inicial="City Mal Paso Canoas" onChange={onChange} />);
    expect(screen.getByText(/¿Es City Mall Paso Canoa/)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("y lo dice en pantalla: se guarda recién al apretar Guardar", () => {
    render(<EnLaFila inicial="City Mal Paso Canoas" />);
    expect(screen.getByText(/Nada se guarda hasta que aprietes Guardar/)).toBeTruthy();
  });
});

describe("🔴 las reglas del motor se ven en el selector", () => {
  it("una diferencia de NÚMERO se avisa: N7 y N4 son tiendas distintas", () => {
    render(<EnLaFila inicial="Sporting Shoes N7" />);
    expect(screen.getByText(/los números no son los mismos/i)).toBeTruthy();
  });

  it("D-201 no se recomienda — la sugerencia lleva al American Classics bueno", () => {
    render(<EnLaFila inicial="American Clasicc" />);
    const texto = document.body.textContent ?? "";
    expect(texto).toContain("D-108");
    expect(texto).not.toContain("D-201");
  });

  it("🩸 SIN directorio se calla: no puede afirmar que no hay ninguno parecido", () => {
    render(<EnLaFila inicial="City Mal Paso Canoas" directorio={[]} />);
    expect(screen.queryByText(/¿Es /)).toBeNull();
    expect(screen.queryByText(/No hay ningún cliente parecido/)).toBeNull();
  });

  it("sin parecidos NO grita: 272 de 441 renglones van a destinos que no existen", () => {
    render(<EnLaFila inicial="Almacen Jordania" />);
    expect(screen.queryByText(/¿Es /)).toBeNull();
    expect(screen.queryByText(/No hay ningún cliente parecido/)).toBeNull();
  });

  it("una fila YA atada no ve sugerencias — ofrecer otras invita a cambiarla", () => {
    render(<EnLaFila inicial="City Mall Paso Canoa" codigoInicial="D-25" />);
    expect(screen.queryByText(/¿Es /)).toBeNull();
  });
});

describe("La red es la MISMA donde el cliente amarra sí o sí", () => {
  it("con permitirOtro=false sigue ofreciendo el parecido (ahí ayuda MÁS)", () => {
    render(<EnLaFila inicial="City Mal Paso Canoas" permitirOtro={false} />);
    expect(screen.getByText(/¿Es City Mall Paso Canoa/)).toBeTruthy();
  });
});
