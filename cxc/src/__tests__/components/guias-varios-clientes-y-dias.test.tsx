/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GUÍAS › NUEVA GUÍA — «FACTURAS DEL CLIENTE», LA PANTALLA DE VERDAD.
 *
 * Se monta `GuiaForm` y se TOCAN los botones: un barrido de texto no puede ver
 * lo único que importa acá —que «+ Otro cliente» limpie el buscador y NO borre
 * los renglones, que los días viejos vengan plegados, que el que trae «Ver más
 * días» también—, y en este repo esos barridos ya se cumplieron cuatro veces
 * con su propio comentario.
 *
 * Daniel (10-sep-2026): *«Una guía lleva facturas de varios clientes en un
 * mismo despacho»* · *«un cliente a la vez»* · *«se quedan abajo»* · *«que ya
 * venga plegado solo el último día desplegado by default»* · *«el ya salió no
 * me molesta»*.
 *
 * 🔴 NADA DE ESTO CAMBIA LO QUE SE GUARDA (la comparación byte a byte vive en
 * `lib/guias-varios-clientes-y-dias.test.ts`, con `instantaneaRenglones`).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";
import GuiaForm from "@/app/guias/components/GuiaForm";
import type { GuiaItem } from "@/app/guias/components/types";

// El interruptor de reversión, controlable por test; el resto del módulo es el REAL.
let atajosEncendidos = true;
vi.mock("@/lib/guias/atajos-facturas", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/guias/atajos-facturas")>();
  return {
    ...real,
    get GUIAS_ATAJOS_NUEVOS() {
      return atajosEncendidos;
    },
  };
});

const CITY = { codigo: "D-24", nombre: "City Mall David" };
const SPORTING = { codigo: "D-142", nombre: "Sporting Shoes N 4" };

/**
 * El caso REAL que Daniel señaló: Sporting Shoes (D-142), con días de 12 y más
 * facturas que llenaban la pantalla entera. Cuatro días con factura: los tres
 * primeros abren la lista, el cuarto queda detrás de «Ver más días».
 */
function facturasDe(codigo: string) {
  if (codigo === SPORTING.codigo) {
    return [
      // Día 1 (el más reciente): 2 facturas
      { empresa_key: "fashion_wear", empresa: "Fashion Wear", secuencial: "7010", fecha: "2026-08-20T15:00:00Z", total: 100, yaSalioEn: null },
      { empresa_key: "fashion_wear", empresa: "Fashion Wear", secuencial: "7011", fecha: "2026-08-20T14:00:00Z", total: 200, yaSalioEn: null },
      // Día 2: 12 facturas (el día que llenaba la pantalla)
      ...Array.from({ length: 12 }, (_, i) => ({
        empresa_key: "vistana",
        empresa: "Vistana International",
        secuencial: `81${String(i).padStart(2, "0")}`,
        fecha: `2026-08-19T1${i % 9}:00:00Z`,
        total: 10 + i,
        yaSalioEn: i === 0 ? 232 : null,
      })),
      // Día 3: 1 factura
      { empresa_key: "joystep", empresa: "Joystep", secuencial: "9001", fecha: "2026-07-23T15:00:00Z", total: 55, yaSalioEn: null },
      // Día 4: 1 factura — solo con «Ver más días»
      { empresa_key: "joystep", empresa: "Joystep", secuencial: "9002", fecha: "2026-07-10T15:00:00Z", total: 60, yaSalioEn: null },
    ];
  }
  return [
    { empresa_key: "vistana", empresa: "Vistana International", secuencial: "2535", fecha: "2026-08-21T16:00:00Z", total: 300, yaSalioEn: null },
    // 🔑 El MISMO día (19 ago) que en Sporting se abre a mano: así el candado
    // de «cambiar de cliente reinicia los días» mira algo de verdad.
    { empresa_key: "vistana", empresa: "Vistana International", secuencial: "2540", fecha: "2026-08-19T16:00:00Z", total: 400, yaSalioEn: null },
  ];
}

beforeEach(() => {
  atajosEncendidos = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.startsWith("/api/guias/facturas-cliente")) {
        const codigo = decodeURIComponent(u.split("codigo=")[1] ?? "");
        // Sporting llega SIN frescura y City Mall CON: el pie tiene que
        // aguantar las dos (sin `hasta` no se inventa una hora).
        const hasta = codigo === CITY.codigo ? "2026-08-21T17:05:00Z" : null;
        return { ok: true, json: async () => ({ facturas: facturasDe(codigo), hasta }) };
      }
      if (u.startsWith("/api/guias/frecuencias")) {
        return { ok: true, json: async () => ({ clientes: [CITY, SPORTING], empresas: [] }) };
      }
      if (u.startsWith("/api/clientes")) {
        return { ok: true, json: async () => ({ clientes: [CITY, SPORTING] }) };
      }
      return { ok: false, json: async () => ({}) };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function filaVacia(uid = "a"): GuiaItem {
  return { uid, orden: 1, cliente: "", cliente_codigo: "", direccion: "", empresa: "", facturas: "", bultos: 0, numero_guia_transp: "" };
}

let itemsCapturados: GuiaItem[];

function Harness({ itemsIniciales }: { itemsIniciales?: GuiaItem[] } = {}) {
  const [items, setItems] = useState<GuiaItem[]>(itemsIniciales ?? [filaVacia()]);
  itemsCapturados = items;
  return (
    <GuiaForm
      editingId={null}
      formNumero={240}
      fecha="2026-08-21" setFecha={() => {}}
      modoEntrega="entrega_directa" setModoEntrega={() => {}}
      transportistaId={null} setTransportistaId={() => {}}
      entregadoPor="Julio" setEntregadoPor={() => {}}
      observaciones="" setObservaciones={() => {}}
      items={items}
      transportistas={[]}
      direcciones={[]}
      validationErrors={new Set()}
      error={null}
      saving={false}
      soloCorregible={false}
      onAddDireccion={() => {}}
      onAddTransportista={() => {}}
      onUpdateItem={(idx, field, value) =>
        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)))
      }
      onUpdateItemFields={(idx, partial) =>
        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...partial } : it)))
      }
      onAddRow={() => setItems((prev) => [...prev, filaVacia(`r${prev.length}`)])}
      onRemoveRow={() => {}}
      onRestoreRow={() => {}}
      onSave={() => {}}
      onCancel={() => {}}
      onReemplazarItems={(next) =>
        setItems(next.map((it, i) => ({ ...it, orden: i + 1, uid: it.uid ?? `n${i}${Math.random()}` })))
      }
    />
  );
}

async function asentar() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Elige un cliente en el ÚNICO buscador del panel (por «Más usados»). */
async function elegirCliente(nombre: string) {
  const campo = document.getElementById("facturas-cliente") as HTMLInputElement;
  expect(campo).toBeTruthy();
  fireEvent.focus(campo);
  // Enfocar copia al buscador el nombre que ya estaba (así el selector no
  // «esconde» lo puesto). Se borra para ver «Más usados», que es como se elige
  // sin teclear.
  fireEvent.change(campo, { target: { value: "" } });
  const opcion = await screen.findByText(nombre, { selector: "[data-desplegable] *" });
  fireEvent.mouseDown(opcion.closest("button") ?? opcion);
  await asentar();
}

const encabezadoDia = (titulo: string) =>
  screen.getByText(titulo).closest("button") as HTMLButtonElement;

const casillas = () => screen.queryAllByRole("checkbox") as HTMLInputElement[];
const otroCliente = () => screen.queryByTestId("otro-cliente");

// ─────────────────────────────────────────────────────────────────────────────
// 1. «+ Otro cliente» — una guía lleva varios clientes
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 «+ Otro cliente»: un cliente a la vez, y los de antes SE QUEDAN ABAJO", () => {
  it("no se dibuja mientras el cliente no dejó nada — un control que no ofrece nada no se dibuja", async () => {
    render(<Harness />);
    await asentar();
    await elegirCliente(SPORTING.nombre);
    expect(otroCliente()).toBeNull();
  });

  it("🔴 mira los renglones DE ESTE cliente, no cualquiera: con el de OTRO ya puesto, no se dibuja", async () => {
    // La guía ya trae un renglón de City Mall (escrito antes). Se elige a
    // Sporting y todavía no se marcó nada suyo: el botón no ofrece nada.
    render(
      <Harness
        itemsIniciales={[
          { uid: "y", orden: 1, cliente: "City Mall David", cliente_codigo: "D-24", direccion: "David", empresa: "Vistana International", facturas: "2535", bultos: 2, numero_guia_transp: "" },
        ]}
      />,
    );
    await asentar();
    await elegirCliente(SPORTING.nombre);
    expect(otroCliente()).toBeNull();
    // Y en cuanto Sporting deja lo suyo, sí.
    fireEvent.click(casillas()[0]);
    expect(otroCliente()).toBeTruthy();
  });

  it("aparece en cuanto se marca la primera factura", async () => {
    render(<Harness />);
    await asentar();
    await elegirCliente(SPORTING.nombre);
    fireEvent.click(casillas()[0]);
    expect(otroCliente()).toBeTruthy();
    expect(otroCliente()!.textContent).toContain("Otro cliente");
  });

  it("🔴 tocarlo LIMPIA EL BUSCADOR y NO borra los renglones ya marcados", async () => {
    render(<Harness />);
    await asentar();
    await elegirCliente(SPORTING.nombre);
    fireEvent.click(casillas()[0]);
    fireEvent.click(casillas()[1]);
    const antes = itemsCapturados.map((r) => [r.cliente_codigo, r.empresa, r.facturas]);
    expect(antes).toEqual([["D-142", "Fashion Wear", "7010, 7011"]]);

    fireEvent.click(otroCliente()!);
    await asentar();

    // El buscador quedó vacío y la lista de facturas se fue…
    const campo = document.getElementById("facturas-cliente") as HTMLInputElement;
    expect(campo.value).toBe("");
    expect(screen.queryByText("7010")).toBeNull();
    // …y el renglón del primer cliente SIGUE ENTERO.
    expect(itemsCapturados.map((r) => [r.cliente_codigo, r.empresa, r.facturas])).toEqual(antes);
  });

  it("🔴 el segundo cliente suma SU renglón: dos clientes en la misma guía", async () => {
    render(<Harness />);
    await asentar();
    await elegirCliente(SPORTING.nombre);
    fireEvent.click(casillas()[0]);
    fireEvent.click(otroCliente()!);
    await asentar();
    await elegirCliente(CITY.nombre);
    fireEvent.click(casillas()[0]);

    expect(itemsCapturados.map((r) => [r.cliente, r.cliente_codigo, r.empresa, r.facturas])).toEqual([
      ["Sporting Shoes N 4", "D-142", "Fashion Wear", "7010"],
      ["City Mall David", "D-24", "Vistana International", "2535"],
    ]);
  });

  it("🔴 vive DEBAJO del cuadro, no adentro — Daniel: «debería estar abajo de ese cuadro, no dentro»", async () => {
    render(<Harness />);
    await asentar();
    await elegirCliente(SPORTING.nombre);
    fireEvent.click(casillas()[0]);

    const panel = screen.getByTestId("facturas-del-cliente");
    const cuadro = panel.querySelector(".border.border-gray-200.rounded-lg") as HTMLElement;
    expect(cuadro).toBeTruthy();
    // Está en el panel, pero NO adentro del cuadro con borde.
    expect(panel.contains(otroCliente())).toBe(true);
    expect(cuadro.contains(otroCliente())).toBe(false);
    // Y es un enlace discreto de ancho natural, no un botón de ancho completo.
    expect(otroCliente()!.className).not.toContain("w-full");
    expect(otroCliente()!.className).toContain("inline-flex");
  });

  it("🔴 acá el cliente SALE DEL DIRECTORIO: no hay salida a mano", async () => {
    // Las facturas viven amarradas al CÓDIGO del cliente, así que un nombre
    // escrito a mano no podría traer ninguna. La salida a mano sigue existiendo
    // donde tiene que existir: en los renglones de «Detalle de Envío».
    render(<Harness />);
    await asentar();
    const campo = document.getElementById("facturas-cliente") as HTMLInputElement;
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "Tienda que no existe" } });
    expect(screen.getByText(/Solo clientes de la lista/)).toBeTruthy();
    expect(screen.queryByText(/No está en la lista — escribir a mano/)).toBeNull();
  });

  it("🔴 REUSA el buscador de siempre: no nace un segundo selector de cliente", async () => {
    render(<Harness />);
    await asentar();
    await elegirCliente(SPORTING.nombre);
    fireEvent.click(casillas()[0]);
    const panel = screen.getByTestId("facturas-del-cliente");
    // Un solo campo de cliente dentro del panel, el de siempre.
    expect(panel.querySelectorAll('input[role="combobox"]')).toHaveLength(1);
    expect(panel.querySelector("#facturas-cliente")).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Los días se pliegan
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 solo el día más reciente viene abierto", () => {
  it("el de arriba muestra sus facturas; los otros dos, solo el título y cuántas tienen", async () => {
    render(<Harness />);
    await asentar();
    await elegirCliente(SPORTING.nombre);

    // Día 1, abierto: sus 2 facturas a la vista.
    expect(screen.getByText("7010")).toBeTruthy();
    expect(screen.getByText("7011")).toBeTruthy();
    expect(casillas()).toHaveLength(2);

    // Día 2 (12 facturas) y día 3 (1): plegados, con su conteo.
    expect(screen.queryByText("8100")).toBeNull();
    expect(encabezadoDia("Miércoles 19 ago").textContent).toContain("12 facturas");
    expect(encabezadoDia("Jueves 23 jul").textContent).toContain("1 factura");
    expect(encabezadoDia("Miércoles 19 ago").getAttribute("aria-expanded")).toBe("false");
    expect(encabezadoDia("Jueves 20 ago").getAttribute("aria-expanded")).toBe("true");
  });

  it("se abre de un toque, y se vuelve a plegar con otro", async () => {
    render(<Harness />);
    await asentar();
    await elegirCliente(SPORTING.nombre);

    fireEvent.click(encabezadoDia("Miércoles 19 ago"));
    expect(screen.getByText("8100")).toBeTruthy();
    expect(casillas()).toHaveLength(14);

    fireEvent.click(encabezadoDia("Miércoles 19 ago"));
    expect(screen.queryByText("8100")).toBeNull();
  });

  it("🔴 un día plegado DICE cuántas de sus facturas ya están marcadas", async () => {
    render(<Harness />);
    await asentar();
    await elegirCliente(SPORTING.nombre);
    fireEvent.click(encabezadoDia("Miércoles 19 ago"));
    fireEvent.click(casillas()[2]); // la primera del día 2
    // Abierto no lo repite: las casillas se ven.
    expect(encabezadoDia("Miércoles 19 ago").textContent).not.toContain("marcada");
    fireEvent.click(encabezadoDia("Miércoles 19 ago"));
    expect(encabezadoDia("Miércoles 19 ago").textContent).toContain("12 facturas · 1 marcada");
  });

  it("🔴 «Ver más días» agrega el día PLEGADO — es el punto del cambio", async () => {
    render(<Harness />);
    await asentar();
    await elegirCliente(SPORTING.nombre);

    fireEvent.click(screen.getByText("Ver más días"));
    expect(screen.getByText("Viernes 10 jul")).toBeTruthy();
    expect(screen.queryByText("9002")).toBeNull();
    // Y con un toque está.
    fireEvent.click(encabezadoDia("Viernes 10 jul"));
    expect(screen.getByText("9002")).toBeTruthy();
  });

  it("cambiar de cliente vuelve a dejar abierto solo el día más reciente del NUEVO", async () => {
    render(<Harness />);
    await asentar();
    await elegirCliente(SPORTING.nombre);
    fireEvent.click(encabezadoDia("Miércoles 19 ago"));
    fireEvent.click(casillas()[0]);
    fireEvent.click(otroCliente()!);
    await asentar();
    await elegirCliente(CITY.nombre);
    // El día más reciente del NUEVO cliente abre solo…
    expect(screen.getByText("2535")).toBeTruthy();
    expect(encabezadoDia("Viernes 21 ago").getAttribute("aria-expanded")).toBe("true");
    // …y el 19 de agosto, que en el cliente ANTERIOR se había abierto a mano,
    // vuelve a nacer plegado: lo que se toca en un cliente no se hereda.
    expect(encabezadoDia("Miércoles 19 ago").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("2540")).toBeNull();
  });

  it("🔴 cambiar de cliente EN EL BUSCADOR (sin pasar por «+ Otro cliente») también reinicia los días", async () => {
    render(<Harness />);
    await asentar();
    await elegirCliente(SPORTING.nombre);
    fireEvent.click(encabezadoDia("Miércoles 19 ago"));
    expect(encabezadoDia("Miércoles 19 ago").getAttribute("aria-expanded")).toBe("true");

    // Se escribe el otro cliente directo en el buscador, como hoy.
    await elegirCliente(CITY.nombre);
    expect(encabezadoDia("Viernes 21 ago").getAttribute("aria-expanded")).toBe("true");
    expect(encabezadoDia("Miércoles 19 ago").getAttribute("aria-expanded")).toBe("false");
  });

  it("🔴 «Ya salió en GT-232» se queda COMPLETO — Daniel: «el ya salió no me molesta»", async () => {
    render(<Harness />);
    await asentar();
    await elegirCliente(SPORTING.nombre);
    fireEvent.click(encabezadoDia("Miércoles 19 ago"));
    expect(screen.getByText("Ya salió en GT-232")).toBeTruthy();
    // Y sigue siendo AVISO, nunca bloqueo.
    expect(casillas().every((c) => !c.disabled)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. El pie: UNA sola línea
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 el pie es UNA línea, y no perdió ninguna función", () => {
  async function pie() {
    render(<Harness />);
    await asentar();
    await elegirCliente(SPORTING.nombre);
    return screen.getByTestId("pie-facturas");
  }

  it("los pedazos viven en el MISMO renglón, en orden y separados por puntos", async () => {
    // (el espacio alrededor del punto lo pone el `gap` del renglón, no el texto)
    const linea = await pie();
    expect((linea.textContent || "").trim()).toBe("Traslado·Escribir el número·Buscar otra vez");
    expect(linea.querySelectorAll("button")).toHaveLength(3);
  });

  it("🔴 con frescura, «Actualizado» va A LA VISTA y en el MISMO renglón — no en un title", async () => {
    // En el iPad no hay mouse: lo que solo se ve pasando el mouse por encima no
    // existe. Y sin `hasta` no se inventa una hora (el caso de arriba).
    render(<Harness />);
    await asentar();
    await elegirCliente(CITY.nombre);
    const linea = screen.getByTestId("pie-facturas");
    expect((linea.textContent || "").trim()).toMatch(
      /^Traslado·Escribir el número·Actualizado .+·Buscar otra vez$/,
    );
    expect(linea.querySelector("[title]")).toBeNull();
  });

  it("🔴 «Traslado» sigue escribiendo el TEXTO Traslado y sigue sin pedir empresa", async () => {
    await pie();
    fireEvent.click(screen.getByRole("button", { name: "Traslado" }));
    expect(itemsCapturados[0].facturas).toBe("Traslado");
    expect(itemsCapturados[0].empresa).toBe("");
    expect(itemsCapturados[0].cliente_codigo).toBe("D-142");
  });

  it("🔴 «Escribir el número» sigue dejando el renglón del cliente con facturas vacío", async () => {
    await pie();
    fireEvent.click(screen.getByText("Escribir el número"));
    expect(itemsCapturados[0].cliente_codigo).toBe("D-142");
    expect(itemsCapturados[0].facturas).toBe("");
  });

  it("🩸 sin cajas ni botones con borde: el pie es texto chico y una línea finita", async () => {
    const linea = await pie();
    expect(linea.className).toContain("text-xs");
    expect(linea.className).toContain("flex-wrap"); // en el celular envuelve, no se arrastra
    expect(linea.className).toContain("border-t border-gray-100");
    for (const b of Array.from(linea.querySelectorAll("button"))) {
      expect(b.className).not.toContain("rounded-md");
      expect(b.className).not.toContain("border ");
    }
  });

  it("«Ver más días» quedó como enlace chico, pegado al final de la lista", async () => {
    await pie();
    const verMas = screen.getByText("Ver más días");
    expect(verMas.className).toContain("text-xs");
    // Y sigue estando ARRIBA del pie, no adentro.
    expect(screen.getByTestId("pie-facturas").contains(verMas)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. El teléfono no pierde los 44 px
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 con el dedo son 44 px; lo que se aprieta es la computadora", () => {
  // jsdom no calcula layout: se congela la CAUSA (las clases), como en los
  // demás candados de iPhone del repo.
  const fuente = readFileSync(
    join(__dirname, "..", "..", "app", "guias", "components", "FacturasDelCliente.tsx"),
    "utf8",
  );

  it("la fila de una factura arranca en min-h-[44px] y solo se aprieta con pointer FINO", () => {
    expect(fuente).toContain(
      "py-1.5 min-h-[44px] lg:[@media(pointer:fine)]:min-h-0 lg:[@media(pointer:fine)]:py-1",
    );
  });

  it("🔴 y ENVUELVE: en 390 px la etiqueta «Ya salió» baja un renglón, nunca empuja la página", () => {
    // Todo lo de la fila es `shrink-0` menos el nombre de la empresa: sin
    // envolver, la fila con etiqueta pide más ancho del que tiene el iPhone y
    // la página entera se arrastra de lado.
    expect(fuente).toContain("flex flex-wrap items-center gap-3 py-1.5 min-h-[44px]");
  });

  it("el encabezado del día, que ahora es un botón, también", () => {
    expect(fuente).toContain(
      "min-h-[44px] lg:[@media(pointer:fine)]:min-h-0 lg:[@media(pointer:fine)]:py-1",
    );
  });

  it("🔑 y el apretado NUNCA se decide por ancho a secas: el iPad tiene 1024 px y se toca con el dedo", () => {
    const apretados = fuente.match(/lg:(?:\[@media\(pointer:fine\)\]:)?min-h-0/g) ?? [];
    expect(apretados.length).toBeGreaterThan(0);
    for (const c of apretados) expect(c).toContain("pointer:fine");
  });

  it("«+ Otro cliente» se toca desde el teléfono", () => {
    expect(fuente).toMatch(/data-testid="otro-cliente"[\s\S]{0,400}min-h-\[44px\]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. 🔴 CONTROL — el interruptor lo apaga TODO
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 CONTROL — con GUIAS_ATAJOS_NUEVOS en false no existe nada de esto", () => {
  beforeEach(() => {
    atajosEncendidos = false;
  });

  it("ni el panel, ni «+ Otro cliente», ni los días plegables", async () => {
    render(<Harness />);
    await asentar();
    expect(screen.queryByTestId("facturas-del-cliente")).toBeNull();
    expect(otroCliente()).toBeNull();
    expect(screen.queryByText("Ver más días")).toBeNull();
    expect(screen.queryByTestId("pie-facturas")).toBeNull();
    expect(screen.queryByText("Traslado")).toBeNull();
    expect(screen.queryByText("Escribir el número")).toBeNull();
    expect(screen.queryByText("Buscar otra vez")).toBeNull();
    expect(screen.queryByText(/facturas$/)).toBeNull();
    // Y la pantalla de siempre sigue entera.
    expect(screen.getByText("Detalle de Envío")).toBeTruthy();
  });
});
