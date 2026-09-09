// ─────────────────────────────────────────────────────────────────────────────
// LA CABEZA DEL ESTADO DE CUENTA: QUIÉN COBRA (9-sep-2026).
//
// El papel de Switch abre con la empresa acreedora escrita como en su registro:
// el nombre legal, la identificación, el teléfono y el correo. Ninguno de esos
// cuatro datos existe en la base del sistema — `EMPRESA_KEY_TO_NAME` guarda el
// nombre corto («Fashion Wear»), no el legal («FASHION WEAR, INC»).
//
// 🔴 ES UNA LISTA ESCRITA A MANO, como el amarre de proveedores y el alias de
// vendedores. No se DERIVA del número fiscal de las facturas: la identificación
// está adentro de `numero_fiscal` («FE01 2 000040254-103-278837-…») sin ningún
// separador que diga dónde termina, y sacarla a fuerza de recortar ceros es
// exactamente el «adivinar» que esta casa tiene prohibido.
//
// 🔴 YA ESTÁN LAS SEIS (9-sep-2026). Daniel bajó de Switch el papel de cada una
// y dictó el nombre legal y la identificación, verbatim. Hasta ese día solo se
// conocía Fashion Wear y las otras cinco salían sin esas líneas.
//
// 🔴 DOS COSAS SE APARTAN DE LO QUE DICE SWITCH, POR DECISIÓN DE DANIEL:
//
//   1. **El teléfono va VACÍO en las seis.** Switch tampoco lo trae. La línea
//      `TEL:` sale como en el papel de Switch, sin número.
//
//   2. **El correo de las SEIS es `info@fashiongr.com`.** Textual: *«los correos
//      de todos debe de ser info@fashiongr.com»*. Los papeles de Switch traen
//      cuatro direcciones distintas y viejas (`vistanaa@cwpanama.net`,
//      `alberto@cboston.net`, `albertolevyalberto@cboston.net` y
//      `fashionvista.pa@gmail.com`) — **ninguna se usa**.
//
// 🔑 POR ESO EL CORREO SE ESCRIBE UNA SOLA VEZ, en `CORREO_DEL_GRUPO`, y las
// seis fichas se ARMAN con él. Repetirlo seis veces es cómo se llega a que el
// día que cambie quede corregido en cinco empresas y viejo en la sexta.
//
// ⚠️ Una empresa que no esté en esta lista sale con el nombre corto de siempre y
// sin las líneas de identificación, teléfono ni correo — **nunca con los datos
// de otra**.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El correo que va en el papel de las SEIS. Un solo lugar, a propósito
 * (Daniel, 9-sep-2026: *«los correos de todos debe de ser info@fashiongr.com»*).
 */
export const CORREO_DEL_GRUPO = "info@fashiongr.com";

export interface EmpresaFiscal {
  /** El nombre legal tal cual lo imprime Switch. Vacío = todavía no se sabe. */
  legal: string;
  identificacion: string;
  telefono: string;
  correo: string;
}

/**
 * Lo que dice el registro de cada empresa: nombre legal e identificación,
 * verbatim de los papeles que Daniel bajó de Switch el 9-sep-2026.
 *
 * El teléfono y el correo NO están acá porque no son de cada empresa: el
 * teléfono va vacío en las seis y el correo es uno solo para todas.
 */
const REGISTRO: Readonly<Record<string, { legal: string; identificacion: string }>> = {
  fashion_wear: { legal: "FASHION WEAR, INC", identificacion: "40254-103-278837" },
  vistana: { legal: "VISTANA INTERNATIONAL PANAMA, S.A.", identificacion: "626251-1-455645" },
  fashion_shoes: { legal: "FASHION SHOES HOLDINGS, S.A.", identificacion: "1481660-1-643734" },
  active_shoes: { legal: "ACTIVE SHOES S.A", identificacion: "155727670-2-2022" },
  active_wear: { legal: "ACTIVE WEAR S.A", identificacion: "155727673-2-2022" },
  joystep: { legal: "JOYSTEP CORP", identificacion: "155769235-2-2025" },
};

/**
 * La ficha completa de cada empresa. Se ARMA del registro + el correo del grupo:
 * el correo vive en `CORREO_DEL_GRUPO` y no se escribe una vez por empresa.
 */
export const EMPRESA_FISCAL: Readonly<Record<string, EmpresaFiscal>> = Object.freeze(
  Object.fromEntries(
    Object.entries(REGISTRO).map(([key, r]) => [
      key,
      Object.freeze({
        legal: r.legal,
        identificacion: r.identificacion,
        // 🔴 Vacío en las seis: Switch tampoco lo trae (decisión de Daniel).
        telefono: "",
        correo: CORREO_DEL_GRUPO,
      }),
    ]),
  ),
);

/**
 * La cabeza del papel de una empresa. Sin ficha —o con la ficha vacía— devuelve
 * el nombre que la pantalla ya usa y las tres líneas en blanco: el papel sale
 * igual, solo que sin datos que no tenemos. **Nunca los de otra empresa.**
 */
export function fichaFiscal(empresaKey: string, nombreDeLaPantalla: string): EmpresaFiscal {
  const f = EMPRESA_FISCAL[empresaKey];
  if (!f) return { legal: nombreDeLaPantalla, identificacion: "", telefono: "", correo: "" };
  return { ...f, legal: f.legal || nombreDeLaPantalla };
}
