// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CUENTAS POR COBRAR EN EL CELULAR: «LA LISTA ES LA CARTERA» (24-sep-2026).
//
// El interruptor de la pantalla de celular del CXC del grupo. `true` = la lista
// nueva; `false` = EXACTAMENTE la pantalla de antes (`PanelCxcMobile`), que no
// se tocó ni una línea y sigue con todos sus candados.
//
// 🩸 QUÉ ARREGLA, medido el 24-sep-2026 contra producción (100 clientes,
// $4.194.743,63):
//   · **83 de 100 montos salían redondeados** («$44K» por $43.806,10). El
//     redondeo escondía $20.794,51 en la suma de las 100 tarjetas, y el peor
//     caso erraba un 29 % (Chez Moi: «$1K» por $1.407,92).
//   · **Abría por el que menos plata tiene**: los 10 primeros sumaban el 2,0 %
//     de la cartera, y el más grande —City Mall Paso Canoa, $650.276— estaba en
//     la posición 66, a 15 pantallazos de arrastre.
//   · **141 de 300 chips por cliente se dibujaban vacíos** (47 %) y se llevaban
//     64 px de los 191 de cada tarjeta: 4,4 clientes por pantalla.
//   · El primer cliente arrancaba en y=490 de 844 px, con 14 cosas tocables
//     antes.
//
// 🔴 LO QUE NO CAMBIA, y hay candado que lo prueba (`cxc-celular.test.tsx`):
//   · La hoja «Cobrar» es la MISMA (`HojaCobrar`), con sus cuatro salidas, su
//     deshacer de 5 s, sus 6 empresas decididas por el SERVIDOR y su anotación
//     en los tres canales. Acá no se manda nada ni se arma un correo nuevo.
//   · Boston NUNCA se mezcla: sigue por su ruta, su pestaña y su botón.
//   · Los tramos son los tres de `cxc-aging`, el nombre del cliente el de
//     Switch (`nombre-cliente.ts`), y NINGÚN total se recalcula acá: los
//     números salen de las mismas lecturas que la computadora.
//   · La computadora no se toca: `ORDEN_AL_ABRIR` (más viejo sin pagar) sigue
//     siendo el orden de la tabla y de su candado.
//
// ⚠️ Es un interruptor de CÓDIGO, no de variable de entorno: Daniel prueba en
// producción y apagarlo es un cambio de una línea más un despliegue.
// ─────────────────────────────────────────────────────────────────────────────

/** `true` = el celular abre en la lista. `false` = la pantalla de antes. */
export const CXC_CELULAR = true;
