// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL PARPADEO AL TOCAR «EDITAR» — la mitad que se puede probar sin navegador.
//
// 🩸 EL DEFECTO: la pantalla de una guía nacía en modo LECTURA (`useState(false)`)
// y recién DESPUÉS del primer dibujo un `useEffect` leía `?editar=1`. Tocar
// «Editar» en la lista pintaba la guía entera —datos, envíos, bloque de
// despacho— y un instante después la reemplazaba por el formulario. Medido con
// capturas en secuencia: a los 100 ms se veía la pantalla equivocada.
//
// 🔑 EL ARREGLO NO ES UN `useEffect` MÁS RÁPIDO: es leer la URL **antes** del
// primer dibujo, en el inicializador perezoso de `useState`. Para eso la
// lectura tiene que ser una función PURA — y por eso se puede probar acá.
//
// 🩸 Y LA SEGUNDA MITAD: al cerrar la edición la URL seguía diciendo
// `?editar=1`, así que recargar, compartir el enlace o darle "atrás" reabría el
// formulario que la persona acababa de cerrar.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { abrirEnEdicion, urlDeLaGuia, QUERY_EDITAR } from "@/lib/guias/abrir-en-edicion";

describe("¿la guía se abre con el formulario ya abierto?", () => {
  it("`?editar=1` la abre — es la puerta única, la misma del camino viejo", () => {
    expect(abrirEnEdicion("?editar=1")).toBe(true);
    // Sin el "?" de adelante también: quien llama pasa `window.location.search`,
    // que a veces viene pelado.
    expect(abrirEnEdicion("editar=1")).toBe(true);
  });

  it("sin query, en lectura", () => {
    expect(abrirEnEdicion("")).toBe(false);
    expect(abrirEnEdicion(null)).toBe(false);
    expect(abrirEnEdicion(undefined)).toBe(false);
  });

  it("🔴 solo `1` abre: cualquier otro valor NO", () => {
    // Un `?editar=0` o `?editar=true` que abriera el formulario sería abrirlo
    // por accidente sobre una guía que alguien está mirando.
    for (const v of ["0", "true", "si", "", "2"]) {
      expect(abrirEnEdicion(`?editar=${v}`), v).toBe(false);
    }
  });

  it("convive con otros parámetros, en cualquier orden", () => {
    expect(abrirEnEdicion("?de=lista&editar=1&x=2")).toBe(true);
    expect(abrirEnEdicion("?de=lista&x=2")).toBe(false);
  });

  it("🔴 un query roto NO puede tumbar la pantalla: se abre en lectura", () => {
    expect(abrirEnEdicion("?%")).toBe(false);
    expect(abrirEnEdicion("?a=%E0%A4%A")).toBe(false);
  });
});

describe("🔴 la dirección dice lo que se está viendo", () => {
  it("al abrir, la URL lo dice; al cerrar, deja de decirlo", () => {
    expect(urlDeLaGuia("abc", true)).toBe(`/guias/abc?${QUERY_EDITAR}=1`);
    expect(urlDeLaGuia("abc", false)).toBe("/guias/abc");
  });

  it("🩸 cerrar sobre una URL que YA decía `editar=1` la limpia de verdad", () => {
    // Éste es el defecto exacto: se cerraba el formulario y la URL seguía
    // pidiéndolo, así que recargar lo reabría.
    expect(urlDeLaGuia("abc", false, "?editar=1")).toBe("/guias/abc");
  });

  it("🔴 los demás parámetros se conservan — no se rompe ningún enlace", () => {
    expect(urlDeLaGuia("abc", false, "?editar=1&de=lista")).toBe("/guias/abc?de=lista");
    expect(urlDeLaGuia("abc", true, "?de=lista")).toBe("/guias/abc?de=lista&editar=1");
  });

  it("abrir dos veces no duplica el parámetro", () => {
    expect(urlDeLaGuia("abc", true, "?editar=1")).toBe("/guias/abc?editar=1");
  });

  it("ida y vuelta: lo que `urlDeLaGuia` escribe, `abrirEnEdicion` lo lee igual", () => {
    for (const inicial of ["", "?editar=1", "?de=lista", "?editar=1&de=lista"]) {
      for (const abierto of [true, false]) {
        const url = urlDeLaGuia("abc", abierto, inicial);
        const query = url.includes("?") ? url.slice(url.indexOf("?")) : "";
        expect(abrirEnEdicion(query), `${inicial} → ${abierto}`).toBe(abierto);
      }
    }
  });
});
