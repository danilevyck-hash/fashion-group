/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 LA LISTA DE DESTINOS ES DEL EQUIPO, NO DE UN NAVEGADOR (7-sep-2026)
 *
 * Daniel, textual: *«lo de solo ver en mi pantalla no tiene lógica, el sistema
 * debe de trabajar todo igual, que sea para todo»* y *«quítame hola»*.
 *
 * 🩸 La lista que ofrece el campo Dirección vivía en `localStorage`
 * (`fg_direcciones`, con `loadList`/`saveList`): lo que agregaba Angela no lo
 * veía nadie más, y **no se podía quitar desde ninguna pantalla** — se podía
 * agregar, nunca borrar. Así quedó vivo para siempre un destino de prueba
 * llamado «hola» en un solo navegador.
 *
 * Lo que este archivo fija:
 *   1. la lista vive en la BASE (`guias_destino_lista`) y el formulario la pide
 *      por `/api/guias/destinos-lista` — nunca más del `localStorage`;
 *   2. la SEMILLA sale de lo que de verdad se usa (medido), jamás del
 *      `localStorage` de nadie: «hola» no entra;
 *   3. si se puede agregar, se puede QUITAR — soft delete FIRMADO, nunca DELETE;
 *   4. el repetido se rechaza por clave EXACTA, jamás por parecido;
 *   5. sin la migración corrida, el campo sigue ofreciendo los cinco de siempre
 *      (el código no degrada);
 *   6. el destino REPETIDO no se dibuja como botón.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import {
  DESTINOS_BASE,
  DESTINOS_LISTA_ROLES_ESCRITURA,
  DESTINOS_LISTA_ROLES_LECTURA,
  listaParaElCampo,
  textoQuitarDeLaLista,
  validarDestinoDeLista,
  yaEstaEnLaLista,
} from "@/lib/guias/destinos-lista";
import { botonesDeDestino, botonesQueSeDibujan } from "@/lib/guias/destinos-clientes";

const raiz = process.cwd();
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

const MIGRACION = "supabase/migrations/20261014120000_guias_destino_lista.sql";
const migracion = leer(MIGRACION);
const servidor = leer("src/lib/guias/destinos-lista-server.ts");
const ruta = leer("src/app/api/guias/destinos-lista/route.ts");
const hook = leer("src/app/guias/components/useGuiaFormState.ts");
const constantes = leer("src/app/guias/components/constants.ts");

// ─── 1 · la lista vive en la base, no en un navegador ────────────────────────

describe("🔴 1. lo que alguien agrega queda para TODOS", () => {
  it("el formulario pide la lista a la ruta compartida, no al localStorage", () => {
    // La LECTURA, con su forma completa: si alguien la cambia de ruta, esto se
    // pone rojo aunque la escritura siga apuntando a la buena.
    expect(hook).toContain('fetch("/api/guias/destinos-lista", { cache: "no-store" })');
    // Y la escribe por la misma puerta.
    const alta = /function addDireccion[\s\S]*?\n  \}/.exec(hook)?.[0] ?? "";
    expect(alta).toContain('fetch("/api/guias/destinos-lista"');
    expect(alta).toContain('method: "POST"');
  });

  it("🩸 la clave `fg_direcciones` no la USA más ningún archivo", () => {
    // Un barrido global: alcanza con que UN archivo la vuelva a leer o escribir
    // para que la lista se parta en dos otra vez. ⚠️ Se busca la clave ENTRE
    // COMILLAS (el uso), no la palabra: los comentarios que cuentan esta
    // historia la nombran, y contarlos sería un candado que se caza a sí mismo.
    const rastro = barrer(/["']fg_direcciones["']/);
    expect(rastro, `todavía hay código guardando la lista en el navegador: ${rastro.join(", ")}`).toEqual([]);
  });

  it("🩸 `loadList` y `saveList` se retiraron, con su nota", () => {
    expect(constantes).not.toMatch(/export function (loadList|saveList)/);
    // La nota fechada se queda: es el porqué.
    expect(constantes).toContain("7-sep-2026");
    expect(constantes).toContain("localStorage");
  });

  it("⚠️ localStorage SIGUE valiendo para las comodidades de cada persona", () => {
    // CONTROL: esto no es una cruzada contra localStorage. El último
    // transportista y quién despacha siguen siendo de cada quien.
    const form = leer("src/app/guias/components/GuiaForm.tsx");
    expect(form).toContain("fg_entregadores");
  });
});

/** Barre `src/` (sin los tests) buscando un patrón. Devuelve los archivos. */
function barrer(re: RegExp): string[] {
  const encontrados: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (rel === "src/__tests__") continue;
        recorrer(rel);
      } else if (/\.tsx?$/.test(e.name) && re.test(readFileSync(path.join(raiz, rel), "utf8"))) {
        encontrados.push(rel);
      }
    }
  };
  recorrer("src");
  return encontrados;
}

// ─── 2 · la semilla sale de lo medido, no de un navegador ────────────────────

describe("🔴 2. la semilla es lo que de verdad se usa — «hola» no entra", () => {
  it("no siembra el destino de prueba de nadie", () => {
    expect(migracion.toLowerCase()).not.toMatch(/'hola'/);
  });

  it("siembra los 17 destinos con 3+ usos medidos el 7-sep-2026", () => {
    const filas = migracion.match(/^\s{2}\('.*?',\s+'sistema'/gm) ?? [];
    expect(filas.length, "la semilla cambió de tamaño sin remedirla").toBe(17);
    // Los cinco de siempre tienen que estar: son los que ofrecía la lista vieja.
    for (const d of DESTINOS_BASE) expect(migracion).toContain(`('${d}'`);
    // Y las grafías que Daniel ya definió ganan sobre el typo del histórico.
    expect(migracion).toContain("('Penonomé'");
    expect(migracion).not.toContain("('Penonome'");
    expect(migracion).toContain("('Chorrera'");
    expect(migracion).not.toContain("('CHORRERA'");
  });

  it("«Changuinola» con «u», acá también", () => {
    expect(migracion).toContain("Changuinola");
    expect(migracion).not.toContain("Changinola");
    expect(DESTINOS_BASE).toContain("Changuinola");
    expect(DESTINOS_BASE).not.toContain("Changinola");
  });
});

// ─── 3 · si se agrega, se quita — y nada se borra ────────────────────────────

describe("🔴 3. quitar existe, y es SOFT DELETE FIRMADO", () => {
  it("la ruta tiene DELETE y el servidor lo resuelve con activo = false", () => {
    expect(ruta).toContain("export async function DELETE");
    expect(servidor).toContain("activo: false");
    expect(servidor).toContain("desactivado_por");
    expect(servidor).toContain("desactivado_en");
  });

  it("🔴 NUNCA un DELETE de verdad, ni en el servidor ni en la migración", () => {
    expect(servidor).not.toMatch(/\.delete\(/);
    expect(migracion).not.toMatch(/DELETE FROM/i);
    // La tabla ni siquiera le da permiso de DELETE al rol del servidor.
    expect(migracion).toMatch(/GRANT SELECT, INSERT, UPDATE ON guias_destino_lista/);
  });

  it("la baja se FIRMA — la tabla lo exige con un CHECK", () => {
    expect(migracion).toMatch(/CHECK \(activo OR \(desactivado_por IS NOT NULL AND desactivado_en IS NOT NULL\)\)/);
  });

  it("el texto de la confirmación dice qué cambia, en palabras", () => {
    expect(textoQuitarDeLaLista("Aguadulce")).toBe(
      "El campo Dirección dejará de ofrecer «Aguadulce» a todo el equipo.",
    );
  });

  it("quién agrega y quién quita: agregar es de quien arma la guía; quitar, de quien administra", () => {
    expect([...DESTINOS_LISTA_ROLES_ESCRITURA]).toEqual(["admin", "secretaria", "bodega"]);
    // Es la MISMA lista que crea guías: no se escribe a mano dos veces.
    const lista = leer("src/app/guias/components/GuiasList.tsx");
    expect(lista).toContain('export const CREATE_ROLES = ["admin", "secretaria", "bodega"]');
    // Quitar va con los roles de Configuración (admin y secretaria).
    expect(ruta).toContain("CONFIG_GUIAS_ROLES");
    expect([...DESTINOS_LISTA_ROLES_LECTURA]).toContain("vendedor");
  });
});

// ─── 4 · el repetido, por clave exacta y jamás por parecido ──────────────────

describe("🔴 4. el repetido se reconoce por regla EXACTA", () => {
  it("«DAVID» no entra dos veces, ni «Paso Canoa» sobre «Paso Canoas»", () => {
    expect(yaEstaEnLaLista("DAVID", ["David"])).toBe(true);
    expect(yaEstaEnLaLista("  david  ", ["David"])).toBe(true);
    expect(yaEstaEnLaLista("Paso Canoa", ["Paso Canoas"])).toBe(true);
    expect(yaEstaEnLaLista("Penonome", ["Penonomé"])).toBe(true);
  });

  it("🔴 pero NADA por parecido: un typo es otro destino, y los dígitos mandan", () => {
    expect(yaEstaEnLaLista("Wesland", ["Westland"])).toBe(false);
    expect(yaEstaEnLaLista("Westland · tienda 5", ["Westland · tienda 6"])).toBe(false);
    expect(yaEstaEnLaLista("Aguadulce", ["Albrook", "David"])).toBe(false);
  });

  it("el servidor lo comprueba, no solo la pantalla", () => {
    // Dentro del ALTA, no en el import: la pantalla puede saltarse la
    // comprobación (otra sesión, otro navegador) y el servidor no.
    const alta = /export async function agregarALaLista[\s\S]*?\n\}/.exec(servidor)?.[0] ?? "";
    expect(alta).toContain("yaEstaEnLaLista");
    expect(alta).toContain("Ese destino ya está en la lista");
  });

  it("lo que llega vacío o gigante se rechaza con texto, no a medias", () => {
    expect(validarDestinoDeLista({ destino: "   " })).toEqual({ ok: false, error: "Escribe el destino" });
    expect(validarDestinoDeLista({})).toEqual({ ok: false, error: "Escribe el destino" });
    expect(validarDestinoDeLista({ destino: "x".repeat(500) }).ok).toBe(false);
    expect(validarDestinoDeLista({ destino: "  Aguadulce " })).toEqual({ ok: true, valor: "Aguadulce" });
  });
});

// ─── 5 · sin la migración, la pantalla sigue funcionando ─────────────────────

describe("🔴 5. el código NO degrada si la DDL no corrió", () => {
  it("la lista vacía cae a los cinco de siempre", () => {
    expect(listaParaElCampo([])).toEqual([...DESTINOS_BASE]);
    expect(listaParaElCampo(null)).toEqual([...DESTINOS_BASE]);
    expect(listaParaElCampo(undefined)).toEqual([...DESTINOS_BASE]);
  });

  it("con filas de la base manda la base, sin repetidos y sin inventar grafías", () => {
    expect(listaParaElCampo(["Aguadulce", "AGUADULCE", " Bugaba "])).toEqual(["Aguadulce", "Bugaba"]);
  });

  it("la lectura del formulario FALLA ABIERTA (nunca lanza)", () => {
    const fn = /export async function leerListaODefaults[\s\S]*?\n\}/.exec(servidor)?.[0] ?? "";
    expect(fn).toContain("catch");
    expect(fn).toContain("DESTINOS_BASE");
  });

  it("y la ruta contesta 200 con lista vacía cuando la tabla todavía no existe", () => {
    // Un 500 acá dejaría la pantalla de Configuración en rojo por una
    // migración pendiente.
    expect(ruta).toContain("sinTabla: true");
  });

  it("el formulario arranca con la red puesta: el campo nunca queda sin sugerencias", () => {
    expect(hook).toContain("useState<string[]>([...DESTINOS_BASE])");
  });
});

// ─── 6 · el destino repetido no se dibuja ────────────────────────────────────

describe("🔴 6. un botón que dice lo mismo que el campo NO se dibuja", () => {
  // Daniel: *«si el cliente tiene un solo destino y ya está escrito en el
  // campo, no dibujar el botón. No ofrece nada.»*
  it("UNO solo, ya escrito → cero botones", () => {
    expect(botonesQueSeDibujan(["Paso Canoas"], "Paso Canoas")).toEqual([]);
    // También si lo escribieron distinto: la clave es exacta pero normaliza.
    expect(botonesQueSeDibujan(["Paso Canoas"], "PASO CANOAS")).toEqual([]);
    // Y con la tienda pegada: se compara contra la BASE del campo.
    expect(botonesQueSeDibujan(["Westland"], "Westland · tienda 6")).toEqual([]);
  });

  it("UNO solo con el campo VACÍO (o con otra cosa) → sí se dibuja", () => {
    expect(botonesQueSeDibujan(["Paso Canoas"], "")).toEqual(["Paso Canoas"]);
    expect(botonesQueSeDibujan(["Paso Canoas"], "David")).toEqual(["Paso Canoas"]);
  });

  it("⚠️ con VARIOS se dibujan TODOS, incluido el que coincide: ahí sí ofrecen algo", () => {
    expect(botonesQueSeDibujan(["Sport Corner Calidonia", "Chorrera"], "Chorrera")).toEqual([
      "Sport Corner Calidonia",
      "Chorrera",
    ]);
    // Y también cuando el que coincide es el PRIMERO: la regla mira CUÁNTOS
    // hay, no cuál está de primero.
    expect(botonesQueSeDibujan(["Chorrera", "Sport Corner Calidonia"], "Chorrera")).toEqual([
      "Chorrera",
      "Sport Corner Calidonia",
    ]);
  });

  it("la regla vive en el módulo puro y la pantalla la usa", () => {
    const comp = leer("src/app/guias/components/DestinosDelCliente.tsx");
    expect(comp).toContain("botonesQueSeDibujan(");
    // CONTROL: el que decide QUÉ botones hay sigue siendo el de siempre.
    expect(botonesDeDestino("D-81", [], undefined)).toEqual(["Paso Canoas"]);
  });

  it("⚠️ la fila de TIENDAS no se pierde: es otra pregunta", () => {
    const comp = leer("src/app/guias/components/DestinosDelCliente.tsx");
    expect(comp).toContain("botones.length === 0 && tiendas.length === 0");
  });
});
