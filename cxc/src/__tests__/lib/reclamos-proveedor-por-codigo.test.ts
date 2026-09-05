/* ─────────────────────────────────────────────────────────────────────────────
 * CANDADO — LOS «RECLAMOS VINCULADOS» SE UNEN POR (EMPRESA, CÓDIGO).
 *
 * 🩸 Lo que pasó: la ficha de /proveedores/[key] leía TODA la tabla `reclamos` y
 * la filtraba en JavaScript comparando el NOMBRE normalizado del proveedor.
 * Medido contra producción el 4-sep-2026, 26 de los 34 reclamos vivos YA no
 * cruzaban: Switch escribe «American Fashion Wear, SA» y los reclamos dicen
 * «American Fashion Wear» — `normProvName` conserva la `SA`. Las fichas de
 * Fashion Wear (21 reclamos) y Fashion Shoes (5) mostraban CERO y nadie se
 * enteró. Es el mismo error que costó caro con los clientes de Boston.
 *
 * Lo que este archivo protege:
 *   1. que la identidad sea el PAR (empresa, código) y no el código solo — `122`
 *      son dos proveedores distintos según la empresa;
 *   2. que cambiar la GRAFÍA del nombre no rompa nada;
 *   3. que un reclamo SIN código no se pegue a nadie;
 *   4. que el mapa siga teniendo las 6 empresas con su código;
 *   5. que la migración que rellena los reclamos viejos no ate por parecido.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// `normProvName` vive en @/lib/proveedores, que al importarse crea el cliente de
// Supabase. Acá no se toca la base: solo hace falta la función pura.
vi.mock("@/lib/supabase-server", () => ({ HAS_SERVICE_ROLE: false, supabaseServer: {} }));

import { EMPRESAS, EMPRESAS_MAP, empresaKeyDeReclamo } from "@/lib/reclamos/empresas";
import {
  clavePar,
  paresDelProveedor,
  reclamosDelProveedor,
} from "@/lib/reclamos/proveedor-vinculo";
import { normProvName } from "@/lib/proveedores";

/** Filas reales de `switch_proveedor_estadocuenta` (producción, 4-sep-2026). */
const SWITCH = [
  { empresa_key: "vistana", codigo: "01", nombre: "American Designer Fashion" },
  { empresa_key: "active_shoes", codigo: "125", nombre: "AMERICAN DESIGNER FASHION" },
  { empresa_key: "fashion_wear", codigo: "122", nombre: "American Fashion Wear, SA" },
  { empresa_key: "fashion_shoes", codigo: "112", nombre: "American Fashion Wear, SA" },
  { empresa_key: "active_shoes", codigo: "122", nombre: "LATIN FITNESS GROUP" },
  { empresa_key: "active_wear", codigo: "113", nombre: "LATIN FITNESS GROUP" },
  { empresa_key: "vistana", codigo: "115", nombre: "LATIN FITNESS GROUP" },
  { empresa_key: "active_wear", codigo: "126", nombre: "AMERICAN UNIQUE BRANDS SA" },
  { empresa_key: "joystep", codigo: "112", nombre: "JCBBRANDS" },
];

/** Los reclamos vivos de producción, resumidos a lo que hace falta para cruzar. */
const RECLAMOS = [
  ...Array.from({ length: 21 }, (_, i) => ({
    id: `fw-${i}`, empresa: "Fashion Wear",
    proveedor: "American Fashion Wear", proveedor_codigo: "122",
  })),
  ...Array.from({ length: 7 }, (_, i) => ({
    id: `vi-${i}`, empresa: "Vistana International",
    proveedor: "American Designer Fashion", proveedor_codigo: "01",
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `fs-${i}`, empresa: "Fashion Shoes",
    proveedor: "American Fashion Wear", proveedor_codigo: "112",
  })),
  { id: "as-0", empresa: "Active Shoes", proveedor: "Latin Fitness Group", proveedor_codigo: "122" },
];

/** Lo que hace la ficha: filas de ESE proveedor → pares → reclamos. */
function fichaDe(key: string, reclamos = RECLAMOS) {
  const pares = paresDelProveedor(SWITCH.filter((r) => normProvName(r.nombre) === key));
  return reclamosDelProveedor(reclamos, pares);
}

describe("🔴 la identidad es el PAR (empresa, código)", () => {
  it("el mismo código en dos empresas son DOS proveedores distintos", () => {
    // El caso que prueba por qué el par: 122 en Fashion Wear es American Fashion
    // Wear y 122 en Active Shoes es Latin Fitness Group.
    const fw = SWITCH.find((r) => r.empresa_key === "fashion_wear" && r.codigo === "122");
    const as = SWITCH.find((r) => r.empresa_key === "active_shoes" && r.codigo === "122");
    expect(normProvName(fw!.nombre)).not.toBe(normProvName(as!.nombre));

    // Y lo mismo con el 112: Fashion Shoes es Tommy, Joystep es Joybees.
    const fs = SWITCH.find((r) => r.empresa_key === "fashion_shoes" && r.codigo === "112");
    const js = SWITCH.find((r) => r.empresa_key === "joystep" && r.codigo === "112");
    expect(normProvName(fs!.nombre)).not.toBe(normProvName(js!.nombre));
  });

  it("el reclamo de Active Shoes NO aparece en la ficha de American Fashion Wear", () => {
    // Los dos llevan el código 122. Sin la empresa, este reclamo se colaría.
    const afw = fichaDe("AMERICAN FASHION WEAR SA");
    expect(afw.some((r) => r.empresa === "Active Shoes")).toBe(false);
    expect(afw).toHaveLength(26); // 21 Fashion Wear + 5 Fashion Shoes
  });

  it("cada ficha ve exactamente sus reclamos", () => {
    expect(fichaDe("AMERICAN DESIGNER FASHION")).toHaveLength(7);
    expect(fichaDe("LATIN FITNESS GROUP")).toHaveLength(1);
    expect(fichaDe("AMERICAN UNIQUE BRANDS SA")).toHaveLength(0);
    expect(fichaDe("JCBBRANDS")).toHaveLength(0);
  });

  it("🔑 una clave a medias no existe: sin empresa o sin código, no hay par", () => {
    expect(clavePar("fashion_wear", "122")).toBe("fashion_wear|122");
    expect(clavePar("", "122")).toBeNull();
    expect(clavePar("fashion_wear", "")).toBeNull();
    expect(clavePar(null, null)).toBeNull();
    // Dos vacíos jamás pueden coincidir entre sí.
    expect(paresDelProveedor([{ empresa_key: "", codigo: null }]).size).toBe(0);
  });
});

describe("🔴 cambiar la grafía del nombre NO rompe la ficha", () => {
  it("el nombre del reclamo puede decir cualquier cosa: el código manda", () => {
    // Es exactamente lo que pasa hoy en producción, y por eso 26 reclamos se
    // habían perdido: Switch dice «, SA» y el reclamo no.
    const conOtraGrafia = RECLAMOS.map((r) => ({ ...r, proveedor: "AMERICAN  fashion wear s.a." }));
    expect(fichaDe("AMERICAN FASHION WEAR SA", conOtraGrafia)).toHaveLength(26);
  });

  it("cambiar el nombre en EMPRESAS_MAP tampoco la rompe", () => {
    // El mapa manda el nombre que se IMPRIME. Que Daniel lo reescriba mañana no
    // puede dejar una ficha en cero.
    const renombrados = RECLAMOS.map((r) =>
      r.empresa === "Fashion Wear" ? { ...r, proveedor: "American Fashion Wear Corp." } : r,
    );
    expect(fichaDe("AMERICAN FASHION WEAR SA", renombrados)).toHaveLength(26);
  });

  it("🩸 la unión por NOMBRE, la de antes, dejaba 26 de 34 afuera", () => {
    // La medición que motivó el cambio, escrita como test para que no vuelva.
    const porNombre = RECLAMOS.filter((r) => normProvName(r.proveedor) === "AMERICAN FASHION WEAR SA");
    expect(porNombre).toHaveLength(0);
    expect(fichaDe("AMERICAN FASHION WEAR SA")).toHaveLength(26);
  });
});

describe("🔴 un reclamo sin código no se pega a nadie", () => {
  it("ni por nombre, ni por parecido, ni al proveedor más probable", () => {
    const huerfano = [
      { id: "x", empresa: "Fashion Wear", proveedor: "American Fashion Wear, SA", proveedor_codigo: null },
      { id: "y", empresa: "Fashion Wear", proveedor: "American Fashion Wear", proveedor_codigo: "" },
    ];
    for (const key of SWITCH.map((r) => normProvName(r.nombre))) {
      expect(fichaDe(key, huerfano as typeof RECLAMOS)).toHaveLength(0);
    }
  });

  it("una empresa que no está en el mapa tampoco cruza", () => {
    // `empresa_key` sale del mapa; sin mapa no hay lado izquierdo del par.
    expect(empresaKeyDeReclamo("Confecciones Boston")).toBeNull();
    const ajeno = [{ id: "z", empresa: "Confecciones Boston", proveedor: "American Fashion Wear", proveedor_codigo: "122" }];
    expect(fichaDe("AMERICAN FASHION WEAR SA", ajeno as typeof RECLAMOS)).toHaveLength(0);
  });
});

describe("🔴 el mapa son las 6 empresas, cada una con su código", () => {
  const ESPERADO: Array<[string, string, string, string]> = [
    ["Vistana International", "vistana", "Calvin Klein", "01"],
    ["Fashion Wear", "fashion_wear", "Tommy Hilfiger", "122"],
    ["Fashion Shoes", "fashion_shoes", "Tommy Hilfiger", "112"],
    ["Active Shoes", "active_shoes", "Reebok", "122"],
    ["Active Wear", "active_wear", "Karl Lagerfeld", "126"],
    ["Joystep", "joystep", "Joybees", "112"],
  ];

  it("están las 6, en ese orden, y ninguna más", () => {
    expect(EMPRESAS).toEqual(ESPERADO.map(([e]) => e));
  });

  it("cada una trae empresa_key, marca y código", () => {
    for (const [empresa, key, marca, codigo] of ESPERADO) {
      const info = EMPRESAS_MAP[empresa];
      expect(info).toBeDefined();
      expect(info.empresa_key).toBe(key);
      expect(info.marca).toBe(marca);
      expect(info.proveedor_codigo).toBe(codigo);
      expect(info.proveedor.trim()).not.toBe("");
    }
  });

  it("⚠️ Active Wear es Karl Lagerfeld, no Reebok", () => {
    // Daniel pasó todo lo de Reebok a Active Shoes y le dio Active Wear a Karl
    // Lagerfeld. Medido: American Unique Brands (126) es el único proveedor con
    // llegadas a Active Wear entre junio y agosto de 2026.
    expect(EMPRESAS_MAP["Active Wear"].proveedor).toBe("American Unique Brands SA");
    expect(EMPRESAS_MAP["Active Wear"].marca).not.toBe("Reebok");
  });

  it("cada par (empresa_key, código) del mapa existe de verdad en Switch", () => {
    for (const info of Object.values(EMPRESAS_MAP)) {
      const fila = SWITCH.find(
        (s) => s.empresa_key === info.empresa_key && s.codigo === info.proveedor_codigo,
      );
      expect(fila, `${info.empresa_key}|${info.proveedor_codigo}`).toBeDefined();
    }
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * LA MIGRACIÓN QUE RELLENA LOS RECLAMOS QUE YA EXISTEN.
 * ⚠️ Se lee el SQL SIN COMENTARIOS: el archivo NOMBRA lo que prohíbe («ni LIKE,
 * ni ILIKE, ni similarity»), así que un barrido sobre el archivo entero se
 * daría por satisfecho con su propia explicación. Ese error ya se cometió acá.
 * ─────────────────────────────────────────────────────────────────────────── */
const RUTA = join(process.cwd(), "supabase", "migrations", "20260922120000_reclamos_proveedor_codigo.sql");
const SQL = readFileSync(RUTA, "utf8");
const CODIGO = SQL.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("🔴 la migración no ata NADA por parecido", () => {
  it("no usa ninguna herramienta de pareo aproximado", () => {
    for (const prohibida of [
      /\bi?like\b/i,
      /similarity/i,
      /unaccent/i,
      /levenshtein/i,
      /soundex/i,
      /metaphone/i,
      /word_similarity/i,
      /\bposition\s*\(/i,
      /\bstrpos\s*\(/i,
      /\bsubstring\s*\(/i,
      /\bleft\s*\(/i,
      /\bregexp_/i,
      /\btranslate\s*\(/i,
      /~\*/,
    ]) {
      expect(CODIGO).not.toMatch(prohibida);
    }
  });

  it("la única normalización es upper(btrim(...)), sobre los DOS lados", () => {
    expect(CODIGO).toMatch(/upper\(btrim\(r\.empresa\)\)\s*=\s*upper\(btrim\(l\.empresa\)\)/);
    expect(CODIGO).toMatch(/upper\(btrim\(r\.proveedor\)\)\s*=\s*upper\(btrim\(l\.proveedor\)\)/);
  });

  it("🔑 la EMPRESA también tiene que coincidir — el código solo no basta", () => {
    const updates = CODIGO.split(/UPDATE\s+reclamos/i).slice(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatch(/r\.empresa/);
  });
});

describe("🔴 la lista de la migración es la misma que la del mapa", () => {
  it("las 6 filas, con el mismo código", () => {
    for (const [empresa, info] of Object.entries(EMPRESAS_MAP)) {
      const fila = new RegExp(
        `\\(\\s*'${empresa}'\\s*,\\s*'${info.proveedor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'\\s*,\\s*'${info.proveedor_codigo}'\\s*\\)`,
      );
      expect(CODIGO, empresa).toMatch(fila);
    }
  });

  it("no hay una SÉPTIMA fila que se haya colado", () => {
    const filas = CODIGO.match(/\(\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*\)/g) ?? [];
    expect(filas).toHaveLength(Object.keys(EMPRESAS_MAP).length);
  });
});

describe("la migración es aditiva y no pisa nada", () => {
  it("solo AGREGA la columna", () => {
    expect(CODIGO).toMatch(/ADD COLUMN IF NOT EXISTS proveedor_codigo text/i);
    expect(CODIGO).not.toMatch(/\bDROP\b/i);
    expect(CODIGO).not.toMatch(/\bDELETE\b/i);
    expect(CODIGO).not.toMatch(/RENAME/i);
    expect(CODIGO).not.toMatch(/ALTER COLUMN/i);
    expect(CODIGO).not.toMatch(/\bTRUNCATE\b/i);
  });

  it("🔴 escribe UNA sola columna de UNA sola tabla", () => {
    const escrituras = CODIGO.match(/UPDATE\s+(\w+)/gi) ?? [];
    expect(escrituras.length).toBe(1);
    expect((escrituras[0] ?? "").toLowerCase()).toContain("reclamos");

    const sets = [...CODIGO.matchAll(/\bSET\b([\s\S]*?)\bFROM\b/gi)];
    expect(sets).toHaveLength(1);
    const columnas = sets[0][1].split(",").map((c) => c.trim().split(/\s*=/)[0].trim()).filter(Boolean);
    expect(columnas).toEqual(["proveedor_codigo"]);
  });

  it("🔑 nunca pisa un código que ya está puesto", () => {
    expect(CODIGO).toMatch(/r\.proveedor_codigo IS NULL/i);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * BARRIDO SOBRE LAS RUTAS REALES. Sin esto, la lógica de arriba puede estar
 * perfecta y la ficha seguir uniendo por nombre a tres archivos de distancia.
 * ⚠️ Se leen SIN COMENTARIOS: los tres archivos EXPLICAN lo que prohíben.
 * ─────────────────────────────────────────────────────────────────────────── */
const leerRuta = (...p: string[]) =>
  readFileSync(join(process.cwd(), ...p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

describe("🔴 la ficha del proveedor NO vuelve a unir por nombre", () => {
  const RUTA_FICHA = ["src", "app", "api", "proveedores", "[key]", "route.ts"];

  it("usa el par (empresa, código) y no compara el nombre del reclamo", () => {
    const codigo = leerRuta(...RUTA_FICHA);
    expect(codigo).toMatch(/paresDelProveedor/);
    expect(codigo).toMatch(/reclamosDelProveedor/);
    // El pecado original, en todas sus formas.
    expect(codigo).not.toMatch(/normProvName\(\s*r\.proveedor/);
    expect(codigo).not.toMatch(/\.proveedor\s*===/);
    expect(codigo).not.toMatch(/\bilike\b/i);
  });

  it("pide `proveedor_codigo` en el select — sin la columna no hay par", () => {
    expect(leerRuta(...RUTA_FICHA)).toMatch(/proveedor_codigo/);
  });
});

describe("🔴 el reclamo nace y se edita con su código", () => {
  it("el POST lo escribe desde el mapa del servidor", () => {
    const codigo = leerRuta("src", "app", "api", "reclamos", "route.ts");
    expect(codigo).toMatch(/datosDeEmpresa/);
    expect(codigo).toMatch(/proveedor_codigo:/);
  });

  it("el PATCH lo rehace cuando cambia la empresa", () => {
    // Dejar el código viejo ataría el reclamo al proveedor de la empresa anterior.
    const codigo = leerRuta("src", "app", "api", "reclamos", "[id]", "route.ts");
    expect(codigo).toMatch(/datosDeEmpresa/);
    expect(codigo).toMatch(/updates\.proveedor_codigo\s*=\s*empInfo\.proveedor_codigo/);
  });
});
