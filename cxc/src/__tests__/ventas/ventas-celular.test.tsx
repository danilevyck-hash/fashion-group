// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — VENTAS EN EL CELULAR (25-sep-2026). El mockup que Daniel aprobó
// letra por letra: 1b · 2a · 3f · 3g · 4d (con 3c) · 5b · 6a.
//
// 🩸 QUÉ REEMPLAZA, medido el 25-sep-2026 contra producción a 390 px:
//   · **Resumen**: el primer número llegaba a y=296 (el 35 % del pantallazo) y
//     **$7.069.116,31 se decía DOS veces** —la tarjeta VENTAS y la fila TOTAL
//     GRUPO—: los únicos dos montos repetidos de los 21 visibles. Las nueve
//     filas medían **65, 78 y 112 px**.
//   · **Clientes**: abría por «última compra», así que los diez primeros eran
//     los diez que compraron ayer y el más grande del año ($1.431.353) quedaba
//     **cuarto de casualidad**; la fecha que mandaba el orden iba **sin rótulo**.
//   · **Productos**: el primer producto empezaba a **y=825 de 844**, con «Dejó
//     de venderse» ENCIMA de lo principal y los cuatro chips en DOS filas.
//
// 🔴 LO QUE ESTE CANDADO SOSTIENE:
//   1. El interruptor existe, está prendido, y con él apagado no se dibuja la
//      pantalla nueva.
//   2. 🔴 NINGÚN NÚMERO CAMBIA: la cifra corta de la tira sale del MISMO monto
//      y el exacto con centavos se dice UNA vez, al pie.
//   3. «compró ayer» / «3 meses sin comprar» se calculan de la ÚLTIMA COMPRA
//      real y con el «hoy» que llega por parámetro — acá nadie mira el reloj.
//   4. «Nuevo», no «+0 %», cuando no hay año pasado con qué comparar.
//   5. Un mes negativo se dibuja HACIA ABAJO y no se esconde ni se pone en 0.
//   6. Las cinco columnas de Productos son cinco, en su orden, y «Cantidad» y
//      «Total» son las mismas piezas y la misma venta de siempre.
//   7. El botón flotante ya no tapa el total del Resumen.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  COLUMNAS_PRODUCTOS,
  MESES_SIN_COMPRAR_AVISA,
  VENTAS_CELULAR,
  barrasDelMesAMes,
  cambioDeLaTira,
  cifraDeLaTira,
  diasEntre,
  lineaGrisDelCliente,
  montoDeLaTabla,
  porcentajeDeLaTabla,
  porcentajeDelCliente,
  subtituloDelProducto,
  ultimaCompraEnPalabras,
} from "@/lib/ventas/celular";
import { fmtMoney } from "@/lib/ventas/format";
import {
  COLCHON_LATERAL_FLOTANTE,
  DIAMETRO_FLOTANTE,
  MARGEN_FLOTANTE,
} from "@/lib/navegacion/barra-celular";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// 1 · El interruptor
// ─────────────────────────────────────────────────────────────────────────────

describe("el interruptor", () => {
  it("está prendido y es de CÓDIGO, no de variable de entorno", () => {
    expect(VENTAS_CELULAR).toBe(true);
    const fuente = leer("src/lib/ventas/celular.ts");
    expect(fuente).not.toContain("process.env");
    expect(fuente).toContain("export const VENTAS_CELULAR");
  });

  it("apagarlo devuelve la pantalla de antes: el gancho lo consulta", () => {
    const hook = leer("src/components/ventas/celular/useEsCelularVentas.ts");
    expect(hook).toContain("if (!VENTAS_CELULAR) return");
    expect(hook).toContain("return VENTAS_CELULAR && celular");
  });

  it("🔑 se monta UN SOLO ÁRBOL, no dos escondidos con CSS", () => {
    // Con las dos vistas a la vez cada nombre saldría DOS veces en el documento.
    const resumen = leer("src/components/ventas/ResumenView.tsx");
    expect(resumen).toContain("enCelular ? (");
    const clientes = leer("src/components/ventas/ClientesView.tsx");
    expect(clientes).toContain("if (enCelular && !enUtilidad) {");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · 1b — la tira de cuatro, y el exacto UNA vez
// ─────────────────────────────────────────────────────────────────────────────

describe("1b · los cuatro números en una línea", () => {
  // Los números REALES del 25-sep-2026.
  const VENTAS = 7_069_116.31;

  it("🔴 la cifra corta es el MISMO monto con menos dígitos", () => {
    expect(cifraDeLaTira(VENTAS)).toBe("$7.07M");
    expect(cifraDeLaTira(2_028_506.54)).toBe("$2.03M");
    expect(cifraDeLaTira(920_681)).toBe("$921k");
    expect(cifraDeLaTira(431)).toBe("$431");
    expect(cifraDeLaTira(null)).toBe("—");
    // Un negativo lleva el signo delante del símbolo, como toda la casa.
    expect(cifraDeLaTira(-1_026.14)).toBe("−$1k");
  });

  it("🔴 el EXACTO con centavos se sigue diciendo, y una sola vez: al pie", () => {
    expect(fmtMoney(VENTAS)).toBe("$7,069,116.31");
    const vista = leer("src/components/ventas/celular/ResumenCelular.tsx");
    // El pie usa `fmtMoney` (centavos); las celdas, el monto entero.
    expect(vista).toContain("{fmtMoney(totalAnio)}");
    expect(vista).toContain("data-total-grupo");
    // Y la tira NO repite el exacto: usa la cifra corta.
    expect(vista).toContain("cifraDeLaTira(k.ventasNetasYTD)");
    expect(vista).not.toContain("fmtMoney(k.ventasNetasYTD)");
  });

  it("el cambio lleva su flecha y su signo", () => {
    expect(cambioDeLaTira(0.08)).toBe("▲ +8%");
    expect(cambioDeLaTira(-0.12)).toBe("▼ −12%");
    expect(cambioDeLaTira(0)).toBe("+0%");
    expect(cambioDeLaTira(null)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · 2a — la tabla compacta
// ─────────────────────────────────────────────────────────────────────────────

describe("2a · la tabla por empresa", () => {
  it("🔴 el monto va ENTERO, nunca redondeado a «K»", () => {
    expect(montoDeLaTabla(1_405_118.14)).toBe("$1,405,118");
    expect(montoDeLaTabla(30_637.96)).toBe("$30,638");
    expect(montoDeLaTabla(-1_026.14)).toBe("−$1,026");
    expect(montoDeLaTabla(null)).toBe("—");
  });

  it("la flecha sale con movimiento de verdad; dentro de ±5 % va gris", () => {
    expect(porcentajeDeLaTabla(0.17)).toEqual({ texto: "▲ +17%", tono: "up" });
    expect(porcentajeDeLaTabla(-0.78)).toEqual({ texto: "▼ −78%", tono: "dn" });
    expect(porcentajeDeLaTabla(0.04)).toEqual({ texto: "+4%", tono: "fl" });
    expect(porcentajeDeLaTabla(-0.004)).toEqual({ texto: "+0%", tono: "fl" });
    expect(porcentajeDeLaTabla(null).texto).toBe("n/a");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · 3f — la fila del cliente
// ─────────────────────────────────────────────────────────────────────────────

describe("3f · hace cuánto compró, en palabras", () => {
  const HOY = "2026-09-25";

  it("🔴 sale de la ÚLTIMA COMPRA real, y «hoy» llega por parámetro", () => {
    // Los seis clientes medidos el 25-sep-2026.
    expect(ultimaCompraEnPalabras("2026-09-24", HOY)).toEqual({ texto: "compró ayer", avisa: false });
    expect(ultimaCompraEnPalabras("2026-09-25", HOY)).toEqual({ texto: "compró hoy", avisa: false });
    expect(ultimaCompraEnPalabras("2026-09-17", HOY)).toEqual({ texto: "compró hace 8 días", avisa: false });
    // La Frontera Duty Free: 25-jun.
    expect(ultimaCompraEnPalabras("2026-06-25", HOY)).toEqual({ texto: "3 meses sin comprar", avisa: true });
    // Y acá nadie mira el reloj: el módulo no importa `fecha-panama`.
    expect(leer("src/lib/ventas/celular.ts")).not.toContain("hoyPanama");
  });

  it("una fecha vacía o rara no dibuja nada — nunca «hace 0 días»", () => {
    expect(ultimaCompraEnPalabras(null, HOY)).toBeNull();
    expect(ultimaCompraEnPalabras("", HOY)).toBeNull();
    expect(ultimaCompraEnPalabras("mañana", HOY)).toBeNull();
    // Una fecha del futuro tampoco.
    expect(ultimaCompraEnPalabras("2026-09-26", HOY)).toBeNull();
    expect(diasEntre("2026-09-24", HOY)).toBe(1);
  });

  it("a partir de dos meses la línea avisa en ámbar", () => {
    expect(MESES_SIN_COMPRAR_AVISA).toBe(2);
    expect(ultimaCompraEnPalabras("2026-08-20", HOY)?.avisa).toBe(false); // 1 mes
    expect(ultimaCompraEnPalabras("2026-07-20", HOY)?.avisa).toBe(true);  // 2 meses
  });

  it("🔴 «Nuevo», NO «+0 %», sin año pasado con qué comparar", () => {
    expect(porcentajeDelCliente(null)).toEqual({ texto: "Nuevo", tono: "nv" });
    expect(porcentajeDelCliente(0.28)).toEqual({ texto: "▲ +28 %", tono: "up" });
    expect(porcentajeDelCliente(-0.42)).toEqual({ texto: "▼ −42 %", tono: "dn" });
  });

  it("la línea gris no deja un « · » suelto cuando falta una parte", () => {
    expect(lineaGrisDelCliente("D-25", 6, { texto: "compró ayer", avisa: false }))
      .toBe("D-25 · 6 empresas · compró ayer");
    expect(lineaGrisDelCliente("D-25", 1, null)).toBe("D-25 · 1 empresa");
    expect(lineaGrisDelCliente(null, 0, null)).toBe("");
  });

  it("🔴 en el celular la lista abre por PLATA DEL AÑO", () => {
    const fuente = leer("src/components/ventas/ClientesView.tsx");
    expect(fuente).toContain('isClosedYear || esPantallaDeCelularVentas() ? "ytd" : "ultima"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5 · 3g — el mes a mes, con el mes negativo hacia abajo
// ─────────────────────────────────────────────────────────────────────────────

describe("3g · el mes a mes del cliente", () => {
  // Fashion Wear en City Mall Paso Canoa (D-25), medido el 25-sep-2026.
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep"];
  const ACTUAL = [-1026.14, 69095.40, 50019.94, 93618.77, 170235.74, 48778.46, 53210.06, 66156.68, 93461.63];
  const PREVIO = [43525.00, 45834.01, 30008.84, 64700.88, 108716.48, 49133.00, 57686.23, 27351.00, 75135.77];

  it("🔴 enero salió NEGATIVO y se dibuja HACIA ABAJO, no en cero", () => {
    const barras = barrasDelMesAMes(MESES, ACTUAL, PREVIO);
    expect(barras[0].monto).toBeCloseTo(-1026.14, 2);
    expect(barras[0].haciaAbajo).toBe(true);
    expect(barras[0].alto).toBeGreaterThan(0);
    // Y su porcentaje es el medido.
    expect(barras[0].cambio).toBe("−102 %");
    // Los demás no van hacia abajo.
    expect(barras.slice(1).every((b) => !b.haciaAbajo)).toBe(true);
  });

  it("el mes más grande llega al 100 % y el resto en su proporción", () => {
    const barras = barrasDelMesAMes(MESES, ACTUAL, PREVIO);
    const mayo = barras[4];
    expect(mayo.alto).toBe(100);
    expect(barras.every((b) => b.alto >= 0 && b.alto <= 100)).toBe(true);
  });

  it("los porcentajes son los medidos, mes contra el MISMO mes del año pasado", () => {
    const barras = barrasDelMesAMes(MESES, ACTUAL, PREVIO);
    expect(barras.map((b) => b.cambio)).toEqual([
      "−102 %", "+51 %", "+67 %", "+45 %", "+57 %", "−1 %", "−8 %", "+142 %", "+24 %",
    ]);
  });

  it("con todo en cero no se divide entre cero ni se dibuja una barra", () => {
    const barras = barrasDelMesAMes(["ene"], [0], [0]);
    expect(barras[0].alto).toBe(0);
    expect(barras[0].cambio).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6 · 4d — las cinco columnas de Productos
// ─────────────────────────────────────────────────────────────────────────────

describe("4d · Productos", () => {
  it("🔴 son CINCO columnas, en su orden", () => {
    expect(COLUMNAS_PRODUCTOS.map((c) => c.rotulo)).toEqual([
      "Descripción", "Precio prom.", "Margen", "Cantidad", "Total",
    ]);
  });

  it("🔴 la tabla de la computadora dibuja esas cinco y ninguna más", () => {
    const fuente = leer("src/components/ventas/ProductosView.tsx");
    // Ni «Códigos» como columna ni la de cambio.
    expect(fuente).not.toContain('<th className="hidden px-1.5 py-2.5 text-right font-normal sm:table-cell lg:px-3">Códigos</th>');
    expect(fuente).not.toContain('data-col="delta"');
    expect(fuente).not.toContain("{deltaLabel}");
    for (const th of ['label="Precio prom."', 'label="Margen"', 'label="Cantidad"', 'label="Total"']) {
      expect(fuente).toContain(th);
    }
  });

  it("🔴 «Cantidad» y «Total» son las MISMAS piezas y la MISMA venta", () => {
    const fuente = leer("src/components/ventas/ProductosView.tsx");
    // El criterio de orden sigue siendo `cantidad` y `venta`: solo cambió el rótulo.
    expect(fuente).toContain('{ key: "cantidad", label: "Cantidad" }');
    expect(fuente).toContain('{ key: "venta", label: "Total" }');
  });

  it("la segunda línea de la tarjeta dice los otros tres números", () => {
    expect(subtituloDelProducto(10012, 20, 0.32)).toBe("10,012 u · $20.00 prom. · margen 32 %");
    // Sin margen (con un cliente puesto) no se inventa uno.
    expect(subtituloDelProducto(10012, 20, null)).toBe("10,012 u · $20.00 prom.");
    expect(subtituloDelProducto(3, null, null)).toBe("3 u");
  });

  it("🔴 «Dejó de venderse» vive DEBAJO de la lista, no encima", () => {
    const fuente = leer("src/components/ventas/ProductosView.tsx");
    const lista = fuente.indexOf('data-vista="tarjetas"');
    const dejados = fuente.indexOf("<DejoDeVenderse filas={dejadosDeVender}");
    expect(lista).toBeGreaterThan(-1);
    expect(dejados).toBeGreaterThan(lista);
  });

  it("🔴 los cuatro chips van en UNA fila: sin el rótulo «Ordenar por»", () => {
    expect(leer("src/components/ventas/ProductosView.tsx")).toContain("sinRotulo");
    expect(leer("src/components/ventas/ChipOrden.tsx")).toContain("sinRotulo?: boolean");
  });

  it("3c · la última empresa elegida se recuerda, y la dirección le gana", () => {
    const fuente = leer("src/components/ventas/ProductosView.tsx");
    expect(fuente).toContain("MEMORIA_EMPRESA_PRODUCTOS");
    expect(fuente).toContain("setEmpresaMemoria(key)");
    expect(fuente).toContain("if (semillaPuesta.current) return;");
  });

  it("🔴 el párrafo de notas de débito pasó a un ⓘ, con el MISMO texto", () => {
    const fuente = leer("src/components/ventas/ProductosView.tsx");
    expect(fuente).toContain("data-cuadre-info");
    // El texto lo sigue escribiendo la MISMA función, y el gancho de medición
    // del verificador sigue existiendo.
    expect(fuente).toContain("textoCuadreProductos(data.cuadre)");
    expect(fuente).toContain("data-cuadre-productos");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7 · 5b — el botón flotante ya no tapa el total
// ─────────────────────────────────────────────────────────────────────────────

describe("5b · el botón flotante y los montos", () => {
  const ANCHO = 390; // el iPhone medido

  it("🔴 el botón ocupa x 338–382 y los montos terminan en x 337", () => {
    const izquierda = ANCHO - MARGEN_FLOTANTE - DIAMETRO_FLOTANTE;
    const derecha = ANCHO - MARGEN_FLOTANTE;
    expect(izquierda).toBe(338);
    expect(derecha).toBe(382);
    // 🩸 Antes eran 56 px a 16 del borde: x 318–374, o sea 19 px de todo monto
    // y la flechita de abrir la fila entera (x 345).
    expect(izquierda).toBeGreaterThan(337);
  });

  it("🔴 y el total del Resumen lleva el colchón de esa MISMA medida", () => {
    expect(COLCHON_LATERAL_FLOTANTE).toBe(DIAMETRO_FLOTANTE + MARGEN_FLOTANTE + 4);
    const piezas = leer("src/components/celular/Piezas.tsx");
    expect(piezas).toContain("COLCHON_LATERAL_FLOTANTE");
    // El pie del Resumen —la última línea de la pantalla— lo usa.
    expect(leer("src/components/ventas/celular/ResumenCelular.tsx"))
      .toContain("style={ESTILO_COLCHON_DERECHA}");
  });

  it("el botón nunca baja del piso de lo tocable de la casa", () => {
    expect(DIAMETRO_FLOTANTE).toBeGreaterThanOrEqual(44);
  });
});
