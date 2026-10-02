// ─────────────────────────────────────────────────────────────────────────────
// TODO CRECE EN PROPORCIÓN CON LA PANTALLA, NADA SE ESTIRA (2-oct-2026, v3).
//
// Daniel, 2-oct-2026, mirando las versiones anteriores:
//   · sobre la lista de CxC a todo el ancho: «se ve peor así alargado, ¿no es
//     mejor agrandarlo?»;
//   · sobre el panel de Nuevo gasto con su propia escala: «no va con el sistema».
//
// La regla: UNA sola escala para TODAS las pantallas, como macOS con «texto más
// grande». Hasta 1279 px todo queda como hoy; desde 1280 px la letra base pasa
// de 14 a 15 px, desde 1600 a 16 y desde 1920 a 18, y TODO lo demás crece en la
// misma proporción: campos, espacios, íconos, el menú, los paneles y las hojas.
// Cada pantalla conserva su forma: una tabla se ve más grande y legible, no más
// ancha; un panel lateral mide lo mismo en proporción. En el celular nada cambia.
//
// Se hace en UN lugar: `SidebarAwareMain` pone la clase y `globals.css` escala
// la raíz (`html`) con `zoom`, así también escala lo que se pinta fuera del
// contenedor (desplegables, calendarios, el vidrio). Las rutas sin barra
// lateral (catálogo público, pedidos públicos) no la llevan.
// Candado: `src/__tests__/navegacion/escala-pantalla.test.tsx`.
//
// 🔴 PRENDIDO desde el 2-oct-2026 (Daniel aprobó). `false` = como antes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 Todo crece en proporción con la pantalla. `false` = como antes.
 * Daniel aprobó el 2-oct-2026 («si te parece sí»), con Nuevo gasto en la misma
 * ventana centrada de Reclamos y Marketing.
 */
export const ESCALA_PANTALLA_2026_10 = true;

/** La clase que activa la escala en `globals.css`. */
export const CLASE_ESCALA_PANTALLA = "escala-pantalla";
