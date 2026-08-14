// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — ranking de productos de Multifashion (Por categoría / Por artículo).
//
// Este archivo se pone rojo si:
//   (a) las notas de crédito dejan de RESTAR (el error caro de este repo: la
//       tabla guarda MAGNITUDES y la NC llega POSITIVA, así que sumar a ciegas
//       INFLA la venta — y la diferencia da exactamente el DOBLE de las NC);
//   (b) el margen se promedia en vez de calcularse sobre el agregado;
//   (c) un margen desconocido deja de ser "—" y pasa a valer 0%;
//   (d) el orden con el que abre la pantalla deja de ser UNIDADES descendente;
//   (e) dos descripciones que el navegador dibuja IGUAL vuelven a ser dos filas;
//   (f) la ventana de 12 meses se calcula en UTC pelado en vez de UTC-5.
//
// Verificado por MUTACIÓN (ver el final del archivo para las cuentas exactas).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  agregarRanking,
  ordenarRanking,
  filtrarRanking,
  signoDeTipo,
  margenDe,
  normalizar,
  textoAgrupable,
  rango12Meses,
  ORDEN_DEFAULT,
  SIN_DATO,
  SIN_CODIGO,
  type FilaArticuloDiario,
  type RenglonRanking,
} from "@/lib/multifashion/productos-ranking";

/** Constructor de filas: solo se nombra lo que el caso está probando. */
function fila(p: Partial<FilaArticuloDiario> & { codigo?: string; descripcion?: string }): FilaArticuloDiario {
  return {
    articulo_id: p.articulo_id ?? 1,
    codigo: p.codigo ?? "A1",
    descripcion: p.descripcion ?? "Women-Bags",
    tipo: p.tipo ?? "FA",
    cantidad_total: p.cantidad_total ?? 0,
    venta_total: p.venta_total ?? 0,
    costo_total: p.costo_total ?? 0,
  };
}

describe("signo contable — las NC restan", () => {
  it("FA suma, NC resta", () => {
    expect(signoDeTipo("FA")).toBe(1);
    expect(signoDeTipo("NC")).toBe(-1);
  });

  it("el tipo se normaliza: ' nc ' también resta", () => {
    // Un espacio de más en la fuente convertiría una devolución en una venta.
    expect(signoDeTipo(" nc ")).toBe(-1);
    expect(signoDeTipo("Nc")).toBe(-1);
  });

  it("un tipo desconocido o nulo SUMA (no se pierde plata por no reconocerlo)", () => {
    expect(signoDeTipo(null)).toBe(1);
    expect(signoDeTipo("XX")).toBe(1);
  });

  it("🩸 la NC llega POSITIVA y aun así baja la venta, las unidades y el costo", () => {
    const r = agregarRanking(
      [
        fila({ tipo: "FA", cantidad_total: 10, venta_total: 1000, costo_total: 600 }),
        // Magnitud positiva — así la manda Switch.
        fila({ tipo: "NC", cantidad_total: 2, venta_total: 200, costo_total: 120 }),
      ],
      "categoria",
    );
    expect(r.totales.unidades).toBe(8);
    expect(r.totales.venta).toBe(800);
    expect(r.totales.costo).toBe(480);
    expect(r.totales.utilidad).toBe(320);
  });

  it("🩸 LA FIRMA DEL BUG: sumar a ciegas da exactamente el DOBLE de las NC de más", () => {
    const filas = [
      fila({ tipo: "FA", cantidad_total: 10, venta_total: 1000, costo_total: 600 }),
      fila({ tipo: "NC", cantidad_total: 2, venta_total: 200, costo_total: 120 }),
    ];
    const correcto = agregarRanking(filas, "categoria").totales.venta;
    const ciego = filas.reduce((s, f) => s + Number(f.venta_total), 0);
    expect(ciego - correcto).toBe(2 * 200);
  });

  it("un grupo que se vendió y se devolvió entero NO aparece (es un no-evento)", () => {
    const r = agregarRanking(
      [
        fila({ codigo: "A1", tipo: "FA", cantidad_total: 3, venta_total: 300, costo_total: 100 }),
        fila({ codigo: "A1", tipo: "NC", cantidad_total: 3, venta_total: 300, costo_total: 100 }),
      ],
      "codigo",
    );
    expect(r.filas).toHaveLength(0);
    expect(r.totales.grupos).toBe(0);
  });

  it("un grupo con devolución NETA sí aparece — es información real", () => {
    const r = agregarRanking(
      [
        fila({ codigo: "A1", tipo: "FA", cantidad_total: 1, venta_total: 100, costo_total: 60 }),
        fila({ codigo: "A1", tipo: "NC", cantidad_total: 3, venta_total: 300, costo_total: 180 }),
      ],
      "codigo",
    );
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].venta).toBe(-200);
    expect(r.filas[0].margen).toBeNull();
  });
});

describe("margen", () => {
  it("se calcula sobre el AGREGADO, no se promedia", () => {
    // Un artículo chico con margen altísimo y uno grande con margen bajo: el
    // promedio simple daría ~52,5%; el agregado da 11,8%.
    const r = agregarRanking(
      [
        fila({ codigo: "chico", descripcion: "X", cantidad_total: 1, venta_total: 10, costo_total: 1 }),
        fila({ codigo: "grande", descripcion: "X", cantidad_total: 1, venta_total: 1000, costo_total: 890 }),
      ],
      "categoria",
    );
    expect(r.filas).toHaveLength(1);
    const promedioSimple = (0.9 + 0.11) / 2;
    expect(r.filas[0].margen).toBeCloseTo(119 / 1010, 6);
    expect(r.filas[0].margen).not.toBeCloseTo(promedioSimple, 2);
  });

  it("venta 0 o negativa → margen null (un 0% sería mentira)", () => {
    expect(margenDe(0, 0)).toBeNull();
    expect(margenDe(-100, -40)).toBeNull();
    expect(margenDe(100, 40)).toBeCloseTo(0.4, 10);
  });

  it("utilidad = venta − costo, siempre", () => {
    const r = agregarRanking(
      [fila({ cantidad_total: 2, venta_total: 500, costo_total: 310 })],
      "categoria",
    );
    expect(r.filas[0].utilidad).toBe(190);
    expect(r.totales.utilidad).toBe(190);
  });
});

describe("agrupación", () => {
  const filas = [
    fila({ codigo: "A1", descripcion: "Women-Bags", cantidad_total: 5, venta_total: 500, costo_total: 300 }),
    fila({ codigo: "A2", descripcion: "Women-Bags", cantidad_total: 3, venta_total: 900, costo_total: 500 }),
    fila({ codigo: "B1", descripcion: "Men-Polos S/S", cantidad_total: 9, venta_total: 300, costo_total: 100 }),
  ];

  it("por categoría junta los códigos bajo la misma descripción", () => {
    const r = agregarRanking(filas, "categoria");
    expect(r.filas.map(f => f.etiqueta)).toEqual(["Men-Polos S/S", "Women-Bags"]);
    const bags = r.filas.find(f => f.etiqueta === "Women-Bags")!;
    expect(bags.unidades).toBe(8);
    expect(bags.venta).toBe(1400);
    expect(bags.articulos).toBe(2);
  });

  it("por artículo agrupa por CÓDIGO y arrastra su descripción", () => {
    const r = agregarRanking(filas, "codigo");
    expect(r.filas.map(f => f.etiqueta)).toEqual(["B1", "A1", "A2"]);
    expect(r.filas.find(f => f.etiqueta === "A2")!.detalle).toBe("Women-Bags");
  });

  it("🩸 dos descripciones que el navegador dibuja IGUAL son UNA sola fila", () => {
    // Switch manda "Men-T-Shirts S/S" y "Men-T-Shirts  S/S" (doble espacio). El
    // HTML colapsa los espacios: sin esto, Daniel ve dos filas idénticas.
    const r = agregarRanking(
      [
        fila({ codigo: "A", descripcion: "Men-T-Shirts S/S", cantidad_total: 2, venta_total: 100, costo_total: 50 }),
        fila({ codigo: "B", descripcion: "Men-T-Shirts  S/S", cantidad_total: 3, venta_total: 200, costo_total: 90 }),
      ],
      "categoria",
    );
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].etiqueta).toBe("Men-T-Shirts S/S");
    expect(r.filas[0].unidades).toBe(5);
  });

  it("pero NO junta categorías que solo se PARECEN — eso sería inventar datos", () => {
    const r = agregarRanking(
      [
        fila({ codigo: "A", descripcion: "Men-T-Shirts S/S", cantidad_total: 1, venta_total: 10 }),
        fila({ codigo: "B", descripcion: "Men-T-Shirts S/S Core", cantidad_total: 1, venta_total: 10 }),
        fila({ codigo: "C", descripcion: "MEN-T-SHIRTS S/S", cantidad_total: 1, venta_total: 10 }),
      ],
      "categoria",
    );
    expect(r.filas).toHaveLength(3);
  });

  it("las descripciones que no son 'Género-Categoría' se muestran tal cual", () => {
    const r = agregarRanking(
      [
        fila({ codigo: "A", descripcion: "CAMISETAS P/H U4001 3PZ", cantidad_total: 1, venta_total: 10 }),
        fila({ codigo: "B", descripcion: "REEBOK BB 1000", cantidad_total: 1, venta_total: 10 }),
      ],
      "categoria",
    );
    expect(r.filas.map(f => f.etiqueta).sort()).toEqual(["CAMISETAS P/H U4001 3PZ", "REEBOK BB 1000"]);
  });

  it("sin descripción / sin código se rotula, no se descarta", () => {
    const c = agregarRanking([fila({ descripcion: "", cantidad_total: 1, venta_total: 10 })], "categoria");
    expect(c.filas[0].etiqueta).toBe(SIN_DATO);
    const k = agregarRanking([fila({ codigo: "", cantidad_total: 1, venta_total: 10 })], "codigo");
    expect(k.filas[0].etiqueta).toBe(SIN_CODIGO);
  });

  it("los montos que PostgREST manda como string se leen igual", () => {
    const r = agregarRanking(
      [fila({ cantidad_total: "2.5000", venta_total: "1234.56", costo_total: "1000.00" })],
      "categoria",
    );
    expect(r.filas[0].unidades).toBe(2.5);
    expect(r.filas[0].venta).toBe(1234.56);
    expect(r.filas[0].utilidad).toBe(234.56);
  });

  it("textoAgrupable recorta las puntas y colapsa el medio", () => {
    expect(textoAgrupable("  Men-T-Shirts   S/S  ")).toBe("Men-T-Shirts S/S");
    expect(textoAgrupable(null)).toBe("");
  });
});

describe("orden", () => {
  const filas: RenglonRanking[] = [
    { clave: "a", etiqueta: "A", detalle: "", unidades: 10, venta: 100, costo: 50, utilidad: 50, margen: 0.5, articulos: 1 },
    { clave: "b", etiqueta: "B", detalle: "", unidades: 30, venta: 90, costo: 80, utilidad: 10, margen: 0.111, articulos: 1 },
    { clave: "c", etiqueta: "C", detalle: "", unidades: 20, venta: 500, costo: 100, utilidad: 400, margen: 0.8, articulos: 1 },
    { clave: "d", etiqueta: "D", detalle: "", unidades: 5, venta: -10, costo: -2, utilidad: -8, margen: null, articulos: 1 },
  ];

  it("el DEFAULT es unidades de mayor a menor — decisión de Daniel", () => {
    expect(ORDEN_DEFAULT).toEqual({ col: "unidades", dir: "desc" });
    const r = agregarRanking(
      [
        fila({ codigo: "pocas-caro", descripcion: "X", cantidad_total: 1, venta_total: 9999 }),
        fila({ codigo: "muchas-barato", descripcion: "Y", cantidad_total: 50, venta_total: 10 }),
      ],
      "codigo",
    );
    // Si el default fuera por monto, "pocas-caro" iría primero.
    expect(r.filas[0].etiqueta).toBe("muchas-barato");
  });

  it("cada columna de plata se puede ordenar en los dos sentidos", () => {
    expect(ordenarRanking(filas, "venta", "desc").map(f => f.etiqueta)).toEqual(["C", "A", "B", "D"]);
    expect(ordenarRanking(filas, "venta", "asc").map(f => f.etiqueta)).toEqual(["D", "B", "A", "C"]);
    expect(ordenarRanking(filas, "utilidad", "desc")[0].etiqueta).toBe("C");
    expect(ordenarRanking(filas, "costo", "asc")[0].etiqueta).toBe("D");
    expect(ordenarRanking(filas, "unidades", "asc").map(f => f.etiqueta)).toEqual(["D", "A", "C", "B"]);
  });

  it("los márgenes desconocidos van SIEMPRE al final, suba o baje", () => {
    expect(ordenarRanking(filas, "margen", "desc").at(-1)!.etiqueta).toBe("D");
    expect(ordenarRanking(filas, "margen", "asc").at(-1)!.etiqueta).toBe("D");
  });

  it("empate = desempate estable por etiqueta (la fila no se mueve sola)", () => {
    const empatadas: RenglonRanking[] = [
      { ...filas[0], clave: "z", etiqueta: "Z", unidades: 7 },
      { ...filas[0], clave: "m", etiqueta: "M", unidades: 7 },
    ];
    expect(ordenarRanking(empatadas, "unidades", "desc").map(f => f.etiqueta)).toEqual(["M", "Z"]);
    expect(ordenarRanking(empatadas, "unidades", "asc").map(f => f.etiqueta)).toEqual(["M", "Z"]);
  });

  it("ordenar NO muta la entrada", () => {
    const antes = filas.map(f => f.etiqueta);
    ordenarRanking(filas, "venta", "asc");
    expect(filas.map(f => f.etiqueta)).toEqual(antes);
  });
});

describe("búsqueda y filtro", () => {
  const filas: RenglonRanking[] = [
    { clave: "102201", etiqueta: "102201", detalle: "Men-Polos S/S", unidades: 5, venta: 10, costo: 5, utilidad: 5, margen: 0.5, articulos: 1 },
    { clave: "ZAMIR", etiqueta: "ZAMIR", detalle: "Women-Flip Flops", unidades: 5, venta: 10, costo: 5, utilidad: 5, margen: 0.5, articulos: 1 },
    { clave: "SAND1", etiqueta: "SAND1", detalle: "Sandalias Niño", unidades: 5, venta: 10, costo: 5, utilidad: 5, margen: 0.5, articulos: 1 },
  ];

  it("busca por código y por descripción", () => {
    expect(filtrarRanking(filas, { texto: "1022" }).map(f => f.clave)).toEqual(["102201"]);
    expect(filtrarRanking(filas, { texto: "flip" }).map(f => f.clave)).toEqual(["ZAMIR"]);
  });

  it("sin acentos y sin mayúsculas — 'sandalia' encuentra 'Sandalias Niño'", () => {
    expect(filtrarRanking(filas, { texto: "SANDALIA" }).map(f => f.clave)).toEqual(["SAND1"]);
    expect(filtrarRanking(filas, { texto: "nino" }).map(f => f.clave)).toEqual(["SAND1"]);
    expect(normalizar("  Niño  ")).toBe("nino");
  });

  it("el filtro por categoría es exacto (baja de la categoría al artículo)", () => {
    expect(filtrarRanking(filas, { categoria: "Men-Polos S/S" }).map(f => f.clave)).toEqual(["102201"]);
    expect(filtrarRanking(filas, { categoria: "Men-Polos" })).toHaveLength(0);
  });

  it("los dos filtros se combinan", () => {
    expect(filtrarRanking(filas, { texto: "z", categoria: "Women-Flip Flops" }).map(f => f.clave)).toEqual(["ZAMIR"]);
    expect(filtrarRanking(filas, { texto: "z", categoria: "Men-Polos S/S" })).toHaveLength(0);
  });

  it("un filtro vacío NO filtra (no devuelve la lista vacía)", () => {
    expect(filtrarRanking(filas, {})).toHaveLength(3);
    expect(filtrarRanking(filas, { texto: "   " })).toHaveLength(3);
  });

  it("filtrar NO muta la entrada", () => {
    const antes = filas.length;
    filtrarRanking(filas, { texto: "z" });
    expect(filas).toHaveLength(antes);
  });
});

describe("ventana de 12 meses", () => {
  it("son 12 meses de calendario, el último es el mes en curso", () => {
    // 7-ago-2026 13:00 en Panamá.
    expect(rango12Meses(new Date("2026-08-07T18:00:00.000Z"))).toEqual({
      desde: "2025-09-01",
      hasta: "2026-08-07",
    });
  });

  it("🩸 el borde de mes va en hora PANAMÁ (UTC-5), no en UTC pelado", () => {
    // 1-ago-2026 02:00 UTC = 31-jul-2026 21:00 en Panamá: todavía es julio, así
    // que la ventana termina el 31 de julio y arranca en agosto de 2025.
    expect(rango12Meses(new Date("2026-08-01T02:00:00.000Z"))).toEqual({
      desde: "2025-08-01",
      hasta: "2026-07-31",
    });
  });

  it("cruza el año sin romperse", () => {
    expect(rango12Meses(new Date("2026-01-15T18:00:00.000Z"))).toEqual({
      desde: "2025-02-01",
      hasta: "2026-01-15",
    });
  });
});

// ── VERIFICADO POR MUTACIÓN (7-ago-2026), rompiendo el código a propósito ───
// En este archivo:
//   · `signoDeTipo` devolviendo siempre 1 (la NC deja de restar) ....... 6 rojos
//   · `margenDe` devolviendo 0 en vez de null con venta ≤ 0 ............ 2 rojos
//   · orden default cambiado a venta/desc ............................. 3 rojos
//   · `textoAgrupable` sin colapsar espacios .......................... 2 rojos
//   · `rango12Meses` con el offset de Panamá en 0 (UTC pelado) ........ 1 rojo
//   · los márgenes null puestos primero en vez de al final ............ 1 rojo
// En los candados vecinos, sobre la MISMA ruta:
//   (el clamp de la ventana de `gerente_acs` se retiró el 13-ago-2026 — ver
//    multifashion-acceso.test.ts)
//   · cambiar el `.range()` paginado por un `.limit(5000)` ............ 1 rojo
//   · paginar sin `.order()` estable .................................. 1 rojo
//     (los dos en supabase-paginado.test.ts)
