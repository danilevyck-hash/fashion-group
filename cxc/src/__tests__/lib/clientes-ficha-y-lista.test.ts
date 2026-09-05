// ─────────────────────────────────────────────────────────────────────────────
// LA FICHA DEL CLIENTE Y LA LISTA — las reglas puras (5-sep-2026).
//
// 🔴 UNA SOLA PÁGINA DEL CLIENTE, TRES LISTAS DISTINTAS. Cuentas por Cobrar y
// Ventas › Clientes no se tocaron: cada lista es un trabajo distinto (cobrar ·
// analizar la venta · arreglar los datos). Lo que se unificó es la página a la
// que se llega al tocar el nombre — la única superficie sobre un cliente que
// pueden abrir TODOS los roles.
//
// Todo lo que este archivo prueba es PURO: sin base, sin React, con fechas
// fijas (Panamá es UTC−5 fijo).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  diasDesde,
  haceCuanto,
  dinero,
  dineroConSigno,
  porcentajeEntero,
  estadoDeCompras,
  tarjetaComproDelAnio,
  tarjetaDebe,
  tarjetaDeFecha,
  totalDeEmpresas,
  tieneAlgo,
  variacionVsAnterior,
  veElModulo,
  ROLES_CXC_EN_LA_FICHA,
  ROLES_VENTAS_EN_LA_FICHA,
  SIN_PAGOS_NUNCA,
  SIN_COMPRAS_NUNCA,
} from "@/lib/clientes/ficha";
import {
  contarChips,
  filtrarPorChip,
  comoContactarlo,
  ordenar,
  ordenAlTocar,
  flechaOrden,
  ORDEN_INICIAL,
  sinLosQueYaNoEstan,
  tieneSaldo,
  contarClientes,
  type ClienteDeLista,
} from "@/lib/clientes/lista";
import { unAnioAntes } from "@/lib/ventas/clientes-corte-comparativo";
import { EMPRESA_KEY_TO_NAME, EMPRESA_KEY_TO_NOMBRE_CORTO, nombreCortoEmpresa } from "@/lib/empresa-mapping";

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 UN CERO GRANDE SE LEE COMO DATO ROTO", () => {
  it("sin comprar, la tarjeta dice palabras — nunca $0.00 en letra grande", () => {
    const t = tarjetaComproDelAnio(0, 0, null, 2026);
    expect(t.monto).toBeNull();
    expect(t.frase).toBe("Sin comprar en 2026");
  });

  it("sin deber, la tarjeta dice «No debe nada»", () => {
    const t = tarjetaDebe(0, 500_000);
    expect(t.monto).toBeNull();
    expect(t.frase).toBe("No debe nada");
    expect(t.proporcion).toBeNull();
  });

  it("sin pagos, «Nunca ha pagado»; sin compras, «Sin compras registradas»", () => {
    expect(tarjetaDeFecha(null, "2026-09-05", "", SIN_PAGOS_NUNCA, null).frase).toBe("Nunca ha pagado");
    expect(tarjetaDeFecha(null, "2026-09-05", "", SIN_COMPRAS_NUNCA).frase).toBe("Sin compras registradas");
  });

  it("con dato, el número grande sí sale", () => {
    const t = tarjetaComproDelAnio(1_234.5, 1_234.5, null, 2026);
    expect(t.monto).toBe(1_234.5);
    expect(t.frase).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🩸 «SIN COMPRAR» NO ES SIEMPRE «NUNCA COMPRÓ»", () => {
  // Medido contra producción el 5-sep-2026: Outlet Duty Free (D-119) facturó
  // $21.826,00 en 4 facturas de agosto (8.034 + 4.500 + 7.590 + 1.702) y el
  // 1-sep le entraron CUATRO notas de crédito por los mismos montos, una por
  // factura. Neto: $0,00 exactos. Rey Store (D-135) igual: $140,00 en abril,
  // $140,00 acreditados en junio.
  //
  // Las notas de crédito RESTAN —es el invariante de Ventas— así que el cero es
  // CORRECTO. Lo que estaba mal era decir «Sin comprar» de un cliente al que se
  // le facturaron $21.826 y se le acreditaron $21.826.
  it("neto cero con bruto positivo = «se le acreditó todo», no «nunca compró»", () => {
    expect(estadoDeCompras(0, 21_826)).toBe("devuelto");
    expect(estadoDeCompras(0, 0)).toBe("nunca");
    expect(estadoDeCompras(21_826, 21_826)).toBe("compro");
  });

  it("la tarjeta de D-119 dice cuánto compró y que se le acreditó", () => {
    const t = tarjetaComproDelAnio(0, 21_826, null, 2026);
    expect(t.monto).toBeNull();
    expect(t.frase).toBe("Compró $21,826.00 y se le acreditó todo");
  });

  it("la tarjeta de D-135, con sus $140,00", () => {
    expect(tarjetaComproDelAnio(0, 140, null, 2026).frase).toBe("Compró $140.00 y se le acreditó todo");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 «DEBE» TRAE QUÉ PORCENTAJE ES DE LO QUE TE COMPRÓ", () => {
  // Ese número no existía en ninguna pantalla: el CXC dice cuánto debe y Ventas
  // cuánto compró, y nadie los divide. Deber $100.000 al que te compró un millón
  // y al que te compró $150.000 no es lo mismo.
  it("lo dice en palabras y sin decimal (diccionario § 0, #5)", () => {
    expect(tarjetaDebe(380, 1000).proporcion).toBe("el 38% de lo que te compró");
  });

  it("sin compras del año NO se divide entre cero: la proporción no sale", () => {
    const t = tarjetaDebe(1000, 0);
    expect(t.monto).toBe(1000);
    expect(t.proporcion).toBeNull();
  });

  it("un saldo A FAVOR no es deuda: se dice así y sin proporción", () => {
    const t = tarjetaDebe(-250, 1000);
    expect(t.monto).toBeNull();
    expect(t.frase).toBe("Saldo a favor $250.00");
    expect(t.proporcion).toBeNull();
  });

  it("una fracción chiquita no se muestra como «0%» — la deuda existe", () => {
    expect(porcentajeEntero(0.001)).toBe("menos de 1%");
    expect(porcentajeEntero(0)).toBe("0%");
    expect(porcentajeEntero(0.125)).toBe("13%");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("«hace N días» — y nunca un número negativo de días", () => {
  it("hoy, ayer y hace 16 días", () => {
    expect(haceCuanto("2026-09-05", "2026-09-05")).toBe("hoy");
    expect(haceCuanto("2026-09-04", "2026-09-05")).toBe("ayer");
    expect(haceCuanto("2026-08-20", "2026-09-05")).toBe("hace 16 días");
  });

  it("una fecha FUTURA dice «hoy», no «hace −3 días»", () => {
    // Existen facturas con fecha adelantada; un negativo en pantalla es un bug
    // visible.
    expect(haceCuanto("2026-09-08", "2026-09-05")).toBe("hoy");
  });

  it("cruza meses y años sin depender de la hora", () => {
    expect(diasDesde("2025-12-31", "2026-01-01")).toBe(1);
    expect(diasDesde("2026-02-28", "2026-03-01")).toBe(1);
  });

  it("la tarjeta de último pago lleva el monto y la fecha debajo", () => {
    const t = tarjetaDeFecha("2026-08-20", "2026-09-05", "20 ago 2026", SIN_PAGOS_NUNCA, 234_189.21);
    expect(t.cuando).toBe("hace 16 días");
    expect(t.detalle).toBe("$234,189.21 · 20 ago 2026");
  });

  it("la de última compra va sin monto", () => {
    const t = tarjetaDeFecha("2026-08-27", "2026-09-05", "27 ago 2026", SIN_COMPRAS_NUNCA);
    expect(t.cuando).toBe("hace 9 días");
    expect(t.detalle).toBe("27 ago 2026");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EL DICCIONARIO DECIDIDO EL 5-sep-2026", () => {
  it("#6 · la plata negativa va «−$100.00», con el menos tipográfico", () => {
    expect(dinero(-100)).toBe("−$100.00");
    expect(dinero(-100).startsWith("−")).toBe(true);
    // El guion del teclado NO: es otro carácter y se ve más corto.
    expect(dinero(-100).includes("-")).toBe(false);
    expect(dinero(-100).startsWith("$-")).toBe(false);
  });

  it("#7 · siempre con centavos, nunca redondeado", () => {
    expect(dinero(1234)).toBe("$1,234.00");
    expect(dinero(198_749.31)).toBe("$198,749.31");
  });

  it("una variación SIEMPRE lleva su signo, también el «+»", () => {
    expect(dineroConSigno(198_749.31)).toBe("+$198,749.31");
    expect(dineroConSigno(-12_000)).toBe("−$12,000.00");
  });

  it("#4 · el nombre corto de la empresa vive en la MISMA lista que el largo", () => {
    // Tres mapas de nombres para las mismas 8 empresas fue lo que el diccionario
    // encontró. Un cuarto habría sido el mismo problema.
    expect(Object.keys(EMPRESA_KEY_TO_NOMBRE_CORTO).sort()).toEqual(Object.keys(EMPRESA_KEY_TO_NAME).sort());
    expect(nombreCortoEmpresa("vistana")).toBe("Vistana");
    expect(nombreCortoEmpresa("confecciones_boston")).toBe("Boston");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("«Empresa por empresa»", () => {
  const FILAS = [
    { empresa: "vistana", compras: 1000.55, comprasAnterior: 900, debe: 200 },
    { empresa: "fashion_wear", compras: 500.45, comprasAnterior: null, debe: -50 },
    { empresa: "joystep", compras: 0, comprasAnterior: null, debe: 0 },
  ];

  it("el total es la SUMA DE LO QUE SE VE, al centavo", () => {
    const t = totalDeEmpresas(FILAS);
    expect(t.compras).toBe(1501.0);
    expect(t.debe).toBe(150);
  });

  it("sin ninguna empresa con año anterior, el total es null — no cero", () => {
    expect(totalDeEmpresas([FILAS[1], FILAS[2]]).comprasAnterior).toBeNull();
    expect(totalDeEmpresas(FILAS).comprasAnterior).toBe(900);
  });

  it("una empresa sin nada no se dibuja; una con solo saldo, sí", () => {
    expect(tieneAlgo(FILAS[2])).toBe(false);
    expect(tieneAlgo({ empresa: "x", compras: 0, comprasAnterior: null, debe: 12 })).toBe(true);
    expect(tieneAlgo({ empresa: "x", compras: 0, comprasAnterior: 5, debe: 0 })).toBe(true);
  });

  it("🔴 sin base el año pasado NO hay porcentaje inventado", () => {
    // Pasar de $0 a $50.000 no es crecer «infinito»: creció $50.000, y eso ya lo
    // dice la columna del año.
    expect(variacionVsAnterior(50_000, null)).toBeNull();
    expect(variacionVsAnterior(50_000, 0)).toBeNull();
  });

  it("la variación va sin decimal y con el menos tipográfico", () => {
    expect(variacionVsAnterior(112, 100)).toBe("+12%");
    expect(variacionVsAnterior(92, 100)).toBe("−8%");
    expect(variacionVsAnterior(92, 100)?.startsWith("−")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EL AÑO PASADO SE CORTA EN LOS MISMOS DÍAS", () => {
  it("la regla no se reimplementa: sale de la definición única del sistema", () => {
    expect(unAnioAntes("2026-09-05")).toBe("2025-09-05");
    // 29-feb → 28-feb, el caso que separa una copia buena de una mala.
    expect(unAnioAntes("2028-02-29")).toBe("2027-02-28");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 LA FICHA LA VEN TODOS, PERO SUS ENLACES NO", () => {
  it("bodega NO ve Cuentas por Cobrar: sus rutas le contestan 403", () => {
    expect(veElModulo("bodega", ROLES_CXC_EN_LA_FICHA, [], "cxc")).toBe(false);
    expect(veElModulo("vendedor", ROLES_CXC_EN_LA_FICHA, [], "cxc")).toBe(true);
    expect(veElModulo("secretaria", ROLES_CXC_EN_LA_FICHA, [], "cxc")).toBe(true);
  });

  it("«Ver en Ventas» es SOLO de admin", () => {
    expect(veElModulo("admin", ROLES_VENTAS_EN_LA_FICHA, [], "ventas")).toBe(true);
    for (const rol of ["secretaria", "vendedor", "bodega", "contabilidad"]) {
      expect(veElModulo(rol, ROLES_VENTAS_EN_LA_FICHA, [], "ventas"), rol).toBe(false);
    }
  });

  it("un módulo dado por `role_permissions` también abre la puerta", () => {
    expect(veElModulo("bodega", ROLES_CXC_EN_LA_FICHA, ["cxc"], "cxc")).toBe(true);
  });

  it("sin rol, nada", () => {
    expect(veElModulo("", ROLES_CXC_EN_LA_FICHA, ["cxc"], "cxc")).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LA LISTA
// ═════════════════════════════════════════════════════════════════════════════

const C = (p: Partial<ClienteDeLista> & { codigo: string }): ClienteDeLista => ({
  nombre: p.codigo, email: null, telefono: null, celular: null, ...p,
});

describe("🔴 LOS CONTEOS DE LOS CHIPS SE CALCULAN, NUNCA SE ESCRIBEN A MANO", () => {
  const LISTA = [
    C({ codigo: "A", email: "a@x.com", telefono: "6000-0000", debe: 100 }),
    C({ codigo: "B", email: "b@x.com" }),                       // sin teléfono
    C({ codigo: "C", telefono: "6000-0001", debe: -5 }),         // sin correo
    C({ codigo: "D" }),                                          // sin nada
    C({ codigo: "E", celular: "  " }),                           // en blanco = sin nada
  ];

  it("cada chip cuenta lo que su propio filtro abre", () => {
    for (const chip of contarChips(LISTA)) {
      expect(filtrarPorChip(LISTA, chip.id).length, chip.id).toBe(chip.cuantos);
    }
  });

  it("los cinco chips, con los números de este ejemplo", () => {
    const m = Object.fromEntries(contarChips(LISTA).map((c) => [c.id, c.cuantos]));
    expect(m).toEqual({ todos: 5, "sin-contacto": 2, "sin-correo": 3, "sin-telefono": 3, deben: 2 });
  });

  it("las etiquetas son las que decidió Daniel", () => {
    expect(contarChips([]).map((c) => c.etiqueta)).toEqual([
      "Todos", "Sin cómo contactarlos", "Sin correo", "Sin teléfono", "Deben",
    ]);
  });

  it("🔴 «Deben» es TENER SALDO, también a favor del cliente", () => {
    // Medido: de los 150, **100 tienen saldo** (94 a favor de la empresa, 6 en
    // contra). El chip lleva a los clientes con plata en juego.
    expect(tieneSaldo(C({ codigo: "X", debe: -5 }))).toBe(true);
    expect(tieneSaldo(C({ codigo: "X", debe: 0 }))).toBe(false);
    expect(tieneSaldo(C({ codigo: "X" }))).toBe(false);
  });

  it("un correo o un teléfono en BLANCO cuenta como que falta", () => {
    expect(comoContactarlo(C({ codigo: "X", email: "   ", telefono: "" })).falta).toBe("Sin correo ni teléfono");
  });
});

describe("🔴 SI FALTA CÓMO CONTACTARLO, SE DICE", () => {
  it("los tres mensajes", () => {
    expect(comoContactarlo(C({ codigo: "X" })).falta).toBe("Sin correo ni teléfono");
    expect(comoContactarlo(C({ codigo: "X", telefono: "6000-0000" })).falta).toBe("Falta el correo");
    expect(comoContactarlo(C({ codigo: "X", email: "a@x.com" })).falta).toBe("Falta el teléfono");
    expect(comoContactarlo(C({ codigo: "X", email: "a@x.com", celular: "6000" })).falta).toBeNull();
  });

  it("el celular sirve de teléfono: uno alcanza para llamar", () => {
    const c = comoContactarlo(C({ codigo: "X", celular: "6727-0766" }));
    expect(c.telefono).toBe("6727-0766");
    expect(c.falta).toBe("Falta el correo");
  });

  it("el teléfono fijo gana sobre el celular cuando están los dos", () => {
    expect(comoContactarlo(C({ codigo: "X", telefono: "727-7247", celular: "6000" })).telefono).toBe("727-7247");
  });
});

describe("🔴 ORDENAR TOCANDO EL ENCABEZADO: DE MAYOR A MENOR PRIMERO", () => {
  it("la plata arranca de mayor a menor; otro toque invierte", () => {
    let o = ORDEN_INICIAL;
    o = ordenAlTocar(o, "compras");
    expect(o).toEqual({ columna: "compras", sentido: "desc" });
    o = ordenAlTocar(o, "compras");
    expect(o).toEqual({ columna: "compras", sentido: "asc" });
    expect(ordenAlTocar(o, "debe")).toEqual({ columna: "debe", sentido: "desc" });
  });

  it("⚠️ «Cliente» es la excepción: los nombres arrancan A→Z", () => {
    expect(ordenAlTocar({ columna: "debe", sentido: "desc" }, "cliente")).toEqual({
      columna: "cliente", sentido: "asc",
    });
    expect(ORDEN_INICIAL).toEqual({ columna: "cliente", sentido: "asc" });
  });

  it("la flecha dice cuál manda", () => {
    const o = { columna: "compras", sentido: "desc" } as const;
    expect(flechaOrden(o, "compras")).toBe("↓");
    expect(flechaOrden({ ...o, sentido: "asc" }, "compras")).toBe("↑");
    expect(flechaOrden(o, "debe")).toBe("↕");
  });

  it("ordena SIN MUTAR y con desempate ESTABLE por código", () => {
    const lista = [
      C({ codigo: "D-9", nombre: "Z", compras: 100 }),
      C({ codigo: "D-1", nombre: "A", compras: 100 }),
    ];
    const copia = [...lista];
    const r = ordenar(lista, { columna: "compras", sentido: "desc" });
    expect(lista).toEqual(copia); // no se mutó el array de entrada
    expect(r.map((c) => c.codigo)).toEqual(["D-1", "D-9"]);
  });

  it("un monto que todavía no llegó cuenta como 0 para ordenar", () => {
    const r = ordenar(
      [C({ codigo: "A" }), C({ codigo: "B", compras: 5 })],
      { columna: "compras", sentido: "desc" },
    );
    expect(r.map((c) => c.codigo)).toEqual(["B", "A"]);
  });
});

describe("🔴 EL QUE YA NO ESTÁ EN SWITCH NO SALE EN LA LISTA", () => {
  // Daniel: «si en switch no esta, aqui no debe de aparecer». Hoy son dos:
  // D-30 (City Moda Chorrera) y D-135 (Rey Store).
  it("se filtran por `ausente_desde`, y los vivos se quedan", () => {
    const r = sinLosQueYaNoEstan([
      { codigo: "D-30", ausente_desde: "2026-08-13T05:41:34Z" },
      { codigo: "D-25", ausente_desde: null },
      { codigo: "D-24" },
    ]);
    expect(r.map((c) => c.codigo)).toEqual(["D-25", "D-24"]);
  });
});

describe("los textos de la lista", () => {
  it("singular y plural del contador", () => {
    expect(contarClientes(1)).toBe("1 cliente");
    expect(contarClientes(150)).toBe("150 clientes");
  });
});
