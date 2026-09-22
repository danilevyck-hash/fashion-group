/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CANDADO — LOS NÚMEROS DE COMPROBANTES CUADRAN (22-sep-2026)
 *
 * Daniel, mirando la captura de Reebok del 19-sep-2026: arriba decía
 * «Todos 13 · Del cliente 1 · Del vendedor 12» y al lado «Pedidos 13 ·
 * Borradores 2». **13 + 2 = 15, pero «Todos» decía 13.** Y abajo, «Ver más (5)».
 *
 * 🩸 MEDIDO CONTRA PRODUCCIÓN (reebok, al 19-sep-2026): 20 comprobantes vivos.
 * 15 dentro de la ventana (13 pedidos + 2 borradores) y 5 detrás del «Ver más»
 * —los cinco pedidos del link del 7 al 13 de julio que nadie confirmó—. Esos 5
 * no los contaba NINGÚN chip, y por eso el Excel del día siguiente bajó 20
 * filas contra las 13 de la pantalla.
 *
 * Lo que este candado exige:
 *   1. Los dos grupos cuentan sobre las MISMAS candidatas: «Todos» es el total
 *      y las dos sumas dan ese mismo número.
 *   2. Ningún conteo se recorta con el filtro del otro grupo.
 *   3. «Sin mandar» NO entra al cuadre: es un subconjunto de «Pedidos».
 *   4. El pie dice cuántas se ven de cuántas hay, y sale del MISMO módulo que
 *      el pie de Guías (`lib/ui/pie-de-lista.ts`) — la regla de la casa es
 *      *«o el total sigue al filtro, o no hay buscador»*.
 *   5. Con las filas REALES del 19-sep-2026 los números salen como Daniel los
 *      vio, y con el arreglo puesto cuadran.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cuadreDeChips,
  gruposDeChips,
  type FilaParaChips,
} from "@/lib/catalogo/chips-comprobantes";
import { partirPorVentana } from "@/lib/catalogo/comprobantes-ventana";
import {
  ROTULO_SELECCIONAR_TODOS,
  textoEliminarSeleccionados,
  textoPieDeComprobantes,
  textoSeleccionarTodos,
} from "@/lib/catalogo/cuantas-comprobantes";
import { textoDelPie } from "@/lib/ui/pie-de-lista";
import { textoPieDeLista } from "@/lib/guias/pie-de-la-lista";

const leer = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const fila = (over: Partial<FilaParaChips> = {}): FilaParaChips => ({
  origen: "mio",
  status: "confirmado",
  enSwitch: true,
  switchDocumento: "pedido",
  switchNumero: "16-000000500",
  numeroPedido: "PED-001",
  fuente: "orders",
  created_at: "2026-09-09T12:00:00Z",
  ...over,
});

// ── LAS FILAS DE VERDAD DE REEBOK, AL 19-sep-2026 ────────────────────────────
//
// 20 vivas: 13 pedidos internos «Del vendedor», 1 pedido «Del cliente» ya
// convertido, 1 borrador... y así hasta las 15 de la ventana, más los 5 del
// link sin confirmar de julio, que a los 30 días caen detrás del «Ver más».
const DEL_VENDEDOR = Array.from({ length: 12 }, (_, i) =>
  fila({ numeroPedido: `PED-0${20 + i}`, created_at: "2026-09-03T12:00:00Z" }),
);
const DEL_CLIENTE = fila({ origen: "link", created_at: "2026-09-09T12:00:00Z" });
const BORRADORES = [
  fila({ status: "borrador", enSwitch: false, switchNumero: null, switchDocumento: null }),
  fila({ status: "borrador", enSwitch: false, switchNumero: null, switchDocumento: null }),
];
const LINK_DE_JULIO = Array.from({ length: 5 }, (_, i) =>
  fila({
    origen: "link",
    fuente: "publicos",
    status: null,
    enSwitch: false,
    switchNumero: null,
    switchDocumento: null,
    numeroPedido: null,
    created_at: `2026-07-${String(7 + i).padStart(2, "0")}T12:00:00Z`,
  }),
);
const VIVAS = [...DEL_VENDEDOR, DEL_CLIENTE, ...BORRADORES, ...LINK_DE_JULIO];
const AHORA = new Date("2026-09-19T12:00:00Z");

describe("🩸 la pantalla del 19-sep-2026, reproducida", () => {
  const { recientes, viejos } = partirPorVentana(VIVAS, AHORA);

  it("20 vivas, 15 en la ventana y 5 detrás del «Ver más»", () => {
    expect(VIVAS.length).toBe(20);
    expect(recientes.length).toBe(15);
    expect(viejos.length).toBe(5);
  });

  it("🔴 los cinco escondidos son «Pedidos» y «Del cliente» — ningún chip los contaba", () => {
    // Ésta es la parte que es «más grande que un conteo»: si el «Ver más»
    // guardara filas de un tipo que ningún chip nombra, el arreglo sería otro.
    const { vista, origen } = gruposDeChips(viejos, { origen: "todos", vista: "pedido" });
    expect(vista.opciones.find((o) => o.clave === "pedido")!.conteo).toBe(5);
    expect(origen.opciones.find((o) => o.clave === "link")!.conteo).toBe(5);
  });

  it("🔴 CON EL ARREGLO: «Todos 15 · Del cliente 1 · Del vendedor 14» y «Pedidos 13 · Borradores 2»", () => {
    const estado = { origen: "todos" as const, vista: "pedido" as const };
    const { origen, vista } = gruposDeChips(recientes, estado);
    expect(origen.opciones.find((o) => o.clave === "todos")!.conteo).toBe(15);
    expect(origen.opciones.find((o) => o.clave === "link")!.conteo).toBe(1);
    expect(origen.opciones.find((o) => o.clave === "mio")!.conteo).toBe(14);
    expect(vista.opciones.find((o) => o.clave === "pedido")!.conteo).toBe(13);
    expect(vista.opciones.find((o) => o.clave === "borrador")!.conteo).toBe(2);
  });

  it("🔴 y el pie ata los cuatro números: «13 comprobantes de 20»", () => {
    const visibles = recientes.filter((f) => f.status !== "borrador");
    expect(visibles.length).toBe(13);
    expect(textoPieDeComprobantes(visibles.length, VIVAS.length)).toBe("13 comprobantes de 20");
  });
});

describe("🔴 1. los dos grupos suman lo mismo, y «Todos» es todos", () => {
  const ESTADOS = [
    { origen: "todos" as const, vista: "pedido" as const },
    { origen: "link" as const, vista: "pedido" as const },
    { origen: "mio" as const, vista: "borrador" as const },
    { origen: "todos" as const, vista: "sin_mandar" as const },
  ];

  for (const estado of ESTADOS) {
    it(`cuadra con origen=${estado.origen} · vista=${estado.vista}`, () => {
      const { recientes } = partirPorVentana(VIVAS, AHORA);
      const c = cuadreDeChips(recientes, estado);
      expect(c.todos).toBe(recientes.length);
      expect(c.origen).toBe(c.todos);
      expect(c.vista).toBe(c.todos);
    });
  }

  it("con la lista vacía no se inventa nada", () => {
    const c = cuadreDeChips([], { origen: "todos", vista: "pedido" });
    expect(c).toEqual({ todos: 0, origen: 0, vista: 0 });
  });

  it("🔴 «Sin mandar» NO entra al cuadre: es un subconjunto de «Pedidos»", () => {
    const trabado = fila({ enSwitch: false, switchNumero: null, switchDocumento: null });
    const filas = [trabado, fila()];
    const { vista } = gruposDeChips(filas, { origen: "todos", vista: "pedido" });
    // El chip existe y cuenta 1…
    expect(vista.opciones.find((o) => o.clave === "sin_mandar")!.conteo).toBe(1);
    // …y aun así el grupo suma 2, no 3.
    expect(cuadreDeChips(filas, { origen: "todos", vista: "pedido" }).vista).toBe(2);
  });
});

describe("🔴 2. ningún conteo se recorta con el filtro del OTRO grupo", () => {
  const FILAS = [
    fila({ origen: "mio" }),
    fila({ origen: "mio", status: "borrador", enSwitch: false }),
    fila({ origen: "link", fuente: "publicos", status: null, enSwitch: false }),
  ];

  it("el origen cuenta igual mire lo que mire el grupo de tipo", () => {
    const conPedidos = gruposDeChips(FILAS, { origen: "todos", vista: "pedido" }).origen;
    const conBorradores = gruposDeChips(FILAS, { origen: "todos", vista: "borrador" }).origen;
    const conteos = (g: typeof conPedidos) =>
      Object.fromEntries(g.opciones.map((o) => [o.clave, o.conteo]));
    expect(conteos(conPedidos)).toEqual(conteos(conBorradores));
  });

  it("el tipo cuenta igual mire lo que mire el grupo de origen", () => {
    const conTodos = gruposDeChips(FILAS, { origen: "todos", vista: "pedido" }).vista;
    const conLink = gruposDeChips(FILAS, { origen: "link", vista: "pedido" }).vista;
    const conteos = (g: typeof conTodos) =>
      Object.fromEntries(g.opciones.map((o) => [o.clave, o.conteo]));
    expect(conteos(conTodos)).toEqual(conteos(conLink));
  });

  it("CONTROL: lo que está en cero sigue sin ocupar lugar, salvo el activo", () => {
    const { vista } = gruposDeChips(FILAS, { origen: "todos", vista: "pedido" });
    expect(vista.opciones.map((o) => o.clave)).not.toContain("cotizacion");
    const conCotizacion = gruposDeChips(FILAS, { origen: "todos", vista: "cotizacion" }).vista;
    expect(conCotizacion.opciones.find((o) => o.clave === "cotizacion")!.conteo).toBe(0);
  });
});

describe("🔴 3. el pie sale de la MISMA regla que el de Guías", () => {
  it("con algo escondido dice «N de M»; con todo a la vista, un solo número", () => {
    expect(textoPieDeComprobantes(13, 20)).toBe("13 comprobantes de 20");
    expect(textoPieDeComprobantes(20, 20)).toBe("20 comprobantes");
    expect(textoPieDeComprobantes(1, 20)).toBe("1 comprobante de 20");
    expect(textoPieDeComprobantes(1, 1)).toBe("1 comprobante");
    // Un «mostradas» mayor que el total no se dibuja como «21 de 20».
    expect(textoPieDeComprobantes(21, 20)).toBe("20 comprobantes");
  });

  it("🔑 es el MISMO módulo que Guías, no una segunda copia de la cuenta", () => {
    expect(textoDelPie(47, 236, { singular: "guía", plural: "guías" })).toBe("47 guías de 236");
    expect(textoPieDeLista(47, 236)).toBe("47 guías de 236");
    for (const rel of ["src/lib/catalogo/cuantas-comprobantes.ts", "src/lib/guias/pie-de-la-lista.ts"]) {
      expect(leer(rel), `${rel} tiene que LEER la regla común`).toContain(
        'from "@/lib/ui/pie-de-lista"',
      );
    }
  });

  it("🔴 la pantalla usa el pie, con lo dibujado y con el total sin filtrar", () => {
    const panel = leer("src/components/catalogo/ComprobantesPanel.tsx");
    expect(panel).toContain("textoPieDeComprobantes(visibles.length, pedidos.length)");
    // Contra la lista ya recortada sería el mismo defecto con otra ropa.
    expect(panel).not.toContain("textoPieDeComprobantes(visibles.length, visibles.length)");
    expect(panel).not.toContain("textoPieDeComprobantes(visibles.length, candidatas.length)");
  });
});

describe("🔴 4. lo que se selecciona y lo que se borra DICEN a cuántos afectan", () => {
  it("los dos rótulos llevan su número", () => {
    expect(textoSeleccionarTodos(13)).toBe("Seleccionar todos (13)");
    expect(textoSeleccionarTodos(1)).toBe("Seleccionar todos (1)");
    expect(textoEliminarSeleccionados(12)).toBe("Eliminar seleccionados (12)");
    expect(textoEliminarSeleccionados(1)).toBe("Eliminar seleccionados (1)");
  });

  it("con cero no se cuelga un «(0)», que se lee como un dato que no cargó", () => {
    expect(textoSeleccionarTodos(0)).toBe(ROTULO_SELECCIONAR_TODOS);
  });
});
