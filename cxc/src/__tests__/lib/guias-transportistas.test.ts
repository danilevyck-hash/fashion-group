/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 SE PUEDE AGREGAR UN TRANSPORTISTA NUEVO — Y QUITARLO (9-sep-2026)
 *
 * Daniel, textual: *«Ponme opción en configuración de guía para poder agregar
 * un transportista nuevo.»* Y al preguntarle quién puede: *«Todos»*.
 *
 * 🩸 Los SEIS transportistas se sembraron el 26-may-2026 y desde entonces nadie
 * pudo agregar uno: no había pantalla, ni botón, ni ruta de alta. Medido contra
 * producción el 9-sep-2026 sobre 227 guías vivas — RedNblue 53 · Boston 30 ·
 * Edwin 29 · Mojica 17 · Transporte Sol 16 · Sanjur 14. Y por no poder
 * agregarlos, se escribieron A MANO en el campo de texto de la guía, saltándose
 * la lista: «NUÑEZ GLOBAL SOLUTIONS», «CITY MODA», «SPORTING SHOES», «LUTY LUI»
 * y uno que dice «no». Es el mismo cuento del destino «hola».
 *
 * Lo que este archivo fija:
 *   1. AGREGAR es de todos los que arman guías (bodega incluida); QUITAR, de
 *      quien administra;
 *   2. el repetido se rechaza por clave EXACTA y normalizada, JAMÁS por
 *      parecido;
 *   3. quitar es SOFT DELETE FIRMADO, nunca DELETE — y una guía vieja NO pierde
 *      el nombre del transportista quitado;
 *   4. único solo entre ACTIVOS: el que vuelve REVIVE su fila, no crea otra;
 *   5. el ＋ vive al lado del desplegable, con rótulo visible y 44 px;
 *   6. cada fila de Configuración dice cuántas guías lleva, y nunca un «0»
 *      pelado;
 *   7. la migración es ADITIVA: ni un DELETE, ni un DROP, ni una fila sembrada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import {
  MAX_LARGO_TRANSPORTISTA,
  TRANSPORTISTAS_ROLES_ESCRITURA,
  TRANSPORTISTAS_ROLES_LECTURA,
  claveTransportista,
  conCuentaDeGuias,
  contarGuiasPorTransportista,
  textoGuiasDelTransportista,
  textoQuitarTransportista,
  validarTransportistaNuevo,
  yaEsUnTransportista,
} from "@/lib/guias/transportistas";
import { CONFIG_GUIAS_ROLES } from "@/lib/guias/destinos-config";

const raiz = process.cwd();
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

const MIGRACION = "supabase/migrations/20261025120000_transportistas_alta_y_baja.sql";
const migracion = leer(MIGRACION);
const puro = leer("src/lib/guias/transportistas.ts");
const servidor = leer("src/lib/guias/transportistas-server.ts");
const ruta = leer("src/app/api/transportistas/route.ts");
const tarjeta = leer("src/app/guias/components/TransportistasConfig.tsx");
const formulario = leer("src/app/guias/components/GuiaForm.tsx");
const hook = leer("src/app/guias/components/useGuiaFormState.ts");
const masMas = leer("src/app/guias/components/AddNewInline.tsx");
const configView = leer("src/app/guias/components/GuiasConfiguracionView.tsx");

// ─── 1 · quién puede qué ─────────────────────────────────────────────────────

describe("🔴 1. agregar lo pueden hacer TODOS los que arman guías", () => {
  it("bodega puede AGREGAR — Daniel, textual: «Todos»", () => {
    expect(TRANSPORTISTAS_ROLES_ESCRITURA).toContain("bodega");
    expect(TRANSPORTISTAS_ROLES_ESCRITURA).toContain("admin");
    expect(TRANSPORTISTAS_ROLES_ESCRITURA).toContain("secretaria");
  });

  it("⚠️ pero NO puede quitar: eso es de quien administra", () => {
    expect(CONFIG_GUIAS_ROLES).not.toContain("bodega");
    // El DELETE de la ruta se cierra con esa lista, no con la de escritura.
    const del = /export async function DELETE[\s\S]*?\n\}/.exec(ruta)?.[0] ?? "";
    expect(del).toContain("CONFIG_GUIAS_ROLES");
    expect(del).not.toContain("TRANSPORTISTAS_ROLES_ESCRITURA");
  });

  it("el POST se abre con la lista de escritura, y el vendedor queda fuera", () => {
    const post = /export async function POST[\s\S]*?\n\}/.exec(ruta)?.[0] ?? "";
    expect(post).toContain("TRANSPORTISTAS_ROLES_ESCRITURA");
    expect(TRANSPORTISTAS_ROLES_ESCRITURA).not.toContain("vendedor");
    // Leer sí puede: el vendedor abre guías.
    expect(TRANSPORTISTAS_ROLES_LECTURA).toContain("vendedor");
  });
});

// ─── 2 · el repetido, por clave exacta y jamás por parecido ──────────────────

describe("🔴 2. el repetido se rechaza EXACTO y normalizado, nunca por parecido", () => {
  it("«RedNblue», «REDNBLUE» y « Red N Blue » son UNO solo", () => {
    const lista = ["RedNblue"];
    expect(yaEsUnTransportista("REDNBLUE", lista)).toBe(true);
    expect(yaEsUnTransportista(" Red N Blue ", lista)).toBe(true);
    expect(yaEsUnTransportista("red-n-blue", lista)).toBe(true);
  });

  it("🔴 dos nombres PARECIDOS son dos transportistas distintos", () => {
    // Una letra cambiada NO es el mismo: nada de distancia de edición.
    expect(yaEsUnTransportista("RedNbleu", ["RedNblue"])).toBe(false);
    expect(yaEsUnTransportista("Mojíca Express", ["Mojica"])).toBe(false);
    expect(yaEsUnTransportista("Sanjur", ["Sanjuz"])).toBe(false);
    // Y los seis de hoy no se pisan entre sí.
    const hoy = ["RedNblue", "Boston", "Edwin", "Mojica", "Transporte Sol", "Sanjur"];
    const claves = new Set(hoy.map(claveTransportista));
    expect(claves.size).toBe(hoy.length);
  });

  it("los acentos no parten un nombre en dos", () => {
    expect(claveTransportista("Núñez")).toBe(claveTransportista("Nunez"));
  });

  it("el servidor comprueba el repetido ANTES de insertar, con la clave", () => {
    expect(servidor).toContain("yaEsUnTransportista");
    // Y no se conforma con el índice único, que compara TEXTO exacto.
    expect(servidor).toContain("status: 409");
  });

  it("la pantalla lo comprueba también, para no hacer el viaje", () => {
    expect(tarjeta).toContain("yaEsUnTransportista");
  });
});

// ─── 3 · quitar es soft delete firmado, y no le borra el nombre a nadie ──────

describe("🔴 3. nada se borra", () => {
  it("quitar escribe activo = false + quién y cuándo", () => {
    const baja = /export async function desactivarTransportista[\s\S]*?\n\}/.exec(servidor)?.[0] ?? "";
    expect(baja).toContain("activo: false");
    expect(baja).toContain("desactivado_por");
    expect(baja).toContain("desactivado_en");
    expect(baja).toContain(".update(");
  });

  it("🔴 NUNCA un DELETE sobre la tabla, en ningún archivo del cambio", () => {
    for (const [nombre, texto] of [
      ["servidor", servidor],
      ["ruta", ruta],
      ["tarjeta", tarjeta],
      ["hook", hook],
    ] as const) {
      expect(texto, `${nombre} borra filas de verdad`).not.toMatch(/\.delete\(\)/);
    }
  });

  it("la migración exige la FIRMA de la baja con un CHECK", () => {
    expect(migracion).toMatch(/CHECK \(activo OR \(desactivado_por IS NOT NULL AND desactivado_en IS NOT NULL\)\)/);
  });

  it("🩸 una guía vieja NO pierde el nombre del transportista quitado", () => {
    // La guía apunta a la fila por id y la fila se queda: por eso ni el
    // servidor ni la ruta pueden ESCRIBIR en el histórico.
    for (const texto of [servidor, ruta]) {
      expect(texto).not.toMatch(/from\("guia_transporte"\)[\s\S]{0,200}?\.(update|delete|upsert|insert)\(/);
      expect(texto).not.toMatch(/from\("guia_items"\)/);
    }
    // Y la lectura de guías que sí hace es un SELECT para contar.
    expect(servidor).toMatch(/from\("guia_transporte"\)[\s\S]{0,80}\.select\(/);
  });

  it("el modal dice en palabras que las guías viejas no cambian", () => {
    expect(textoQuitarTransportista("Mojica", 17)).toContain("17 guías");
    expect(textoQuitarTransportista("Mojica", 17)).toMatch(/no cambian/);
    expect(textoQuitarTransportista("Mojica", 1)).toContain("guía que lo usa");
    // Sin guías, no se inventa una frase sobre guías que no existen.
    expect(textoQuitarTransportista("Nuevo", 0)).not.toMatch(/guías que|guía que/);
  });
});

// ─── 4 · único entre ACTIVOS: el que vuelve revive ───────────────────────────

describe("🔴 4. único solo entre los ACTIVOS", () => {
  it("el índice de la migración es PARCIAL (WHERE activo)", () => {
    const idx = /CREATE UNIQUE INDEX[\s\S]*?;/.exec(migracion)?.[0] ?? "";
    expect(idx).toMatch(/ON transportistas \(nombre\)/);
    expect(idx).toMatch(/WHERE activo/);
  });

  it("un nombre que estaba quitado REVIVE su fila, no crea otra", () => {
    const alta = /export async function agregarTransportista[\s\S]*?\n\}/.exec(servidor)?.[0] ?? "";
    expect(alta).toContain("activo: true");
    expect(alta).toContain("revivido");
    // Y limpia la firma de la baja, porque ya no está quitado.
    expect(alta).toMatch(/desactivado_por: null/);
  });
});

// ─── 5 · el ＋ de la guía ────────────────────────────────────────────────────

describe("🔴 5. el ＋ al lado del desplegable", () => {
  it("el formulario lo dibuja, con rótulo VISIBLE", () => {
    expect(formulario).toContain("onAddTransportista");
    expect(formulario).toContain('textoBoton="Agregar transportista"');
  });

  it("⚠️ con rótulo y no solo `title`: en el iPad no hay mouse", () => {
    // El `title` solo aparece pasando el mouse por encima. El rótulo es lo que
    // dice qué hace el botón en la tablet donde se arman las guías.
    const bloque = /onAdd=\{onAddTransportista\}[\s\S]{0,200}/.exec(formulario)?.[0] ?? "";
    expect(bloque).toContain("textoBoton");
  });

  it("🔴 el ＋ mide 44 px en las dos direcciones", () => {
    expect(masMas).toContain("min-w-[44px]");
    expect(masMas).toContain("min-h-[44px]");
  });

  it("lo que se agrega desde la guía va a la lista COMPARTIDA, no al navegador", () => {
    const alta = /async function addTransportista[\s\S]*?\n  \}/.exec(hook)?.[0] ?? "";
    expect(alta).toContain('fetch("/api/transportistas"');
    expect(alta).toContain('method: "POST"');
    expect(alta).not.toMatch(/localStorage/);
    // Y queda ELEGIDO: a eso se vino — la fila NUEVA, no otra.
    expect(alta).toContain("setTransportistaId(fila.id)");
  });

  it("un nombre que ya está NO se manda otra vez: se elige el que hay", () => {
    const alta = /async function addTransportista[\s\S]*?\n  \}/.exec(hook)?.[0] ?? "";
    expect(alta).toContain("yaEsUnTransportista");
  });
});

// ─── 6 · lo que muestra Configuración ────────────────────────────────────────

describe("🔴 6. cada fila dice cuántas guías lleva", () => {
  it("la cuenta ignora las de Entrega directa (sin transportista)", () => {
    const cuenta = contarGuiasPorTransportista([
      { transportista_id: "a" },
      { transportista_id: "a" },
      { transportista_id: null }, // ⚠️ nuestro propio camión: no es de nadie
      { transportista_id: "b" },
    ]);
    expect(cuenta.get("a")).toBe(2);
    expect(cuenta.get("b")).toBe(1);
    expect(cuenta.size).toBe(2);
  });

  it("los más usados primero — el orden de la medición real", () => {
    const filas = [
      { id: "s", nombre: "Sanjur", activo: true },
      { id: "r", nombre: "RedNblue", activo: true },
      { id: "b", nombre: "Boston", activo: true },
    ];
    const cuenta = new Map([["r", 53], ["b", 30], ["s", 14]]);
    expect(conCuentaDeGuias(filas, cuenta).map((f) => f.nombre)).toEqual([
      "RedNblue", "Boston", "Sanjur",
    ]);
  });

  it("🔴 nunca un «0» pelado", () => {
    expect(textoGuiasDelTransportista(0)).toBe("Todavía sin guías");
    expect(textoGuiasDelTransportista(1)).toBe("1 guía");
    expect(textoGuiasDelTransportista(53)).toBe("53 guías");
  });

  it("la tarjeta vive en Guías › Configuración, debajo de las de destinos", () => {
    expect(configView).toContain("<TransportistasConfig");
    const iDestinos = configView.indexOf("<DestinosListaConfig");
    const iTransp = configView.indexOf("<TransportistasConfig");
    expect(iDestinos).toBeGreaterThan(-1);
    expect(iTransp).toBeGreaterThan(iDestinos);
  });

  it("pide la cuenta por la MISMA ruta de siempre, con ?config=1", () => {
    expect(tarjeta).toContain('/api/transportistas?config=1');
    // ⚠️ Y el GET pelado sigue devolviendo el ARRAY tal cual, sin envolver: es
    // lo que lee el formulario desde el 26-may-2026, y envolverlo lo dejaría
    // sin transportistas.
    expect(ruta).toContain("return NextResponse.json(await leerTransportistasActivos());");
  });

  it("⚠️ contar guías no se corta en silencio a las 1.000 filas", () => {
    // El helper Y su import: sin el import el archivo ni compila, pero el
    // barrido tiene que ver las dos cosas o se caza a sí mismo.
    expect(servidor).toContain('from "@/lib/supabase-paginado"');
    expect(servidor).toContain("leerTodoPaginado<");
  });
});

// ─── 7 · solo el nombre ──────────────────────────────────────────────────────

describe("🔴 7. solo el NOMBRE", () => {
  it("no se pide teléfono ni ningún campo extra", () => {
    // Daniel: solo el nombre — es lo único que la guía usa y lo único que se
    // imprime.
    expect(tarjeta).not.toMatch(/tel[eé]fono|celular|correo/i);
    expect(migracion).not.toMatch(/ADD COLUMN[^\n]*(telefono|celular|email)/i);
  });

  it("el validador exige nombre y le pone tope", () => {
    expect(validarTransportistaNuevo({ nombre: "   " })).toEqual({
      ok: false, error: "Escribe el nombre del transportista",
    });
    expect(validarTransportistaNuevo({ nombre: "  Mojica  " })).toEqual({ ok: true, valor: "Mojica" });
    expect(validarTransportistaNuevo({ nombre: "x".repeat(MAX_LARGO_TRANSPORTISTA + 1) }).ok).toBe(false);
    expect(validarTransportistaNuevo({}).ok).toBe(false);
  });
});

// ─── 8 · la migración: aditiva y sin sembrar a nadie ─────────────────────────

/**
 * El SQL sin comentarios NI textos entre comillas: los `COMMENT ON` de esta
 * migración dicen «NUNCA DELETE», y contarlos sería un candado que se caza a sí
 * mismo. Lo que se mira son las SENTENCIAS.
 */
const sqlEjecutable = (sql: string): string =>
  sql.replace(/^--.*$/gm, "").replace(/'[^']*'/g, "''");

describe("🔴 8. la migración no toca ni una guía", () => {
  it("es ADITIVA: ni DELETE, ni DROP, ni UPDATE", () => {
    const sinComentarios = sqlEjecutable(migracion);
    expect(sinComentarios).not.toMatch(/\bDELETE\b/i);
    expect(sinComentarios).not.toMatch(/\bDROP\b/i);
    expect(sinComentarios).not.toMatch(/\bUPDATE\b/i);
    expect(sinComentarios).not.toMatch(/\bTRUNCATE\b/i);
  });

  it("🔴 los cinco escritos a mano NO se siembran", () => {
    expect(sqlEjecutable(migracion)).not.toMatch(/\bINSERT\b/i);
    // ⚠️ Acá los textos entre comillas se CONSERVAN a propósito (si alguien los
    // sembrara, el nombre viajaría entre comillas). Solo se quitan los
    // comentarios `--`, que son los que cuentan esta historia.
    const sentencias = migracion.replace(/^--.*$/gm, "");
    for (const nombre of ["CITY MODA", "SPORTING SHOES", "LUTY LUI", "NUÑEZ GLOBAL SOLUTIONS"]) {
      expect(sentencias).not.toContain(nombre);
    }
  });

  it("no toca `guia_transporte` ni `guia_items`", () => {
    const sinComentarios = sqlEjecutable(migracion);
    expect(sinComentarios).not.toMatch(/guia_transporte|guia_items/);
  });

  it("y ninguna otra migración dropea la tabla", () => {
    const dir = path.join(raiz, "supabase/migrations");
    const culpables = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => /DROP\s+TABLE[^\n;]*transportistas/i.test(readFileSync(path.join(dir, f), "utf8")));
    expect(culpables, `alguien dropea transportistas: ${culpables.join(", ")}`).toEqual([]);
  });
});

// ─── 9 · el módulo puro es puro ──────────────────────────────────────────────

describe("las reglas viven en un módulo PURO", () => {
  it("sin React, sin fetch, sin base", () => {
    expect(puro).not.toMatch(/from "react"|supabaseServer|fetch\(/);
  });
});
