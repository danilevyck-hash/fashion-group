// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LO QUE SE LIMPIÓ DE GUÍAS EL 5-sep-2026, con su medición.
//
// Cuatro decisiones de Daniel, todas contra producción y todas en un archivo
// porque comparten la misma regla de la casa: **lo que se retira son los
// LECTORES, no la columna** (patrón `mayor_lineas` / `cxc_favorites`).
//
//   · Punto 6 — el texto técnico de Observaciones: *«dejar de mostrarlo»*.
//   · Punto 7 — el ámbar, solo para lo que se puede arreglar: *«sí, ya que
//     igual no se puede editar después de cerrarlas ni cerrarlas sin los campos
//     obligatorios»*.
//   · Punto 8 — los restos que ninguna pantalla muestra: *«sí»*.
//   · Punto 9 — el estado «Rechazada»: *«quitarlo»*.
//   · Punto 13 — «Changinola» → «Changuinola»: *«es changuinola»*.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { observacionesVisibles, TEXTO_CIERRE_EN_BLOQUE } from "@/lib/guias/observaciones";
import {
  FECHA_BLOQUEO_DESPACHO,
  despachadaIncompleta,
  faltantesDeLaDespachada,
} from "@/lib/guias/faltantes-despacho";
import { guiaYaDespachada } from "@/lib/guias/modo-despacho";
import { DEFAULT_DIRECCIONES } from "@/app/guias/components/constants";

const raiz = process.cwd();
const leer = (p: string) => readFileSync(path.join(raiz, p), "utf8");
const MIGRACIONES = path.join(raiz, "supabase/migrations");

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 6 · el rastro del cierre en bloque deja de mostrarse (54 guías)", () => {
  const SOLA = `${TEXTO_CIERRE_EN_BLOQUE}.`;

  it("una guía que SOLO tiene esa línea queda sin observaciones (51 medidas)", () => {
    expect(observacionesVisibles(SOLA)).toBe("");
    expect(observacionesVisibles(TEXTO_CIERRE_EN_BLOQUE)).toBe("");
  });

  it("🔴 las observaciones REALES se conservan (las 3 medidas con texto propio)", () => {
    expect(observacionesVisibles(`Devolucion de mueble\n${SOLA}`)).toBe("Devolucion de mueble");
    expect(
      observacionesVisibles(`Dollar mall lleva una caja de ganchos \nAmerica clasid david  lleva  2 bultos   de  boston\n${SOLA}`),
    ).toBe("Dollar mall lleva una caja de ganchos \nAmerica clasid david  lleva  2 bultos   de  boston");
  });

  it("una observación normal no se toca", () => {
    expect(observacionesVisibles("Tienda # 10 metromall")).toBe("Tienda # 10 metromall");
    expect(observacionesVisibles("")).toBe("");
    expect(observacionesVisibles(null)).toBe("");
  });

  it("🔴 se compara la LÍNEA entera, no un pedazo suelto", () => {
    // Una nota que mencione la fecha no puede desaparecer.
    expect(observacionesVisibles("Salió el 3-ago-2026 con Mojica")).toBe("Salió el 3-ago-2026 con Mojica");
  });

  it("se esconde en las cinco superficies de lectura", () => {
    for (const p of [
      "src/app/guias/components/PrintDocument.tsx",
      "src/lib/guias/pdf-guia.ts",
      "src/app/guias/components/GuiasList.tsx",
      "src/app/guias/[id]/page.tsx",
      "src/lib/guias/png-guia.ts",
    ]) {
      expect(leer(p), p).toContain("observacionesVisibles");
    }
  });

  it("🔴 y NINGUNA dibuja el campo crudo por otro camino", () => {
    // Importar la función y no usarla en el bloque que se pinta es exactamente
    // la mutación que hay que cazar.
    const casos: Array<[string, RegExp]> = [
      ["src/app/guias/components/GuiasList.tsx", /expandedGuia\.observaciones(?!\s*\))/],
      ["src/lib/guias/pdf-guia.ts", /g\.observaciones(?!\s*\))/],
      ["src/app/guias/[id]/page.tsx", /g\.observaciones(?!\s*\))/],
      ["src/app/guias/components/PrintDocument.tsx", /g\.observaciones(?!\s*\))/],
      ["src/lib/guias/png-guia.ts", /g\.observaciones(?!\s*\))/],
    ];
    for (const [ruta, prohibido] of casos) {
      const sinComentarios = leer(ruta)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(sinComentarios, ruta).not.toMatch(prohibido);
    }
  });

  it("🔴 NO se borra de la base: ninguna migración toca `observaciones`", () => {
    for (const f of readdirSync(MIGRACIONES).filter((n) => n.endsWith(".sql"))) {
      const sql = readFileSync(path.join(MIGRACIONES, f), "utf8");
      expect(sql, f).not.toMatch(/UPDATE\s+guia_transporte[\s\S]{0,200}observaciones/i);
    }
  });

  it("⚠️ el campo que se EDITA sigue trayendo el texto guardado", () => {
    // Si el formulario mostrara el texto recortado, guardar lo borraría.
    const form = leer("src/app/guias/components/GuiaForm.tsx");
    expect(form).toContain("value={observaciones}");
    expect(form).not.toContain("observacionesVisibles");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 7 · el ámbar, solo para lo que se puede arreglar", () => {
  const rota = {
    estado: "Completada",
    tipo_despacho: "externo",
    placa: "",
    receptor_nombre: "",
    cedula: "",
  };

  it("el corte es el día en que placa/receptor/cédula empezaron a bloquear", () => {
    expect(FECHA_BLOQUEO_DESPACHO).toBe("2026-08-10");
  });

  it("🩸 una guía ANTERIOR al bloqueo ya no se marca (las 65 medidas)", () => {
    expect(faltantesDeLaDespachada({ ...rota, fecha: "2026-08-09" })).toEqual([]);
    expect(despachadaIncompleta({ ...rota, fecha: "2026-04-15" })).toBe(false);
  });

  it("🔴 una guía del día del bloqueo o posterior SÍ se marca: la regla no se apagó", () => {
    expect(faltantesDeLaDespachada({ ...rota, fecha: "2026-08-10" })).toEqual([
      "la placa",
      "quién recibió",
      "la cédula",
    ]);
    expect(despachadaIncompleta({ ...rota, fecha: "2026-09-04" })).toBe(true);
  });

  it("⚠️ sin fecha legible se MARCA: ante la duda se dice", () => {
    expect(despachadaIncompleta(rota)).toBe(true);
    expect(despachadaIncompleta({ ...rota, fecha: "no es fecha" })).toBe(true);
  });

  it("🔴 el N° del transportista NO lleva corte: ése sí se anota tarde", () => {
    // 22 guías vivas lo tienen vacío y se arreglan desde la pantalla — con un
    // corte por fecha, las viejas dejarían de encontrarse.
    const modo = leer("src/lib/guias/modo-despacho.ts");
    const bloque = modo.slice(modo.indexOf("export function guiaSinNumeroTransp"));
    expect(bloque).not.toContain("FECHA_BLOQUEO_DESPACHO");
    expect(bloque).not.toContain("g.fecha");
  });

  it("⚠️ MARCA, NO ABRE: placa, receptor y cédula siguen cerradas", () => {
    const editables = leer("src/lib/guias/campos-editables.ts");
    for (const cerrado of ["placa", "receptor_nombre", "cedula"]) {
      expect(editables).not.toContain(`"${cerrado}"`);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 8 · los restos muertos: sin lectores, y la columna NO se dropea", () => {
  const MUERTAS = [
    "firma_transportista",
    "nombre_entregador",
    "cedula_entregador",
    "motivo_rechazo",
    "monto_total",
  ];

  const CODIGO = [
    "src/app/api/guias/route.ts",
    "src/app/api/guias/[id]/route.ts",
    "src/app/guias/components/types.ts",
    "src/app/guias/components/GuiasList.tsx",
    "src/app/guias/components/GuiaForm.tsx",
    "src/app/guias/components/excel-guias.ts",
    "src/app/guias/components/PrintDocument.tsx",
    "src/lib/guias/pdf-guia.ts",
    "src/lib/guias/png-guia.ts",
  ];

  it.each(MUERTAS)("nadie lee ni escribe `%s` en guías", (col) => {
    for (const p of CODIGO) {
      // Los comentarios explican por qué se fueron; el CÓDIGO no la nombra.
      const sinComentarios = leer(p)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
      expect(sinComentarios, `${p} · ${col}`).not.toContain(col);
    }
  });

  it("🔴 NINGUNA migración las dropea (patrón mayor_lineas / cxc_favorites)", () => {
    for (const f of readdirSync(MIGRACIONES).filter((n) => n.endsWith(".sql"))) {
      const sql = readFileSync(path.join(MIGRACIONES, f), "utf8").toLowerCase();
      for (const col of MUERTAS) {
        expect(sql, `${f} · ${col}`).not.toMatch(
          new RegExp(`alter\\s+table\\s+guia_transporte[\\s\\S]{0,200}drop\\s+column[\\s\\S]{0,40}${col}`),
        );
      }
    }
  });

  it("y quedan documentadas con COMMENT en su migración", () => {
    const mig = leer("supabase/migrations/20261006120000_guias_columnas_retiradas.sql");
    for (const col of MUERTAS) expect(mig).toContain(`guia_transporte.${col}`);
    expect(mig).not.toMatch(/DROP\s+COLUMN/i);
  });

  it("⚠️ CONTROL — las DOS firmas que SÍ se usan no se tocaron", () => {
    // Están llenas en el 70% de las guías y son lo que el papel imprime. El
    // parecido de los nombres con `firma_transportista` es la trampa.
    for (const viva of ["firma_base64", "firma_entregador_base64"]) {
      expect(leer("src/app/api/guias/[id]/route.ts")).toContain(viva);
      expect(leer("src/lib/guias/pdf-guia.ts")).toContain(viva);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 9 · el estado «Rechazada» se retiró (0 de 242 guías)", () => {
  it("una guía «Rechazada» ya no cuenta como despachada", () => {
    expect(guiaYaDespachada("Rechazada")).toBe(false);
    expect(guiaYaDespachada("Completada")).toBe(true);
    expect(guiaYaDespachada("Pendiente Bodega")).toBe(false);
  });

  it("el PATCH ya no acepta `motivo_rechazo`", () => {
    const ruta = leer("src/app/api/guias/[id]/route.ts");
    const allowed = /const allowed = \[[^\]]*\]/.exec(ruta)?.[0] ?? "";
    expect(allowed.length).toBeGreaterThan(0);
    expect(allowed).not.toContain("motivo_rechazo");
  });

  it("los juegos frecuentes piden solo «Completada»", () => {
    const ruta = leer("src/app/api/guias/despachos-frecuentes/route.ts");
    expect(ruta).toContain('.eq("estado", "Completada")');
    expect(ruta).not.toContain('.in("estado"');
  });

  it("no queda ningún botón ni texto de rechazar en la pantalla", () => {
    for (const p of [
      "src/app/guias/components/GuiasList.tsx",
      "src/app/guias/[id]/page.tsx",
      "src/app/guias/components/DespachoForm.tsx",
    ]) {
      expect(leer(p), p).not.toMatch(/Rechazar|Motivo de rechazo/);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 13 · «Changuinola» con «u» (Daniel: «es changuinola»)", () => {
  it("la lista que el formulario OFRECE ya no propone la grafía mala", () => {
    expect(DEFAULT_DIRECCIONES).toContain("Changuinola");
    expect(DEFAULT_DIRECCIONES).not.toContain("Changinola");
  });

  it("🔴 la migración corrige el histórico acotada al valor EXACTO, nunca un LIKE", () => {
    const mig = leer("supabase/migrations/20261005120000_guias_changuinola.sql");
    // Solo el SQL: los comentarios explican justamente qué NO se hizo.
    const sql = mig.replace(/^--.*$/gm, "");
    expect(sql).toContain("SET direccion = 'Changuinola'");
    expect(sql).toContain("WHERE btrim(direccion) = 'Changinola'");
    // Un `%changinola%` pisaría «Changinola pasillo 4», que dice algo más.
    expect(sql).not.toMatch(/LIKE|%/i);
  });

  it("⚠️ y no toca `guia_transporte`: ni estado, ni firmas, ni bultos", () => {
    const sql = leer("supabase/migrations/20261005120000_guias_changuinola.sql").replace(/^--.*$/gm, "");
    expect(sql).not.toMatch(/UPDATE\s+guia_transporte/i);
    expect(sql).not.toMatch(/\bbultos\b\s*=/);
  });
});
