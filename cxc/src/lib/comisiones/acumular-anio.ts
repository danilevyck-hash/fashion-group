// ─────────────────────────────────────────────────────────────────────────────
// «TODO EL AÑO» = LA SUMA DE SUS MESES. (módulo PURO)
//
// 🔴 NO HAY UNA SEGUNDA FÓRMULA DEL AÑO. Cada mes se pide a la MISMA RPC con los
// MISMOS argumentos y se netea con `netearComisiones` —el único restador de
// descuentos del sistema— y recién después se suman los meses acá. Una consulta
// «anual» aparte sería la forma conocida de que el año y la suma de sus doce
// meses dejen de coincidir.
//
// Verificado contra producción el 6-sep-2026, ene–sep de las 6 empresas:
//   Edwin 9.037,17 · Reynaldo 58.544,09 · Rodrigo 234,49 = **67.815,75**
// exactamente lo que dan los 9 meses sumados a mano.
//
// ⚠️ LA TASA NO SE SUMA, SE CONSERVA. Es un porcentaje: sumar 0,5 % doce veces
// daría 6 %. Se guarda la del ÚLTIMO mes en el que ese vendedor apareció, que es
// la vigente.
// ─────────────────────────────────────────────────────────────────────────────

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Los campos de plata que SÍ se suman mes a mes. */
const SUMABLES = [
  "base",
  "comision",
  "base_cobro",
  "comision_cobro",
  "comision_total",
  "descuento",
] as const;

/** Los campos que se CONSERVAN (el último que se vio), nunca se suman. */
const CONSERVADOS = ["tasa", "tasa_cobro"] as const;

export interface VendedorAcumulable {
  vendedor: string;
}

/**
 * Suma, por vendedor, las filas de varios meses de UNA empresa.
 *
 * El orden de salida es el del PRIMER mes en que apareció cada vendedor, para
 * que la lista no baile entre recargas; quien ordena por total es la vista.
 */
export function acumularVendedores<T extends VendedorAcumulable>(
  meses: readonly (readonly T[])[],
): T[] {
  const porVendedor = new Map<string, Record<string, unknown>>();

  for (const mes of meses) {
    for (const fila of mes ?? []) {
      const v = fila as unknown as Record<string, unknown>;
      const clave = fila.vendedor;
      const acc = porVendedor.get(clave);
      if (!acc) {
        porVendedor.set(clave, { ...v });
        continue;
      }
      for (const campo of SUMABLES) {
        // Un campo que ninguno de los dos trae no se inventa.
        if (acc[campo] === undefined && v[campo] === undefined) continue;
        acc[campo] = round2(Number(acc[campo] ?? 0) + Number(v[campo] ?? 0));
      }
      for (const campo of CONSERVADOS) {
        if (v[campo] !== undefined && v[campo] !== null) acc[campo] = v[campo];
      }
      // Listas informativas (clientes que no comisionan): la última gana; es la
      // MISMA lista todos los meses — no depende del período.
      if (Array.isArray(v.clientes_sin_comision)) {
        acc.clientes_sin_comision = v.clientes_sin_comision;
      }
    }
  }

  return [...porVendedor.values()] as unknown as T[];
}
