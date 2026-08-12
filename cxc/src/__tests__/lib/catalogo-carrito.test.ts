// EL CARRITO MUERE CON LA PESTAÑA (12-ago-2026).
//
// Daniel: *"el carrito no te debe de guardar cuando sales del catálogo… así
// como cuando entro después de 2 semanas y veo artículos seleccionados"*. Lo
// aprobado es vida de SESIÓN: sobrevive navegar y refrescar dentro de la misma
// pestaña, muere al cerrarla.
//
// Lo que estos casos protegen, en las dos direcciones:
//  · una sesión NUEVA arranca vacía (aunque localStorage tenga el carrito viejo
//    ya migrado — o sea, entrar dos semanas después da carrito vacío);
//  · el trabajo a medias de HOY no se descarta en silencio: lo guardado por el
//    esquema viejo se lee UNA última vez y se limpia.

import { describe, it, expect, beforeEach } from "vitest";
import { leerCarrito, guardarCarrito, limpiarCarrito } from "@/lib/catalogo/carrito";
import { getMarcaTheme, MARCAS_UI } from "@/lib/catalogo/marcas-ui";

const KEY = "reebok_cart";
const ITEM = { product_id: "p1", sku: "RBK-1", name: "Classic", image_url: "", quantity: 2, unit_price: 20 };

// Nota de entorno (la misma de useLastUsed.test.ts): Node expone un
// `localStorage` global stub SIN métodos que pisa al de jsdom, así que se
// instala un polyfill in-memory propio — el mismo que lee el módulo y que
// aserta el test. `sessionStorage.clear()` acá equivale a CERRAR la pestaña.
function makeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", { value: makeStorage(), configurable: true, writable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: makeStorage(), configurable: true, writable: true });
});

describe("carrito con vida de SESIÓN", () => {
  it("guarda en sessionStorage y NUNCA en localStorage", () => {
    guardarCarrito(KEY, [ITEM]);
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual([ITEM]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("sobrevive dentro de la misma pestaña (navegar / refrescar)", () => {
    guardarCarrito(KEY, [ITEM]);
    // Otro montaje del componente = otra lectura del MISMO sessionStorage.
    expect(leerCarrito(KEY)).toEqual([ITEM]);
  });

  it("una sesión NUEVA arranca vacía — entrar dos semanas después no revive nada", () => {
    guardarCarrito(KEY, [ITEM]);
    sessionStorage.clear(); // cerrar la pestaña
    expect(leerCarrito(KEY)).toEqual([]);
  });

  it("limpiar vacía la sesión (y cualquier resto viejo)", () => {
    guardarCarrito(KEY, [ITEM]);
    localStorage.setItem(KEY, JSON.stringify([ITEM]));
    limpiarCarrito(KEY);
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(leerCarrito(KEY)).toEqual([]);
  });
});

describe("migración del esquema viejo — se lee UNA vez y se limpia", () => {
  it("el carrito que quedó en localStorage se rescata en la primera lectura", () => {
    localStorage.setItem(KEY, JSON.stringify([ITEM]));
    expect(leerCarrito(KEY)).toEqual([ITEM]);
    // Ya migrado: vive en la sesión y la copia vieja se borró.
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual([ITEM]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("migrado UNA vez, la sesión siguiente ya no lo revive", () => {
    localStorage.setItem(KEY, JSON.stringify([ITEM]));
    leerCarrito(KEY);          // sesión de hoy: lo rescata
    sessionStorage.clear();    // se cierra la pestaña
    expect(leerCarrito(KEY)).toEqual([]); // dos semanas después: vacío
  });

  it("lo que hay en la SESIÓN manda sobre el resto viejo (y lo borra)", () => {
    guardarCarrito(KEY, []);                       // el vendedor vació el carrito
    localStorage.setItem(KEY, JSON.stringify([ITEM])); // resto de ayer
    expect(leerCarrito(KEY)).toEqual([]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("data corrupta no revienta: carrito vacío", () => {
    sessionStorage.setItem(KEY, "{no es json");
    expect(leerCarrito(KEY)).toEqual([]);
    localStorage.setItem(KEY, JSON.stringify({ no: "es un arreglo" }));
    sessionStorage.clear();
    expect(leerCarrito(KEY)).toEqual([]);
  });
});

describe("las 4 marcas comparten el mecanismo", () => {
  it("cada marca tiene UNA sola clave de carrito y son distintas entre sí", () => {
    const keys = MARCAS_UI.map((m) => getMarcaTheme(m)!.cartKey);
    expect(keys.length).toBe(4);
    expect(new Set(keys).size).toBe(4);
    // Las claves históricas se conservan — es lo que hace posible la migración.
    expect(keys).toEqual(["reebok_cart", "joybees_cart", "tommy_cart", "calvin_cart"]);
  });

  it("los carritos de dos marcas no se pisan", () => {
    guardarCarrito("reebok_cart", [ITEM]);
    expect(leerCarrito("tommy_cart")).toEqual([]);
    expect(leerCarrito("reebok_cart")).toEqual([ITEM]);
  });

  it("el catálogo PÚBLICO usa el mismo mecanismo, con su propia clave", () => {
    const theme = getMarcaTheme("tommy")!;
    expect(theme.publicCartKey).toBe("tommy_public_cart");
    guardarCarrito(theme.publicCartKey, [ITEM]);
    expect(localStorage.getItem(theme.publicCartKey)).toBeNull();
    sessionStorage.clear();
    expect(leerCarrito(theme.publicCartKey)).toEqual([]);
  });
});
