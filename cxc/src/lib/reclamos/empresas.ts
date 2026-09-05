// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — LA EMPRESA DICE A QUÉ PROVEEDOR SE LE RECLAMA, Y CON QUÉ CÓDIGO.
//
// Fuente única del par (proveedor, marca) al crear un reclamo, y —desde el
// 4-sep-2026— también del CÓDIGO con el que ese proveedor está en Switch.
//
// 🔴 EL CÓDIGO NO ES ÚNICO ENTRE EMPRESAS. Medido contra producción
// (`switch_proveedor_estadocuenta`, 4-sep-2026):
//   · `122` en Fashion Wear  = «American Fashion Wear, SA»  ($2.270.756,78)
//   · `122` en Active Shoes  = «LATIN FITNESS GROUP»        ($206.954,76)
//   · `112` en Fashion Shoes = «American Fashion Wear, SA»  ($1.302.582,91)
//   · `112` en Joystep       = «JCBBRANDS»                  ($16.165,61)
// Son cuatro proveedores distintos con dos códigos. El par (empresa, código)
// viaja SIEMPRE junto: un código suelto no identifica a nadie.
//
// 🔴 POR QUÉ EXISTE ESTE CAMPO. La ficha de `/proveedores/[key]` unía sus
// «Reclamos vinculados» comparando el NOMBRE normalizado del proveedor, en
// JavaScript, sin ningún candado. Medido el 4-sep-2026: de los 34 reclamos
// vivos, **26 ya no cruzaban** — Switch dice «American Fashion Wear, SA» y los
// reclamos dicen «American Fashion Wear», y `normProvName` conserva la `SA`. Las
// fichas de Fashion Wear y Fashion Shoes mostraban CERO reclamos sin decir por
// qué. Es el mismo error que con los clientes de Boston: unir por nombre no
// falla con un error, falla en silencio.
//
// ⚠️ El nombre NO se retira: es lo que se imprime en el PDF, en el Excel y en
// el correo que ve el proveedor. Lo que cambia es quién MANDA en la unión.
// ─────────────────────────────────────────────────────────────────────────────

export interface EmpresaReclamo {
  /** `empresa_key` de la base — el lado de `switch_proveedor_estadocuenta`. */
  empresa_key: string;
  /** Nombre del proveedor tal como se imprime. NO es la identidad. */
  proveedor: string;
  marca: string;
  /** Código del proveedor en Switch, PARA ESA EMPRESA. Es la identidad. */
  proveedor_codigo: string;
}

/**
 * Las 6 empresas que reclaman, con su proveedor, su marca y su código.
 * Cerrado con Daniel el 4-sep-2026 y verificado uno por uno contra
 * `switch_proveedor_estadocuenta`.
 *
 * ⚠️ Active Wear dejó de ser Reebok: Daniel pasó todo lo de Reebok (apparel y
 * hardware) a Active Shoes para tenerlo en un solo sistema, y le dio Active Wear
 * a Karl Lagerfeld. Medido: «AMERICAN UNIQUE BRANDS SA» (código 126) es el único
 * proveedor con llegadas a Active Wear entre junio y agosto de 2026; Latin
 * Fitness no le manda nada desde el 11 de junio.
 */
export const EMPRESAS_MAP: Record<string, EmpresaReclamo> = {
  "Vistana International": {
    empresa_key: "vistana",
    proveedor: "American Designer Fashion",
    marca: "Calvin Klein",
    proveedor_codigo: "01",
  },
  "Fashion Wear": {
    empresa_key: "fashion_wear",
    proveedor: "American Fashion Wear",
    marca: "Tommy Hilfiger",
    proveedor_codigo: "122",
  },
  "Fashion Shoes": {
    empresa_key: "fashion_shoes",
    proveedor: "American Fashion Wear",
    marca: "Tommy Hilfiger",
    proveedor_codigo: "112",
  },
  "Active Shoes": {
    empresa_key: "active_shoes",
    proveedor: "Latin Fitness Group",
    marca: "Reebok",
    proveedor_codigo: "122",
  },
  "Active Wear": {
    empresa_key: "active_wear",
    proveedor: "American Unique Brands SA",
    marca: "Karl Lagerfeld",
    proveedor_codigo: "126",
  },
  Joystep: {
    empresa_key: "joystep",
    proveedor: "JCBBRANDS",
    marca: "Joybees",
    proveedor_codigo: "112",
  },
};

/** Las empresas del desplegable, en el orden del mapa. */
export const EMPRESAS = Object.keys(EMPRESAS_MAP);

/** Los datos de una empresa, o null si el nombre no está en el mapa. */
export function datosDeEmpresa(empresa: string | null | undefined): EmpresaReclamo | null {
  return EMPRESAS_MAP[(empresa ?? "").trim()] ?? null;
}

/** `empresa_key` de la empresa de un reclamo (que guarda el NOMBRE, no la key). */
export function empresaKeyDeReclamo(empresa: string | null | undefined): string | null {
  return datosDeEmpresa(empresa)?.empresa_key ?? null;
}
