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
// 🔴 Y ESTÁ CONFECCIONES BOSTON, QUE NO ES DEL GRUPO Y NO SE FIRMA COMO ÉL
// (9-sep-2026). Su papel también salía sin esas cuatro líneas; Daniel bajó el
// suyo de Switch y lo dictó igual que las seis. **Su correo NO es el del grupo**
// — ver `CORREO_DEL_GRUPO` más abajo.
//
// 🔴 Y DESDE EL 20-sep-2026 ACÁ TAMBIÉN VIVE DÓNDE SE LE PAGA A CADA UNA. El
// estado de cuenta le decía al cliente cuánto debe y ningún lugar donde pagarlo.
// Daniel dictó las ocho cuentas y eligió que **cada empresa cobra en la suya**,
// no una sola del grupo: la hoja de Fashion Wear lleva la cuenta de Fashion Wear
// y la de Boston la de Boston. Es el MISMO dato que la identidad fiscal —quién
// cobra— así que vive en la MISMA ficha y no en una segunda lista paralela.
//
// 🔴 DOS COSAS SE APARTAN DE LO QUE DICE SWITCH, POR DECISIÓN DE DANIEL:
//
//   1. 🔄 **El teléfono.** Hasta el 20-sep-2026 iba VACÍO en todas, porque
//      Switch tampoco lo trae. Ese día Daniel dictó uno solo para todas —
//      `212-0790`— junto con las cuentas de banco, así que la línea `TEL:` del
//      encabezado ya sale con número. ⚠️ Lo dictó **antes** de dar la cuenta de
//      Confecciones Boston: que Boston use ese mismo teléfono está **pendiente
//      de que Daniel lo confirme**.
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
 *
 * 🔴 «LAS SEIS» ES LITERAL: CONFECCIONES BOSTON NO ENTRA ACÁ. Es la excepción, y
 * conviene entender por qué antes de «unificarla»: el papel de Boston lo lee un
 * cliente que **le compró a Confecciones Boston**, no a Fashion Group, y por eso
 * ese papel sale sin el logo del grupo y sin `fashiongr.com` en el pie (ver
 * `casa-del-papel.ts`, la decisión de Daniel *«Firma Confecciones Boston»*).
 * Ponerle `info@fashiongr.com` en la cabeza fiscal le devolvería al papel
 * exactamente lo que se le acaba de sacar. Su correo es el que Switch imprime en
 * SU papel: `ventas@cboston.net`.
 *
 * ⚠️ Esto NO cambia el REMITENTE del correo, que sigue saliendo por nuestro
 * dominio (Daniel, preguntado: *«fashiongr»*). Lo que cambia es la cabeza del
 * PDF, que es lo que dice quién cobra.
 */
export const CORREO_DEL_GRUPO = "info@fashiongr.com";

/**
 * El banco y el tipo de cuenta de las OCHO, escritos una sola vez (Daniel,
 * 20-sep-2026: todas en Banco General y todas cuenta corriente). Repetirlos ocho
 * veces es cómo se llega a que el día que una cambie de banco queden siete
 * corregidas y una vieja.
 */
export const BANCO_DE_TODAS = "Banco General";
export const TIPO_DE_CUENTA = "Cuenta corriente";

/**
 * El teléfono que Daniel dictó para TODAS (20-sep-2026).
 *
 * ⚠️ Lo dictó junto con las cuentas de las siete del grupo y Multifashion,
 * **antes** de dar la de Confecciones Boston. Que Boston conteste en ese mismo
 * número está pendiente de que él lo confirme; mientras tanto va el dictado,
 * porque dijo «todas».
 */
export const TELEFONO_DE_TODAS = "212-0790";

export interface EmpresaFiscal {
  /** El nombre legal tal cual lo imprime Switch. Vacío = todavía no se sabe. */
  legal: string;
  identificacion: string;
  telefono: string;
  correo: string;
  /** Dónde se le paga a ESTA empresa. Vacío = no se sabe, y no se dibuja nada. */
  banco: string;
  tipoCuenta: string;
  cuenta: string;
}

/**
 * Lo que dice el registro de cada empresa: nombre legal e identificación,
 * verbatim de los papeles que Daniel bajó de Switch el 9-sep-2026.
 *
 * El teléfono NO está acá porque es el MISMO en todas (`TELEFONO_DE_TODAS`), y
 * el banco y el tipo de cuenta tampoco por lo mismo. El correo solo se escribe
 * donde NO es el del grupo, así que las seis siguen tomándolo de un lugar único
 * y no hay seis copias que mantener iguales a mano.
 *
 * 🔴 LA `cuenta` SÍ ES DE CADA UNA, y es el dato que no admite un error de una
 * tecla: una cuenta mal copiada manda la plata de un cliente a otra empresa.
 * Está dictada por Daniel el 20-sep-2026 y hay candado que la compara dígito por
 * dígito contra lo que él escribió.
 */
const REGISTRO: Readonly<
  Record<string, { legal: string; identificacion: string; cuenta: string; correo?: string }>
> = {
  fashion_wear: { legal: "FASHION WEAR, INC", identificacion: "40254-103-278837", cuenta: "03-02-01-094730-4" },
  vistana: { legal: "VISTANA INTERNATIONAL PANAMA, S.A.", identificacion: "626251-1-455645", cuenta: "03-02-01-119821-6" },
  fashion_shoes: { legal: "FASHION SHOES HOLDINGS, S.A.", identificacion: "1481660-1-643734", cuenta: "03-02-01-103566-3" },
  active_shoes: { legal: "ACTIVE SHOES S.A", identificacion: "155727670-2-2022", cuenta: "04-02-97-602364-7" },
  active_wear: { legal: "ACTIVE WEAR S.A", identificacion: "155727673-2-2022", cuenta: "04-02-97-548356-3" },
  joystep: { legal: "JOYSTEP CORP", identificacion: "155769235-2-2025", cuenta: "04-02-00-001055-7" },
  // 🔴 La excepción, y a propósito: su papel no dice Fashion Group en ninguna
  // parte, así que su correo tampoco. Es el que Switch imprime en SU papel.
  confecciones_boston: {
    legal: "CONFECCIONES BOSTON S.A",
    identificacion: "655-544-133465",
    correo: "ventas@cboston.net",
    // 🔴 SU CUENTA ES SUYA, como su papel: el cliente de Boston le paga a Boston.
    cuenta: "03-02-01-110198-4",
  },
  // 🔴 MULTIFASHION / ACS (10-sep-2026). Los dos datos salen del AVISO DE
  // OPERACIÓN del Ministerio de Comercio e Industrias que mandó Daniel — no de
  // Switch, que para esta empresa no imprime papel de cobro.
  //
  // ⚠️ SU CORREO VA VACÍO, Y NO ES UN OLVIDO. `info@fashiongr.com` es el de las
  // SEIS del grupo y ACS es otra entidad; Daniel todavía no dijo cuál usa, así
  // que ponerle el del grupo sería firmarle el papel a nombre de otro. El
  // teléfono va vacío como en todas.
  //
  // 🔑 El `correo: ""` es EXPLÍCITO: sin él, `?? CORREO_DEL_GRUPO` le pondría el
  // del grupo por descarte. Un vacío escrito a propósito no es lo mismo que un
  // campo que nadie llenó.
  american_classic: {
    legal: "MULTI FASHION HOLDING CORP.",
    identificacion: "155638923-2-2016",
    correo: "",
    // ⚠️ Su cuenta también la dictó Daniel, aunque ACS no cobre por este camino
    // (no tiene estado de cuenta): la ficha la guarda igual, como el nombre
    // legal, para el papel que sí firma.
    cuenta: "03-02-01-114161-3",
  },
};

/**
 * La ficha completa de cada empresa. Se ARMA del registro + el correo del grupo:
 * el correo vive en `CORREO_DEL_GRUPO` y no se escribe una vez por empresa —
 * salvo el de la empresa que declara el suyo, que es Confecciones Boston.
 */
export const EMPRESA_FISCAL: Readonly<Record<string, EmpresaFiscal>> = Object.freeze(
  Object.fromEntries(
    Object.entries(REGISTRO).map(([key, r]) => [
      key,
      Object.freeze({
        legal: r.legal,
        identificacion: r.identificacion,
        // 🔄 El MISMO en todas, dictado el 20-sep-2026 (antes iba vacío).
        telefono: TELEFONO_DE_TODAS,
        correo: r.correo ?? CORREO_DEL_GRUPO,
        banco: BANCO_DE_TODAS,
        tipoCuenta: TIPO_DE_CUENTA,
        cuenta: r.cuenta,
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
  if (!f) {
    return {
      legal: nombreDeLaPantalla,
      identificacion: "",
      telefono: "",
      correo: "",
      banco: "",
      tipoCuenta: "",
      cuenta: "",
    };
  }
  return { ...f, legal: f.legal || nombreDeLaPantalla };
}

// ─────────────────────────────────────────────────────────────────────────────
// DÓNDE SE LE PAGA A ESTA EMPRESA (20-sep-2026).
//
// 🔴 UN SOLO ARMADOR DE LAS TRES LÍNEAS, para el papel y para el correo. Si el
// PDF dijera «Cuenta corriente 03-02-01-094730-4» y el correo «Cta. Cte. 03 02
// 01 094730 4», el cliente tendría que decidir cuál de los dos copia.
// ─────────────────────────────────────────────────────────────────────────────

export interface ComoPagar {
  /** A nombre de quién se hace el pago: el nombre legal, el mismo del encabezado. */
  aNombreDe: string;
  banco: string;
  tipoCuenta: string;
  cuenta: string;
  telefono: string;
}

/**
 * Dónde pagarle a una empresa. **`null` cuando no se sabe su cuenta** — el papel
 * y el correo salen como antes, sin el bloque. Nunca la cuenta de otra empresa:
 * es la misma regla de la cabeza fiscal, y acá el error se mide en plata que
 * cae en el banco equivocado.
 */
export function comoPagar(empresaKey: string, nombreDeLaPantalla: string): ComoPagar | null {
  const f = fichaFiscal(empresaKey, nombreDeLaPantalla);
  if (!f.cuenta) return null;
  return {
    aNombreDe: f.legal,
    banco: f.banco,
    tipoCuenta: f.tipoCuenta,
    cuenta: f.cuenta,
    telefono: f.telefono,
  };
}

/**
 * Las tres líneas, tal cual se leen: a nombre de quién, el banco con la cuenta y
 * el teléfono. Una línea sin dato no se dibuja en blanco: se cae.
 */
export function lineasDePago(c: ComoPagar): string[] {
  return [
    `Pagos a nombre de: ${c.aNombreDe}`,
    [c.banco, c.tipoCuenta, c.cuenta].filter(Boolean).join(" · "),
    c.telefono ? `Tel: ${c.telefono}` : "",
  ].filter(Boolean);
}
