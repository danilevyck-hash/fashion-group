// Candado: Ventas (Clientes / Productos / Utilidad) y Vista General NO vuelven
// a arrastrarse en iPhone ni en iPad.
//
// 🔑 EL NÚMERO QUE DECIDE ES EL ANCHO ÚTIL, NO EL VIEWPORT. La barra lateral se
// lleva 223 px y el `main` otros 56, así que un iPad de 834 px deja **552** —
// más angosto que un iPhone acostado. Ésa es la razón de que estas cuatro
// pantallas midieran casi lo mismo en celular y en tablet (Clientes: 369 px de
// arrastre a 390 y 368 a 834; el iPad no ganaba NADA por ser más ancho, la firma
// de que estaba recibiendo la pantalla de escritorio sin adaptar).
//
// Anchos útiles reales, medidos en el navegador contra el build de producción:
//
//   390 (iPhone, sin barra lateral) → 356      810 (iPad Air vertical) → 528
//   834 (iPad vertical)             → 552     1024 (iPad Pro)          → 742
//
// Por eso el corte de estas tablas es `lg` (1024) y no `md` (768): con `md`, el
// iPad caía del lado de la tabla. La única excepción es Vista General, cuya
// tabla mide 498 px de mínimo y SÍ entra en los 552 de un iPad — ahí el corte se
// queda en `md` porque a 834 ya medía 0 y pasarla a tarjetas no habría ganado un
// solo píxel.
//
// Medición reproducible (solo lectura, sin tocar ningún botón que ejecute):
//   node scripts/_ancho-util-ventas.mjs     ← ¿la tabla ENTRA o no entra?
//   node scripts/_medir-scroll-lateral.mjs  ← el censo de arrastre
//   node scripts/_verif-ventas-ipad.mjs     ← ningún número cambió

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";

const ventas = path.resolve(__dirname, "../../components/ventas");
const app = path.resolve(__dirname, "../../app");
const read = (p: string) => readFileSync(p, "utf8");

const clientes = read(path.join(ventas, "ClientesView.tsx"));
const productos = read(path.join(ventas, "ProductosView.tsx"));
const utilidad = read(path.join(ventas, "UtilidadView.tsx"));
const clienteSheet = read(path.join(ventas, "ClienteSheet.tsx"));
const sortSheet = read(path.join(ventas, "SortSheet.tsx"));
const shell = read(path.join(app, "ventas/VentasShell.tsx"));
const vistaGeneral = read(path.join(app, "vista-general/page.tsx"));

describe("Ventas › Clientes — la tabla en todos los anchos, con el nombre fijo", () => {
  // 🩸 Daniel rechazó las tarjetas el 30-jul-2026: *"me gusta ver mi tabla
  // completa"*. Acá las tarjetas venían de ANTES de todo este trabajo (eran
  // `md:hidden` desde mucho antes), así que a 390 px esta pestaña no había
  // cambiado — pero el pedido es del módulo entero y quedó pareja con el resto.

  it("no queda ningún corte por ancho: una sola forma", () => {
    expect(clientes).toContain('<Card className="overflow-hidden p-0">');
    expect(clientes).not.toContain("p-0 lg:block");
    expect(clientes).not.toContain("p-0 md:block");
  });

  it("las tarjetas ya no se dibujan", () => {
    expect(clientes).not.toContain("<ClienteCard");
    expect(clientes).not.toContain("<OtrosCard");
    expect(clientes).not.toContain('<div className="space-y-2 lg:hidden">');
  });

  it("se fija UNA sola columna, el nombre, y pegada al borde", () => {
    // 🩸 Fijar también "#" con un desplazamiento escrito a mano se MIDIÓ y no
    // funciona: en `table-layout: auto` el ancho de la columna lo decide el
    // navegador. A 390 px, "#" quedó en 96 px con `width: 3rem` puesto → el
    // nombre se despegaba 48 px al deslizar. Con una sola columna fija no hay
    // ningún número que pueda desincronizarse.
    expect(clientes).toContain("fija>Cliente</SortHeader>");
    expect(clientes).not.toContain("ANCHO_RANK");
    expect(clientes).toContain("fija && \"sticky left-0 z-20 border-r border-gray-200\"");
  });

  it("las celdas fijas tienen FONDO OPACO — sin eso los montos se ven por debajo", () => {
    // una por cada clase de fila: cliente, "Otros clientes" y el mostrador
    expect(clientes).toContain('className="sticky left-0 z-10 border-b border-r border-gray-200 bg-white');
    expect(clientes).toContain('className="sticky left-0 z-10 border-b border-r border-gray-200 bg-gray-100');
    expect(clientes).toContain('className="sticky left-0 z-10 border-b border-r border-gray-200 bg-amber-50');
  });

  it("ninguna celda fija abarca dos columnas (queda pinchada tapando la de al lado)", () => {
    const fijas = clientes.split("\n").filter((l) => l.includes("sticky") && l.includes("<td"));
    expect(fijas.length).toBeGreaterThan(0);
    for (const l of fijas) expect(l).not.toContain("colSpan");
  });

  it("el detalle de celular sigue existiendo: la fila lo abre", () => {
    expect(clientes).toContain("onClick={onTap}");
    expect(clientes).toContain("onTap={() => setSheetCliente(c)}");
    expect(clientes).toContain("<ClienteSheet");
  });

  it("los encabezados no se abreviaron", () => {
    expect(clientes).toContain("Compras {selectedYear}");
    expect(clientes).toContain("Última compra");
  });

  it("las píldoras de empresa siguen envolviendo (no vuelven a arrastrarse)", () => {
    expect(clientes).toContain("flex flex-wrap gap-1.5");
    expect(clientes).not.toContain("scrollSnapType");
  });
});

describe("Ventas › Utilidad — la tabla vuelve, con Cliente fijo", () => {
  it("no queda ningún corte por ancho ni rastro de las tarjetas", () => {
    expect(utilidad).toContain('<div className="overflow-x-auto rounded-lg border border-gray-200">');
    expect(utilidad).not.toContain("lg:block");
    expect(utilidad).not.toContain("lg:hidden");
    expect(utilidad).not.toContain("UtilidadCard");
    expect(utilidad).not.toContain("ORDEN_TARJETAS");
  });

  it("la columna Cliente no se desliza, y tiene fondo opaco", () => {
    expect(utilidad).toContain('<th className="sticky left-0 z-20 border-r border-gray-200 bg-white px-3 py-2.5 font-normal">Cliente</th>');
    expect(utilidad).toContain('className="sticky left-0 z-10 border-r border-gray-200 bg-white px-3 py-2.5 group-hover:bg-gray-50"');
  });

  it("las 6 columnas siguen ahí — es la tabla completa que Daniel pidió", () => {
    for (const col of ["cliente", "empresa", "ventas", "costo", "utilidad", "margen"]) {
      expect(utilidad).toContain(`data-col="${col}"`);
    }
  });

  it("el encabezado sigue siendo el control de orden, y mide 44 px", () => {
    expect(utilidad).toContain("inline-flex min-h-[44px] min-w-[44px] items-center justify-end");
  });
});

describe("Ventas › Productos — la tabla ENTRA, así que se queda tabla", () => {
  it("sin el min-w-[560px] inventado, que era TODO el arrastre", () => {
    // Se mira la etiqueta <table>, no el archivo: el comentario de al lado
    // nombra la clase vieja para explicar de dónde salían los 204 px.
    expect(productos).toContain('<table className="w-full border-collapse text-sm">');
    expect(/<table[^>]*min-w-\[/.test(productos)).toBe(false);
  });

  it("no se pasó a tarjetas: a 390 px el mínimo real es 294 contra 356 disponibles", () => {
    expect(productos).not.toContain("lg:hidden");
    expect(productos).toContain("<tbody>");
  });

  it("y ahora la columna Descripción tampoco se desliza", () => {
    expect(productos).toContain("sticky left-0 z-20 border-r border-gray-200 bg-white");
    expect(productos).toContain("sticky left-0 z-10 border-r border-gray-200 bg-white");
  });

  it("las 6 columnas siguen existiendo con sus mismos textos", () => {
    for (const th of ["Descripción", "Códigos", "Cant", "Venta", "Margen %"]) {
      expect(productos).toContain(th);
    }
    expect(productos).toContain("Δ {selectedYear - 1}");
  });
});

describe("Vista General › Semáforo — tarjetas en iPhone, tabla desde md", () => {
  it("hay tarjetas debajo de md y la tabla arranca en md", () => {
    expect(vistaGeneral).toContain('<div className="space-y-2 md:hidden">');
    expect(vistaGeneral).toContain("overflow-x-auto md:block");
    expect(vistaGeneral).toContain("function SemaforoTarjeta");
  });

  it("la tabla perdió su min-w-[560px] (mínimo real 498, útil a 834 = 552)", () => {
    const semaforo = vistaGeneral.slice(vistaGeneral.indexOf("function Semaforo("));
    expect(semaforo).not.toContain("min-w-[560px]");
  });

  it("el desglose se dibuja UNA vez para las dos formas", () => {
    expect(vistaGeneral).toContain("function SemaforoDesglose");
    // Dos copias del mismo párrafo es como divergen los números entre pantallas.
    expect(vistaGeneral.match(/Parte de gastos de Grupo/g) ?? []).toHaveLength(1);
    expect(vistaGeneral).toContain("function VerGastosLink");
  });

  it("la píldora de estado conserva sus cuatro textos", () => {
    for (const label of ["Sana", "Al límite", "Pierde plata", "Sin gastos cargados"]) {
      expect(vistaGeneral).toContain(`label: "${label}"`);
    }
  });
});

describe("la tira de pestañas de Ventas deja de arrastrarse (54 px en los 4 tabs)", () => {
  it("el TabsList ya no scrollea a lo ancho", () => {
    const linea = shell.slice(shell.indexOf("<TabsList"), shell.indexOf("</TabsList>"));
    expect(linea).not.toContain("overflow-x-auto");
  });

  it("las 4 pestañas siguen ahí con su nombre completo", () => {
    for (const t of ["Resumen", "Clientes", "Productos", "Utilidad"]) {
      expect(shell).toContain(`> ${t}\n`);
    }
  });
});

describe("blancos táctiles de 44 px en lo que se toca", () => {
  it("Clientes: el nombre de la tabla, el chip de vista y el desglose por empresa", () => {
    // El nombre medía 18 px de alto; se envolvió junto al código.
    expect(clientes).toContain("flex min-h-[44px] max-w-full flex-col justify-center");
    // El chip de vista medía 236×22 (escritorio) y 107×26 (celular).
    expect(clientes.match(/min-h-\[44px\]/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
  });

  it("los botones de ordenar de Productos y Utilidad miden 44×44 (Cant medía 41 de ancho)", () => {
    for (const src of [productos, utilidad]) {
      expect(src).toContain("inline-flex min-h-[44px] min-w-[44px] items-center justify-end");
    }
  });

  it("Vista General: el enlace de gastos deja de medir 129×17", () => {
    expect(vistaGeneral).toContain("inline-flex min-h-[44px] items-center text-teal-600");
  });
});

describe("las anclas del verificador son `data-` FIJOS, no clases de breakpoint", () => {
  // 🩸 La trampa: buscar la vista angosta por `.md\:hidden` y, al moverse el
  // corte, no encontrar nada — la comparación recorre 0 filas y el chequeo pasa
  // en verde sin haber comparado un solo número.
  it("cada fila lleva su clave estable", () => {
    // Clientes y Utilidad volvieron a tener UNA sola forma (la tabla), así que
    // ahora hay un ancla por fila y no dos. Vista General sigue con tarjetas en
    // celular —ahí no hubo queja: lo que se arregló fue que la grilla ENTRARA— y
    // conserva sus dos.
    expect(clientes.match(/data-fila-cliente=/g) ?? []).toHaveLength(1);
    expect(utilidad.match(/data-fila-utilidad=/g) ?? []).toHaveLength(1);
    expect(vistaGeneral.match(/data-fila-semaforo=/g) ?? []).toHaveLength(2);
    expect(productos.match(/data-fila-producto=/g) ?? []).toHaveLength(1);
  });

  it("el verificador existe y no busca por clase de breakpoint", () => {
    const script = path.resolve(__dirname, "../../../scripts/_verif-ventas-ipad.mjs");
    expect(existsSync(script)).toBe(true);
    const src = read(script);
    expect(src).toContain("data-fila-cliente");
    expect(src).not.toMatch(/querySelectorAll\(["'`][^"'`]*\\\\:hidden/);
    // Y tiene control de vacío: 0 diferencias sobre 0 filas NO es un aprobado.
    expect(src).toContain("SIN FILAS");
  });
});
