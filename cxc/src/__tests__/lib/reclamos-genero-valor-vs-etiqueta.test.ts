// ============================================================================
// CANDADO — el género de Reclamos: se GUARDA en inglés, se MUESTRA en español.
//
// Lo que ve el usuario ya está protegido por conducta (el desplegable se pinta
// y se leen sus opciones) en
// `src/__tests__/components/marketing-reclamos-toques.test.tsx`.
//
// Acá va lo que NINGÚN render puede ver: que la lista de valores del código
// siga siendo EXACTAMENTE la que admite el CHECK de la base. Si alguien
// "termina" la traducción cambiando `GENEROS` a Hombre/Mujer/Niños/Accesorios,
// la pantalla se vería igual de bien y el INSERT reventaría en producción —
// que es justo el error que el aviso del encargo pedía no cometer.
//
// 🩸 El SQL se lee SIN COMENTARIOS: el propio archivo de migración nombra los
// cuatro valores en su encabezado, así que un barrido ingenuo se cumpliría con
// la explicación aunque el CHECK dijera otra cosa. Este repo ya pagó cuatro
// veces ese error.
// ============================================================================
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  GENEROS,
  GENERO_LABEL,
  generoLabel,
} from "@/app/reclamos/components/constants";

const RAIZ = path.join(__dirname, "..", "..", "..");
const MIGRACION = path.join(
  RAIZ,
  "supabase/migrations/20260623120000_reclamo_items_genero.sql",
);

/** Quita comentarios de línea `--` y de bloque, para que el barrido mire CÓDIGO. */
function sqlSinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

describe("el valor guardado tiene que caber en el CHECK de la base", () => {
  const sql = sqlSinComentarios(readFileSync(MIGRACION, "utf8"));

  it("el CHECK existe y no se lo llevó nadie", () => {
    expect(sql).toMatch(/reclamo_items_genero_check/);
    expect(sql).toMatch(/CHECK\s*\(/i);
  });

  it("GENEROS es EXACTAMENTE la lista que admite el CHECK", () => {
    const check = sql.match(/genero\s+IN\s*\(([^)]*)\)/i);
    expect(check).toBeTruthy();
    const permitidos = [...check![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect([...GENEROS].sort()).toEqual([...permitidos].sort());
  });

  it("ninguno de los valores está traducido", () => {
    for (const g of GENEROS) {
      expect(g).toMatch(/^[A-Za-z]+$/); // sin tildes ni ñ
    }
    expect([...GENEROS]).not.toContain("Hombre");
    expect([...GENEROS]).not.toContain("Niños");
  });
});

describe("la etiqueta sí está en español, y cubre los cuatro", () => {
  it("cada valor guardado tiene su etiqueta", () => {
    for (const g of GENEROS) {
      expect(GENERO_LABEL[g]).toBeTruthy();
      expect(GENERO_LABEL[g]).not.toBe(g);
    }
  });

  it("las etiquetas son las acordadas", () => {
    expect(generoLabel("Men")).toBe("Hombre");
    expect(generoLabel("Women")).toBe("Mujer");
    expect(generoLabel("Kids")).toBe("Niños");
    expect(generoLabel("Accessories")).toBe("Accesorios");
  });
});

describe("la FICHA del reclamo también muestra la etiqueta, no el valor", () => {
  // 🩸 Esto salió de una mutación que SOBREVIVIÓ: `ReclamoDetail` es la
  // pantalla de sólo lectura del reclamo y ningún test la pintaba, así que
  // devolverle `{item.genero}` crudo pasaba en verde con "Men" en pantalla.
  // Pintarla entera pide una decena de props y un reclamo completo; el barrido
  // alcanza porque el riesgo es un cambio literal de una expresión.
  // Los comentarios se BORRAN antes de mirar: si no, esta misma nota —que
  // nombra `item.genero`— haría pasar el candado con el código roto debajo.
  const src = readFileSync(
    path.join(RAIZ, "src/app/reclamos/components/ReclamoDetail.tsx"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

  it("las dos vistas (ficha y tabla) pasan el género por generoLabel", () => {
    const usos = src.match(/generoLabel\(item\.genero\)/g) ?? [];
    expect(usos.length).toBe(2);
  });

  it("y no queda ni un `item.genero` pintado crudo", () => {
    // El valor crudo SÍ puede seguir viviendo en el `value=` del <select> y en
    // el ternario que pregunta si está lleno — eso es el VALOR, no el texto.
    // Lo que no puede volver es imprimirlo: `{item.genero || "—"}`.
    expect(src).not.toMatch(/\{\s*item\.genero\s*\|\|\s*"—"\s*\}/);
    expect(src).not.toMatch(/>\s*\{\s*item\.genero\s*\}/);
  });

  it("el desplegable de edición sigue guardando el valor en inglés", () => {
    // El `value` de la <option> es el valor guardado; el texto, la etiqueta.
    expect(src).toMatch(/value=\{g\}>\{generoLabel\(g\)\}/);
  });
});

describe("el Excel que va al PROVEEDOR sigue llevando el valor guardado", () => {
  // Son marcas extranjeras y el documento sale del sistema hacia afuera:
  // traducirlo NO estaba pedido y cambiaría un papel que ya reciben así.
  // 🔄 11-sep-2026: el papel (PDF y Excel) pasó al orden de la pantalla y sus
  // celdas salen de `lib/reclamos/papel.ts` — el MISMO módulo para las dos
  // superficies. El `String(item.genero || "")` escrito a mano en
  // `excel-reclamo.ts` se fue con esa unificación; la regla que este candado
  // protege NO cambió y ahora se comprueba donde de verdad vive: el valor del
  // género que sale al papel es el GUARDADO, en inglés, y ninguna de las dos
  // superficies pasa por `generoLabel`.
  it("el papel devuelve el género GUARDADO, sin pasarlo por generoLabel", async () => {
    const { valorDeCelda } = await import("@/lib/reclamos/papel");
    expect(valorDeCelda({ genero: "Men" }, "genero")).toBe("Men");
    expect(valorDeCelda({ genero: "Kids" }, "genero")).toBe("Kids");
    expect(valorDeCelda({ genero: null }, "genero")).toBe("");
  });

  it("ni el Excel ni el PDF ni el módulo del papel conocen generoLabel", () => {
    for (const ruta of [
      "src/lib/excel-reclamo.ts",
      "src/lib/reclamos/pdf-bulk.ts",
      "src/lib/reclamos/papel.ts",
    ]) {
      const src = readFileSync(path.join(RAIZ, ruta), "utf8")
        .split("\n")
        .map((l) => l.replace(/\/\/.*$/, ""))
        .join("\n");
      expect(src, `${ruta} tradujo el género del papel`).not.toMatch(/generoLabel/);
    }
  });

  it("y el Excel de verdad escribe «Men», no «Hombre»", async () => {
    const XLSX = (await import("xlsx-js-style")).default;
    const { buildReclamoSheet } = await import("@/lib/excel-reclamo");
    const ws = buildReclamoSheet(
      { nro_reclamo: "R-1", empresa: "Fashion Wear" },
      [{ referencia: "A", descripcion: "Camisa", talla: "M", genero: "Men", cantidad: 1, precio_unitario: 10, motivo: "Faltante" }],
      [],
    );
    const texto = Object.keys(ws)
      .filter((k) => !k.startsWith("!"))
      .map((k) => String((ws[k] as { v?: unknown }).v ?? ""))
      .join("\n");
    expect(texto).toContain("Men");
    expect(texto).not.toContain("Hombre");
    expect(XLSX).toBeDefined();
  });
});
