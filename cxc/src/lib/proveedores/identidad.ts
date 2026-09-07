// ─────────────────────────────────────────────────────────────────────────────
// 🔴 QUIÉN ES QUIÉN EN PROVEEDORES — la identidad de una fila, en UN solo lugar.
//
// El problema, medido contra producción el 6-sep-2026: en
// `switch_proveedor_estadocuenta` cada empresa da de alta a SU proveedor por su
// cuenta, así que el mismo proveedor llega escrito distinto y la pantalla lo
// parte en varias filas. **Confecciones Boston aparece en CUATRO grafías**
// (`CONFECCIONES BOSTON` · `CONFECCIONES BOSTON  S.A` · `CONFECCIONES BOSTON S A`
// · `CONFECCIONES BOSTON S.A`) repartidas en 5 empresas, y la pantalla dibuja
// TRES filas que suman $4,165.96 sin que ninguna diga que las otras existen.
//
// 🔴 **LA CÉDULA NO SIRVE PARA DECIDIR.** De los seis grupos de filas que
// comparten identificación, **tres son empresas distintas** — Daniel, textual:
// *«no te fijes por la cédula, solo por nombre para saber cuáles son iguales»*.
// Y al revés: el proveedor más grande del grupo (American Fashion Wear,
// $3,633,293.25) tiene DOS cédulas que difieren en un guion, así que unir por
// cédula lo partiría en dos. Por eso la lista de equivalencias **se escribe a
// mano y se revisa una por una**, igual que se hizo con las grafías de Reynaldo
// en Comisiones (`comision_vendedor_alias`). **Nada por parecido.**
//
// 🔴 EL GRANO DEL AMARRE ES `(empresa_key, proveedor_switch_id)`, no el nombre y
// no el código:
//   · El código SOLO no es identidad — medido: **10 códigos nombran proveedores
//     distintos según la empresa** (`122` es American Fashion Wear en Fashion
//     Wear y Latin Fitness Group en Active Shoes).
//   · El par `(empresa_key, codigo)` sí distingue las 65 filas hoy, pero
//     `codigo` es NULLABLE en la tabla y lo teclea una persona en Switch: si
//     alguien lo renumera, el amarre se rompe en silencio.
//   · `(empresa_key, proveedor_switch_id)` es la UNIQUE de la tabla, es la
//     llave del upsert del sync y la que usa su purga — y no es nula nunca.
//     Medido: 65 pares distintos para 65 filas.
//
// ⚠️ `switch_proveedor_estadocuenta` **no tiene soft delete** y el sync hace un
// DELETE real de los proveedores que Switch ya no lista. Por eso el amarre vive
// en su propia tabla: si un proveedor se cae del estado de cuenta y vuelve, su
// fila de amarre sigue ahí y sigue valiendo.
//
// 🔑 FALLA ABIERTO: sin amarres (la tabla todavía sin migrar, o una lectura que
// falló) `aplicarAmarre` devuelve exactamente lo de siempre — el nombre
// normalizado. La pantalla nunca se queda sin lista por esto.
// ─────────────────────────────────────────────────────────────────────────────

/** UPPER + quita [.,] + colapsa espacios. Es la clave de siempre, sin amarre. */
export function normProvName(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
}

/** Una fila de `proveedor_amarre`, tal como la devuelve la base. */
export interface AmarreProveedor {
  empresa_key: string;
  proveedor_switch_id: number;
  /** La clave que manda. Normalizada con `normProvName`. */
  proveedor_canonico: string;
  /** Cómo se escribe en pantalla. `null` = la grafía más larga, como siempre. */
  nombre_mostrado: string | null;
}

/** Lo mínimo que hace falta de una fila del estado de cuenta para identificarla. */
export interface FilaProveedorIdentificable {
  empresa_key: string;
  proveedor_switch_id: number;
  nombre: string;
}

/**
 * La llave de UNA fila real: `empresa#id`. No se muestra nunca; solo cruza la
 * fila con su amarre.
 */
export function claveDeFila(empresaKey: string, proveedorSwitchId: number): string {
  return `${empresaKey}#${proveedorSwitchId}`;
}

/** Índice `empresa#id → amarre`, para no recorrer la lista en cada fila. */
export function indexarAmarres(
  amarres: readonly AmarreProveedor[],
): Map<string, AmarreProveedor> {
  const m = new Map<string, AmarreProveedor>();
  for (const a of amarres) m.set(claveDeFila(a.empresa_key, a.proveedor_switch_id), a);
  return m;
}

/** Lo que la resolución contesta de una fila. */
export interface ProveedorResuelto {
  /** La clave con la que se agrupa y con la que abre la ficha. */
  clave: string;
  /** El nombre escrito a mano, si lo hay. `null` = decide la regla de siempre. */
  nombreMostrado: string | null;
  /** `true` solo si esta fila cayó en un amarre escrito a mano. */
  amarrada: boolean;
}

/**
 * 🔴 **LA ÚNICA FUNCIÓN QUE DICE QUIÉN ES UN PROVEEDOR.** La lista, la ficha y
 * el Excel pasan por acá y por ningún otro lado.
 *
 * Espejo de `proveedor_canonico(text, int, text)` en la base. Con amarre
 * devuelve el proveedor escrito a mano; sin amarre, el nombre normalizado tal
 * como se agrupaba antes de que esto existiera.
 */
export function aplicarAmarre(
  fila: FilaProveedorIdentificable,
  amarres: ReadonlyMap<string, AmarreProveedor> | readonly AmarreProveedor[],
): ProveedorResuelto {
  const indice =
    amarres instanceof Map ? amarres : indexarAmarres(amarres as readonly AmarreProveedor[]);
  const hit = indice.get(claveDeFila(fila.empresa_key, fila.proveedor_switch_id));
  if (hit && normProvName(hit.proveedor_canonico)) {
    return {
      clave: normProvName(hit.proveedor_canonico),
      nombreMostrado: hit.nombre_mostrado?.trim() || null,
      amarrada: true,
    };
  }
  return { clave: normProvName(fila.nombre), nombreMostrado: null, amarrada: false };
}

/**
 * 🩸 LOS QUE **NO** SON EL MISMO, aunque Switch les puso la MISMA cédula.
 * Escrito acá para que nadie los una nunca «porque la cédula coincide».
 * Daniel los revisó uno por uno el 6-sep-2026.
 *
 * En los tres casos **Switch tiene la cédula mal**. No se arregla desde este
 * sistema; queda escrito para quien mantenga Switch.
 */
export const NO_SON_EL_MISMO: readonly {
  cedula: string;
  nombres: readonly string[];
  daniel: string;
}[] = [
  {
    cedula: "655-544-133465",
    nombres: ["CONFECCIONES BOSTON", "FASHION WEAR, INC"],
    daniel: "fashion wear no es boston",
  },
  {
    cedula: "40254-103-278837",
    nombres: ["CIF EXPRESS SA.", "Luis Alberto Torres De Gracias"],
    daniel: "son diferentes",
  },
  {
    cedula: "155727670-2-2022",
    nombres: ["ACTIVE SHOES S.A", "BDL SERVICES INC"],
    daniel: "son diferentes",
  },
] as const;
