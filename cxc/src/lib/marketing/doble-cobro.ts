// ─────────────────────────────────────────────────────────────────────────────
// Marketing › EL AVISO DE DOBLE COBRO (6-oct-2026). Módulo PURO.
//
// Daniel, 6-oct-2026: «si esas barras se compran a Tommy al costo y después se
// le entregan a $18, Tommy queda cobrado dos veces. Que el sistema lo impida o
// avise».
//
// 🔑 SIGUE TENIENDO SENTIDO AUNQUE MOBILIARIO NO SE CONECTE (6-oct-2026, la
// segunda vuelta): Daniel decidió que la compra se registra como un gasto más y
// que el inventario de Mobiliario lo escribe él a mano. Igual, si una factura
// SIN marca (a cargo de la empresa) se le compró a una marca y después esa
// misma mercancía se le entrega a ESA marca, se le cobraría dos veces. El
// sistema no puede
// saber si la compra fue al costo —eso lo sabe Daniel—, así que AVISA.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ALIAS_DE_PROVEEDOR,
  claveDeProveedor,
  mismoProveedorConAlias,
} from "./proveedores-2026-10";

// ─── EL FRENO DEL DOBLE COBRO ────────────────────────────────────────────────

/**
 * 🔴 EL RIESGO QUE DANIEL PIDIÓ CORTAR (6-oct-2026): «si esas barras se compran
 * a Tommy al costo y después se le entregan a $18, Tommy queda cobrado dos
 * veces. Que el sistema lo impida o avise».
 *
 * Es el mismo hecho dos veces: Tommy ya puso la plata al venderme las barras al
 * costo, y después se le cobra la entrega. El sistema no puede saber si la
 * compra fue «al costo» o un negocio aparte —eso lo sabe Daniel—, así que
 * AVISA y no bloquea, igual que el stock negativo y el «ya salió en otra guía»
 * de Guías. Un freno duro aquí trabaría una entrega legítima con plata real en
 * la mano, que es exactamente el defecto que Impreco provocó en sep-2026
 * (`marketing-rediseno.md` › el duplicado por tienda).
 */
export interface AvisoDobleCobro {
  /** El texto que se le muestra a la persona. */
  mensaje: string;
  /** El proveedor de la compra, como se escribió. */
  proveedor: string;
  /** La marca a la que se le está cobrando la entrega. */
  marca: string;
}

/**
 * ¿Hay riesgo de cobrarle dos veces a la misma marca?
 *
 * Sí cuando el proveedor de la COMPRA del inventario es la misma parte que la
 * marca a la que se le COBRA la entrega. Se compara con `claveDeProveedor`
 * —normalizado y con alias—, nunca con `includes`: «Calvin» dentro de «Calvin
 * Klein Panamá» tiene que empatar por el amarre, no por el parecido.
 *
 * `null` = no hay riesgo (o falta un dato para afirmarlo: ante la duda, callar).
 */
export function avisoDeDobleCobro(
  e: {
    /** Proveedor de la factura con la que entró el inventario. */
    proveedorDeLaCompra: string | null | undefined;
    /** Nombre de la marca a la que se le cobra la entrega. */
    marcaCobrada: string | null | undefined;
    /** Nombres alternos de esa marca (su razón social, su casa). Opcional. */
    nombresDeLaMarca?: ReadonlyArray<string>;
  },
  alias: Readonly<Record<string, string>> = ALIAS_DE_PROVEEDOR,
): AvisoDobleCobro | null {
  const proveedor = String(e?.proveedorDeLaCompra ?? "").replace(/\s+/g, " ").trim();
  const marca = String(e?.marcaCobrada ?? "").replace(/\s+/g, " ").trim();
  if (proveedor.length === 0 || marca.length === 0) return null;
  const candidatos = [marca, ...(e?.nombresDeLaMarca ?? [])];
  const empata = candidatos.some((n) => mismoProveedorConAlias(proveedor, n, alias));
  if (!empata) return null;
  return {
    mensaje:
      `Este mueble se le compró a ${marca} y ahora se le cobra a ${marca}. ` +
      `Si la compra fue al costo, ya pagó una vez: revisa antes de guardar.`,
    proveedor,
    marca,
  };
}

/**
 * Lo mismo para una entrega con varios renglones: el primer aviso que aparezca.
 * Uno alcanza — la pregunta de la pantalla es «¿reviso esto antes de guardar?»,
 * no «¿cuántos renglones?».
 */
export function avisoDeDobleCobroEnLaEntrega(
  marcaCobrada: string | null | undefined,
  compras: ReadonlyArray<{ proveedorDeLaCompra: string | null | undefined }>,
  nombresDeLaMarca?: ReadonlyArray<string>,
  alias: Readonly<Record<string, string>> = ALIAS_DE_PROVEEDOR,
): AvisoDobleCobro | null {
  const vistos = new Set<string>();
  for (const c of Array.isArray(compras) ? compras : []) {
    const clave = claveDeProveedor(c?.proveedorDeLaCompra, alias);
    if (clave.length === 0 || vistos.has(clave)) continue;
    vistos.add(clave);
    const aviso = avisoDeDobleCobro(
      {
        proveedorDeLaCompra: c.proveedorDeLaCompra,
        marcaCobrada,
        nombresDeLaMarca,
      },
      alias,
    );
    if (aviso) return aviso;
  }
  return null;
}
