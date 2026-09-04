/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GUÍAS — los destinos de cada cliente como botones (4-sep-2026).
 *
 * Lo que se congela:
 *   1. Los 9 clientes definidos por Daniel devuelven EXACTAMENTE su tabla —
 *      fuente de verdad, sin mezclar el histórico (que en D-87 dice otra cosa).
 *   2. Para cualquier otro cliente, los destinos salen de su historia, por
 *      frecuencia, con la grafía MÁS USADA (nunca la normalizada), máximo 6.
 *   3. Variantes de escritura se agrupan por regla EXACTA («Paso Canoas» /
 *      «Pasocanoas» / «Paso Canoa» = 1) y una diferencia de NÚMERO nunca se
 *      agrupa («Outlet Duty Free N2» ≠ «N3», «tienda 5» ≠ «tienda 6»).
 *   4. Un renglón borrado no cuenta — y `guia_items.deleted` es independiente
 *      del `deleted` de la cabecera: se filtran LOS DOS.
 *   5. Cliente sin historia (o sin código) → cero botones.
 *   6. La tienda de D-142: `componerDestino("Westland", "6")` =
 *      «Westland · tienda 6» — el separador vive en UN solo lugar. City Moda
 *      NO lleva tienda: cada «tienda» de City Moda es OTRO cliente con su
 *      propio código (4-sep-2026).
 *   7. 🔴 El payload no cambia: el renglón armado tocando un botón es byte por
 *      byte el que se arma tecleando lo mismo (`instantaneaRenglones`).
 *   8. 🔴 `destinoParaAutollenar` (4-sep-2026, Daniel: «sí quiero que se
 *      llene sola…» / «quita esa regla. Que se autollene…»): con UN solo
 *      destino — definido o único en la historia AGRUPADA — se llena solo;
 *      con varios, nada. El pareo por parecido sigue prohibido.
 *
 * Fixtures con fechas FIJAS — nunca `new Date()`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import {
  DESTINOS_DEFINIDOS,
  MAX_BOTONES_DESTINO,
  TIENDAS_POR_CLIENTE,
  baseDeDestino,
  botonesDeDestino,
  claveDestino,
  componerDestino,
  destinoParaAutollenar,
  destinosHistoricos,
  tiendasDelDestino,
} from "@/lib/guias/destinos-clientes";
import { instantaneaRenglones } from "@/lib/guias/cambios-form";

// ─── fixtures ────────────────────────────────────────────────────────────────

type Envio = { guia_id: string; cliente_codigo?: string | null; direccion?: string | null; deleted?: boolean | null };
type Guia = { id: string; fecha?: string | null; numero?: number | null; deleted?: boolean | null };

const GUIAS: Guia[] = [
  { id: "g1", fecha: "2026-06-01", numero: 101 },
  { id: "g2", fecha: "2026-07-01", numero: 150 },
  { id: "g3", fecha: "2026-08-01", numero: 200 },
  { id: "g-borrada", fecha: "2026-08-15", numero: 210, deleted: true },
];

function envio(guia_id: string, cliente_codigo: string, direccion: string, deleted = false): Envio {
  return { guia_id, cliente_codigo, direccion, deleted };
}

// ─── 1 · los 9 definidos por Daniel ──────────────────────────────────────────

describe("los 9 definidos por Daniel devuelven exactamente su tabla", () => {
  const tabla: Array<[string, string[]]> = [
    ["D-81", ["Paso Canoas"]],
    ["D-156", ["Changuinola"]],
    ["D-117", ["Guabito"]],
    ["D-87", ["Guabito"]],
    ["D-25", ["Paso Canoas"]],
    ["D-35", ["Calle 19 Central"]],
    ["D-144", ["Albrook"]],
    // ⚠️ La familia City Moda (4-sep-2026): son ONCE clientes con su propio
    // código. Las «X (ENTREGA EN SPORTCORNER)» del histórico de D-26 eran
    // envíos cargados al cliente equivocado (iban a los otros códigos) y se
    // IGNORAN; el único destino propio de D-26 es «5 de Mayo».
    ["D-26", ["5 de Mayo"]],
    ["D-27", ["Sport Corner Calidonia"]],
    ["D-28", ["Sport Corner Calidonia"]],
    ["D-29", ["Sport Corner Calidonia"]],
    ["D-31", ["Sport Corner Calidonia"]],
    ["D-32", ["Sport Corner Calidonia"]],
    ["D-34", ["Sport Corner Calidonia"]],
    ["D-42", ["Sport Corner Calidonia"]],
    ["D-142", ["Westland", "Albrook", "Los Andes", "Santiago", "Penonomé", "Metromall", "Megamall", "Outlet Vía España"]],
  ];

  it.each(tabla)("%s → lo que dijo Daniel, sin mirar el histórico", (codigo, esperado) => {
    // Con un histórico que dice OTRA cosa (el caso real de D-87: más veces
    // «Changinola» que «Guabito»), la definición gana igual.
    const historicos = ["Changinola", "Changinola", "Otro lado"];
    expect(botonesDeDestino(codigo, historicos)).toEqual(esperado);
  });

  it("🔴 D-87 La Frontera Duty Free dice GUABITO aunque su histórico real diga Changinola — Daniel: «en Frontera Duty Free es Guabito, hazme caso.»", () => {
    // El histórico REAL medido el 4-sep-2026: «Changinola» 7 veces y
    // «Guabito» 4. Por frecuencia ganaría Changinola; la definición gana.
    const historicoReal = [
      ...Array<string>(7).fill("Changinola"),
      ...Array<string>(4).fill("Guabito"),
    ];
    expect(botonesDeDestino("D-87", historicoReal)).toEqual(["Guabito"]);
    expect(DESTINOS_DEFINIDOS["D-87"]).toEqual(["Guabito"]);
  });

  it("la tabla tiene los 16 y solo los 16 (los 9 de Daniel + la familia City Moda del 4-sep)", () => {
    expect(Object.keys(DESTINOS_DEFINIDOS).sort()).toEqual(
      [
        "D-117", "D-142", "D-144", "D-156", "D-25", "D-26", "D-35", "D-81", "D-87",
        // La familia City Moda con guías propias. D-30, D-33 y D-78 no tienen
        // guías todavía y por eso NO tienen destino definido.
        "D-27", "D-28", "D-29", "D-31", "D-32", "D-34", "D-42",
      ].sort(),
    );
  });
});

// ─── 2 y 3 · el histórico: frecuencia, grafía más usada, agrupado exacto ─────

describe("para los demás clientes, los destinos salen de su historia", () => {
  it("agrupa las variantes reales de producción: Paso Canoas / Pasocanoas / Paso Canoa = UN botón, con la grafía más usada", () => {
    const envios = [
      envio("g1", "D-999", "Paso Canoas"),
      envio("g1", "D-999", "Paso Canoas"),
      envio("g2", "D-999", "Pasocanoas"),
      envio("g3", "D-999", "Paso Canoa"),
    ];
    const d = destinosHistoricos(envios, GUIAS);
    // Un solo botón, y con la grafía MÁS USADA — nunca la normalizada.
    expect(d["D-999"]).toEqual(["Paso Canoas"]);
  });

  it("agrupa mayúsculas y acentos: Penonome / PENONOME / Penonomé = 1", () => {
    const envios = [
      envio("g1", "D-999", "PENONOME"),
      envio("g2", "D-999", "Penonomé"),
      envio("g3", "D-999", "Penonome"),
    ];
    const d = destinosHistoricos(envios, GUIAS);
    expect(d["D-999"]).toHaveLength(1);
  });

  it("🔴 una diferencia de NÚMERO nunca se agrupa: Outlet Duty Free N2 ≠ N3, tienda 5 ≠ tienda 6", () => {
    expect(claveDestino("Outlet Duty Free N2")).not.toBe(claveDestino("Outlet Duty Free N3"));
    expect(claveDestino("Westland · tienda 5")).not.toBe(claveDestino("Westland · tienda 6"));
    const envios = [
      envio("g1", "D-999", "Outlet Duty Free N2"),
      envio("g2", "D-999", "Outlet Duty Free N3"),
    ];
    expect(destinosHistoricos(envios, GUIAS)["D-999"]).toHaveLength(2);
  });

  it("🔴 nada de distancia de edición: Wesland (typo) NO se junta con Westland", () => {
    expect(claveDestino("Wesland")).not.toBe(claveDestino("Westland"));
  });

  it("ordena por frecuencia, la más usada primero (no por fecha ni alfabético)", () => {
    const envios = [
      envio("g1", "D-999", "David"),
      envio("g2", "D-999", "Santiago"),
      envio("g2", "D-999", "Santiago"),
      envio("g3", "D-999", "Santiago"),
      envio("g3", "D-999", "David"),
      envio("g3", "D-999", "Changuinola"),
    ];
    expect(destinosHistoricos(envios, GUIAS)["D-999"]).toEqual(["Santiago", "David", "Changuinola"]);
  });

  it("máximo 6 botones", () => {
    const envios = ["A", "B", "C", "D", "E", "F", "G", "H"].map((dir) => envio("g1", "D-999", dir));
    expect(destinosHistoricos(envios, GUIAS)["D-999"]).toHaveLength(MAX_BOTONES_DESTINO);
    expect(MAX_BOTONES_DESTINO).toBe(6);
  });

  it("la grafía ofrecida es un valor ORIGINAL del histórico, jamás el normalizado", () => {
    const envios = [
      envio("g1", "D-999", "CALLE 19"),
      envio("g2", "D-999", "CALLE 19"),
      envio("g3", "D-999", "Calle 19"),
    ];
    const [unico] = destinosHistoricos(envios, GUIAS)["D-999"];
    expect(unico).toBe("CALLE 19"); // la más usada, tal como se escribió
  });
});

// ─── 4 · renglones y guías borrados no cuentan ───────────────────────────────

describe("lo borrado no cuenta — los DOS deleted son independientes", () => {
  it("un renglón con deleted=true no aporta", () => {
    const envios = [
      envio("g1", "D-999", "David"),
      envio("g2", "D-999", "Santiago", true),
      envio("g3", "D-999", "Santiago", true),
    ];
    expect(destinosHistoricos(envios, GUIAS)["D-999"]).toEqual(["David"]);
  });

  it("un renglón vivo de una GUÍA borrada tampoco (el deleted de la cabecera)", () => {
    const envios = [
      envio("g1", "D-999", "David"),
      envio("g-borrada", "D-999", "Santiago"),
      envio("g-borrada", "D-999", "Santiago"),
    ];
    expect(destinosHistoricos(envios, GUIAS)["D-999"]).toEqual(["David"]);
  });
});

// ─── 5 · sin historia, nada ──────────────────────────────────────────────────

describe("cliente sin historia → cero botones, campo vacío como hoy", () => {
  it("sin historia y sin definición no hay botones", () => {
    expect(botonesDeDestino("D-999", [])).toEqual([]);
  });
  it("sin código no hay botones (el texto libre no identifica al cliente)", () => {
    expect(botonesDeDestino("", ["David"])).toEqual([]);
    expect(botonesDeDestino(null, ["David"])).toEqual([]);
  });
});

// ─── 6 · la tienda de Sporting Shoes (D-142) ─────────────────────────────────

describe("D-142: la tienda opcional y el separador en UN solo lugar", () => {
  it("componer con número dice «tienda»: Westland + 6 → «Westland · tienda 6»", () => {
    expect(componerDestino("Westland", "6")).toBe("Westland · tienda 6");
  });
  it("componer con texto no lo dice: Westland + Mas Flow → «Westland · Mas Flow»", () => {
    expect(componerDestino("Westland", "Mas Flow")).toBe("Westland · Mas Flow");
  });
  it("sin tienda queda el destino pelado", () => {
    expect(componerDestino("Westland", "")).toBe("Westland");
    expect(componerDestino("Westland", "  ")).toBe("Westland");
  });
  it("las tiendas ya usadas son las de la tabla de Daniel", () => {
    expect(TIENDAS_POR_CLIENTE["D-142"]).toEqual({
      Westland: ["5", "6", "14", "Mas Flow"],
      Albrook: ["7", "8", "9"],
      "Los Andes": ["3", "4"],
      Metromall: ["10"],
    });
  });
  it("tiendasDelDestino mira la BASE del campo: con «Westland · tienda 6» siguen siendo las de Westland", () => {
    expect(tiendasDelDestino("D-142", "Westland")).toEqual(["5", "6", "14", "Mas Flow"]);
    expect(tiendasDelDestino("D-142", "Westland · tienda 6")).toEqual(["5", "6", "14", "Mas Flow"]);
    expect(baseDeDestino("Westland · tienda 6")).toBe("Westland");
  });
  it("un destino sin tiendas (Santiago), un campo vacío u otro cliente no ofrecen nada", () => {
    expect(tiendasDelDestino("D-142", "Santiago")).toEqual([]);
    expect(tiendasDelDestino("D-142", "")).toEqual([]);
    expect(tiendasDelDestino("D-25", "Westland")).toEqual([]);
  });
});

// ─── 6b · City Moda NO lleva tienda: cada «tienda» es OTRO cliente ───────────

describe("City Moda (4-sep-2026): once códigos, cero tiendas", () => {
  it("TIENDAS_POR_CLIENTE solo tiene a D-142 — D-26 no ofrece tiendas", () => {
    expect(Object.keys(TIENDAS_POR_CLIENTE)).toEqual(["D-142"]);
    expect(tiendasDelDestino("D-26", "5 de Mayo")).toEqual([]);
    expect(tiendasDelDestino("D-27", "Sport Corner Calidonia")).toEqual([]);
  });
});

// ─── 6c · el destino que SÍ se llena solo (4-sep-2026) ───────────────────────

describe("🔴 destinoParaAutollenar: UN solo destino — definido o único en la historia", () => {
  // Daniel, textual (4-sep-2026): «sí quiero que se llene sola, ¿ese no era el
  // propósito de todo esto? ¿Cómo que no pre-llenaste la dirección?» y, sobre
  // la regla del 14-ago: «"la dirección no se escribe sola" me refería a que
  // el usuario no lo haga para no escribirlo mal como lo vimos, quita esa
  // regla. Que se autollene como lo discutimos antes.» Medido: 40 de 48
  // clientes con guías usan siempre el mismo destino.
  it("un definido con UN destino lo devuelve (incluida la familia City Moda)", () => {
    expect(destinoParaAutollenar("D-81", [])).toBe("Paso Canoas");
    expect(destinoParaAutollenar("D-87", [])).toBe("Guabito");
    expect(destinoParaAutollenar("D-156", [])).toBe("Changuinola");
    expect(destinoParaAutollenar("D-26", [])).toBe("5 de Mayo");
    expect(destinoParaAutollenar("D-27", [])).toBe("Sport Corner Calidonia");
    // Y la definición gana aunque el histórico diga otra cosa (D-87 real:
    // más veces «Changinola» que «Guabito»).
    expect(destinoParaAutollenar("D-87", ["Changinola"])).toBe("Guabito");
  });
  it("un cliente FUERA de la tabla con UN solo destino histórico también autollena — Bouti, S.A. (D-14) → David", () => {
    // El ejemplo que preguntó Daniel: D-14 tiene 4 guías, siempre a «David».
    expect(destinoParaAutollenar("D-14", ["David"])).toBe("David");
  });
  it("🔴 con VARIOS destinos no se llena nada: salen los botones y elige la persona", () => {
    expect(destinoParaAutollenar("D-142", [])).toBeNull(); // 8 definidos
    expect(destinoParaAutollenar("D-999", ["David", "Santiago"])).toBeNull();
  });
  it("sin código o sin historia, nada", () => {
    expect(destinoParaAutollenar("D-999", [])).toBeNull();
    expect(destinoParaAutollenar("", ["David"])).toBeNull();
    expect(destinoParaAutollenar(null, ["David"])).toBeNull();
  });
});

// ─── 7 · el payload no cambia ────────────────────────────────────────────────

describe("🔴 el payload es idéntico por los dos caminos", () => {
  it("el renglón con la dirección puesta por botón = el renglón tecleado a mano, byte por byte", () => {
    const base = {
      orden: 1,
      cliente: "Sporting Shoes N 4",
      cliente_codigo: "D-142",
      empresa: "Fashion Shoes",
      facturas: "10234",
      bultos: 3,
      numero_guia_transp: "",
    };
    // Camino 1: tocar «Westland» y después la tienda «6».
    const porBoton = { ...base, direccion: componerDestino("Westland", "6") };
    // Camino 2: teclear lo mismo a mano.
    const aMano = { ...base, direccion: "Westland · tienda 6" };
    expect(instantaneaRenglones([porBoton])).toBe(instantaneaRenglones([aMano]));
  });
});
