// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CUÁNTO ESPERA UNA PRUEBA ANTES DE DARSE POR VENCIDA (20-sep-2026)
//
// 🩸 EL DEFECTO: `waitFor` de Testing Library se rinde a los **1.000 ms** por
// omisión. En esta computadora alcanza de sobra; en la máquina de GitHub, que
// corre las 16.600 pruebas en paralelo, no. Resultado: el CI daba rojo al azar
// —`cxc-estado-cuenta-un-boton` el 20-sep, `guias-editar-no-guarda-sola` el
// 19— y el mismo archivo, corrido solo, pasaba 5 de 5.
//
// 🔑 ESTO NO ES SUBIR UN TOPE PARA TAPAR UNA PRUEBA ROTA. `waitFor` **reintenta
// hasta que la condición se cumple**: si el código está bien, termina en
// milisegundos y estos 5 segundos no se gastan nunca. Solo cambia cuánto está
// dispuesta a esperar antes de rendirse. Una prueba que de verdad falla, falla
// igual — cinco segundos más tarde.
//
// ⚠️ Lo que SÍ sería tapar el problema es una espera FIJA (`setTimeout` de N ms
// y después afirmar). Ésas se barrieron el 19-sep: eran 39 en 12 archivos.
// Si vuelven a aparecer, el arreglo es cambiarlas por `waitFor`, no subir esto.
// ─────────────────────────────────────────────────────────────────────────────

import { configure } from "@testing-library/react";

// ⚠️ 23-sep-2026: eran 5.000 ms, EXACTAMENTE el tope que Vitest le da a una
// prueba por omisión — así que la prueba se moría en el mismo instante en que
// `waitFor` iba a rendirse y el margen nunca se usaba. Ahora el tope de Vitest
// está en 20.000 (`vitest.config.ts`) y esta espera tiene aire de sobra: el
// PDF del estado de cuenta tardaba más de 5 s en la máquina de GitHub.
configure({ asyncUtilTimeout: 10_000 });
