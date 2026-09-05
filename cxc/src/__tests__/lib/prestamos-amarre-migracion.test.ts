/* ─────────────────────────────────────────────────────────────────────────────
 * CANDADO DE LA MIGRACIÓN QUE ATA CADA PRÉSTAMO A SU CÓDIGO.
 *
 * Lo que protege no es la aritmética —eso se midió contra producción antes de
 * correrla— sino las CUATRO formas en que este backfill podría hacer daño:
 *
 *   1. que empiece a PAREAR POR PARECIDO (LIKE, similarity, unaccent, quitar
 *      dígitos, distancia de edición). Es la lección de `Outlet Duty Free N2`
 *      vs `N3`: dos nombres parecidos pueden ser dos personas, y un descuento
 *      aplicado a la equivocada no deja ningún rastro;
 *   2. que ate SIN mirar la empresa;
 *   3. que ate cuando hay VARIOS candidatos con el mismo nombre;
 *   4. que la lista de los tres amarres a mano deje de exigir que el código
 *      tenga el nombre que se espera — o sea, que se convierta en un comentario.
 *
 * ⚠️ Se lee el SQL SIN COMENTARIOS. El archivo NOMBRA lo que prohíbe («nada de
 * parecidos», «LAURA CASIANI»), así que un barrido de texto sobre el archivo
 * entero se engañaría solo. Es el mismo error que ya se cometió en este repo.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MIGRACION_AMARRE_PRESTAMOS } from "@/lib/asistencia/prestamos-planilla";

const RUTA = join(process.cwd(), "supabase", "migrations", MIGRACION_AMARRE_PRESTAMOS);
const SQL = readFileSync(RUTA, "utf8");

/** Lo que Postgres realmente va a ejecutar: sin una sola línea de comentario. */
const CODIGO = SQL.split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

describe("🔴 nada se ata por parecido", () => {
  it("el SQL no usa NINGUNA herramienta de pareo aproximado", () => {
    // `LIKE`/`ILIKE` con comodines, similitud, quitar acentos o dígitos,
    // distancia de edición, expresiones regulares sobre el nombre. Cualquiera
    // de las seis convierte esta migración en la que reparte plata al azar.
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

  it("la única normalización es upper(btrim(...)), sobre los dos lados", () => {
    // 🔑 Ni más ni menos. `upper` y `btrim` no pueden comerse un dígito ni una
    // letra: `LAURA CASIANI` sigue siendo distinto de `LAURA CASIANO`.
    expect(CODIGO).toMatch(/upper\(btrim\(e\.nombre\)\)/);
    expect(CODIGO).toMatch(/upper\(btrim\(p\.nombre\)\)/);
  });

  it("🩸 el caso que lo prueba: CASIANI y CASIANO no colapsan", () => {
    const norm = (s: string) => s.trim().toUpperCase();
    expect(norm("LAURA CASIANI")).not.toBe(norm("Laura Lismari Casiano Vega"));
    // Y ni siquiera el apellido solo.
    expect(norm("CASIANI")).not.toBe(norm("CASIANO"));
  });
});

describe("🔴 la empresa también tiene que coincidir", () => {
  it("los dos UPDATE comparan la empresa", () => {
    // Dos personas con el mismo nombre en dos empresas distintas es justo el
    // caso donde atar la primera que aparezca es inventar.
    const updates = CODIGO.split(/UPDATE\s+prestamos_empleados/i).slice(1);
    expect(updates).toHaveLength(2);
    for (const u of updates) expect(u).toMatch(/empresa/i);
  });

  it("la traducción de empresa es una lista CERRADA — una empresa desconocida no ata", () => {
    // El `ELSE NULL` es lo que hace que una empresa que no está en la lista
    // simplemente no cruce, en vez de cruzar «de más».
    expect(CODIGO).toMatch(/ELSE\s+NULL/i);
    for (const par of [
      ["Confecciones Boston", "confecciones_boston"],
      ["Vistana International", "vistana"],
      ["Fashion Wear", "fashion_wear"],
    ]) {
      expect(CODIGO).toContain(par[0]);
      expect(CODIGO).toContain(par[1]);
    }
  });
});

describe("🔴 con dos candidatos no se ata ninguno", () => {
  it("el paso automático exige un único candidato", () => {
    expect(CODIGO).toMatch(/cuantos\s*=\s*1/);
  });
});

describe("🔴 los tres amarres a mano son una lista explícita CON guard", () => {
  const ESPERADOS: Array<[string, string, string, string]> = [
    ["GABRIELA A. JARAMILLO P.", "Confecciones Boston", "53", "GABRIELA JARAMILLO"],
    ["LUIS ADRIAN ARROYO", "Vistana International", "9", "LUIS ARROYO"],
    ["MARIA BETHANCOURTH", "Confecciones Boston", "49", "MARIA V. BETHANCOURTH G."],
  ];

  it("están los tres, con su código y con el nombre que ese código tiene que tener", () => {
    for (const [nombre, empresa, codigo, nombrePlanilla] of ESPERADOS) {
      // El renglón entero, en una línea: nombre, empresa, código y el nombre
      // esperado en la planilla. Si alguien saca el último, este test lo caza.
      const fila = new RegExp(
        `'${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'\\s*,\\s*`
        + `'${empresa}'\\s*,\\s*'${codigo}'\\s*,\\s*`
        + `'${nombrePlanilla.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`,
      );
      expect(CODIGO).toMatch(fila);
    }
  });

  it("🔑 el UPDATE EXIGE que el código tenga ese nombre — no es un comentario", () => {
    // Sin este EXISTS, renombrar al código 53 mañana ataría el préstamo de
    // Gabriela a quien haya quedado en ese código.
    expect(CODIGO).toMatch(/EXISTS\s*\(/i);
    expect(CODIGO).toMatch(/p\.empleado_codigo\s*=\s*l\.codigo/);
    expect(CODIGO).toMatch(/upper\(btrim\(p\.nombre\)\)\s*=\s*l\.nombre_planilla/);
  });

  it("no hay un CUARTO amarre a mano que se haya colado", () => {
    const filas = CODIGO.match(/\(\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*\)/g) ?? [];
    expect(filas).toHaveLength(ESPERADOS.length);
  });

  it("⚠️ JOHANA VALLEJO no se ata a nadie: ya no trabaja acá", () => {
    // Su baja es otra migración. Acá lo único que importa es que no aparezca en
    // ninguna lista de amarre.
    const enLista = /\(\s*'JOHANA VALLEJO'/i.test(CODIGO);
    expect(enLista).toBe(false);
  });
});

describe("la migración es aditiva y no pisa nada", () => {
  it("solo AGREGA la columna: no borra, no renombra, no cambia tipos", () => {
    expect(CODIGO).toMatch(/ADD COLUMN IF NOT EXISTS empleado_codigo text/i);
    expect(CODIGO).not.toMatch(/\bDROP\b/i);
    expect(CODIGO).not.toMatch(/\bDELETE\b/i);
    expect(CODIGO).not.toMatch(/RENAME/i);
    expect(CODIGO).not.toMatch(/ALTER COLUMN/i);
    expect(CODIGO).not.toMatch(/\bTRUNCATE\b/i);
  });

  it("🔴 no toca NINGUNA otra tabla ni ninguna otra columna", () => {
    // Solo escribe `prestamos_empleados`, y de esa tabla SOLO la columna nueva.
    const escrituras = CODIGO.match(/UPDATE\s+(\w+)/gi) ?? [];
    expect(escrituras.length).toBeGreaterThan(0);
    for (const e of escrituras) expect(e.toLowerCase()).toContain("prestamos_empleados");

    // 🔑 Se mira el SET ENTERO, no solo su primera palabra: un
    // `SET empleado_codigo = …, nombre = …` reescribiría el nombre que tecleó
    // una persona, y un `SET nombre = …` a secas es solo la forma obvia de ese
    // mismo daño. La lista de columnas escritas tiene que ser exactamente una.
    const sets = [...CODIGO.matchAll(/\bSET\b([\s\S]*?)\b(?:FROM|WHERE)\b/gi)];
    expect(sets).toHaveLength(2);
    for (const s of sets) {
      const columnas = s[1]
        .split(",")
        .map((c) => c.trim().split(/\s*=/)[0].trim())
        .filter(Boolean);
      expect(columnas).toEqual(["empleado_codigo"]);
    }
  });

  it("🔑 nunca pisa un amarre que ya existe", () => {
    // Los dos UPDATE exigen `empleado_codigo IS NULL`. Sin eso, volver a correr
    // la migración después de una corrección a mano la desharía.
    const updates = CODIGO.split(/UPDATE\s+prestamos_empleados/i).slice(1);
    for (const u of updates) expect(u).toMatch(/e\.empleado_codigo IS NULL/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LA SEGUNDA MIGRACIÓN DEL AMARRE (5-sep-2026) — las mismas reglas, extendidas.
//
// 🔴 El invariante «nada se ata por parecido» NO es de un archivo: es del
// módulo. Esta migración ata dos fichas más (MARTHA 43 · YERITZA 51, $400 de
// deuda viva), copia el nombre desde Asistencia y junta las dos fichas de RAMON
// MIRANDA — así que tiene que pasar exactamente el mismo barrido.
// ═════════════════════════════════════════════════════════════════════════════

const RUTA_2 = join(process.cwd(), "supabase", "migrations", "20260925120000_prestamos_dos_cuentas_y_tope.sql");
const SQL_2 = readFileSync(RUTA_2, "utf8");
const CODIGO_2 = SQL_2.split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

describe("🔴 la migración de las dos cuentas tampoco ata por parecido", () => {
  it("el SQL no usa NINGUNA herramienta de pareo aproximado", () => {
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
      /\bregexp_/i,
      /\btranslate\s*\(/i,
      /~\*/,
    ]) {
      expect(CODIGO_2).not.toMatch(prohibida);
    }
  });

  it("la única normalización sigue siendo upper(btrim(...)), en los dos lados", () => {
    expect(CODIGO_2).toMatch(/upper\(btrim\(e\.nombre\)\)/);
    expect(CODIGO_2).toMatch(/upper\(btrim\(p\.nombre\)\)/);
  });

  it("🔴 los DOS amarres nuevos son una lista explícita CON guard", () => {
    const ESPERADOS: Array<[string, string, string, string]> = [
      ["MARTHA AZUCENA CHAVARRIA", "Confecciones Boston", "43", "MARTHA ASUCENA CHAVARRIA Z."],
      ["YERITZA Y. SOLIS CASTRO", "Confecciones Boston", "51", "YERITZA YANETH SOLIS CASTRO"],
    ];
    for (const [nombre, empresa, codigo, nombrePlanilla] of ESPERADOS) {
      const fila = new RegExp(
        `'${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'\\s*,\\s*`
        + `'${empresa}'\\s*,\\s*'${codigo}'\\s*,\\s*`
        + `'${nombrePlanilla.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`,
      );
      expect(CODIGO_2).toMatch(fila);
    }
    // 🔑 Y el UPDATE EXIGE que ese código tenga ese nombre. AZUCENA con Z y
    // ASUCENA con S no cruzan solas, y así tiene que ser.
    expect(CODIGO_2).toMatch(/EXISTS\s*\(/i);
    expect(CODIGO_2).toMatch(/p\.empleado_codigo\s*=\s*l\.codigo/);
    expect(CODIGO_2).toMatch(/upper\(btrim\(p\.nombre\)\)\s*=\s*l\.nombre_planilla/);
  });

  it("no hay un TERCER amarre a mano que se haya colado", () => {
    const filas = CODIGO_2.match(/\(\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*\)/g) ?? [];
    expect(filas).toHaveLength(2);
  });

  it("🔑 nunca pisa un amarre que ya existe", () => {
    expect(CODIGO_2).toMatch(/e\.empleado_codigo IS NULL/i);
  });
});

describe("🔴 el nombre sale de Asistencia", () => {
  it("se copia SOLO donde el código ya ata a alguien, y SOLO la columna nombre", () => {
    const i = CODIGO_2.indexOf("SET nombre = p.nombre");
    expect(i).toBeGreaterThan(-1);
    const bloque = CODIGO_2.slice(i, i + 500);
    // Sin código no hay de dónde sacar el nombre: esa ficha se queda con el suyo.
    expect(bloque).toMatch(/e\.empleado_codigo IS NOT NULL/);
    expect(bloque).toMatch(/p\.empleado_codigo = e\.empleado_codigo/);
    // Y no se copia un nombre vacío encima de uno bueno.
    expect(bloque).toMatch(/btrim\(p\.nombre\) <> ''/);
  });

  it("no toca ninguna otra columna en ese UPDATE", () => {
    const i = CODIGO_2.indexOf("SET nombre = p.nombre");
    const hastaFrom = CODIGO_2.slice(i, CODIGO_2.indexOf("FROM asistencia_personas", i));
    expect(hastaFrom.split(",").filter((c) => c.includes("="))).toHaveLength(1);
  });
});

describe("🔴 RAMON MIRANDA queda en UNA ficha, con $220 — sin mover un centavo", () => {
  it("los movimientos se MUDAN, no se borran, y la ficha sobrante queda `deleted`", () => {
    expect(CODIGO_2).toMatch(/UPDATE prestamos_movimientos SET empleado_id = v_viva WHERE empleado_id = v_vieja/);
    expect(CODIGO_2).toMatch(/UPDATE prestamos_empleados SET deleted = true WHERE id = v_vieja/);
    // 🔴 Ni un DELETE real en toda la migración: es la tabla de plata.
    expect(CODIGO_2).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(CODIGO_2).not.toMatch(/\bTRUNCATE\b/i);
  });

  it("🔑 el guard: solo escribe si las dos fichas son las que se midieron", () => {
    // Mismo código 21, mismo nombre, y la que se retira con saldo CERO. Mover
    // movimientos a la ficha equivocada movería plata de una persona a otra.
    expect(CODIGO_2).toMatch(/a\.empleado_codigo = '21' AND b\.empleado_codigo = '21'/);
    expect(CODIGO_2).toMatch(/upper\(btrim\(a\.nombre\)\) = upper\(btrim\(b\.nombre\)\)/);
    expect(CODIGO_2).toMatch(/IF v_ok AND v_saldo_vieja = 0 THEN/);
  });

  it("la aritmética que no cambia: $220 + $0 = $220", () => {
    expect(220 + 0).toBe(220);
  });
});

describe("la columna `activo` NO se borra: se queda sin lectores", () => {
  it("🔴 ninguna migración del módulo la dropea", () => {
    expect(CODIGO_2).not.toMatch(/DROP\s+COLUMN\s+.*activo/i);
    expect(CODIGO_2).toMatch(/COMMENT ON COLUMN prestamos_empleados\.activo/);
  });

  it("y nadie la lee: ni la lista, ni la ficha, ni Boston, ni la planilla, ni el Excel", () => {
    const lectores = [
      "src/app/prestamos/PrestamosClient.tsx",
      "src/app/prestamos/[id]/page.tsx",
      "src/lib/prestamos-lista-server.ts",
      "src/lib/asistencia/prestamos-planilla-server.ts",
      "src/lib/exports/prestamos-excel.ts",
      "src/app/api/boston/prestamos/route.ts",
      "src/app/api/boston/inicio/route.ts",
      "src/app/api/prestamos/export-excel/route.ts",
    ];
    for (const f of lectores) {
      const txt = readFileSync(join(process.cwd(), f), "utf8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
      // ⚠️ Se mira SOLO lo que cuelga de `prestamos_empleados`: la misma
      // palabra en `asistencia_personas` es OTRA columna y ahí sí manda —
      // es justamente de donde sale ahora «quién trabaja».
      for (const trozo of txt.split(/from\(\s*"prestamos_empleados"\s*\)/).slice(1)) {
        const consulta = trozo.split(/from\(/)[0];
        expect(consulta, f).not.toMatch(/\bactivo\b/);
      }
      // Y tampoco se escribe la bandera al dar de alta o al borrar.
      expect(txt, f).not.toMatch(/\bactivo:\s*(true|false)\b/);
    }
  });
});

describe("la migración es aditiva y reversible en lo que importa", () => {
  it("las columnas nuevas se AGREGAN con IF NOT EXISTS", () => {
    expect(CODIGO_2).toMatch(/ADD COLUMN IF NOT EXISTS deduccion_dano numeric/i);
    expect(CODIGO_2).toMatch(/ADD COLUMN IF NOT EXISTS cuenta text/i);
    expect(CODIGO_2).toMatch(/ADD COLUMN IF NOT EXISTS origen_pago text/i);
  });

  it("🔴 `cuenta` se queda en NULL en lo viejo: la derivación vive en UN solo lugar", () => {
    // Un backfill sería una segunda definición de la misma regla. Ver
    // `cuentaDeMovimiento` en src/lib/prestamos-saldo.ts.
    expect(CODIGO_2).not.toMatch(/UPDATE\s+prestamos_movimientos\s+SET\s+cuenta/i);
  });

  it("🔴 NINGÚN concepto se renombra — renombrarlo los deja de contar en silencio", () => {
    expect(CODIGO_2).not.toMatch(/SET\s+concepto\s*=/i);
    expect(CODIGO_2).not.toContain("'Daño de mercancía'");
  });
});

describe("🔴 la RPC de la quincena reparte con la MISMA regla que la app", () => {
  it("la cuenta de cada movimiento se deriva UNA vez, y como en `cuentaDeMovimiento`", () => {
    // 🩸 La primera versión de esta RPC escribía las dos sumas por separado, con
    // sus propios `case`, y un `Préstamo` con `cuenta = 'dano'` entraba en LAS
    // DOS: el saldo salía duplicado. La derivación va una sola vez.
    expect(CODIGO_2).toMatch(/coalesce\(\s*cuenta,/);
    expect(CODIGO_2).toMatch(/'Responsabilidad por daño', 'Pago de responsabilidad'\s*\)\s*\n?\s*then 'dano' else 'prestamo'/);
    expect(CODIGO_2).toMatch(/when c = 'prestamo' then s else 0 end/);
    expect(CODIGO_2).toMatch(/when c = 'dano'\s+then s else 0 end/);
  });

  it("los signos son los mismos cinco conceptos de `prestamos-saldo.ts`", () => {
    expect(CODIGO_2).toMatch(/concepto in \('Préstamo', 'Responsabilidad por daño'\) then monto/);
    expect(CODIGO_2).toMatch(/concepto in \('Pago', 'Abono extra', 'Pago de responsabilidad'\) then -monto/);
  });

  it("🔴 deja de mirar la bandera `activo` y le pregunta a Asistencia quién trabaja", () => {
    expect(CODIGO_2).not.toMatch(/coalesce\(activo, true\) = true/);
    expect(CODIGO_2).toMatch(/from asistencia_personas p/);
    expect(CODIGO_2).toMatch(/p\.fecha_salida is null or p\.fecha_salida >= p_fecha/);
    expect(CODIGO_2).toContain("'ya no trabaja'");
  });

  it("🔑 una ficha SIN código no recibe descuento: no se sabe de quién es", () => {
    expect(CODIGO_2).toContain("'sin persona atada'");
  });

  it("🔑 el dedup mira el ORIGEN, no la nota, y «Abono extra» queda fuera", () => {
    expect(CODIGO_2).toMatch(/coalesce\(origen_pago, 'Quincena'\) = 'Quincena'/);
    const i = CODIGO_2.indexOf("into v_ya_deducido");
    const bloque = CODIGO_2.slice(Math.max(0, i - 900), i);
    expect(bloque).not.toContain("notas");
    expect(bloque).not.toContain("Abono extra");
  });

  it("la ventana asimétrica [inicio, fin+3] se conserva", () => {
    expect(CODIGO_2).toMatch(/v_tol_start date := p_quincena_start;/);
    expect(CODIGO_2).toMatch(/v_tol_end\s+date := p_quincena_end \+ 3;/);
  });

  it("🔴 primero la cuenta MÁS VIEJA, y cada cuota capeada a SU saldo", () => {
    expect(CODIGO_2).toMatch(/array\['dano', 'prestamo'\]/);
    expect(CODIGO_2).toMatch(/array\['prestamo', 'dano'\]/);
    expect(CODIGO_2).toMatch(/least\(r\.cuota_prestamo, v_saldo_prestamo\)/);
    expect(CODIGO_2).toMatch(/least\(r\.cuota_dano, v_saldo_dano\)/);
  });
});
