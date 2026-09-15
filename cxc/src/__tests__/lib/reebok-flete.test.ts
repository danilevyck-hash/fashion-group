/* ─────────────────────────────────────────────────────────────────────────────
 * EL FLETE DE REEBOK — 1.10 o 1.15, y nada más (14-sep-2026).
 *
 * Daniel, textual: «quiero ponerle opcion de 1.1 y 1.15» · «Costo CIF seria 1.1
 * o 1.15 (default 1.1)» · «porque tengo que pagar el flete que es 1.1 siempre es
 * tommy y 1.1 y 1.15 en reebok» · «la 1 si pero 1.1 por default (que pueda
 * cambiar el default en configuracion de reebok)».
 *
 * 🔴 ESTO MUEVE PLATA: el «Costo CIF *» es el costo con el que los artículos
 * entran a Switch, y de él sale el precio de venta.
 *
 * Lo que este candado protege, y por qué cada cosa:
 *   1. El default es 1.10 → con nadie tocando nada, el Excel es el de siempre.
 *   2. Solo existen 1.10 y 1.15 → un campo libre aceptaría `11` y mandaría
 *      costos 10× mal (el defecto del divisor, `divisor.ts`).
 *   3. El valor vive en UN solo lugar → dos sitios con el mismo número es cómo
 *      nace un Excel que dice una cosa y una pantalla otra.
 *   4. Tommy sigue FIJO en 1.10 → Daniel lo dijo con esas palabras.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FLETE_OPCIONES,
  FLETE_DEFAULT,
  CLAVE_FLETE_DEFAULT,
  esFleteValido,
  normalizarFlete,
  etiquetaFlete,
} from "@/lib/depurador/flete";
import {
  buildSwitchRows,
  buildCatalogo,
  REEBOK_FORMULA_A_DEFAULT,
  REEBOK_FORMULA_B_DEFAULT,
} from "@/lib/depurador/reebok";
import type { ReebokItem } from "@/lib/depurador/reebok";

const RAIZ = join(__dirname, "..", "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

/** Dos artículos reales en forma: calzado (FOB = 80%) y una prenda (FOB = 70%). */
const ITEMS: ReebokItem[] = [
  {
    po: "PO-1", newArticle: "100034418", sku: "1000344180090", name: "CLUB C 85",
    department: "FOOTWEAR", category: "SHOES", ageGroup: "ADULT", colorName: "WHITE",
    gender: "Male", sellIn: "SI", wholesale: 45, wholesaleOff: null, talla: "9", piezas: 6,
  },
  {
    po: "PO-1", newArticle: "100200571", sku: "1002005710M", name: "IDENTITY TEE",
    department: "APPAREL", category: "T-SHIRTS", ageGroup: "ADULT", colorName: "BLACK",
    gender: "Female", sellIn: "SI", wholesale: 14.9, wholesaleOff: null, talla: "M", piezas: 12,
  },
];

const cifDe = (flete?: number) =>
  buildSwitchRows(ITEMS, {
    formula: REEBOK_FORMULA_A_DEFAULT, temporada: "2026-09", tasa: "07", flete,
  }).map((r) => [r.cols["Código *"], r.cols["Costo FOB *"], r.cols["Costo CIF *"], r.cols["Precio *"]]);

const costoCatalogoDe = (flete?: number) =>
  buildCatalogo(ITEMS, {
    formulaA: REEBOK_FORMULA_A_DEFAULT, formulaB: REEBOK_FORMULA_B_DEFAULT, flete,
  }).map((r) => [r.newArticle, r.costo, r.precioA, r.precioB]);

describe("El flete de Reebok: 1.10 por defecto, 1.15 opcional", () => {
  it("el default es 1.10 — el de siempre", () => {
    expect(FLETE_DEFAULT).toBe(1.1);
    expect(normalizarFlete(undefined)).toBe(1.1);
  });

  it("solo existen DOS opciones: 1.10 y 1.15", () => {
    expect([...FLETE_OPCIONES]).toEqual([1.1, 1.15]);
  });

  it("🔴 rechaza cualquier otro valor — un «11» por «1.1» sería costo 10× mal", () => {
    for (const malo of [11, 1.15001, 1.2, 1, 0, 1.5, 110, "", null, undefined, NaN, "mucho"]) {
      expect(esFleteValido(malo), `aceptó ${String(malo)}`).toBe(false);
    }
    expect(esFleteValido(1.1)).toBe(true);
    expect(esFleteValido(1.15)).toBe(true);
    expect(esFleteValido("1.15")).toBe(true); // lo que llega por JSON de la pantalla
  });

  it("lo que no sirve cae al default: falla ABIERTA, nunca sin flete", () => {
    for (const malo of [11, 0, -1, "", null, undefined, NaN, {}, "1,15"]) {
      expect(normalizarFlete(malo)).toBe(FLETE_DEFAULT);
    }
  });

  it("en pantalla se escribe con dos decimales", () => {
    expect(etiquetaFlete(1.1)).toBe("1.10");
    expect(etiquetaFlete(1.15)).toBe("1.15");
  });

  // ── EL CONTROL DE TODO EL CAMBIO ──────────────────────────────────────────
  it("🔑 con 1.10 no cambia NI UN CENTAVO: es idéntico a no elegir nada", () => {
    expect(cifDe(1.1)).toEqual(cifDe(undefined));
    expect(costoCatalogoDe(1.1)).toEqual(costoCatalogoDe(undefined));
    // Y los números son los de siempre, escritos acá para que se vean:
    expect(cifDe(undefined)).toEqual([
      ["100034418", 36, 39.6, 54],     // 45 × 0.80 = 36 → × 1.10 = 39.60
      ["100200571", 10.43, 11.47, 16], // 14.9 × 0.70 = 10.43 → × 1.10 = 11.47
    ]);
  });

  it("🔴 un 11 tecleado NO llega al Excel: los generadores normalizan", () => {
    // Si el flete se usara crudo, el CIF saldría 10× mal y el archivo entraría
    // así a Switch. Los dos generadores lo tienen que cortar antes.
    for (const malo of [11, 0, -1, 1.2, NaN]) {
      expect(cifDe(malo), `pasó un flete de ${String(malo)}`).toEqual(cifDe(1.1));
      expect(costoCatalogoDe(malo)).toEqual(costoCatalogoDe(1.1));
    }
  });

  it("con 1.15 el Costo CIF sube, y es FOB × 1.15", () => {
    expect(cifDe(1.15)).toEqual([
      ["100034418", 36, 41.4, 56],     // 36 × 1.15
      ["100200571", 10.43, 11.99, 16], // 10.43 × 1.15
    ]);
  });

  it("el flete es del EMBARQUE: también mueve el costo del pedido para cliente", () => {
    // Si solo moviera el CIF de Switch, el Precio A/B saldría calculado sobre un
    // flete que no se está pagando — vendiendo más barato en silencio.
    expect(costoCatalogoDe(1.15)).not.toEqual(costoCatalogoDe(1.1));
    expect(costoCatalogoDe(1.15)[0][1]).toBe(41.4); // 45 × 0.80 × 1.15
  });
});

describe("El flete vive en UN solo lugar", () => {
  it("🔴 ningún generador de Reebok multiplica por 1.1 escrito a mano", () => {
    const src = leer("src/lib/depurador/reebok.ts");
    const sinComentarios = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(sinComentarios, "hay un flete escrito a mano en reebok.ts")
      .not.toMatch(/\*\s*1\.1\d*\b/);
    expect(sinComentarios).toMatch(/\*\s*flete\b/);
    expect(src).toMatch(/from "\.\/flete"/);
  });

  it("la pantalla y los generadores leen el MISMO módulo", () => {
    const cli = leer("src/app/productos/cargar/ReebokClient.tsx");
    // Los nombres tienen que VENIR del módulo, no estar redefinidos acá: una
    // copia local es exactamente cómo la pantalla y el Excel empiezan a decir
    // cosas distintas.
    for (const nombre of ["FLETE_OPCIONES", "FLETE_DEFAULT", "etiquetaFlete", "normalizarFlete"]) {
      expect(cli, `${nombre} no sale de @/lib/depurador/flete`)
        .toMatch(new RegExp(`import \\{[^}]*\\b${nombre}\\b[^}]*\\} from "@/lib/depurador/flete"`));
      expect(cli, `${nombre} está redefinido en la pantalla`)
        .not.toMatch(new RegExp(`const ${nombre}\\s*=`));
    }
    expect(cli, "la pantalla escribe el flete a mano").not.toMatch(/setFlete\(1\.1\d*\)/);
  });

  it("la ruta que guarda el default valida con la MISMA función", () => {
    const route = leer("src/app/api/productos/cargar/flete/route.ts");
    // Barrido: lo que se exige es el GUARD, no que la palabra aparezca en un
    // import. Un `if (false)` pasaría lo primero y no lo segundo.
    expect(route, "la ruta dejó de frenar un flete inválido")
      .toMatch(/if\s*\(\s*!\s*esFleteValido\s*\(\s*body\.flete\s*\)\s*\)/);
    expect(route).toMatch(/status:\s*400/);
    expect(route).toMatch(/normalizarFlete\(body\.flete\)/);
    expect(route).toMatch(/CLAVE_FLETE_DEFAULT/);
  });
});

describe("⚠️ Tommy sigue FIJO en 1.10 — no lleva la opción", () => {
  // Daniel: «el flete que es 1.1 siempre es tommy». Tommy (y Calvin, y KL) van
  // por el Depurador CK/TH (logic.ts), que es otro camino y otro archivo.
  it("logic.ts no conoce el 1.15 y conserva su 1.1", () => {
    const logic = leer("src/lib/depurador/logic.ts");
    expect(logic, "a Tommy le llegó la opción de 1.15").not.toMatch(/1\.15/);
    expect(logic, "se movió el factor fijo de CK/TH").toMatch(/config\.factor\)\s*\|\|\s*1\.1\b/);
  });

  it("CONTROL AL REVÉS: logic.ts no importa el módulo del flete de Reebok", () => {
    expect(leer("src/lib/depurador/logic.ts")).not.toMatch(/from "\.\/flete"/);
  });
});

describe("La migración del default es aditiva y acotada", () => {
  const sql = leer("supabase/migrations/20261126120000_reebok_flete_default.sql");

  it("inserta UNA fila, por clave exacta, sin pisar nada", () => {
    expect(sql).toMatch(/ON CONFLICT \(key\) DO NOTHING/i);
    expect(sql).toMatch(new RegExp(`'${CLAVE_FLETE_DEFAULT}'`));
    expect(sql, "un UPDATE abierto sobre app_settings").not.toMatch(/UPDATE\s+(public\.)?app_settings/i);
    expect(sql, "un DELETE sobre app_settings").not.toMatch(/DELETE\s+FROM/i);
    expect(sql, "un LIKE suelto").not.toMatch(/LIKE\s+'%/i);
  });

  it("el CHECK repite el rango: solo 1.1 o 1.15", () => {
    expect(sql).toMatch(/IN \('1\.1', '1\.15'\)/);
  });
});
