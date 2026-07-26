// ─────────────────────────────────────────────────────────────────────────────
// Formato ÚNICO de precio para los catálogos (Reebok / Joybees / Tommy).
//
// Regla de Daniel (26-jul-2026): **nunca redondear y nunca mostrar `.00`**.
//   $35        ← precio entero
//   $12.50     ← precio con medio dólar
//   $4,422     ← total entero (con separador de miles)
//   $37.50     ← total que cae en medio
//
// Por qué existe este archivo y no se toca `fmt`/`fmtMoney` de src/lib/format:
// ese formateo lo comparten CXC, cheques, comisiones y estados de cuenta, donde
// el `.00` SÍ corresponde — son montos contables, no precios de lista. Acá se
// formatea lo que ve un cliente en una vitrina.
//
// Qué decimales existen de verdad (auditado contra la base el 26-jul-2026):
// de los 797 productos de las 3 marcas, 729 tienen precio entero y 68 terminan
// en `.50` (67 Tommy + 1 Joybees `UKTRK.MPS`). NINGUNO tiene otro decimal. Aun
// así el helper es general: un `.98` saldría `$49.98`, no `$50`.
//
// El bug que cierra: la celda del PDF de catálogo usaba `toFixed(0)`, que
// redondea — $12.50 se imprimía "$13" — y el catálogo del vendedor de Reebok
// hacía lo mismo en pantalla vía `vendorFmtDecimals: 0`. Las otras dos marcas
// mostraban `$35.00`. Ni redondeo ni `.00`: un solo formato para las 3.
// ─────────────────────────────────────────────────────────────────────────────

/** ¿El monto cae en un dólar exacto (ya redondeado al centavo)? */
function esEntero(n: number): boolean {
  return Number.isInteger(Math.round(n * 100) / 100);
}

/** Número del precio SIN el signo: `35`, `12.50`, `4,422`. */
export function precioTexto(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: esEntero(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** Precio listo para mostrar: `$35`, `$12.50`, `$4,422`. */
export function fmtPrecio(n: number): string {
  return `$${precioTexto(n)}`;
}
