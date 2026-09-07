// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL CORREO DEL CLIENTE SALE DEL DIRECTORIO, NO SE TECLEA (6-sep-2026)
//
// 🩸 SE ESCRIBÍA A MANO CADA VEZ, Y EL SISTEMA LO BORRABA. La columna
// `client_email` existe en las cuatro tablas de pedidos desde el día uno y,
// medido contra producción el 7-sep-2026, **está vacía en los 56 pedidos vivos**
// (Reebok 15 · Tommy 32 · Calvin 5 · Joybees 4). El detalle lo pedía, lo mandaba
// y hacía `setClientEmail("")` — así que el pedido siguiente empezaba de cero.
//
// Daniel, textual: *«no quiero que sea obligatorio mandar el correo, pero sí que
// sea opcional, ya escrito automáticamente el mail del cliente»*.
//
// 🔴 SE UNE POR CÓDIGO, NUNCA POR NOMBRE. Es la regla de la casa: la identidad
// del cliente es el código (`clientes_master.codigo`), y unir directorios por
// nombre es exactamente lo que publicó $2,55 millones de venta que no existió en
// el ranking de Ventas. El código sale de `switch_clientes.codigo` de la empresa
// de la marca, que es el mismo del directorio del grupo — las cuatro marcas son
// de las SEIS (Reebok→active_shoes · Joybees→joystep · Tommy→fashion_shoes ·
// Calvin→vistana).
//
// 🔴 FALLA ABIERTA. Sin código, sin fila, con la columna caída o con la lectura
// rota, devuelve `null` y el campo queda vacío exactamente como hoy. Nunca
// bloquea, nunca inventa, y NUNCA manda nada sola.
//
// Medido: 100 de las 150 filas vivas de `clientes_master` traen un correo.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo mínimo que hace falta del cliente de Supabase: no se importa el tipo. */
interface LectorDirectorio {
  from(tabla: string): {
    select(cols: string): {
      eq(col: string, val: unknown): {
        eq(col: string, val: unknown): {
          maybeSingle(): Promise<{ data: { email?: string | null } | null; error: unknown }>;
        };
      };
    };
  };
}

/**
 * El correo del cliente en el directorio del grupo, por CÓDIGO. `null` si no
 * hay código, si no está en el directorio, si no tiene correo o si la lectura
 * falla — las cuatro se ven igual desde la pantalla: el campo vacío.
 */
export async function correoDelDirectorio(
  db: unknown,
  codigo: string | null | undefined,
): Promise<string | null> {
  const cod = (codigo ?? "").trim();
  if (!cod) return null;
  try {
    const { data, error } = await (db as LectorDirectorio)
      .from("clientes_master")
      .select("email")
      .eq("codigo", cod)
      .eq("deleted", false)
      .maybeSingle();
    if (error) return null;
    const correo = (data?.email ?? "").trim();
    return correo || null;
  } catch {
    return null;
  }
}
