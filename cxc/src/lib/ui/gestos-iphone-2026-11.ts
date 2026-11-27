// ─────────────────────────────────────────────────────────────────────────────
// LOS GESTOS DEL IPHONE (27-nov-2026). Daniel: «En lugares de eliminar que sea
// como el barril de iphone. Desliza y elimina.» Y aprobó cuatro más. Solo en el
// teléfono; en la computadora no cambia nada.
//
// 1. Deslizar para ELIMINAR: el renglón a la izquierda muestra «Eliminar» en
//    rojo; tocarlo, o deslizar hasta el final (como en Mail), lo elimina con
//    «Deshacer» de 5 s. 🔴 Solo cambia el GESTO: cada pantalla llama a SU MISMO
//    borrado (soft delete, permisos y servidor iguales). Una sola pieza:
//    `SwipeableRow` con `eliminar` (`components/ui.tsx`).
// 2. Despachos › Pedidos: deslizar a la DERECHA avanza al siguiente paso, con
//    «Deshacer» 5 s, por la MISMA ruta y la misma regla de rol que el botón.
//    «Preparado» abre los bultos (obligatorios), no avanza solo.
// 3. Volver deslizando desde el borde izquierdo (`VolverDesdeElBorde`).
// 4. Mantener presionado = tarjeta de resumen, SOLO con lo que ya está en
//    pantalla (`TarjetaResumen`): CxC (saldo por empresa), Clientes, Despachos ›
//    Guías, Ventas › Clientes, Proveedores (sin «vencido») y Comisiones.
// 5. Tocar el encabezado sube la lista al principio.
// 6. Deslizar a la DERECHA = acción principal, por la MISMA ruta y el mismo rol:
//    Asistencia › Aprobaciones (derecha Sí, izquierda No, «Deshacer» 5 s; al
//    aprobar manda el servidor) · Recordatorios (cheque «Depositado», «Deshacer»
//    5 s) · CxC (abre «Estado de cuenta», NO envía) · Reclamos (abre «Cobrar»
//    con el total; no a los cobrados, NO cobra).
//
// `false` = lo de antes. Candados `borrar-al-deslizar.test.tsx` y
// `gestos-iphone.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

export const GESTOS_IPHONE_2026_11 = true;

/** Cuánto hay que deslizar para ejecutar sin tocar el botón (fracción del ancho). */
export const FRACCION_BORRAR_DE_UNA = 0.55;

/** Volver desde el borde: el dedo tiene que nacer en estos primeros px. */
export const BORDE_VOLVER_PX = 20;

/** Mantener presionado: cuánto, y cuánto puede moverse el dedo sin cancelarlo. */
export const MANTENER_MS = 500;
export const MANTENER_TOLERANCIA_PX = 10;
