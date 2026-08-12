// CANDADO — las tablas de Marketing no pueden volver a RECORTAR.
//
// 🩸 QUÉ PASÓ (jul-2026). Las tablas de "Anulados" y "Mobiliario" vivían dentro
// de un `rounded-* overflow-hidden` y SIN scroller propio adentro. Cuando el
// contenido no entra, `overflow-hidden` no arrastra: RECORTA. Medido contra el
// build de producción:
//
//   Anulados     @390 recorte 581px · @834 558px · @1440 16px
//   Mobiliario   @390 recorte 338px (productos) y 248px (resumen)
//                @834 recorte 134px y 44px
//
// Lo recortado en Anulados eran los botones "Restaurar" y "Eliminar": una
// ACCIÓN que la página promete por escrito y que en celular y iPad no se podía
// ejecutar de ninguna forma. En Mobiliario, 4 de 8 columnas del inventario.
//
// Este candado es ESTÁTICO (lee el JSX). No mide píxeles: mide las dos
// condiciones que PRODUCEN el recorte, que es lo que se puede verificar sin
// navegador y lo que un cambio futuro rompería sin darse cuenta.
//
//   1. Toda tabla envuelta en un contenedor `overflow-hidden` tiene que llevar
//      un `overflow-x-auto` propio entre medio. Sin él no hay ni la salida de
//      arrastrar.
//   2. En los anchos donde la tabla NO entra hay tarjetas: la tabla se muestra
//      desde `lg` y las tarjetas hasta `lg`. Un cambio que borre el bloque de
//      tarjetas, o que devuelva la tabla a un breakpoint menor, pone el build
//      en ROJO.
//   3. Las acciones de Anulados existen en LOS DOS layouts, marcadas con un
//      `data-fg-accion` fijo — nunca por clase de breakpoint: si el corte se
//      mueve, una búsqueda por `.md\:hidden` devuelve vacío y el chequeo pasa
//      sin comparar nada (pasó en esta misma jornada).

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const RAIZ = path.join(__dirname, "..", "..");

// ⚠️ "Anulados" ERA la otra tabla vigilada acá. La pantalla se retiró en
// ago-2026 con el rediseño por proveedor (`AnuladosLista.tsx` borrado), así que
// no queda nada que medir: sus tests se fueron con ella. Las facturas anuladas
// NO se perdieron — se ven y se restauran desde el detalle de su proyecto
// (`FacturasSection`), en una lista de tarjetas SIN tabla, o sea sin la clase de
// recorte que este archivo existe para prevenir. De las rutas `papelera/*` solo
// queda viva `papelera/restaurar` (el Deshacer); el GET de papelera y
// `papelera/limpieza` se retiraron el 11-ago-2026 con 0 llamadores. Si algún
// día vuelve una tabla de anulados, vuelve también a esta lista.
const MOBILIARIO = path.join(RAIZ, "app/marketing/mobiliario/page.tsx");

function leer(p: string): string {
  return readFileSync(p, "utf8");
}

/**
 * Para cada `<table` del archivo, camina hacia atrás por los `<div ...>` que lo
 * envuelven y devuelve, en orden de cercanía, las clases de esos contenedores.
 * Es una aproximación textual a propósito: alcanza para responder "¿hay un
 * overflow-x-auto entre la tabla y el overflow-hidden?".
 */
function contenedoresDeCadaTabla(src: string): string[][] {
  const salida: string[][] = [];
  for (const m of src.matchAll(/<table\b/g)) {
    const antes = src.slice(0, m.index ?? 0);
    // Los últimos 6 <div ...> abiertos antes de la tabla, del más cercano al
    // más lejano.
    const divs = [...antes.matchAll(/<div\b[^>]*>/g)].map((d) => d[0]);
    salida.push(divs.slice(-6).reverse());
  }
  return salida;
}

describe("Marketing — las tablas no pueden recortar", () => {
  const archivos: Array<[string, string]> = [["Mobiliario", MOBILIARIO]];

  for (const [nombre, ruta] of archivos) {
    it(`${nombre}: cada tabla tiene un scroller propio antes del overflow-hidden`, () => {
      const src = leer(ruta);
      const grupos = contenedoresDeCadaTabla(src);
      expect(grupos.length).toBeGreaterThan(0);

      for (const [i, contenedores] of grupos.entries()) {
        const idxScroller = contenedores.findIndex((c) =>
          c.includes("overflow-x-auto"),
        );
        const idxRecorta = contenedores.findIndex((c) =>
          /overflow-hidden/.test(c),
        );
        expect(
          idxScroller,
          `${nombre}: la tabla #${i} no tiene ningún contenedor con overflow-x-auto. ` +
            `Sin scroller, lo que no entra NO se puede ver de ninguna forma.`,
        ).toBeGreaterThanOrEqual(0);
        if (idxRecorta >= 0) {
          expect(
            idxScroller,
            `${nombre}: la tabla #${i} tiene un overflow-hidden MÁS CERCA que el ` +
              `overflow-x-auto. El que gana es el de adentro: vuelve a recortar.`,
          ).toBeLessThan(idxRecorta);
        }
      }
    });

    it(`${nombre}: la tabla se muestra desde lg y hay tarjetas debajo de lg`, () => {
      const src = leer(ruta);
      // La tabla vive detrás de `hidden lg:block`. Aceptar un breakpoint menor
      // sería volver a poner una tabla en un ancho donde no entra.
      expect(
        (src.match(/hidden lg:block/g) ?? []).length,
        `${nombre}: falta el gate "hidden lg:block" del bloque de tabla.`,
      ).toBe(grupoDeTablas(src));
      expect(
        /hidden (?:sm|md):block/.test(src),
        `${nombre}: hay una tabla mostrada desde sm/md. El ancho ÚTIL a 834px ` +
          `es 562px (la barra lateral se come 224px desde md): no entra.`,
      ).toBe(false);
      expect(
        (src.match(/lg:hidden/g) ?? []).length,
        `${nombre}: falta el bloque de TARJETAS (lg:hidden) que reemplaza a la tabla.`,
      ).toBeGreaterThanOrEqual(grupoDeTablas(src));
      expect(
        src.includes("data-fg-tarjeta"),
        `${nombre}: las tarjetas tienen que llevar data-fg-tarjeta para poder ` +
          `medirlas sin depender de clases de breakpoint.`,
      ).toBe(true);
    });
  }

});

/** Cuántos bloques de tabla tiene el archivo. */
function grupoDeTablas(src: string): number {
  return (src.match(/<table\b/g) ?? []).length;
}
