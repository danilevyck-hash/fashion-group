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
 *      «Westland · tienda 6» — el separador vive en UN solo lugar.
 *   7. 🔴 El payload no cambia: el renglón armado tocando un botón es byte por
 *      byte el que se arma tecleando lo mismo (`instantaneaRenglones`).
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
    ["D-26", ["Entrega en SportCorner"]],
    ["D-142", ["Westland", "Albrook", "Los Andes", "Santiago", "Penonomé", "Metromall", "Megamall", "Outlet Vía España"]],
  ];

  it.each(tabla)("%s → lo que dijo Daniel, sin mirar el histórico", (codigo, esperado) => {
    // Con un histórico que dice OTRA cosa (el caso real de D-87: más veces
    // «Changinola» que «Guabito»), la definición gana igual.
    const historicos = ["Changinola", "Changinola", "Otro lado"];
    expect(botonesDeDestino(codigo, historicos)).toEqual(esperado);
  });

  it("la tabla tiene los 9 y solo los 9", () => {
    expect(Object.keys(DESTINOS_DEFINIDOS).sort()).toEqual(
      ["D-117", "D-142", "D-144", "D-156", "D-25", "D-26", "D-35", "D-81", "D-87"].sort(),
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
