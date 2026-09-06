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
// La sección "Rentabilidad por empresa" (antes "Semáforo por empresa") vive en
// su propio archivo desde el 13-ago-2026, para poder pintarla en un test sin
// montar la página entera. Estas mediciones son de LA PANTALLA, así que leen las
// dos partes juntas: partir el archivo no puede aflojar el candado del ancho.
const vistaGeneral =
  read(path.join(app, "vista-general/page.tsx")) +
  read(path.join(app, "vista-general/RentabilidadPorEmpresa.tsx"));

describe("Ventas › Clientes — el iPad deja de recibir la tabla de escritorio", () => {
  it("la tabla es lg+, no md+ (con md, un iPad de 834 px cae del lado de la tabla)", () => {
    expect(clientes).toContain('className="hidden overflow-hidden p-0 lg:block"');
    expect(clientes).not.toContain("p-0 md:block");
  });

  it("las tarjetas cubren todo lo que está por debajo de lg", () => {
    expect(clientes).toContain('<div className="space-y-2 lg:hidden">');
  });

  it("el mínimo de la tabla entra en los 742 px útiles de una pantalla de 1024", () => {
    const m = /minWidth:\s*(\d+)/.exec(clientes);
    expect(m).not.toBeNull();
    // 920 era el valor viejo: mínimo real 791 px, o sea que NO entraba ni a 1024.
    expect(Number(m![1])).toBeLessThanOrEqual(742);
  });

  it("los encabezados pueden partirse en dos líneas (es la mitad de lo que bajó el mínimo)", () => {
    // Con `whitespace-nowrap`, "Compras 2026" y "Última compra" fuerzan su ancho
    // de una sola línea. Se mira la CLASE del <th>, no el archivo entero: el
    // comentario de al lado nombra la clase justo para explicar por qué no está.
    const th = clientes.slice(clientes.indexOf("function SortHeader"));
    const clase = /"cursor-pointer select-none[^"]*"/.exec(th);
    expect(clase).not.toBeNull();
    expect(clase![0]).not.toContain("whitespace-nowrap");
  });

  it("los textos de los encabezados NO se abreviaron", () => {
    expect(clientes).toContain("Compras {selectedYear}");
    expect(clientes).toContain("Última compra");
  });

  it("las píldoras de empresa ENVUELVEN en vez de arrastrarse (eran los 369 px del iPhone)", () => {
    expect(clientes).toContain("flex flex-wrap gap-1.5");
    expect(clientes).not.toContain("flex flex-nowrap gap-1.5");
    expect(clientes).not.toContain("scrollSnapType");
    expect(clientes).not.toContain("scrollSnapAlign");
  });

  // 🩸 ESTE TEST CAMBIÓ DE DIRECCIÓN (2-sep-2026), y antes ERA ÉL EL QUE FIJABA
  // EL BUG. Se llamaba "las 6 píldoras" pero enumeraba CINCO empresas + "Todas":
  // **joystep no estaba**, y el test exigía que la lista estuviera escrita a mano
  // (`label: "Vistana International"`), que es justamente lo que dejó a joystep
  // afuera. Daniel: *"deberían estar solo las 6 de Fashion Group, que son las 5
  // de las fotos y joystep"*.
  //
  // Lo que este archivo SIEMPRE quiso decir es de ANCHO: que las píldoras no se
  // abrevien para que entren en el iPad. Eso se conserva y se dice mejor — los
  // rótulos salen de `EMPRESA_KEY_TO_NAME`, que trae el nombre entero. QUIÉNES
  // son las píldoras lo vigila `ventas-clientes-las-seis-empresas.test.tsx`, que
  // además las PINTA.
  it("las píldoras se DERIVAN de las 6 y su rótulo es el nombre entero", () => {
    expect(clientes).toContain("B2B_EMPRESA_KEYS.map");
    // 🔁 5-sep-2026: el rótulo es el nombre CORTO («Vistana», «Boston»),
    // decisión #4 del diccionario. NO es una abreviatura de las que este archivo
    // vino a prohibir —«Vist. Int.», partir el nombre para que entre—: es el
    // nombre que Daniel usa, elegido por él, y sale del SEGUNDO CAMPO de la
    // MISMA lista de empresas, no de un mapa aparte. Lo que este test sostiene
    // sigue en pie: el rótulo se DERIVA, no se escribe a mano.
    expect(clientes).toContain("nombreCortoEmpresa(key)");
    expect(clientes).not.toMatch(/label:\s*"Vistana International"/);
    expect(clientes).toContain('{ id: "todas", label: "Todas" }');
    // Ningún rótulo abreviado a mano: si alguien vuelve a escribirlos, vuelve a
    // poder olvidarse de una empresa.
    for (const label of [
      "Vistana International", "Fashion Wear",
      "Fashion Shoes", "Active Shoes", "Active Wear", "Joystep",
    ]) {
      expect(clientes, `"${label}" no puede estar escrito a mano`).not.toContain(`label: "${label}"`);
    }
  });

  it("los sheets acompañan el corte: con md se abrían sólo debajo de 768 y el iPad quedaba sin ellos", () => {
    expect(clienteSheet).toContain("z-50 lg:hidden");
    expect(sortSheet).toContain("z-50 lg:hidden");
    expect(clienteSheet).not.toContain("z-50 md:hidden");
    expect(sortSheet).not.toContain("z-50 md:hidden");
  });

  it("el HoverCard sólo aparece donde hay tabla (debajo de lg no hay hover)", () => {
    expect(clientes).toContain('className="hidden w-[320px] lg:block"');
  });
});

describe("Ventas › Utilidad — tarjetas debajo de lg", () => {
  it("la tabla es lg+ y hay una lista de tarjetas debajo", () => {
    expect(utilidad).toContain("hidden overflow-x-auto rounded-lg border border-gray-200 lg:block");
    expect(utilidad).toContain('<div className="space-y-2 lg:hidden">');
    expect(utilidad).toContain("function UtilidadCard");
  });

  it("la tarjeta trae los SEIS campos de la fila — no se perdió ninguna cifra", () => {
    const card = utilidad.slice(utilidad.indexOf("function UtilidadCard"));
    for (const col of ["cliente", "empresa", "ventas", "costo", "utilidad", "margen"]) {
      expect(card).toContain(`data-col="${col}"`);
    }
  });

  it("la tarjeta usa EXACTAMENTE los mismos formateadores que la tabla", () => {
    const card = utilidad.slice(utilidad.indexOf("function UtilidadCard"));
    expect(card).toContain("fmtMoneySigned(r.ventas)");
    expect(card).toContain("fmtMoneySigned(r.costo)");
    expect(card).toContain("fmtMoneySigned(r.utilidad)");
    // 🔁 5-sep-2026: `fmtMargen` se renombró a `fmtMargenPantalla` (el módulo
    // tenía DOS funciones con ese nombre, en dos archivos, redondeando distinto)
    // y ahora delega en `fmtPorcentaje`. Lo que este test exige no cambió: la
    // tarjeta y la tabla usan EL MISMO formateador.
    expect(card).toContain("fmtMargenPantalla(r.margen)");
    const fila = utilidad.slice(utilidad.indexOf("function UtilidadRow"), utilidad.indexOf("function UtilidadCard"));
    expect(fila).toContain("fmtMargenPantalla(r.margen)");
    // Nada de redondeos ni abreviaturas propias de la tarjeta.
    expect(card).not.toContain("toFixed");
  });

  it("sin tabla sigue habiendo forma de ordenar en celular", () => {
    // 🔁 5-sep-2026: la tira de chips se fue al componente compartido
    // `TiraOrden` — acá el chip activo era VERDE y en Productos NEGRO, dos
    // colores para el mismo estado en el mismo módulo. Sigue siendo `lg:hidden`
    // y siguen siendo los MISMOS tres criterios.
    expect(utilidad).toContain("ORDEN_TARJETAS");
    expect(utilidad).toContain("<TiraOrden criterios={ORDEN_TARJETAS}");
    expect(utilidad).toContain('className="mb-4 lg:hidden"');
  });

  it("las etiquetas del selector de orden son las MISMAS de los encabezados", () => {
    for (const label of ["Ventas", "Utilidad", "Margen %"]) {
      expect(utilidad).toContain(`label: "${label}"`);
    }
  });

  it("en la tabla de escritorio Empresa y Costo dejaron de esconderse (ya no hace falta)", () => {
    const tabla = utilidad.slice(utilidad.indexOf("lg:block"), utilidad.indexOf("function SortableTh"));
    expect(tabla).not.toContain("sm:table-cell");
    expect(tabla).not.toContain("md:table-cell");
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

  it("las columnas siguen existiendo con sus mismos textos, más Precio prom.", () => {
    for (const th of ["Descripción", "Códigos", "Cant", "Venta", "Precio prom.", "Margen %"]) {
      expect(productos).toContain(th);
    }
    // El rótulo de la columna de cambio se calcula (`vs 2025` con año/mes;
    // `vs año ant.` con las ventanas relativas, donde nombrar un año sería
    // mentira). La "Δ" se retiró: es notación de matemática en una tabla que
    // mira gente que no la conoce. Que DIGA lo correcto en cada caso se prueba
    // tocando el selector, no leyendo el archivo:
    // src/__tests__/components/ventas-productos-precio-periodos.tsx.
    expect(productos).toContain("{deltaLabel}");
    expect(productos).toContain('`vs ${selectedYear - 1}`');
  });

  it("Precio prom. se esconde bajo `sm`, como Cant y Δ — a 390 px no cabe una 4a", () => {
    const th = productos.slice(productos.indexOf('label="Precio prom."'));
    expect(th.slice(0, 200)).toContain('className="hidden sm:table-cell"');
  });
});

describe("Vista General › Rentabilidad por empresa — tarjetas en iPhone, tabla desde md", () => {
  it("hay tarjetas debajo de md y la tabla arranca en md", () => {
    expect(vistaGeneral).toContain('<div className="space-y-2 md:hidden">');
    expect(vistaGeneral).toContain("overflow-x-auto md:block");
    expect(vistaGeneral).toContain("function Tarjeta(");
  });

  it("la tabla perdió su min-w-[560px] (mínimo real 498, útil a 834 = 552)", () => {
    const semaforo = vistaGeneral.slice(vistaGeneral.indexOf("function RentabilidadPorEmpresa("));
    expect(semaforo).not.toContain("min-w-[560px]");
  });

  it("el desglose se dibuja UNA vez para las dos formas", () => {
    expect(vistaGeneral).toContain("function Desglose(");
    // Dos copias del mismo párrafo es como divergen los números entre pantallas.
    // (El desglose es "utilidad bruta − gastos": ya no hay gasto de "grupo" que
    // prorratear, cada gasto trae su empresa. El rótulo dejó de decir "de
    // contabilidad" el 13-ago-2026, cuando la fuente pasó del mayor a Egresos
    // Varios — lo que se cuenta ahora es lo que SALIÓ de caja y banco.)
    expect(vistaGeneral.match(/\{" − "\}Gastos /g) ?? []).toHaveLength(1);
    expect(vistaGeneral).toContain("function VerGastosLink");
  });

  it("la píldora de estado conserva sus textos", () => {
    for (const label of ["Sana", "Al límite", "Pierde plata"]) {
      expect(vistaGeneral).toContain(`label: "${label}"`);
    }
    // 🔑 Sin número, la píldora dice POR QUÉ y no un genérico: los cuatro
    // motivos salen de `ETIQUETA_SIN_GASTO` (módulo puro compartido con el
    // servidor), no de una lista copiada acá.
    expect(vistaGeneral).toContain("ETIQUETA_SIN_GASTO");
  });
});

describe("la tira de pestañas de Ventas no se arrastra (54 px que costaban los tabs)", () => {
  it("el TabsList ya no scrollea a lo ancho", () => {
    const linea = shell.slice(shell.indexOf("<TabsList"), shell.indexOf("</TabsList>"));
    expect(linea).not.toContain("overflow-x-auto");
  });

  it("🔁 las 3 pestañas están con su nombre completo, y son SOLO tres", () => {
    for (const t of ["Resumen", "Clientes", "Productos"]) {
      expect(shell).toContain(`> ${t}\n`);
    }
    // Referencia fue la 5ª entre el 9 y el 12-ago-2026 y volvió a arrastrar el
    // celular (por eso se escondían los iconos y la letra bajaba a 13 px). Se
    // mudó a su propio módulo, /referencia.
    //
    // ⚠️ 25-ago-2026: la 5ª volvió, y era **Comisiones**. Tenía las MISMAS 10
    // letras que «Referencia», así que devolvió el mismo apriete.
    //
    // 🔁 5-sep-2026: la tira volvió a TRES. «Comisiones» se fue a su módulo
    // (Daniel: *«si quitala»*) y «Utilidad» pasó a ser un MODO de Clientes, con
    // el mismo control segmentado que el Resumen. Lo que este test sostiene no
    // cambió: los nombres van ENTEROS, no abreviados, y son exactamente los que
    // se decidieron — ni uno más.
    const tira = shell.slice(shell.indexOf("<TabsList"), shell.indexOf("</TabsList>"));
    expect(tira.match(/<TabsTrigger /g)?.length ?? 0).toBe(3);
    expect(tira).not.toContain("Referencia");
    expect(tira).not.toContain("Comisiones");
    expect(tira).not.toContain("Utilidad");
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

  it("Vista General: el enlace a Gastos respeta los 44 px de alto", () => {
    // Era el enlace del punto de equilibrio (129×17), que se retiró con la
    // tarjeta entera; el que queda es "Ver gastos de <empresa> →" del semáforo.
    expect(vistaGeneral).toContain("inline-flex min-h-[44px] items-center text-xs text-teal-600");
  });
});

describe("las anclas del verificador son `data-` FIJOS, no clases de breakpoint", () => {
  // 🩸 La trampa: buscar la vista angosta por `.md\:hidden` y, al moverse el
  // corte, no encontrar nada — la comparación recorre 0 filas y el chequeo pasa
  // en verde sin haber comparado un solo número.
  it("cada fila y cada tarjeta llevan la MISMA clave estable", () => {
    expect(clientes.match(/data-fila-cliente=/g) ?? []).toHaveLength(2);
    expect(utilidad.match(/data-fila-utilidad=/g) ?? []).toHaveLength(2);
    expect(vistaGeneral.match(/data-fila-semaforo=/g) ?? []).toHaveLength(2);
    // Productos no se partió en dos formas: una sola tabla, un solo ancla.
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
