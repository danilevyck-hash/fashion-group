// ============================================================================
// Candado de Marketing › Mobiliario — NOTAS DEL PROVEEDOR
// ============================================================================
//
// Las tres cosas que Daniel pidió explícitamente y que nadie puede deshacer
// sin poner el build en ROJO:
//
//   1. NO SUMA. "son los datos de los costos del proveedor. que no sume ni
//      nada, solo info personal." → el módulo no exporta ninguna función que
//      agregue precios, el componente que muestra los costos no tiene un
//      `.reduce(`, y el `metricas` de la página (valor / entregado /
//      disponible / tiendas) no toca las notas.
//      ⚠️ ago-2026: ese componente ya NO es `NotasProveedorMobiliario.tsx`
//      (borrado), es el "?" `PreciosProveedorAyuda.tsx`. La regla no cambió,
//      cambió el archivo donde se verifica.
//   2. SOLO ADMIN, EN EL SERVIDOR. La secretaria entra a Mobiliario y no debe
//      ver estos costos. Esconder el bloque en el cliente no cierra nada —
//      es exactamente el error del `allowedRoles` decorativo de Catálogos—,
//      así que se verifica que las 3 rutas de la API llamen
//      `requireRole(req, ["admin"])` y que ninguna use `requireAdmin`, que
//      en este repo significa admin+secretaria.
//   3. PRECIO OPCIONAL → "—", NUNCA "$0.00". Un costo desconocido mostrado
//      como cero es un dato inventado.
//
// Verificado por mutación:
//   * borrar el guard de null en `formatearPrecioNota` (que caiga a
//     `formatearMonto`) rompe 3 tests;
//   * exportar un `sumarPreciosNotas()` del módulo puro rompe 1;
//   * meter un `.reduce(` de precios en el componente rompe 1;
//   * cambiar `["admin"]` por `["admin","secretaria"]` en cualquiera de las
//     3 rutas rompe 2;
//   * hacer que la lectura reviente en vez de degradar cuando falta la tabla
//     rompe 2;
//   * quitar el dedupe de fotos rompe 1, y el tope de fotos rompe 1.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
  process.env.SESSION_SECRET ||= "test-secret";
});

// ── Doble mínimo de Supabase: solo lo que usa el módulo (from → select →
//    order → order, que es "thenable"). No hay base en los tests.
interface RespuestaFalsa {
  data: unknown[] | null;
  error: { code?: string; message: string } | null;
}
const respuesta: { valor: RespuestaFalsa } = {
  valor: { data: [], error: null },
};
vi.mock("@/lib/supabase-server", () => {
  const cadena = {
    select: () => cadena,
    order: () => cadena,
    then: (resolve: (r: RespuestaFalsa) => unknown) =>
      Promise.resolve(respuesta.valor).then(resolve),
  };
  return {
    supabaseServer: { from: () => cadena },
    HAS_SERVICE_ROLE: false,
  };
});
// Firmar una foto sale de Storage; acá se devuelve una URL predecible.
vi.mock("@/lib/marketing/storage", () => ({
  firmarPath: async (p: string) => `https://firmada/${p}`,
  esPathStorage: () => true,
}));

import * as notasModulo from "@/lib/marketing/notas-proveedor";
import {
  MAX_FOTOS_POR_RENGLON,
  SIN_PRECIO,
  formatearPrecioNota,
  normalizarFotoPaths,
  ordenarNotas,
  parsearPrecioNota,
  precioParaInput,
  siguienteOrden,
  validarNotaProveedor,
  type NotaProveedorRenglon,
} from "@/lib/marketing/notas-proveedor";
import { listNotasProveedor } from "@/lib/marketing/notas-proveedor-server";

const RAIZ = process.cwd();
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

const RUTA_PAGINA = "src/app/marketing/mobiliario/page.tsx";
// 🔁 MUDADO (ago-2026). `NotasProveedorMobiliario.tsx` SE BORRÓ: el bloque
//    "Notas del proveedor" no se montaba en ningún lado y Daniel mandó sacarlo
//    ("y despues eliminar notas proveedor"). Los mismos costos se ven hoy en el
//    "?" de arriba de Mobiliario. Las dos reglas que este candado vigilaba sobre
//    aquel archivo —NO SUMA, y que la PANTALLA lo diga— siguen vivas, así que se
//    REAPUNTAN al archivo vivo en vez de borrarse.
const RUTA_AYUDA_PRECIOS = "src/components/marketing/PreciosProveedorAyuda.tsx";
const RUTAS_API = [
  "src/app/api/marketing/mobiliario/notas-proveedor/route.ts",
  "src/app/api/marketing/mobiliario/notas-proveedor/[id]/route.ts",
  "src/app/api/marketing/mobiliario/notas-proveedor/upload-url/route.ts",
];
const RUTA_MIGRACION =
  "supabase/migrations/20260808120000_mk_mobiliario_notas_proveedor.sql";

/**
 * El código sin comentarios. `PreciosProveedorAyuda` cita la propia regla en su
 * encabezado ("ni un `.reduce(` de precios"): contar ese comentario daría un
 * ROJO falso.
 */
function soloCodigo(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

function renglon(p: Partial<NotaProveedorRenglon>): NotaProveedorRenglon {
  return {
    id: "a",
    producto: "X",
    precio: null,
    nota: null,
    fotoPaths: [],
    fotoUrls: [],
    orden: 0,
    ...p,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
describe("1 · NO SUMA — la nota es información, no un cálculo", () => {
  it("el módulo puro no exporta NINGUNA función que agregue precios", () => {
    const prohibido = /^(sumar|total|totalizar|acumular|promediar|agregar)/i;
    const infractores = Object.keys(notasModulo).filter((k) =>
      prohibido.test(k),
    );
    expect(infractores).toEqual([]);
  });

  it("tampoco exporta algo que TERMINE en Total/Suma (totalNotas, precioTotal…)", () => {
    const infractores = Object.keys(notasModulo).filter((k) =>
      /(total|suma|promedio|acumulado)$/i.test(k),
    );
    expect(infractores).toEqual([]);
  });

  // 🔁 MUDADO del archivo borrado al "?" vivo. Lo que Daniel pidió nunca fue
  //    "ESE archivo no suma", fue "los costos del proveedor no se suman EN
  //    NINGÚN LADO"; hoy quien los muestra es `PreciosProveedorAyuda`.
  it('el "?" de precios no agrega: sin .reduce( y sin fila TOTAL', () => {
    const src = leer(RUTA_AYUDA_PRECIOS);
    expect(soloCodigo(src)).not.toMatch(/\.reduce\(/);
    // La página SÍ tiene una fila "TOTAL" en sus tablas de inventario; el "?"
    // de costos no puede tener una.
    expect(src).not.toMatch(/>\s*TOTAL\s*</);
  });

  it("`metricas` de la página no mira las notas del proveedor", () => {
    const src = leer(RUTA_PAGINA);
    const inicio = src.indexOf("const metricas = useMemo(");
    expect(inicio).toBeGreaterThan(-1);
    const bloque = src.slice(inicio, src.indexOf("}, [productos, entregas])"));
    expect(bloque.length).toBeGreaterThan(50);
    expect(bloque.toLowerCase()).not.toContain("nota");
    // Sigue calculándose SOLO con productos y entregas.
    expect(src).toContain("}, [productos, entregas])");
  });

  // ⚠️ ago-2026: el bloque "Notas del proveedor" YA NO SE MONTA en Mobiliario
  // (Daniel: "y despues eliminar notas proveedor"). Los costos ahora se ven en
  // un solo "?" arriba, `PreciosProveedorAyuda`, que tiene su propio candado en
  // `marketing-precios-proveedor.test.ts`. Acá se conserva lo que sigue siendo
  // cierto y sigue importando: la página no le pasa NI RECIBE datos a nadie que
  // maneje precios del proveedor, así que no hay por dónde contaminar un total.
  it("la página no monta ningún bloque de notas ni recibe sus precios", () => {
    const src = leer(RUTA_PAGINA);
    expect(src).not.toContain("<NotasProveedorMobiliario");
    expect(src).toContain("<PreciosProveedorAyuda />");
  });

  // 🔁 MUDADO. La frase se fue con el bloque viejo, pero el "?" la repite:
  //    "Nota personal. No se suma ni entra en ningún cálculo.". Se conserva el
  //    mismo trozo corto y distintivo, ahora sobre el archivo vivo.
  it("la pantalla lo DICE, no solo el código", () => {
    expect(leer(RUTA_AYUDA_PRECIOS)).toContain("No se suma");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("2 · SOLO ADMIN, y el candado está en el SERVIDOR", () => {
  it.each(RUTAS_API)("%s exige rol admin", (ruta) => {
    // Se miran solo las líneas de CÓDIGO: los comentarios de estas rutas
    // citan el guard, y contarlos daría un verde falso.
    const src = leer(ruta)
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
      .join("\n");
    // Toda función exportada de handler tiene su guard.
    const handlers = src.match(/export async function (GET|POST|PUT|DELETE)/g) ?? [];
    expect(handlers.length).toBeGreaterThan(0);
    const guards = src.match(/requireRole\(req,\s*\["admin"\]\)/g) ?? [];
    expect(guards.length).toBe(handlers.length);
  });

  it.each(RUTAS_API)("%s NO deja entrar a la secretaria", (ruta) => {
    const src = leer(ruta);
    expect(src).not.toContain('"secretaria"');
    // `requireAdmin` de api-auth.ts es admin+secretaria: sería un colador.
    expect(src).not.toMatch(/requireAdmin\s*\(/);
  });

  // El bloque se fue de la pantalla, pero la puerta de cortesía sigue: hoy la
  // que la usa es el "?" con los mismos costos.
  it("la pantalla esconde los costos del proveedor a quien no es admin (cortesía)", () => {
    expect(leer(RUTA_PAGINA)).toContain(
      'role === "admin" && <PreciosProveedorAyuda />',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("3 · precio opcional: '—', nunca $0.00", () => {
  it("sin precio muestra el guion", () => {
    expect(formatearPrecioNota(null)).toBe(SIN_PRECIO);
    expect(formatearPrecioNota(undefined)).toBe(SIN_PRECIO);
    expect(formatearPrecioNota(null)).not.toBe("$0.00");
  });

  it("un no-número tampoco se convierte en cero", () => {
    expect(formatearPrecioNota(Number.NaN)).toBe(SIN_PRECIO);
    expect(formatearPrecioNota(Number.POSITIVE_INFINITY)).toBe(SIN_PRECIO);
  });

  it("un cero ESCRITO sí se muestra como $0.00 (es un dato, no un vacío)", () => {
    expect(formatearPrecioNota(0)).toBe("$0.00");
  });

  it("los 5 precios reales de Changalo se ven bien", () => {
    expect(formatearPrecioNota(65)).toBe("$65.00");
    expect(formatearPrecioNota(10.5)).toBe("$10.50");
    expect(formatearPrecioNota(6.75)).toBe("$6.75");
    expect(formatearPrecioNota(33)).toBe("$33.00");
    expect(formatearPrecioNota(13.75)).toBe("$13.75");
  });

  it("el input arranca vacío cuando no hay precio", () => {
    expect(precioParaInput(null)).toBe("");
    expect(precioParaInput(undefined)).toBe("");
    expect(precioParaInput(0)).toBe("0");
    expect(precioParaInput(10.5)).toBe("10.5");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("4 · leer lo que se escribe en el campo de precio", () => {
  it("vacío es VÁLIDO y significa 'todavía no sé'", () => {
    expect(parsearPrecioNota("")).toEqual({ ok: true, precio: null });
    expect(parsearPrecioNota("   ")).toEqual({ ok: true, precio: null });
    expect(parsearPrecioNota(null)).toEqual({ ok: true, precio: null });
  });

  it("acepta como lo escribe la gente: coma decimal y signo de dólar", () => {
    expect(parsearPrecioNota("10,50")).toEqual({ ok: true, precio: 10.5 });
    expect(parsearPrecioNota("$65")).toEqual({ ok: true, precio: 65 });
    expect(parsearPrecioNota(" 13.75 ")).toEqual({ ok: true, precio: 13.75 });
  });

  it("redondea a centavos", () => {
    expect(parsearPrecioNota("6.754")).toEqual({ ok: true, precio: 6.75 });
    expect(parsearPrecioNota("6.756")).toEqual({ ok: true, precio: 6.76 });
  });

  it("rechaza texto y negativos", () => {
    expect(parsearPrecioNota("abc").ok).toBe(false);
    expect(parsearPrecioNota("10 dolares").ok).toBe(false);
    expect(parsearPrecioNota("-5").ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("5 · validación del renglón completo", () => {
  it("el producto es obligatorio", () => {
    const r = validarNotaProveedor({ producto: "  ", precio: "10" });
    expect(r.ok).toBe(false);
  });

  it("un renglón sin precio se guarda igual", () => {
    const r = validarNotaProveedor({ producto: "Flauta", precio: "" });
    expect(r).toEqual({
      ok: true,
      valor: { producto: "Flauta", precio: null, nota: null, fotoPaths: [] },
    });
  });

  it("el caso real de la fusión: barra + flauta con sus DOS fotos", () => {
    const r = validarNotaProveedor({
      producto: "Barra plana + flauta",
      precio: "13.75",
      nota: "se venden juntas",
      fotoPaths: [
        "notas-proveedor/changalo/barra-plana.jpg",
        "notas-proveedor/changalo/flauta.jpg",
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.precio).toBe(13.75);
      expect(r.valor.fotoPaths).toHaveLength(2);
      expect(r.valor.nota).toBe("se venden juntas");
    }
  });

  it("la aclaración vacía se guarda como null, no como cadena vacía", () => {
    const r = validarNotaProveedor({ producto: "Paneles", nota: "   " });
    expect(r.ok && r.valor.nota).toBe(null);
  });

  it("corta el nombre demasiado largo", () => {
    const r = validarNotaProveedor({ producto: "x".repeat(200) });
    expect(r.ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("6 · lista de fotos", () => {
  it("la misma foto no se muestra dos veces", () => {
    expect(normalizarFotoPaths(["a.jpg", "a.jpg", "b.jpg"])).toEqual([
      "a.jpg",
      "b.jpg",
    ]);
  });

  it("saca vacíos y respeta el orden en que se subieron", () => {
    expect(normalizarFotoPaths(["", "b.jpg", null, "a.jpg"])).toEqual([
      "b.jpg",
      "a.jpg",
    ]);
  });

  it("no pasa del tope por renglón", () => {
    const muchas = Array.from({ length: 20 }, (_, i) => `f${i}.jpg`);
    expect(normalizarFotoPaths(muchas)).toHaveLength(MAX_FOTOS_POR_RENGLON);
  });

  it("nada raro tumba la lista", () => {
    expect(normalizarFotoPaths(null)).toEqual([]);
    expect(normalizarFotoPaths(undefined)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("7 · orden de la lista", () => {
  it("ordena por `orden` y desempata por id (orden TOTAL, estable)", () => {
    const lista = [
      renglon({ id: "z", orden: 1 }),
      renglon({ id: "a", orden: 1 }),
      renglon({ id: "m", orden: 0 }),
    ];
    expect(ordenarNotas(lista).map((n) => n.id)).toEqual(["m", "a", "z"]);
  });

  it("no muta la lista original", () => {
    const lista = [renglon({ id: "b", orden: 1 }), renglon({ id: "a", orden: 0 })];
    ordenarNotas(lista);
    expect(lista.map((n) => n.id)).toEqual(["b", "a"]);
  });

  it("el renglón nuevo va al final", () => {
    expect(siguienteOrden([])).toBe(0);
    expect(
      siguienteOrden([renglon({ orden: 0 }), renglon({ orden: 4 })]),
    ).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("8 · la pantalla funciona ANTES de correr la migración", () => {
  beforeEach(() => {
    respuesta.valor = { data: [], error: null };
  });

  it("tabla ausente (42P01) → lista vacía + ddlPendiente, sin reventar", async () => {
    respuesta.valor = {
      data: null,
      error: { code: "42P01", message: 'relation "…" does not exist' },
    };
    const r = await listNotasProveedor();
    expect(r).toEqual({ notas: [], ddlPendiente: true });
  });

  it("tabla ausente para PostgREST (PGRST205) → lo mismo", async () => {
    respuesta.valor = {
      data: null,
      error: { code: "PGRST205", message: "Could not find the table" },
    };
    const r = await listNotasProveedor();
    expect(r.ddlPendiente).toBe(true);
  });

  it("un error DE VERDAD sí se propaga (no se disfraza de 'falta la DDL')", async () => {
    respuesta.valor = {
      data: null,
      error: { code: "57014", message: "canceling statement due to timeout" },
    };
    await expect(listNotasProveedor()).rejects.toThrow(/timeout/);
  });

  it("con la tabla puesta, lee y firma las fotos en orden", async () => {
    respuesta.valor = {
      data: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          producto: "Barra plana + flauta",
          precio: "13.75",
          nota: "se venden juntas",
          foto_paths: ["a.jpg", "b.jpg"],
          orden: 4,
        },
        {
          id: "22222222-2222-2222-2222-222222222222",
          producto: "Paneles",
          precio: "65.00",
          nota: null,
          foto_paths: ["p.jpg"],
          orden: 0,
        },
      ],
      error: null,
    };
    const r = await listNotasProveedor();
    expect(r.ddlPendiente).toBe(false);
    expect(r.notas.map((n) => n.producto)).toEqual([
      "Paneles",
      "Barra plana + flauta",
    ]);
    expect(r.notas[0].precio).toBe(65);
    expect(r.notas[1].fotoUrls).toEqual([
      "https://firmada/a.jpg",
      "https://firmada/b.jpg",
    ]);
  });

  it("precio NULL en la base llega como null, no como 0", async () => {
    respuesta.valor = {
      data: [
        {
          id: "33333333-3333-3333-3333-333333333333",
          producto: "Sin precio todavía",
          precio: null,
          nota: null,
          foto_paths: [],
          orden: 0,
        },
      ],
      error: null,
    };
    const r = await listNotasProveedor();
    expect(r.notas[0].precio).toBe(null);
    expect(formatearPrecioNota(r.notas[0].precio)).toBe(SIN_PRECIO);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("9 · la migración dice lo que Daniel confirmó", () => {
  const sql = leer(RUTA_MIGRACION);

  it("es aditiva y no puede duplicar la siembra si se corre dos veces", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS");
    expect(sql).toContain(
      "WHERE NOT EXISTS (SELECT 1 FROM mk_mobiliario_notas_proveedor)",
    );
  });

  it("RLS activo y SOLO service_role (nada de anon)", () => {
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("FOR ALL TO service_role");
    expect(sql).not.toMatch(/TO\s+anon/);
  });

  it("el precio puede ser NULL (no lleva NOT NULL)", () => {
    expect(sql).toMatch(/precio\s+numeric\(12,2\)\s*,/);
  });

  it("son 5 renglones, con los precios que confirmó Daniel", () => {
    expect(sql).toContain("('Paneles',                65.00");
    expect(sql).toContain("('Tablas',                 10.50");
    expect(sql).toContain("('Conjunto soporte tabla',  6.75, 'el par completo'");
    expect(sql).toContain("('Norte colgador',         33.00");
    expect(sql).toContain("('Barra plana + flauta',   13.75");
    // El renglón fusionado lleva las DOS fotos.
    expect(sql).toContain("notas-proveedor/changalo/barra-plana.jpg");
    expect(sql).toContain("notas-proveedor/changalo/flauta.jpg");
    // Y NO existen renglones sueltos "Barra plana" / "Flauta".
    expect(sql).not.toMatch(/\('Barra plana',/);
    expect(sql).not.toMatch(/\('Flauta',/);
  });

  it("las 6 fotos subidas están todas referenciadas", () => {
    for (const f of [
      "paneles.jpg",
      "tablas.jpg",
      "conjunto-soporte-tabla.jpg",
      "norte-colgador.jpg",
      "barra-plana.jpg",
      "flauta.jpg",
    ]) {
      expect(sql).toContain(`notas-proveedor/changalo/${f}`);
    }
  });

  it("sin el signo de dólar en los comentarios (gotcha de dollar-quote)", () => {
    for (const linea of sql.split("\n")) {
      if (linea.trimStart().startsWith("--")) {
        expect(linea).not.toContain("$");
      }
    }
  });
});
