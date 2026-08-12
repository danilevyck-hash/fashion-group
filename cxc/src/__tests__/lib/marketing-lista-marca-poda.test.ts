// ============================================================================
// Candado — los 7 sobrantes de la lista de marca (poda del 11-ago-2026,
// aprobados por Daniel tras la barrida del PR #480).
//
// Lo que protege:
//   1. La columna MARCAS (chips C/T) no vuelve a la lista: la lista YA está
//      acotada a una marca (la columna repetía el título) y las marcas del
//      proyecto se ven en su ficha.
//   2. El subtítulo "Proyectos con gasto de esta marca" no vuelve.
//   3. La etiqueta Apertura/Remodelacion (p.nombre) no vuelve a la FILA —
//      queda en Editar/ficha como etiqueta opcional.
//   4. El chip "Muebles" no vuelve (redundante con "N entregas").
//   5. Los contadores solo dicen los que NO son cero, desde el módulo puro
//      contadoresDeProyecto — nada de "0 fotos". Con todos en cero, la fila
//      dice "Sin gastos todavía".
//   6. Los enlaces Mobiliario · Reportes · Impulsadoras se fueron de la
//      cabecera de la lista (viven en el inicio; Reportes ganó su tarjeta ahí
//      — ese candado vive en marketing-inicio-marcas.test.ts). La línea de
//      cuadre de Impulsadoras al pie SÍ se queda.
//   7. Las rutas muertas se retiraron (papelera GET, papelera/limpieza,
//      anulados/eliminar-bulk — 0 llamadores, verificado dos veces) y
//      papelera/restaurar (el Deshacer) sigue viva.
//
// Verificado por mutación: devolver la columna Marcas rompe 1, devolver el
// chip Muebles rompe 1, escribir los contadores a mano en la vista rompe 1,
// mostrar un contador en cero rompe 3, y resucitar una ruta muerta rompe 1.
// ============================================================================
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { contadoresDeProyecto } from "@/lib/marketing/normalizar";

const RAIZ = path.join(__dirname, "..", "..");

function leer(rel: string): string {
  return readFileSync(path.join(RAIZ, rel), "utf8");
}

/** Sin comentarios: los comentarios SÍ pueden nombrar la historia. */
function sinComentarios(src: string): string {
  return src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

const VISTA = "app/marketing/components/ProyectosHomeView.tsx";

describe("contadoresDeProyecto — solo se dicen los que no son cero", () => {
  it("todos con valor: los tres, con el separador de siempre", () => {
    expect(
      contadoresDeProyecto({ facturas: 2, entregas: 1, fotos: 3 }),
    ).toBe("2 facturas · 1 entrega · 3 fotos");
  });

  it("los ceros no se dicen — nada de '0 fotos'", () => {
    expect(contadoresDeProyecto({ facturas: 2, entregas: 1, fotos: 0 })).toBe(
      "2 facturas · 1 entrega",
    );
    expect(contadoresDeProyecto({ facturas: 5, entregas: 0, fotos: 0 })).toBe(
      "5 facturas",
    );
    expect(contadoresDeProyecto({ facturas: 0, entregas: 3, fotos: 0 })).toBe(
      "3 entregas",
    );
    expect(contadoresDeProyecto({ facturas: 0, entregas: 0, fotos: 7 })).toBe(
      "7 fotos",
    );
  });

  it("singular y plural, por contador", () => {
    expect(contadoresDeProyecto({ facturas: 1, entregas: 0, fotos: 1 })).toBe(
      "1 factura · 1 foto",
    );
    expect(contadoresDeProyecto({ facturas: 3, entregas: 2, fotos: 0 })).toBe(
      "3 facturas · 2 entregas",
    );
  });

  it("con TODOS en cero la fila lo dice con palabras, no queda vacía", () => {
    // Decisión del 11-ago-2026: un subtítulo vacío se lee como que a la fila
    // le falta cargar algo; "Sin gastos todavía" dice lo que pasa.
    expect(contadoresDeProyecto({ facturas: 0, entregas: 0, fotos: 0 })).toBe(
      "Sin gastos todavía",
    );
  });
});

describe("la fila de proyecto quedó podada (y la vista usa el módulo puro)", () => {
  const src = leer(VISTA);
  const limpio = sinComentarios(src);

  it("los contadores salen de contadoresDeProyecto, no de una segunda cuenta", () => {
    expect(src).toContain("contadoresDeProyecto({");
    // La forma vieja (contador incondicional con su plural inline) no vuelve.
    expect(limpio).not.toMatch(/p\.fotos_count === 1 \? "foto" : "fotos"/);
    expect(limpio).not.toMatch(/p\.facturas_count === 1 \? "factura" : "facturas"/);
  });

  it("la columna MARCAS no vuelve", () => {
    expect(limpio).not.toMatch(/>\s*Marcas\s*</);
    expect(limpio).not.toMatch(/colorParaMarca/);
    expect(limpio).not.toMatch(/p\.marcas\.map/);
  });

  it("el subtítulo de la cabecera no vuelve", () => {
    // El comentario del archivo SÍ lo nombra (explica por qué se fue).
    expect(limpio).not.toContain("Proyectos con gasto de esta marca");
  });

  it("la etiqueta del tipo de gasto (Apertura/Remodelacion) no vuelve a la fila", () => {
    expect(limpio).not.toMatch(/subtituloTipo/);
    // El título sigue anclado al cliente, con el nombre solo de fallback.
    expect(src).toMatch(/p\.tienda \|\| p\.nombre/);
  });

  it('el chip "Muebles" no vuelve (redundante con "N entregas")', () => {
    expect(limpio).not.toMatch(/>\s*Muebles\s*</);
    expect(src).not.toContain("Este proyecto tiene entregas de muebles");
  });

  it("los enlaces de arriba se fueron; el cuadre de Impulsadoras se queda", () => {
    // Sin puertas de navegación en la cabecera: eso vive en el inicio.
    expect(limpio).not.toMatch(/onOpenReportes|onOpenInventario/);
    // La línea de cuadre al pie NO es un enlace de navegación: es el dato de
    // impulsadoras de ESTA marca, y sin ella el detalle visible no suma igual
    // que el bloque del inicio.
    expect(src).toMatch(/impulsadoraTotal > 0/);
    expect(src).toMatch(/onClick=\{onOpenImpulsadoras\}/);
    // La única acción de la cabecera sigue siendo registrar gasto.
    expect(src).toContain("+ Registrar gasto");
  });
});

describe("las rutas muertas se retiraron; el Deshacer sigue vivo", () => {
  it.each([
    "app/api/marketing/papelera/route.ts",
    "app/api/marketing/papelera/limpieza/route.ts",
    "app/api/marketing/anulados/eliminar-bulk/route.ts",
  ])("%s se borró", (rel) => {
    expect(existsSync(path.join(RAIZ, rel))).toBe(false);
  });

  it("papelera/restaurar SE QUEDA — es la vuelta atrás del eliminar", () => {
    expect(
      existsSync(path.join(RAIZ, "app/api/marketing/papelera/restaurar/route.ts")),
    ).toBe(true);
    // Y la vista la sigue llamando desde el aviso con "Deshacer".
    expect(leer(VISTA)).toContain("/api/marketing/papelera/restaurar");
  });

  it("los hard-delete huérfanos no quedaron en las librerías", () => {
    const mutations = sinComentarios(leer("lib/marketing/mutations.ts"));
    expect(mutations).not.toMatch(
      /function\s+(eliminarProyectoPermanente|eliminarFacturaPermanente|limpiezaAnualAnulados)/,
    );
    // El soft delete y su restauración siguen intactos.
    expect(mutations).toMatch(/function\s+anulacionSoftDelete/);
    expect(mutations).toMatch(/restaurarProyecto|restaurarFactura/);
    const queries = sinComentarios(leer("lib/marketing/queries.ts"));
    expect(queries).not.toMatch(/function\s+getAnulados/);
  });
});
