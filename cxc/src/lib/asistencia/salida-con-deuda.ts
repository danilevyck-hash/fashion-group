// ─────────────────────────────────────────────────────────────────────────────
// QUIEN SE VA DEBIENDO, SE DICE AL DAR DE BAJA. Módulo PURO.
//
// Daniel, 5-sep-2026: al marcar la fecha de salida de alguien con deuda hay que
// avisar **ahí mismo**: «Debe $100 — descuéntalo de la liquidación». Es el
// momento en que se decide la liquidación, y el único en que ese dato sirve:
// después la persona ya cobró y la plata se fue. **Sin Telegram** — el aviso va
// donde se toma la decisión.
//
// 🩸 El aviso vivía solo en el panel desplegable de la lista vieja
// (`ConfiguracionTab`), que con la página de la persona prendida nunca se
// dibuja: dar de baja desde `/asistencia/colaboradores/<código>` decía «Listo,
// guardado» y nada más (auditoría del 11-sep-2026). El candado seguía verde
// porque era un barrido de TEXTO sobre ese archivo, no sobre la pantalla viva.
//
// UNA definición del texto, para la ficha, la lista vieja y el toast: la deuda
// es la de las TRES cuentas (`calcularSaldoPrestamo(...).saldo`, vía
// `leerDeudaPorCodigo`), nunca una sola.
// ─────────────────────────────────────────────────────────────────────────────

const plata = (n: number) => `$${n.toFixed(2)}`;

/** «Debe $100.00 en Préstamos — descuéntalo de la liquidación.» `null` sin deuda. */
export function avisoSalidaConDeuda(deuda: number | null | undefined): string | null {
  const d = Number(deuda ?? 0);
  if (!(d > 0)) return null;
  return `Debe ${plata(d)} en Préstamos — descuéntalo de la liquidación.`;
}

/**
 * El aviso de «guardado» cuando se puso fecha de salida: dice quién, desde
 * cuándo, y — si debe — cuánto. La ficha se cierra al guardar, así que el
 * recordatorio viaja también en el toast.
 */
export function avisoGuardadoConSalida(quien: string, fechaSalida: string, deuda: number | null | undefined): string {
  const base = `Listo. ${quien} no sale en las quincenas posteriores al ${fechaSalida}; las anteriores quedan igual.`;
  const aviso = avisoSalidaConDeuda(deuda);
  return aviso ? `${base} ${aviso}` : base;
}
