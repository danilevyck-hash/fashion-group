// Una barra pegajosa se pega DEBAJO del encabezado, nunca encima (11-sep-2026).
//
// 🩸 Daniel, textual, con captura de Ventas › Clientes: *«mira cómo se corta
// arriba; y así también pasa en otros módulos, para que chequees y arregles
// eso»*. La barra de filtros de esa pantalla era `sticky top-0 z-20` y el
// `AppHeader` es `sticky top-0 z-10`: mismo tope y MÁS z-index, así que al
// hacer scroll la barra se montaba encima del logo, del breadcrumb, del
// buscador y del usuario. No era un defecto de Ventas: era que cada barra
// elegía su propio número.
//
// Acá viven las DOS cosas que hacían falta y no existían:
//
//   1. `VAR_ALTURA_ENCABEZADO` — el alto REAL del encabezado pegajoso de la
//      pantalla, medido y publicado por quien lo dibuja (`AppHeader` en la
//      app, `CatalogoNavbar` en el catálogo con sesión). Se mide, no se
//      escribe: en el escritorio el encabezado lleva la tira del breadcrumb
//      (≈70 px) y en el celular no (≈46 px), y el módulo que la usa no tiene
//      por qué saber cuál de las dos le tocó.
//
//   2. `CLASE_BARRA_PEGAJOSA` — la ÚNICA forma de pegar una barra de contenido.
//      Pone `position: sticky`, `top: var(--fg-altura-encabezado)` y un
//      z-index POR DEBAJO del encabezado. Su cuerpo vive en `globals.css`.
//
// 🔴 Ningún módulo vuelve a escribir `sticky top-0` ni `top-14` a mano en una
// barra de contenido. Lo exige `src/__tests__/lib/barras-pegajosas.test.ts`.
//
// ⚠️ Lo que NO cubre, a propósito: los `<thead>`/`<th>` con `sticky top-0`
// adentro de una tabla con scroll propio (se pegan al CONTENEDOR, no a la
// página) y las cabeceras de los modales (se pegan al panel del modal). Esas
// no compiten con el encabezado de la app y cambiarlas las rompería.

/** Nombre de la variable CSS con el alto del encabezado pegajoso, en px. */
export const VAR_ALTURA_ENCABEZADO = "--fg-altura-encabezado";

/** Clase única de «barra pegajosa debajo del encabezado». Cuerpo en globals.css. */
export const CLASE_BARRA_PEGAJOSA = "fg-barra-pegajosa";

/**
 * z-index del encabezado (`AppHeader`) y de las barras de contenido.
 *
 * 🔴 La barra va DEBAJO: es la regla entera del arreglo. Los dos números viven
 * acá para que se lean juntos — separados es como nació el z-20 contra z-10.
 */
export const Z_ENCABEZADO = 10;
export const Z_BARRA_PEGAJOSA = 9;

/** Alto de respaldo mientras el encabezado no se midió (o no hay encabezado). */
export const ALTURA_ENCABEZADO_INICIAL = "0px";
