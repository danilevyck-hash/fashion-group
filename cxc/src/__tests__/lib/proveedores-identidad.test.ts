// ─────────────────────────────────────────────────────────────────────────────
// 🔴 UN PROVEEDOR, UNA FILA — Y NUNCA POR LA CÉDULA NI POR PARECIDO.
//
// Este candado protege dos cosas que se decidieron el 6-sep-2026 y que no se
// pueden volver a romper:
//
//   1. **Quién es quién sale de una LISTA ESCRITA A MANO** (`proveedor_amarre`,
//      grano `(empresa_key, proveedor_switch_id)`), como se hizo con las
//      grafías de Reynaldo en Comisiones. La resuelve UNA función,
//      `aplicarAmarre`, y la usan la lista, la ficha, el buscador y el Excel.
//
//   2. 🩸 **LA CÉDULA NO DECIDE, Y EL PARECIDO TAMPOCO.** Daniel, textual:
//      *«no te fijes por la cédula, solo por nombre para saber cuáles son
//      iguales»*. Está MEDIDO: de los seis grupos de filas que comparten
//      identificación, **TRES son empresas distintas** —
//        · `FASHION WEAR, INC` ($76,165.72) NO es Confecciones Boston
//          («fashion wear no es boston»),
//        · `CIF EXPRESS SA.` NO es `Luis Alberto Torres De Gracias`,
//        · `ACTIVE SHOES S.A` NO es `BDL SERVICES INC`.
//      Y al revés: **American Fashion Wear, el proveedor más grande del grupo
//      ($3,633,293.25), tiene DOS cédulas** que difieren en un guion, así que
//      agrupar por cédula lo partiría en dos.
//
// Las 65 filas de abajo son las REALES de producción, medidas el 6-sep-2026
// (`scripts/_medir-proveedores-amarre.mjs`). Con ellas se comprueba que la
// lista pasa de **47 a 43 filas** y que el total **$5,199,705.82 no se mueve
// ni un centavo**: esto reagrupa, no cambia plata.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

// `buildList`/`buildFicha` son puras pero viven en un módulo que crea el cliente
// de Supabase al importarse. Acá no se toca la base.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));
import {
  aplicarAmarre,
  claveDeFila,
  indexarAmarres,
  normProvName,
  NO_SON_EL_MISMO,
  type AmarreProveedor,
} from "@/lib/proveedores/identidad";
import { buildFicha, buildList, type ProveedorRow } from "@/lib/proveedores/lista";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const MIGRACION = "supabase/migrations/20261010120000_proveedor_amarre.sql";

// ── LAS 65 FILAS REALES ─────────────────────────────────────────────────────
// [empresa_key, proveedor_switch_id, codigo, nombre, identificacion, saldo]
const FILAS: readonly [string, number, string | null, string, string | null, number][] = [
  ["active_shoes", 1, "1", "GENERAL", "0000000001", 0],
  ["active_shoes", 2, "122", "LATIN FITNESS GROUP", null, 206954.76],
  ["active_shoes", 3, "123", "MACK IMPORT & EXPORT", "155620473-2-2016", 10352.71],
  ["active_shoes", 4, "124", "CONFECCIONES BOSTON S.A", "655-544-133465", 0],
  ["active_shoes", 5, "125", "AMERICAN DESIGNER FASHION", null, 0],
  ["active_shoes", 6, "116", "DISPLAY BUSINESS", null, 0],
  ["active_shoes", 7, "117", "INMOBILIARIA  HENRYMAR, S.A.", "13709-182-134437", 0],
  ["active_shoes", 8, "118", "GRUPO J NAVARRO", "2023672-1-743774", 0],
  ["active_shoes", 9, "129", "ACTIVE WEAR, S.A.", "155727673-2-2022", 43806.1],
  ["active_shoes", 10, "1110", "BDL SERVICES INC", "155727670-2-2022", 0],
  ["active_wear", 1, "1", "GENERAL", "0000000001", -284.62],
  ["active_wear", 3, "113", "LATIN FITNESS GROUP", "0", 81430.83],
  ["active_wear", 4, "114", "MACK IMPORT & EXPORT", "155620473-2-2016", 20233.34],
  ["active_wear", 5, "125", "BELI 18, S.A.", "155713975-2-2021", 3655.8],
  ["active_wear", 6, "126", "AMERICAN UNIQUE BRANDS SA", null, 6471.62],
  ["american_classic", 1, "1", "GENERAL", "0000000001", 0],
  ["american_classic", 2, "112", "FASHION WEAR, INC", "655-544-133465", 76165.72],
  ["american_classic", 3, "113", "VISTANA INTERNATIONAL PANAMA, S.A.", "626251-1-455645", 22418.64],
  ["american_classic", 4, "114", "FASHION SHOES HOLDINGS, S.A.", "155638923-2-2016", 12016.63],
  ["american_classic", 8, "118", "ACTIVE SHOES S.A", "155727670-2-2022", -2032.57],
  ["american_classic", 9, "119", "American Unique Brands SA", "155746380-2-2024", 11686.56],
  ["american_classic", 10, "1110", "LATIN FITNESS GROUP INC.", null, -26.75],
  ["american_classic", 11, "120", "ACTIVE WEAR SA", "155727673-2-2022", 8673.42],
  ["american_classic", 12, "1112", "FASHION FITNESS RETAIL MP, INC.", "155724880-2-2022", 0],
  ["american_classic", 14, "1114", "JOYSTEP CORP", "155769235-2-2025", -4786.11],
  ["american_classic", 17, "1117", "AMERICAN  SPORTSWEAR", null, 0],
  ["american_classic", 19, "6", "GRAFICO  PANAMA", "155593349-2-2015", 240.75],
  ["american_classic", 21, "1321", "CONFECCIONES BOSTON S A", "655-544-133465", 80.25],
  ["fashion_shoes", 1, "1", "GENERAL", "0000000001", 0],
  ["fashion_shoes", 2, "112", "American Fashion Wear, SA", "2238988-1779356", 1338175.39],
  ["fashion_shoes", 15, "113", "American Sportswear, S.A.", "21154-184-190522", 0],
  ["fashion_wear", 1, "1", "GENERAL", "0000000001", 0],
  ["fashion_wear", 2, "122", "American Fashion Wear, SA", "2238988-1-779356", 2295117.86],
  ["fashion_wear", 6, "2", "MOVADO GROUP, INC.", "0000-1-000", 11323.53],
  ["fashion_wear", 8, "3", "CIF EXPRESS SA.", "40254-103-278837", 1530.36],
  ["fashion_wear", 11, "4", "American Sportswear, S.A.", "21154-184-190522", 0],
  ["fashion_wear", 12, "1812", "TRANSPORTE Y SERVICIOS JEDIDAS", "972694-1-530297", -5290.04],
  ["fashion_wear", 13, "5", "CONFECCIONES BOSTON  S.A", "655-544-133465", 367.55],
  ["fashion_wear", 38, "6", "ULTRACOM", "1091-157-111481", 0],
  ["fashion_wear", 39, "7", "ILLUMINATIONS  USA CORP", "1838853-1-711641", 0],
  ["fashion_wear", 40, "8", "OFFICE OUTLET S,A", "155657269-2-2017", 0],
  ["fashion_wear", 41, "1641", "THALIA INTERNACIONAL, S.A.", "1942627-1-730225", 28676],
  ["fashion_wear", 42, "1642", "DAVID QUINTERO CAR SERVICES", "8-317-755", 230.59],
  ["fashion_wear", 43, "1643", "CORPORACION REPSA, S.A.", "155633418-2-2016", 73.38],
  ["fashion_wear", 44, "1644", "ALTA EFICIENCIA, S.A.", "155618022-2-2015", 26.75],
  ["fashion_wear", 45, "1645", "EQUIPOS Y SERVICIOS R, S.A.", "133464-1-387172", 84.53],
  ["fashion_wear", 46, "1646", "REFRISTORE, S.A.", "1767235-1-699413", 146.86],
  ["fashion_wear", 47, "1447", "Luis Alberto Torres De Gracias", "40254-103-278837", 2214.9],
  ["joystep", 1, "1", "GENERAL", "0000000001", 0],
  ["joystep", 2, "112", "JCBBRANDS", null, 16165.61],
  ["joystep", 3, "123", "CONFECCIONES BOSTON", "655-544-133465", 3718.16],
  ["joystep", 4, "124", "IMPRESORA COMERCIAL", "1681734-1-682377", 160.52],
  ["joystep", 5, "125", "GRUPO MONAT, S.A.", "155654260-2-2017 DV 90", 1144.9],
  ["vistana", 1, "1", "GENERAL", "0000000001", 0],
  ["vistana", 2, "01", "American Designer Fashion", "2506356-1-819710", 1003040.53],
  ["vistana", 4, "02", "AQUALINDA PANAMA S.A", "2600069-1-833752", 2377.28],
  ["vistana", 5, "115", "LATIN FITNESS GROUP", null, 0],
  ["vistana", 7, "177", "TRANSPORTE Y SERVICIOS JEDIDAS", "972694-1-530297", 0],
  ["vistana", 8, "03", "REFAH PHARMACEUTICAL S.A", "155666676-2-2018", 1438.08],
  ["vistana", 9, "179", "CONFECCIONES BOSTON", "655-544-133465", 0],
  ["vistana", 10, "1710", "GRUPO J NAVARRO, S.A.", "2023672-1-743774", 0],
  ["vistana", 11, "1711", "IMPRESORA COMERCIAL", "1681734-1-682377", 0],
  ["vistana", 12, "1712", "BIG TIME, S.A.", "956823-1-527095", 0],
  ["vistana", 20, "1420", "Kathiana Yashira Espinoza Sanguillen", "3-736-316", 1926],
  ["vistana", 21, "1421", "Tansporte De Logistuc", "55555", 0],
];

const filas = FILAS.map(([empresa_key, proveedor_switch_id, codigo, nombre, identificacion, saldo_total]) => ({
  empresa_key, proveedor_switch_id, codigo, nombre, identificacion, saldo_total,
}));

// Los CUATRO grupos de la migración, leídos de ella misma para que agregar uno
// en el SQL sin decirlo acá (o al revés) ponga el build rojo.
function amarresDeLaMigracion(): AmarreProveedor[] {
  const sql = leer(MIGRACION);
  const cuerpo = sql.slice(sql.indexOf("INSERT INTO proveedor_amarre"), sql.indexOf("ON CONFLICT DO NOTHING"));
  const salida: AmarreProveedor[] = [];
  const re = /\(\s*'([a-z_]+)'\s*,\s*(\d+)\s*,\s*(?:'((?:[^']|'')*)'|NULL)\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*(?:'((?:[^']|'')*)'|NULL)\s*\)/g;
  for (const m of cuerpo.matchAll(re)) {
    salida.push({
      empresa_key: m[1],
      proveedor_switch_id: Number(m[2]),
      proveedor_canonico: m[5].replace(/''/g, "'"),
      nombre_mostrado: m[6] == null ? null : m[6].replace(/''/g, "'"),
    });
  }
  return salida;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** La agrupación tal como la hace la pantalla. `[]` = sin amarres (lo de antes). */
function agrupar(amarres: readonly AmarreProveedor[]) {
  const indice = indexarAmarres(amarres);
  const m = new Map<string, { saldo: number; empresas: Set<string>; filas: number }>();
  for (const f of filas) {
    const { clave } = aplicarAmarre(f, indice);
    if (!m.has(clave)) m.set(clave, { saldo: 0, empresas: new Set(), filas: 0 });
    const g = m.get(clave)!;
    g.saldo = round2(g.saldo + f.saldo_total);
    g.empresas.add(f.empresa_key);
    g.filas += 1;
  }
  return m;
}

const totalDe = (m: ReturnType<typeof agrupar>) =>
  round2([...m.values()].reduce((s, g) => s + g.saldo, 0));

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 la identidad sale del amarre, no del nombre ni de la cédula", () => {
  const amarres = amarresDeLaMigracion();

  it("el amarre cruza por (empresa, proveedor_switch_id) — el nombre no manda", () => {
    // Misma empresa, MISMO nombre, id distinto: solo la fila amarrada cambia.
    const amarrada = { empresa_key: "joystep", proveedor_switch_id: 3, nombre: "CONFECCIONES BOSTON" };
    const impostora = { empresa_key: "joystep", proveedor_switch_id: 999, nombre: "CONFECCIONES BOSTON" };
    expect(aplicarAmarre(amarrada, amarres).amarrada).toBe(true);
    expect(aplicarAmarre(impostora, amarres).amarrada).toBe(false);
  });

  it("la clave de una fila es empresa#id, y no colisiona entre empresas", () => {
    // 🩸 10 códigos nombran proveedores distintos según la empresa: `122` es
    // American Fashion Wear en Fashion Wear y Latin Fitness en Active Shoes.
    expect(claveDeFila("fashion_wear", 2)).not.toBe(claveDeFila("active_shoes", 2));
    const claves = new Set(filas.map((f) => claveDeFila(f.empresa_key, f.proveedor_switch_id)));
    expect(claves.size).toBe(65);
  });

  it("🩸 el CÓDIGO solo no alcanza: 10 códigos nombran proveedores distintos", () => {
    const porCodigo = new Map<string, Set<string>>();
    for (const f of filas) {
      if (!f.codigo) continue;
      if (!porCodigo.has(f.codigo)) porCodigo.set(f.codigo, new Set());
      porCodigo.get(f.codigo)!.add(normProvName(f.nombre));
    }
    const ambiguos = [...porCodigo.values()].filter((s) => s.size > 1).length;
    expect(ambiguos).toBe(10);
  });

  it("FALLA ABIERTO: sin amarres la agrupación es EXACTAMENTE la de antes (47 filas)", () => {
    const sinAmarre = agrupar([]);
    expect(sinAmarre.size).toBe(47);
    expect(totalDe(sinAmarre)).toBe(5199705.82);
    for (const f of filas) {
      expect(aplicarAmarre(f, []).clave).toBe(normProvName(f.nombre));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 la lista se reagrupa y el total NO se mueve", () => {
  const antes = agrupar([]);
  const despues = agrupar(amarresDeLaMigracion());

  it("47 filas antes, 43 después", () => {
    expect(antes.size).toBe(47);
    expect(despues.size).toBe(43);
  });

  it("con saldo: 34 antes, 31 después", () => {
    const conSaldo = (m: typeof antes) => [...m.values()].filter((g) => Math.abs(g.saldo) >= 0.005).length;
    expect(conSaldo(antes)).toBe(34);
    expect(conSaldo(despues)).toBe(31);
  });

  it("🔴 el total queda intacto al centavo: $5,199,705.82", () => {
    expect(totalDe(antes)).toBe(5199705.82);
    expect(totalDe(despues)).toBe(5199705.82);
  });

  it("Confecciones Boston: de TRES filas a UNA, $4,165.96, 5 empresas", () => {
    const partido = [...antes.keys()].filter((k) => k.startsWith("CONFECCIONES BOSTON"));
    expect(partido.sort()).toEqual([
      "CONFECCIONES BOSTON", "CONFECCIONES BOSTON S A", "CONFECCIONES BOSTON SA",
    ]);
    const uno = despues.get("CONFECCIONES BOSTON")!;
    expect(uno.saldo).toBe(4165.96);
    expect(uno.filas).toBe(5);
    expect([...uno.empresas].sort()).toEqual([
      "active_shoes", "american_classic", "fashion_wear", "joystep", "vistana",
    ]);
  });

  it("los otros tres grupos quedan con su monto medido", () => {
    expect(despues.get("ACTIVE WEAR SA")!.saldo).toBe(52479.52);
    expect(despues.get("ACTIVE WEAR SA")!.empresas.size).toBe(2);
    expect(despues.get("GRUPO J NAVARRO")!.saldo).toBe(0);
    expect(despues.get("GRUPO J NAVARRO")!.empresas.size).toBe(2);
    expect(despues.get("LATIN FITNESS GROUP")!.saldo).toBe(288358.84);
    expect(despues.get("LATIN FITNESS GROUP")!.empresas.size).toBe(4);
  });

  it("🔴 SOLO esos cuatro: ninguna otra fila de la lista se movió", () => {
    const cuatro = new Set(["ACTIVE WEAR SA", "GRUPO J NAVARRO", "CONFECCIONES BOSTON", "LATIN FITNESS GROUP"]);
    for (const [clave, g] of despues) {
      if (cuatro.has(clave)) continue;
      expect(antes.get(clave)?.saldo).toBe(g.saldo);
      expect(antes.get(clave)?.filas).toBe(g.filas);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🩸 LOS QUE COMPARTEN CÉDULA Y NO SON EL MISMO", () => {
  const despues = agrupar(amarresDeLaMigracion());

  it("hay CUATRO cédulas repetidas con nombres distintos, y 3 son empresas distintas", () => {
    const porCedula = new Map<string, Set<string>>();
    for (const f of filas) {
      const c = (f.identificacion ?? "").trim();
      if (!c) continue;
      if (!porCedula.has(c)) porCedula.set(c, new Set());
      porCedula.get(c)!.add(normProvName(f.nombre));
    }
    const repetidas = [...porCedula.entries()].filter(([, s]) => s.size > 1).map(([c]) => c).sort();
    expect(repetidas).toEqual([
      "155727670-2-2022", "2023672-1-743774", "40254-103-278837", "655-544-133465",
    ]);
    expect(NO_SON_EL_MISMO.map((n) => n.cedula).sort()).toEqual([
      "155727670-2-2022", "40254-103-278837", "655-544-133465",
    ]);
    // 🔴 Y con los DOS nombres de cada par: media pareja no dice nada.
    expect(NO_SON_EL_MISMO.map((n) => [...n.nombres].sort())).toEqual([
      ["CONFECCIONES BOSTON", "FASHION WEAR, INC"],
      ["CIF EXPRESS SA.", "Luis Alberto Torres De Gracias"],
      ["ACTIVE SHOES S.A", "BDL SERVICES INC"],
    ]);
    for (const n of NO_SON_EL_MISMO) {
      expect(n.nombres.length).toBe(2);
      // Los dos nombres existen de verdad en producción.
      for (const nombre of n.nombres) {
        expect(filas.some((f) => f.nombre === nombre || normProvName(f.nombre) === normProvName(nombre)), nombre).toBe(true);
      }
    }
  });

  it("🔴 FASHION WEAR, INC no cae en Confecciones Boston ($76,165.72 aparte)", () => {
    const fw = filas.find((f) => f.nombre === "FASHION WEAR, INC")!;
    expect(fw.identificacion).toBe("655-544-133465"); // la MISMA cédula de Boston
    expect(aplicarAmarre(fw, amarresDeLaMigracion()).clave).toBe("FASHION WEAR INC");
    expect(despues.get("FASHION WEAR INC")!.saldo).toBe(76165.72);
    expect(despues.get("CONFECCIONES BOSTON")!.saldo).toBe(4165.96);
  });

  it("🔴 CIF EXPRESS y Luis Alberto Torres siguen separados (misma cédula)", () => {
    expect(despues.get("CIF EXPRESS SA")!.saldo).toBe(1530.36);
    expect(despues.get("LUIS ALBERTO TORRES DE GRACIAS")!.saldo).toBe(2214.9);
  });

  it("🔴 ACTIVE SHOES S.A y BDL SERVICES siguen separados (misma cédula)", () => {
    expect(despues.get("ACTIVE SHOES SA")!.saldo).toBe(-2032.57);
    expect(despues.get("BDL SERVICES INC")!.saldo).toBe(0);
  });

  it("🩸 American Fashion Wear tiene DOS cédulas y sigue en UNA fila ($3,633,293.25)", () => {
    // Es la prueba de que unir por cédula lo partiría en dos.
    const suyas = filas.filter((f) => normProvName(f.nombre) === "AMERICAN FASHION WEAR SA");
    expect(new Set(suyas.map((f) => f.identificacion)).size).toBe(2);
    expect(despues.get("AMERICAN FASHION WEAR SA")!.saldo).toBe(3633293.25);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EL BARRIDO: nadie agrupa por cédula ni por parecido", () => {
  // Todos los archivos del módulo Proveedores.
  const CARPETAS = ["src/lib/proveedores", "src/app/proveedores", "src/app/api/proveedores"];

  function archivosDe(rel: string): string[] {
    const raiz = path.join(RAIZ, rel);
    const salida: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const completo = path.join(dir, e.name);
        if (e.isDirectory()) recorrer(completo);
        else if (/\.(ts|tsx)$/.test(e.name)) salida.push(completo);
      }
    };
    recorrer(raiz);
    return salida;
  }

  it("las tres carpetas existen (si no, el barrido no barre nada)", () => {
    // 🩸 Un barrido sobre una carpeta que no existe pasa en VERDE sin mirar un
    // solo archivo. Es la trampa clásica de este tipo de candado.
    for (const c of CARPETAS) {
      expect(fs.existsSync(path.join(RAIZ, c))).toBe(true);
      expect(archivosDe(c).length).toBeGreaterThan(0);
    }
  });

  it("🔴 el módulo que decide la identidad no menciona la cédula ni una vez", () => {
    // Si alguien vuelve a mirar `identificacion` para decidir quién es quién,
    // tiene que pasar por acá primero.
    expect(leer("src/lib/proveedores/identidad.ts")).not.toMatch(/\bidentificacion\b/);
  });

  it("🔴 ninguna línea usa la cédula para agrupar", () => {
    const AGRUPA = /\b(Map|Set|group|agrupar|byKey|clave|key|reduce|onConflict|join)\b/;
    for (const c of CARPETAS) {
      for (const archivo of archivosDe(c)) {
        const texto = fs.readFileSync(archivo, "utf8");
        texto.split("\n").forEach((linea, i) => {
          if (!/\bidentificacion\b/.test(linea)) return;
          if (linea.trimStart().startsWith("//") || linea.trimStart().startsWith("*")) return;
          expect(
            AGRUPA.test(linea),
            `${path.relative(RAIZ, archivo)}:${i + 1} agrupa por cédula: ${linea.trim()}`,
          ).toBe(false);
        });
      }
    }
  });

  it("🔴 nada de parecido: ni distancia de edición, ni trigramas, ni fonética", () => {
    // Tokens distintivos: ninguno aparece por casualidad dentro de otra
    // palabra del repo, así que no hace falta borde — y así `gin_trgm_ops` o
    // `proveedor_amarre_trigram_idx` tampoco se escapan.
    const PROHIBIDO =
      /(levenshtein|similarity|similitud|fuzzy|soundex|metaphone|jaro|winkler|trigram|trgm|parecido|distancia_edicion)/i;
    const archivos = CARPETAS.flatMap(archivosDe).concat(path.join(RAIZ, MIGRACION));
    for (const archivo of archivos) {
      // La palabra puede aparecer en un comentario que la PROHÍBE; lo que no
      // puede es aparecer en una línea de código.
      fs.readFileSync(archivo, "utf8").split("\n").forEach((linea) => {
        if (!PROHIBIDO.test(linea)) return;
        const t = linea.trimStart();
        // Prosa: un comentario, o la continuación del texto de un COMMENT ON
        // en el SQL (que empieza con comilla simple).
        const esProsa =
          t.startsWith("//") || t.startsWith("*") || t.startsWith("--") || t.startsWith("/*") ||
          (archivo.endsWith(".sql") && t.startsWith("'"));
        expect(esProsa, `${path.relative(RAIZ, archivo)}: ${linea.trim()}`).toBe(true);
      });
    }
  });

  it("🔴 la agrupación pasa por aplicarAmarre y por nada más", () => {
    const lista = leer("src/lib/proveedores/lista.ts");
    expect(lista).toContain("aplicarAmarre");
    // La clave de agrupación ya no se calcula a mano en la lista.
    expect(lista).not.toMatch(/const\s+k\s*=\s*normProvName\(r\.nombre\)/);
    // La ficha y los reclamos leen las MISMAS filas que la lista.
    expect(leer("src/app/api/proveedores/[key]/route.ts")).toContain("filasDelProveedor(rows, key, amarres)");
    expect(leer("src/app/api/proveedores/route.ts")).toContain(
      'buildList(rows, { empresa: sp.get("empresa"), q: sp.get("q"), amarres })',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 la migración: los cuatro grupos, soft delete y nada de DELETE", () => {
  const sql = leer(MIGRACION);

  it("carga EXACTAMENTE 13 filas: los 4 grupos que Daniel confirmó", () => {
    const a = amarresDeLaMigracion();
    expect(a.length).toBe(13);
    const porCanonico = new Map<string, number>();
    for (const x of a) porCanonico.set(x.proveedor_canonico, (porCanonico.get(x.proveedor_canonico) ?? 0) + 1);
    expect([...porCanonico.entries()].sort()).toEqual([
      ["ACTIVE WEAR SA", 2],
      ["CONFECCIONES BOSTON", 5],
      ["GRUPO J NAVARRO", 2],
      ["LATIN FITNESS GROUP", 4],
    ]);
  });

  it("cada fila del amarre existe de verdad en producción", () => {
    for (const x of amarresDeLaMigracion()) {
      const real = filas.find(
        (f) => f.empresa_key === x.empresa_key && f.proveedor_switch_id === x.proveedor_switch_id,
      );
      expect(real, `${x.empresa_key}#${x.proveedor_switch_id} no existe`).toBeTruthy();
    }
  });

  it("el nombre que se muestra es SIEMPRE una grafía real de Switch", () => {
    // 🔴 Acá no se inventan nombres.
    const reales = new Set(filas.map((f) => f.nombre.replace(/\s+/g, " ").trim()));
    for (const x of amarresDeLaMigracion()) {
      if (!x.nombre_mostrado) continue;
      expect(reales.has(x.nombre_mostrado), `inventado: ${x.nombre_mostrado}`).toBe(true);
    }
  });

  it("soft delete FIRMADO, única entre activas, RLS service_role", () => {
    expect(sql).toMatch(/activo\s+boolean\s+NOT NULL DEFAULT true/);
    expect(sql).toMatch(/proveedor_amarre_baja_firmada/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX[^;]*proveedor_amarre_fila_activa_idx[^;]*WHERE activo/s);
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toMatch(/CREATE POLICY service_role_all ON proveedor_amarre/);
  });

  it("🔴 NUNCA un DELETE, y nada de DROP a la tabla", () => {
    expect(sql).not.toMatch(/\bDELETE\s+FROM\s+proveedor_amarre/i);
    expect(sql).not.toMatch(/DROP\s+TABLE[^;]*proveedor_amarre/i);
    // Y ninguna otra migración puede dropearla.
    const dir = path.join(RAIZ, "supabase/migrations");
    for (const f of fs.readdirSync(dir)) {
      const t = fs.readFileSync(path.join(dir, f), "utf8");
      expect(t, f).not.toMatch(/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?proveedor_amarre\b/i);
    }
  });

  it("los tres «no son el mismo» quedan escritos en la migración y en el código", () => {
    for (const n of NO_SON_EL_MISMO) {
      expect(sql).toContain(n.cedula);
      expect(sql.toLowerCase()).toContain(n.daniel.toLowerCase());
    }
  });

  it("la tabla entra al respaldo (nada escrito a mano se queda sin copia)", () => {
    expect(leer("src/lib/backup/tablas.ts")).toMatch(/^\s*"proveedor_amarre",\s*$/m);
    // Y se copia DE VERDAD: una línea comentada no respalda nada.
    expect(leer("src/app/api/cron/backup/route.ts")).toMatch(
      /^\s*\{ table: "proveedor_amarre" \},\s*$/m,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 LA PANTALLA: una fila, su saldo y de qué empresas viene", () => {
  const amarres = amarresDeLaMigracion();
  // Las filas con la forma que pide `buildList` (aging vacío: acá se mide el
  // agrupado, no los tramos, que ya tienen su propio candado).
  const rows: ProveedorRow[] = filas.map((f) => ({
    ...f,
    dv: null, direccion: null, contacto: null, telefono: null, celular: null,
    email: null, tipo_proveedor: null, aging: [],
    ultimo_pago_monto: null, ultimo_pago_fecha: null, ultimo_pago_dias: null,
    synced_at: null,
  }));

  it("la lista trae 43 filas y el mismo total de siempre", () => {
    const { proveedores, total, grupo_saldo } = buildList(rows, { amarres });
    expect(total).toBe(43);
    expect(proveedores.length).toBe(43);
    expect(grupo_saldo).toBe(5199705.82);
  });

  it("🔴 cada fila dice DE QUÉ EMPRESAS viene, la de más saldo primero", () => {
    const { proveedores } = buildList(rows, { amarres });
    const boston = proveedores.find((p) => p.key === "CONFECCIONES BOSTON")!;
    expect(boston.saldo_total).toBe(4165.96);
    // joystep $3.718,16 · fashion_wear $367,55 · american_classic $80,25 · los
    // dos en cero al final, por nombre.
    expect(boston.empresas).toEqual([
      "joystep", "fashion_wear", "american_classic", "active_shoes", "vistana",
    ]);
    expect(boston.empresas_count).toBe(5);
  });

  it("el nombre que se muestra sale del amarre y sin espacios dobles", () => {
    const { proveedores } = buildList(rows, { amarres });
    // 🩸 Switch manda «CONFECCIONES BOSTON  S.A» con DOS espacios; eso no se
    // enseña. Sin amarre mandaría esa grafía, por ser la más larga.
    expect(proveedores.find((p) => p.key === "CONFECCIONES BOSTON")!.nombre)
      .toBe("CONFECCIONES BOSTON S.A");
    expect(proveedores.find((p) => p.key === "LATIN FITNESS GROUP")!.nombre)
      .toBe("LATIN FITNESS GROUP INC.");
  });

  it("🩸 sin amarre, el nombre pierde el espacio doble que manda Switch", () => {
    // `AMERICAN  SPORTSWEAR` (Multifashion) llega con DOS espacios y no tiene
    // amarre: es la regla de siempre, solo que ya no se enseña el espacio.
    const { proveedores } = buildList(rows, { amarres });
    expect(filas.some((f) => f.nombre === "AMERICAN  SPORTSWEAR")).toBe(true);
    expect(proveedores.find((p) => p.key === "AMERICAN SPORTSWEAR")!.nombre)
      .toBe("AMERICAN SPORTSWEAR");
  });

  it("🔴 el nombre ESCRITO A MANO le gana a la grafía más larga", () => {
    // Hoy los cuatro nombres escritos coinciden con la grafía más larga, así
    // que la regla se prueba con un amarre a propósito distinto: si el escrito
    // dejara de mandar, la fila volvería a llamarse como la escribió Switch.
    const escrito: AmarreProveedor[] = [
      ...amarres.filter((a) => a.proveedor_canonico !== "GRUPO J NAVARRO"),
      { empresa_key: "active_shoes", proveedor_switch_id: 8, proveedor_canonico: "GRUPO J NAVARRO", nombre_mostrado: "Grupo J Navarro" },
      { empresa_key: "vistana", proveedor_switch_id: 10, proveedor_canonico: "GRUPO J NAVARRO", nombre_mostrado: "Grupo J Navarro" },
    ];
    const { proveedores } = buildList(rows, { amarres: escrito });
    expect(proveedores.find((p) => p.key === "GRUPO J NAVARRO")!.nombre).toBe("Grupo J Navarro");
    // Y la ficha dice con qué grafías llega, para que se entienda la suma.
    expect(buildFicha(rows, "GRUPO J NAVARRO", escrito)!.grafias)
      .toEqual(["GRUPO J NAVARRO", "GRUPO J NAVARRO, S.A."]);
  });

  it("🔴 buscar «boston» encuentra la fila, se muestre con la grafía que se muestre", () => {
    const { proveedores } = buildList(rows, { amarres, q: "boston" });
    // Boston (una fila) + FASHION WEAR, INC no (no dice boston).
    expect(proveedores.map((p) => p.key)).toEqual(["CONFECCIONES BOSTON"]);
  });

  it("🔴 buscar por una grafía que ya NO se muestra también encuentra", () => {
    // Multifashion escribe «CONFECCIONES BOSTON S A» (con espacios). Esa
    // grafía ya no se muestra —la fila dice «CONFECCIONES BOSTON S.A»— y aun
    // así tiene que encontrarse: si el buscador solo mirara lo que se enseña,
    // quien busque como está escrito en SU empresa no encontraría nada.
    expect(normProvName("CONFECCIONES BOSTON S.A")).not.toContain("BOSTON S A");
    const { proveedores } = buildList(rows, { amarres, q: "boston s a" });
    expect(proveedores.map((p) => p.key)).toEqual(["CONFECCIONES BOSTON"]);
  });

  it("la ficha suma las 5 empresas de Boston y dice las otras grafías", () => {
    const f = buildFicha(rows, "CONFECCIONES BOSTON", amarres)!;
    expect(f.total_grupo.por_pagar).toBe(4165.96);
    expect(f.empresas.map((e) => e.empresa).sort()).toEqual([
      "active_shoes", "american_classic", "fashion_wear", "joystep", "vistana",
    ]);
    expect(f.grafias).toEqual(["CONFECCIONES BOSTON", "CONFECCIONES BOSTON S A"]);
  });

  it("filtrar por una empresa no cambia quién es quién", () => {
    const { proveedores } = buildList(rows, { amarres, empresa: "joystep" });
    const boston = proveedores.find((p) => p.key === "CONFECCIONES BOSTON")!;
    expect(boston.saldo_total).toBe(3718.16);
    expect(boston.empresas).toEqual(["joystep"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔑 la lectura del amarre falla ABIERTA", () => {
  it("con la tabla ausente o un error, devuelve lista vacía en vez de romper", () => {
    const src = leer("src/lib/proveedores/amarre-lectura.ts");
    expect(src).toMatch(/if\s*\(error\)\s*\{[\s\S]{0,200}return \[\];/);
    expect(src).not.toMatch(/throw new Error/);
  });

  it("la lista y la ficha piden los amarres, pero no dependen de ellos", () => {
    expect(leer("src/app/api/proveedores/route.ts")).toContain("leerAmarresProveedor()");
    expect(leer("src/app/api/proveedores/[key]/route.ts")).toContain("leerAmarresProveedor()");
  });
});
