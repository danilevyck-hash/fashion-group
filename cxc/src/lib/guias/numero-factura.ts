// ─────────────────────────────────────────────────────────────────────────────
// EL NÚMERO DE FACTURA DE UN RENGLÓN — se GUARDA completo, se MUESTRA corto.
// (módulo PURO: sin React, sin fetch, sin reloj)
//
// Daniel, 5-sep-2026: *«¿Sugieres agregar la factura completa pero que solo se
// refleje los últimos 4 dígitos?»* → sí.
//
// 🩸 QUÉ PASABA. El atajo de «marcar facturas» (4-sep-2026) guarda el
// `secuencial` crudo de Switch — `11-000002534` — y las personas escribieron
// siempre el número corto. Medido contra producción el 5-sep-2026: de los 566
// renglones vivos, **565 traen el formato corto y 1 el largo** (la guía 242,
// la primera hecha con el atajo). Dos consecuencias, las dos malas:
//   · el papel, el PDF y el Excel imprimían 12 caracteres donde siempre hubo 4;
//   · el aviso «ya salió en otra guía» comparaba `11-000002534` contra la clave
//     `2534` de los renglones viejos, así que NUNCA pareaba con ninguno.
//
// 🔴 LA REGLA, y las tres mitades importan:
//   1. Se GUARDA lo que Switch manda, completo. Es el dato que identifica el
//      comprobante sin ambigüedad, y tirarlo al escribir no se puede deshacer.
//   2. Se MUESTRA el número corto (los últimos 4 dígitos) en pantalla, papel,
//      PDF y Excel — que es lo que la bodega y el transportista leen.
//   3. Se COMPARA por los últimos 4 dígitos **DENTRO DE LA MISMA EMPRESA**.
//
// 🔴 POR QUÉ LA EMPRESA ES PARTE DE LA CLAVE, medido el 5-sep-2026 sobre las
// **10.279** facturas de 2026 (`switch_facturas`, tipo `Factura`):
//   · acotando por empresa, los últimos 4 dígitos dan **10.279 claves
//     distintas** — no se repiten NI UNA vez;
//   · sin acotar por empresa quedan **7.830** claves: **2.449** choques.
// O sea: comparar sin empresa inventaría avisos «ya salió» falsos. La empresa
// ya era parte de la clave antes de este cambio y no se toca.
//
// ⚠️ LO QUE NO ES UN NÚMERO DE FACTURA NO ENTRA A LA COMPARACIÓN. `Traslado`
// (el envío sin factura) y el `0000` viejo — **67 renglones vivos** — dan clave
// vacía a propósito: si `0000` se indexara, dos traslados de la misma empresa
// se acusarían entre sí de «ya salió».
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cuántos dígitos del final identifican una factura. Cuatro, porque es lo que
 * las personas escribieron siempre (649 de los 670 números tecleados en guías
 * vivas tienen exactamente 4 dígitos) y porque dentro de una empresa alcanzan.
 */
export const DIGITOS_DE_LA_FACTURA = 4;

/**
 * El formato largo que manda Switch: `11-000002534` (serie, guion, correlativo
 * con ceros). Se reconoce por su FORMA, nunca por su largo total: recortar
 * cualquier texto con guion convertiría `FA-0012` en algo que no es.
 */
const SECUENCIAL_SWITCH = /^\s*\d{1,3}-\d{5,}\s*$/;

/** Solo los dígitos de un texto. `"11-000002534"` → `"11000002534"`. */
function digitos(v: string | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

/**
 * La CLAVE de comparación de UN número: sus últimos 4 dígitos.
 *
 * `""` cuando no hay con qué comparar: sin dígitos (`Traslado`), o todos ceros
 * (`0000`, `00000`) — que es el vocabulario viejo de «este envío no lleva
 * factura», no un comprobante.
 *
 * Con menos de 4 dígitos se devuelven los que haya (`985` → `985`): recortar no
 * puede inventar dígitos que no existen.
 */
export function claveDeFactura(v: string | null | undefined): string {
  const d = digitos(v);
  if (d === "" || /^0+$/.test(d)) return "";
  return d.length > DIGITOS_DE_LA_FACTURA ? d.slice(-DIGITOS_DE_LA_FACTURA) : d;
}

/**
 * UN número tal como se MUESTRA. El largo de Switch se recorta a sus últimos 4
 * dígitos; **cualquier otra cosa se deja EXACTAMENTE como está** — `2534`,
 * `0000`, `Traslado`, `FA-0012` y los 5 dígitos de `23589` salen tal cual.
 *
 * ⚠️ Recortar solo el formato de Switch, y no «todo lo que tenga más de 4
 * dígitos», es a propósito: hay 12 renglones vivos con facturas de 5 dígitos
 * escritas a mano, y esas son el número REAL, no un secuencial con ceros.
 */
export function facturaParaMostrar(v: string | null | undefined): string {
  const t = String(v ?? "");
  if (!SECUENCIAL_SWITCH.test(t)) return t;
  const corta = claveDeFactura(t);
  return corta === "" ? t : corta;
}

/**
 * El CAMPO `facturas` entero tal como se muestra: `"11-000002534, 11-000002540"`
 * → `"2534, 2540"`. Los separadores de la persona se conservan (se parte por
 * coma, que es el separador que valida el formulario) y lo que no es un
 * secuencial de Switch no se toca.
 */
export function facturasParaMostrar(campo: string | null | undefined): string {
  const t = String(campo ?? "");
  if (!t.includes(",")) return facturaParaMostrar(t);
  return t
    .split(",")
    .map((parte) => {
      const recortado = facturaParaMostrar(parte.trim());
      // Se conserva el espacio de después de la coma que el formulario exige.
      return recortado;
    })
    .join(", ");
}
