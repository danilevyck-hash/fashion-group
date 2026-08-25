// ─────────────────────────────────────────────────────────────────────────────
// CANDADOS DE CONDUCTA del filtro por cliente de Ventas › Productos.
//
// 🔴 ACÁ NO HAY BARRIDOS DE TEXTO SOBRE EL FUENTE: se MONTA la pantalla real,
// se ABRE el desplegable, se ELIGE un cliente y se mira qué quedó dibujado y
// qué URL se pidió. El #591 aprendió esto a los golpes — dos mutaciones le
// sobrevivieron por no tener una sola prueba que renderizara el desplegable.
//
// Lo que se prueba TOCANDO:
//   1. La matriz NO se pide al cargar la pantalla — sólo al tocar el filtro.
//      (La base está en compute Micro: quien no usa el filtro no paga nada.)
//   2. Elegir un cliente FILTRA la tabla de verdad: cambian las filas Y los
//      números, no sólo el rótulo.
//   3. Con un cliente puesto, Margen % NO SE MUESTRA — no hay margen por
//      cliente y `switch_factura_lineas` no trae costo.
//   4. La columna de cambio compara contra lo que compraba ÉL, no la empresa.
//   5. «Dejó de comprar» sale ordenado por plata y DISTINGUE "se sigue
//      vendiendo" de "ya no se vende".
//   6. El aviso ÁMBAR de «código mal clasificado» YA NO SALE — tampoco con el
//      filtro puesto (candado invertido el 25-ago-2026; ver el bloque).
//   7. Cambiar de empresa suelta el cliente (el id es de UNA empresa).
//   8. Ordenar y buscar siguen funcionando y NO piden nada al servidor.
//   9. 🔴 Esto es un FILTRO y no un segundo selector de cliente — se comprueba
//      con el detector del candado `un-solo-selector-de-cliente`, no de palabra.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { ProductosView } from "@/components/ventas/ProductosView";
import type { ProductosResponse } from "@/lib/ventas/productos";

// ─────────────────────────────────────────────────────────────────────────────
// 🩸 EN JSDOM LOS DOS LAYOUTS EXISTEN A LA VEZ, y hay que decir cuál se mira.
//
// Desde el 25-ago-2026 esta pantalla tiene TABLA (desde `sm`) y TARJETAS (en
// celular): Daniel a 390 px sólo veía Venta y Margen y pidió ver también las
// piezas y el precio promedio. En el navegador se ve UNO de los dos; en jsdom
// no hay CSS, así que los dos están montados y un `screen.getByRole` suelto
// encuentra DOS botones "Precio prom." y falla por ambigüedad.
//
// Por eso los candados de la tabla preguntan DENTRO de `[data-vista="tabla"]` y
// los de las tarjetas dentro de `[data-vista="tarjetas"]`. No es una molestia
// del test: con dos layouts, "el botón de ordenar" ya no es una sola cosa, y un
// candado que no dice cuál mira estaría probando el azar del orden del DOM.
//
// 🔑 `data-vista` es FIJO, NO la clase del breakpoint: `.sm\:hidden` deja de
// existir en cuanto el corte se mueve y el `querySelector` devolvería null.
// `enTabla()` y `enTarjetas()` REVIENTAN si el layout no está, que es lo único
// que impide que un candado "pase" sin haber mirado nada.
// ─────────────────────────────────────────────────────────────────────────────
function layout(vista: "tabla" | "tarjetas") {
  const el = document.querySelector(`[data-vista="${vista}"]`);
  if (!el) throw new Error(`no está el layout data-vista="${vista}" — el candado no miró nada`);
  return within(el as HTMLElement);
}
const enTabla = () => layout("tabla");
const enTarjetas = () => layout("tarjetas");

vi.mock("next/navigation", () => ({
  usePathname: () => "/ventas",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false) as never;
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
});

// ── Fixture ─────────────────────────────────────────────────────────────────
// La empresa vende cinco descripciones; City Mall compra DOS de ellas. Si el
// filtro no filtrara, seguirían saliendo las cinco.
const PRODUCTOS = [
  { descripcion: "CAMISA POLO", num_codigos: 3, cantidad: 1000, venta: 9000, costo: 5400, margen: 0.4 },
  { descripcion: "SANDALIA", num_codigos: 2, cantidad: 100, venta: 5000, costo: 3000, margen: 0.4 },
  { descripcion: "BOXER", num_codigos: 1, cantidad: 400, venta: 4000, costo: 2400, margen: 0.4 },
  { descripcion: "GORRA", num_codigos: 1, cantidad: 50, venta: 1000, costo: 600, margen: 0.4 },
  { descripcion: "DEVUELTO", num_codigos: 1, cantidad: 0, venta: 300, costo: 100, margen: 0.667 },
];

const CITY = { id: 12, nombre: "City Mall Paso Canoa" };
const GOLDEN = { id: 30, nombre: "Golden Mall" };

/** La matriz del período: quién compró qué. */
let matriz = [
  { cliente_switch_id: CITY.id, cliente_nombre: CITY.nombre, descripcion: "CAMISA POLO", cantidad: 100, venta: 2000 },
  { cliente_switch_id: CITY.id, cliente_nombre: CITY.nombre, descripcion: "SANDALIA", cantidad: 50, venta: 700 },
  { cliente_switch_id: GOLDEN.id, cliente_nombre: GOLDEN.nombre, descripcion: "GORRA", cantidad: 50, venta: 1000 },
];
/**
 * Lo que City Mall compraba ANTES. BOXER se sigue vendiendo; PANTUFLA no.
 *
 * 🔑 EL MÁS CARO ES EL ÚLTIMO EN EL ALFABETO, a propósito: si el orden por plata
 * coincidiera con el alfabético, ordenar por nombre pasaría el test igual.
 */
let previaCity = [
  { cliente_switch_id: CITY.id, cliente_nombre: CITY.nombre, descripcion: "CAMISA POLO", cantidad: 90, venta: 1500 },
  { cliente_switch_id: CITY.id, cliente_nombre: CITY.nombre, descripcion: "BOXER", cantidad: 30, venta: 450 },
  { cliente_switch_id: CITY.id, cliente_nombre: CITY.nombre, descripcion: "PANTUFLA", cantidad: 200, venta: 3200 },
];
/** Un `aviso` INVENTADO en la respuesta. Ya no existe en el tipo: se inyecta
 *  para exigir que, aunque llegara, la pantalla no lo dibuje (bloque 6). */
let avisoDeLaFila: { otra: string; codigo: string }[] = [];
let urls: string[] = [];

function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}
function respuesta(over: Partial<ProductosResponse> = {}): ProductosResponse {
  return {
    empresa: "fashion_wear", year: 2026, mes: null, periodo: "ytd",
    desde: "2026-01-01", hasta: "2026-08-25",
    comparativo: { desde: "2025-01-01", hasta: "2025-08-25" },
    totales: { venta: 19300, costo: 11500, margen: 0.4041 },
    productos: PRODUCTOS,
    ...over,
  };
}

beforeEach(() => {
  urls = [];
  avisoDeLaFila = [];
  matriz = [
    { cliente_switch_id: CITY.id, cliente_nombre: CITY.nombre, descripcion: "CAMISA POLO", cantidad: 100, venta: 2000 },
    { cliente_switch_id: CITY.id, cliente_nombre: CITY.nombre, descripcion: "SANDALIA", cantidad: 50, venta: 700 },
    { cliente_switch_id: GOLDEN.id, cliente_nombre: GOLDEN.nombre, descripcion: "GORRA", cantidad: 50, venta: 1000 },
  ];
  previaCity = [
    { cliente_switch_id: CITY.id, cliente_nombre: CITY.nombre, descripcion: "CAMISA POLO", cantidad: 90, venta: 1500 },
    { cliente_switch_id: CITY.id, cliente_nombre: CITY.nombre, descripcion: "BOXER", cantidad: 30, venta: 450 },
    { cliente_switch_id: CITY.id, cliente_nombre: CITY.nombre, descripcion: "PANTUFLA", cantidad: 200, venta: 3200 },
  ];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    urls.push(u);
    // 🔴 El orden importa: "/por-cliente" tiene que mirarse ANTES que el
    // genérico de productos, o cae en la rama equivocada.
    if (u.includes("/productos/por-cliente")) {
      const sp = new URL(u, "http://x").searchParams;
      if (sp.get("ventana") === "previa") {
        return json({ filas: sp.get("cliente") === String(CITY.id) ? previaCity : [], sinDescripcion: 0 });
      }
      return json({ filas: matriz, sinDescripcion: 0 });
    }
    if (u.includes("/productos/codigos")) {
      return json({
        codigos: [{ codigo: "A-1", descripcion: "CAMISA POLO", cantidad: 800, venta: 8000, costo: 4800, margen: 0.4 }],
        clientes: [{ cliente_switch_id: CITY.id, cliente_nombre: CITY.nombre, cantidad: 100, venta: 2000 }],
      });
    }
    const previo = u.includes("previo=1");
    if (previo) return json(respuesta({ productos: PRODUCTOS.map(p => ({ ...p, venta: p.venta * 0.8 })) }));
    // El `aviso` viajaba en la fila de NIVEL 1. Ya no lo manda nadie; se
    // inyecta para que el bloque 6 exija que no se dibuje ni así.
    return json(respuesta({
      productos: PRODUCTOS.map(p =>
        p.descripcion === "CAMISA POLO" && avisoDeLaFila.length > 0
          ? ({ ...p, aviso: avisoDeLaFila } as typeof p)
          : p),
    }));
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function filas(): string[] {
  return [...document.querySelectorAll("tr[data-fila-producto]")]
    .map(tr => tr.getAttribute("data-fila-producto") ?? "");
}
function celda(fila: string, col: string): string {
  const tr = document.querySelector(`tr[data-fila-producto="${fila}"]`);
  return (tr?.querySelector(`[data-col="${col}"]`)?.textContent ?? "").trim();
}
async function pintada(n = PRODUCTOS.length) {
  await waitFor(() => expect(filas().length).toBe(n));
}
function trigger() {
  return document.querySelector("[data-filtro-cliente]") as HTMLElement;
}
async function abrirFiltro() {
  fireEvent.keyDown(trigger(), { key: "ArrowDown" });
  await screen.findByRole("option", { name: "Cliente: todos" });
}
async function elegirCliente(nombre: string) {
  await abrirFiltro();
  fireEvent.click(await screen.findByRole("option", { name: nombre }));
  await waitFor(() => expect(document.querySelector("[data-sin-mostrador]")).toBeTruthy());
}
const pedidosMatriz = () => urls.filter(u => u.includes("/productos/por-cliente"));

// ─────────────────────────────────────────────────────────────────────────────

describe("1 · el control está y no cuesta nada hasta que se lo toca", () => {
  it("dibuja «Cliente: todos» al lado del buscador", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    expect(trigger()).toBeTruthy();
    expect(trigger().textContent).toContain("Cliente: todos");
  });

  it("🔑 al CARGAR la pantalla no se pide la matriz — ni una consulta de más", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    expect(pedidosMatriz()).toHaveLength(0);
  });

  it("se pide reción al ABRIR el desplegable, y una sola vez", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await abrirFiltro();
    await waitFor(() => expect(pedidosMatriz().length).toBe(1));
    expect(pedidosMatriz()[0]).toContain("ventana=actual");
    // Cerrar y volver a abrir NO vuelve a pedir.
    fireEvent.keyDown(trigger(), { key: "Escape" });
    await abrirFiltro();
    expect(pedidosMatriz()).toHaveLength(1);
  });

  it("🔴 si no hay detalle por cliente lo DICE, no deja un menú vacío sin motivo", async () => {
    // Multifashion no tiene ni una línea en `switch_factura_lineas` (medido: 0).
    matriz = [];
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await abrirFiltro();
    await waitFor(() =>
      expect(screen.getByText("Sin detalle por cliente en este período.")).toBeTruthy(),
    );
    // Y NO dice "no le vende a nadie", que sería falso.
    expect(screen.queryByText(/nadie/i)).toBeNull();
  });

  it("los clientes que ofrece son los de la respuesta, del que más compra al que menos", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await abrirFiltro();
    await screen.findByRole("option", { name: CITY.nombre });
    const opciones = screen.getAllByRole("option").map(o => (o.textContent ?? "").trim());
    expect(opciones).toEqual(["Cliente: todos", CITY.nombre, GOLDEN.nombre]);
  });
});

describe("2 · elegir un cliente FILTRA la tabla de verdad", () => {
  it("quedan sólo sus descripciones, con SUS piezas y SU venta", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirCliente(CITY.nombre);
    expect(filas()).toEqual(["CAMISA POLO", "SANDALIA"]);
    expect(celda("CAMISA POLO", "venta")).toBe("$2,000.00");
    expect(celda("CAMISA POLO", "cantidad")).toBe("100");
    // 2000 ÷ 100. Si mostrara el precio de la EMPRESA diría $9.00.
    expect(celda("CAMISA POLO", "precio")).toBe("$20.00");
  });

  it("el total de arriba pasa a ser el del cliente", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirCliente(CITY.nombre);
    const totales = document.querySelector("[data-totales-productos]")!.textContent ?? "";
    expect(totales).toContain("$2,700.00");
    const resumen = document.querySelector("[data-resumen-productos]")!.textContent ?? "";
    expect(resumen).toContain("150 piezas");
  });

  it("volver a «Cliente: todos» devuelve la tabla entera, sin pedir nada nuevo", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirCliente(CITY.nombre);
    const antes = urls.length;
    await abrirFiltro();
    fireEvent.click(await screen.findByRole("option", { name: "Cliente: todos" }));
    await pintada();
    expect(celda("CAMISA POLO", "venta")).toBe("$9,000.00");
    expect(urls.length).toBe(antes);
  });

  it("la ventana ANTERIOR se pide por cliente, y una sola vez por cliente", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirCliente(CITY.nombre);
    const previas = urls.filter(u => u.includes("ventana=previa"));
    expect(previas).toHaveLength(1);
    expect(previas[0]).toContain(`cliente=${CITY.id}`);
    // Ir y volver no vuelve a pedirla.
    await abrirFiltro();
    fireEvent.click(await screen.findByRole("option", { name: "Cliente: todos" }));
    await elegirCliente(CITY.nombre);
    expect(urls.filter(u => u.includes("ventana=previa"))).toHaveLength(1);
  });
});

describe("3 · 🔴 con un cliente puesto NO hay Margen %", () => {
  it("la columna desaparece — no hay margen por cliente y no se puede inventar", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    expect(enTabla().queryByRole("button", { name: /Margen/ })).toBeTruthy();
    expect(celda("CAMISA POLO", "margen")).toBe("40.0%");

    await elegirCliente(CITY.nombre);
    expect(enTabla().queryByRole("button", { name: /Margen/ })).toBeNull();
    expect(document.querySelector('[data-col="margen"]')).toBeNull();
    expect((document.querySelector("[data-totales-productos]")!.textContent ?? "")).not.toContain("Margen");
  });

  it("y vuelve intacta al sacar el filtro", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirCliente(CITY.nombre);
    await abrirFiltro();
    fireEvent.click(await screen.findByRole("option", { name: "Cliente: todos" }));
    await pintada();
    expect(celda("CAMISA POLO", "margen")).toBe("40.0%");
  });

  it("si estaba ordenando por Margen, el orden se muda a Venta y no queda apuntando a nada", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    fireEvent.click(enTabla().getByRole("button", { name: /Margen/ }));
    await elegirCliente(CITY.nombre);
    expect(filas()).toEqual(["CAMISA POLO", "SANDALIA"]);
    expect(enTabla().getByRole("button", { name: /^Venta/ }).textContent).toContain("▼");
  });
});

describe("4 · la columna de cambio compara contra lo que compraba ÉL", () => {
  it("usa la venta anterior DEL CLIENTE, no la de la empresa", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirCliente(CITY.nombre);
    // 2000 contra 1500 = +33%. Con la base de la empresa (7200) sería −72%.
    expect(celda("CAMISA POLO", "delta")).toBe("+33%");
  });

  it("lo que no compraba antes sale «Nuevo»", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirCliente(CITY.nombre);
    expect(celda("SANDALIA", "delta")).toBe("Nuevo");
  });
});

describe("5 · «Dejó de comprar»", () => {
  it("sale ordenado por CUÁNTA PLATA ERA, de mayor a menor", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirCliente(CITY.nombre);
    const bloque = await waitFor(() => {
      const b = document.querySelector("[data-dejo-de-comprar]");
      expect(b).toBeTruthy();
      return b!;
    });
    const renglones = [...bloque.querySelectorAll("tbody tr")].map(tr => (tr.textContent ?? "").trim());
    expect(renglones[0]).toContain("PANTUFLA");
    expect(renglones[0]).toContain("$3,200.00");
    expect(renglones[1]).toContain("BOXER");
  });

  it("🔴 DISTINGUE lo que se sigue vendiendo de lo que ya no se vende", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirCliente(CITY.nombre);
    const bloque = await waitFor(() => {
      const el = document.querySelector("[data-dejo-de-comprar]");
      expect(el, "no se dibujó «Dejó de comprar»").toBeTruthy();
      return el!;
    });
    const etiquetas = [...bloque.querySelectorAll("[data-etiqueta]")].map(e => e.getAttribute("data-etiqueta"));
    // PANTUFLA (la de arriba, $3.200) no está en ninguna fila de la empresa →
    // la empresa dejó de venderla. BOXER sí está → otros la siguen comprando.
    expect(etiquetas).toEqual(["ya-no-se-vende", "se-sigue-vendiendo"]);
  });

  it("lo que SIGUE comprando no entra a la lista", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirCliente(CITY.nombre);
    const bloque = await waitFor(() => {
      const el = document.querySelector("[data-dejo-de-comprar]");
      expect(el, "no se dibujó «Dejó de comprar»").toBeTruthy();
      return el!;
    });
    expect(bloque.textContent).not.toContain("CAMISA POLO");
  });

  it("si no dejó de comprar nada, no se dibuja NADA (un «sin novedad» es ruido)", async () => {
    previaCity = [
      { cliente_switch_id: CITY.id, cliente_nombre: CITY.nombre, descripcion: "CAMISA POLO", cantidad: 90, venta: 1500 },
    ];
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirCliente(CITY.nombre);
    await waitFor(() => expect(document.querySelector("[data-dejo-de-comprar-cargando]")).toBeNull());
    expect(document.querySelector("[data-dejo-de-comprar]")).toBeNull();
  });

  it("sin filtro no existe: es parte del filtro, no una pantalla nueva", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    expect(document.querySelector("[data-dejo-de-comprar]")).toBeNull();
  });
});

describe("6 · el aviso ÁMBAR ya no sale — tampoco con el filtro puesto", () => {
  // ⚠️ ESTE CANDADO CAMBIÓ DE DIRECCIÓN DOS VECES, y las dos quedan escritas.
  //
  // 1ª — ACÁ SE MIRABA `data-aviso-grafias`, el aviso de "la lista suma más que
  //      la fila". Ese cartel existía porque la fila sumaba UNA sola grafía;
  //      desde que la tabla agrupa por el nombre más reciente del código, la
  //      fila suma las dos y el aviso pasó a ser FALSO.
  // 2ª — Lo reemplazó el de "código mal clasificado en Switch"
  //      (`data-aviso-clasificacion`), y ese TAMBIÉN se fue: 25-ago-2026, por
  //      orden de Daniel. Nació para que él revisara los 5 códigos y ya los
  //      revisó — *"si lo más reciente es 17-ago alguien lo pasó a Flip Flop,
  //      entonces es Flip Flop"*: la clasificación de Switch es la buena y no
  //      quedaba nada que corregir.
  //
  // 🩸 EL CANDADO SE INVIERTE, NO SE BORRA: lo que ahora se exige es que poner
  // un cliente no HAGA APARECER el aviso, ni siquiera si el servidor lo manda.
  it("con un cliente elegido, la fila NO avisa nada", async () => {
    avisoDeLaFila = [{ otra: "Camisa Polo M/C", codigo: "A-1" }];
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirCliente(CITY.nombre);
    await waitFor(() => expect(filas()).toEqual(["CAMISA POLO", "SANDALIA"]));
    expect(document.querySelector("[data-aviso-clasificacion]")).toBeNull();
    expect(document.body.textContent).not.toContain("también está en");
    expect(document.querySelector('tr[data-fila-producto="CAMISA POLO"]')!
      .querySelector('[class*="amber"]')).toBeNull();
  });

  it("y el pie que dice que el mostrador no trae detalle también", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirCliente(CITY.nombre);
    fireEvent.click(document.querySelector('tr[data-fila-producto="CAMISA POLO"]')!);
    const pie = await waitFor(() => {
      const el = document.querySelector("[data-pie-clientes]");
      expect(el, "no se dibujó el pie de «Quién lo compra»").toBeTruthy();
      return el!;
    });
    expect(pie.textContent).toContain("mostrador");
    // Y la tabla filtrada lo dice una vez arriba, en cinco palabras.
    expect(document.querySelector("[data-sin-mostrador]")!.textContent).toBe("sin las ventas de mostrador");
  });
});

describe("7 · cambiar de empresa suelta el cliente", () => {
  it("el id es de UNA empresa: arrastrarlo mostraría otro negocio con el nombre viejo", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirCliente(CITY.nombre);
    const empresa = screen.getByText("Fashion Wear").closest("button")!;
    fireEvent.keyDown(empresa, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Vistana International" }));
    await pintada();
    expect(trigger().textContent).toContain("Cliente: todos");
    expect(celda("CAMISA POLO", "venta")).toBe("$9,000.00");
  });
});

describe("8 · ordenar y buscar siguen andando, y NO piden nada", () => {
  it("ordenar por Cant reordena las filas filtradas sin una consulta más", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirCliente(CITY.nombre);
    const antes = urls.length;
    fireEvent.click(enTabla().getByRole("button", { name: /^Cant/ }));
    expect(filas()).toEqual(["CAMISA POLO", "SANDALIA"]);
    fireEvent.click(enTabla().getByRole("button", { name: /^Cant/ }));
    expect(filas()).toEqual(["SANDALIA", "CAMISA POLO"]);
    fireEvent.click(enTabla().getByRole("button", { name: /Precio prom\./ }));
    expect(filas()).toEqual(["CAMISA POLO", "SANDALIA"]);
    expect(urls.length).toBe(antes);
  });

  it("buscar acota lo filtrado, sin consultar", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirCliente(CITY.nombre);
    const antes = urls.length;
    fireEvent.change(screen.getByPlaceholderText("Buscar descripción…"), { target: { value: "SANDA" } });
    expect(filas()).toEqual(["SANDALIA"]);
    expect(urls.length).toBe(antes);
  });
});

// El candado de "es un FILTRO y no un selector" vive donde vive la definición:
// `src/__tests__/un-solo-selector-de-cliente.test.ts`, con el detector del
// sistema. Acá se prueba la otra mitad, la que sólo se ve tocando: que elegir
// un cliente no ESCRIBE nada en ninguna parte.
describe("9 · 🔴 esto es un FILTRO, no un segundo selector de cliente", () => {
  it("no guarda el cliente en ningún lado: sacar el filtro no deja rastro", async () => {
    render(<ProductosView selectedYear={2026} />);
    await pintada();
    await elegirCliente(CITY.nombre);
    await abrirFiltro();
    fireEvent.click(await screen.findByRole("option", { name: "Cliente: todos" }));
    await pintada();
    const escrituras = (vi.mocked(fetch).mock.calls as unknown[][])
      .map(c => c[1] as { method?: string } | undefined)
      .filter(o => o?.method && o.method !== "GET");
    expect(escrituras).toHaveLength(0);
  });
});
