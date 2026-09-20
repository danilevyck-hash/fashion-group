/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — GUÍAS › CONFIGURACIÓN NO LLAMA IGUAL A DOS COSAS DISTINTAS.
 *
 * 🩸 Daniel preguntó qué hace «el de siempre» y pidió simplificar la pantalla.
 * El diagnóstico fueron DOS confusiones, no una:
 *
 *   1. Ahí conviven **dos listas que se llamaban las dos «destinos»**:
 *      · `guias_destino_cliente` — a dónde entrega CADA CLIENTE; lo marcado se
 *        escribe solo al armar la guía. Lo administran admin y secretaria.
 *      · `guias_destino_lista` — los BOTONES DE LUGARES que salen debajo del
 *        campo dirección. Sin dueño, y bodega también puede agregar.
 *      Llamarlas igual obliga a leer las dos tarjetas enteras para saber cuál
 *      es cuál.
 *
 *   2. «el de siempre» aparecía como ESTADO y como ACCIÓN con la MISMA frase.
 *
 * 🔴 NO SE FUSIONAN: tienen dueños y permisos distintos, y es un invariante
 * escrito. Lo único que cambió son rótulos y una línea de ayuda por tarjeta —
 * cero cambios en la base, cero en lo que se guarda, cero en los permisos. La
 * última parte de este archivo es el CONTROL de eso.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  ACCION_PONER_SIEMPRE,
  AYUDA_DIRECCIONES_QUE_SUGIERE,
  AYUDA_DONDE_ENTREGA_CADA_CLIENTE,
  MARCA_SIEMPRE,
  ROTULO_DIRECCIONES_QUE_SUGIERE,
  ROTULO_DONDE_ENTREGA_CADA_CLIENTE,
  palabraDeLaMarca,
} from "@/lib/guias/rotulos-configuracion";
import { comoSeUsa } from "@/lib/guias/destinos-config";
import { DESTINOS_LISTA_ROLES_ESCRITURA } from "@/lib/guias/destinos-lista";
import { CONFIG_GUIAS_ROLES } from "@/lib/guias/destinos-config";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(path.join(raiz, r), "utf8");

/**
 * 🩸 LOS COMENTARIOS SE BORRAN ANTES DE BARRER. La nota que cuenta esta misma
 * historia nombra «el de siempre» a propósito —es el porqué—, y contarla sería
 * un candado que se caza a sí mismo.
 */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const vista = sinComentarios(leer("src/app/guias/components/GuiasConfiguracionView.tsx"));
const lista = sinComentarios(leer("src/app/guias/components/DestinosListaConfig.tsx"));
const reglas = sinComentarios(leer("src/lib/guias/destinos-config.ts"));

describe("🔴 las dos tarjetas ya no se llaman igual", () => {
  it("la de arriba dice a dónde entrega CADA CLIENTE", () => {
    expect(ROTULO_DONDE_ENTREGA_CADA_CLIENTE).toBe("Dónde entrega cada cliente");
    expect(vista).toContain("{ROTULO_DONDE_ENTREGA_CADA_CLIENTE}");
    expect(vista).not.toContain("Destinos por cliente");
  });

  it("la de abajo dice que son las direcciones que sugiere el sistema", () => {
    expect(ROTULO_DIRECCIONES_QUE_SUGIERE).toBe("Direcciones que sugiere el sistema");
    expect(lista).toContain("{ROTULO_DIRECCIONES_QUE_SUGIERE}");
    expect(lista).not.toContain("Destinos que ofrece el campo Dirección");
  });

  it("cada una lleva SU línea de ayuda, y dicen cosas distintas", () => {
    expect(AYUDA_DONDE_ENTREGA_CADA_CLIENTE).toBe("Lo marcado se escribe solo al armar la guía.");
    expect(AYUDA_DIRECCIONES_QUE_SUGIERE).toBe(
      "Los botones que salen debajo del campo dirección. No están atados a ningún cliente.",
    );
    expect(vista).toContain("{AYUDA_DONDE_ENTREGA_CADA_CLIENTE}");
    expect(lista).toContain("{AYUDA_DIRECCIONES_QUE_SUGIERE}");
    expect(AYUDA_DONDE_ENTREGA_CADA_CLIENTE).not.toBe(AYUDA_DIRECCIONES_QUE_SUGIERE);
  });

  it("🔴 y los cuatro rótulos son distintos entre sí", () => {
    const todos = [
      ROTULO_DONDE_ENTREGA_CADA_CLIENTE,
      ROTULO_DIRECCIONES_QUE_SUGIERE,
      AYUDA_DONDE_ENTREGA_CADA_CLIENTE,
      AYUDA_DIRECCIONES_QUE_SUGIERE,
    ];
    expect(new Set(todos).size).toBe(todos.length);
    // Ninguno de los dos títulos arranca con la misma palabra: es lo primero
    // que se lee al bajar por la pantalla.
    expect(ROTULO_DONDE_ENTREGA_CADA_CLIENTE.split(" ")[0]).not.toBe(
      ROTULO_DIRECCIONES_QUE_SUGIERE.split(" ")[0],
    );
  });
});

describe("🔴 «el de siempre» no vuelve como texto suelto", () => {
  it("no aparece en ninguna de las dos pantallas ni en las reglas", () => {
    for (const [nombre, src] of [
      ["la pantalla de configuración", vista],
      ["la tarjeta de direcciones", lista],
      ["las reglas", reglas],
    ] as const) {
      expect(src.toLowerCase(), `«el de siempre» volvió a ${nombre}`).not.toContain("el de siempre");
    }
  });

  it("⚠️ pero la COLUMNA y el campo del API no se tocaron", () => {
    // Renombrar el rótulo no puede renombrar el dato: `el_de_siempre` es la
    // columna de `guias_destino_cliente` y `elDeSiempre` el campo del PATCH.
    expect(vista).toContain("f.el_de_siempre");
    expect(vista).toContain("elDeSiempre: true");
    expect(reglas).toContain("el_de_siempre: boolean;");
    expect(leer("src/lib/guias/destinos-config-server.ts")).toContain("el_de_siempre");
  });

  it("el estado y la acción son DOS palabras distintas", () => {
    expect(MARCA_SIEMPRE).toBe("Siempre");
    expect(ACCION_PONER_SIEMPRE).toBe("Poner siempre");
    expect(MARCA_SIEMPRE).not.toBe(ACCION_PONER_SIEMPRE);
    expect(palabraDeLaMarca(true)).toBe(MARCA_SIEMPRE);
    expect(palabraDeLaMarca(false)).toBe(ACCION_PONER_SIEMPRE);
  });

  it("el renglón de un destino usa una u otra según su estado", () => {
    expect(vista).toContain("{f.el_de_siempre ? MARCA_SIEMPRE : ACCION_PONER_SIEMPRE}");
  });

  it("y el chip del histórico dice la MISMA palabra, no una tercera", () => {
    expect(vista).toContain("ACCION_PONER_SIEMPRE : \"Definir\"");
  });

  it("el texto de «cómo se usa» habla de la marca, no de la frase vieja", () => {
    expect(comoSeUsa(2, true)).toContain(`«${MARCA_SIEMPRE}»`);
    expect(comoSeUsa(1, false)).toContain(`«${ACCION_PONER_SIEMPRE}»`);
    expect(comoSeUsa(1, true)).toBe("Se llena solo al elegir el cliente.");
    expect(comoSeUsa(2, false)).toBe("Se ofrecen como botones y la persona elige.");
  });
});

describe("🔴 el chip dice la verdad: si dice «Poner siempre», pone siempre", () => {
  it("solo cuando el cliente todavía no tiene NINGÚN destino definido", () => {
    // Con destinos ya definidos sigue diciendo «Definir» y hace lo de antes:
    // mover la marca de un cliente ya configurado es otra decisión.
    expect(vista).toContain("onPromover(g.codigo, h, n === 0)");
    expect(vista).toContain("n === 0 ? ACCION_PONER_SIEMPRE : \"Definir\"");
  });

  it("y entonces marca la fila recién creada", () => {
    expect(vista).toContain("async function promover(codigo: string, destino: string, comoSiempre = false)");
    expect(vista).toContain("if (comoSiempre && id !== null)");
    expect(vista).toContain('body: JSON.stringify({ elDeSiempre: true }),');
  });
});

describe("⚠️ CONTROL — las dos listas siguen SIN fusionarse", () => {
  it("son dos tablas, dos rutas y dos tarjetas", () => {
    expect(leer("src/lib/guias/destinos-config-server.ts")).toContain("guias_destino_cliente");
    expect(leer("src/lib/guias/destinos-lista-server.ts")).toContain("guias_destino_lista");
    expect(vista).toContain('fetch("/api/guias/destinos-config"');
    expect(lista).toContain('fetch("/api/guias/destinos-lista"');
    expect(vista).toContain("<DestinosListaConfig onAviso={setToast} />");
  });

  it("y con permisos DISTINTOS: bodega agrega direcciones, no destinos de cliente", () => {
    expect([...DESTINOS_LISTA_ROLES_ESCRITURA]).toContain("bodega");
    expect([...CONFIG_GUIAS_ROLES]).not.toContain("bodega");
  });
});
