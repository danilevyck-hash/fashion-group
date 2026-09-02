// ─────────────────────────────────────────────────────────────────────────────
// QUIÉN ES QUIÉN — la clave de una vendedora, y por qué existe.
//
// 🩸 EL MISMO NOMBRE ESTÁ CARGADO DE DOS FORMAS EN SWITCH, y una meta por
// vendedora sobre el texto crudo mide LA MITAD. Medido contra producción el
// 13-ago-2026 (12 meses de american_classic retail): **14 nombres distintos
// para 11 personas**. Tres están partidas en dos:
//
//   `Ana Trejos`      + `ANA TREJOS`      → $44.998,17 en 854 documentos
//   `Yeisibeth Muñoz` + `YEISIBETH MUÑOZ` → $20.925,62 en 433 documentos
//   `Cindy De Gracia` + `CINDY DE GRACIA` → $14.728,77 en 316 documentos
//
// Sin agrupar, cada una aparecería DOS veces con la mitad de sus ventas — y en
// una meta con premio eso no es un detalle de presentación: es plata.
//
// ⚠️ ESTO NO "ARREGLA" SWITCH NI LA BASE. No se escribe una sola fila: la
// corrección de los nombres en Switch es decisión de Daniel y va aparte. Acá
// solo se AGRUPA al leer, que es reversible y no puede romper nada.
//
// ── LA REGLA, y por qué es tan chata a propósito ─────────────────────────────
// Igualdad EXACTA después de: pasar a mayúsculas, sacar los acentos y colapsar
// los espacios. **Nada de parecido, nada de distancia de edición.** Este repo ya
// pagó esa lección con las tiendas (`Outlet Duty Free N2` vs `N3` son dos
// locales distintos y una normalización "inteligente" los fusionó en silencio,
// ver CLAUDE.md § Guías). Dos personas distintas fusionadas por parecido sería
// exactamente el mismo error, y encima repartiría un premio mal.
//
// ⚠️ POR QUÉ SÍ SE SACAN LOS ACENTOS: `Yeisibeth Muñoz` y `YEISIBETH MUÑOZ` son
// la misma persona, y la Ñ sobrevive a `toUpperCase()` pero no siempre a cómo
// cada sistema la teclea. Sacar el acento NO puede juntar a dos personas
// distintas salvo que difieran ÚNICAMENTE en una tilde — un caso que no existe
// en los 14 nombres medidos y que, de aparecer, se vería en la pantalla de
// participantes (que muestra todas las formas que agrupó).
//
// 🔴 NO HAY LISTA NEGRA DE PERSONAS. `DEFAULT` se excluye porque es el
// marcador del sistema —y porque la RPC `multifashion_vendedoras_v3` YA lo
// excluye con el mismo criterio, así que acá no se estrena una segunda regla—,
// pero cualquier otro nombre (por ejemplo `Angel pizza`, que Daniel dice que no
// es vendedora) se muestra en la lista y simplemente NO SE ELIGE. Decidir por
// código quién es vendedora sería decidir por Daniel, y el día que contrate a
// alguien habría que tocar código para que aparezca.
// ─────────────────────────────────────────────────────────────────────────────

/** El marcador de Switch para "sin vendedor asignado". No es una persona. */
export const CLAVE_SISTEMA = "DEFAULT";

/**
 * La clave de agrupación de una vendedora. `null` cuando no hay nombre.
 *
 * Es la MISMA normalización que usa la pantalla de participantes y la que
 * compara el avance, así que lo que se elige y lo que se mide no pueden
 * separarse.
 */
export function claveVendedora(nombre: string | null | undefined): string | null {
  if (nombre == null) return null;
  const limpio = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // acentos: Muñoz ≡ MUNOZ
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return limpio === "" ? null : limpio;
}

/** `DEFAULT` es del sistema, no una persona: nunca puede participar de una meta. */
export function esClaveDeSistema(clave: string | null): boolean {
  return clave === CLAVE_SISTEMA;
}

export interface VendedoraAgrupada {
  /** La clave normalizada — lo que se guarda en la meta. */
  clave: string;
  /** Cómo se muestra en pantalla (ver `nombreParaMostrar`). */
  nombre: string;
  /** TODAS las formas en que Switch la tiene escrita, ordenadas. */
  formas: string[];
  ventas: number;
  documentos: number;
  /**
   * El día de su ÚLTIMA venta (`YYYY-MM-DD`), o `null` si no vendió en la
   * ventana mirada.
   *
   * 🔴 NO ES UN ADORNO. Medido el 13-ago-2026: de las personas que aparecen en
   * los últimos 12 meses, **varias ya no trabajan** (Witney Miranda vendió por
   * última vez el 28-mar-2026, y tampoco siguen Yeisibeth Muñoz, Ana Trejos ni
   * Cindy De Gracia). Sin esta fecha, la lista de participantes las muestra con
   * ventas grandes al lado y es facilísimo colgar en una meta a alguien que ya
   * no está — y el premio de esa meta es un viaje.
   *
   * ⚠️ El sistema NO las filtra solo: quién participa lo elige Daniel. Lo que
   * hace es DECIRLO.
   */
  ultimaVenta: string | null;
}

/**
 * Cómo se muestra una persona cuando Switch la tiene escrita de varias formas.
 *
 * Se prefiere la que NO está toda en mayúsculas (`Yeisibeth Muñoz` antes que
 * `YEISIBETH MUÑOZ`): es la que se lee como un nombre y no como un grito. El
 * desempate es ALFABÉTICO y no "la que más vende", a propósito — si dependiera
 * de las ventas, el nombre en pantalla podría cambiar solo entre dos cargas de
 * la misma pantalla.
 */
export function nombreParaMostrar(formas: string[]): string {
  const orden = [...formas].sort((a, b) => a.localeCompare(b, "es"));
  const conMinuscula = orden.find((f) => f !== f.toUpperCase());
  return conMinuscula ?? orden[0] ?? "";
}

interface FilaVendedor {
  vendedor: string | null;
  subtotal: number | string | null;
  /**
   * Cuántos documentos representa la fila. Ausente = 1 (fila cruda). Las filas
   * que vienen ya agregadas por Postgres traen su propio conteo: sin esto, una
   * fila que resume 900 tiquetes contaría como uno solo y la pantalla mostraría
   * "3 documentos" al lado de miles de dólares.
   */
  documentos?: number;
  /** Día de la última venta de esa fila (`YYYY-MM-DD`), si se conoce. */
  ultima?: string | null;
}

/**
 * Agrupa filas de venta por persona. Devuelve la lista ordenada por ventas
 * descendente — que es el orden en que sirve elegir participantes.
 *
 * `DEFAULT` queda FUERA: no es alguien que pueda cumplir una meta.
 */
export function agruparVendedoras(filas: FilaVendedor[]): VendedoraAgrupada[] {
  const porClave = new Map<
    string,
    { ventas: number; documentos: number; formas: Set<string>; ultima: string | null }
  >();

  for (const fila of filas) {
    const clave = claveVendedora(fila.vendedor);
    if (clave == null || esClaveDeSistema(clave)) continue;
    const acc =
      porClave.get(clave) ?? { ventas: 0, documentos: 0, formas: new Set<string>(), ultima: null };
    acc.ventas += Number(fila.subtotal) || 0;
    acc.documentos += fila.documentos ?? 1;
    acc.formas.add((fila.vendedor ?? "").replace(/\s+/g, " ").trim());
    // La última venta de la persona es la más nueva de TODAS sus formas: si
    // `Ana Trejos` dejó de usarse y siguió `ANA TREJOS`, la fecha buena es la
    // segunda. Comparar como texto `YYYY-MM-DD` ordena igual que por fecha.
    const dia = fila.ultima ?? null;
    if (dia != null && (acc.ultima == null || dia > acc.ultima)) acc.ultima = dia;
    porClave.set(clave, acc);
  }

  return [...porClave.entries()]
    .map(([clave, { ventas, documentos, formas, ultima }]) => {
      const lista = [...formas].sort((a, b) => a.localeCompare(b, "es"));
      return {
        clave,
        nombre: nombreParaMostrar(lista),
        formas: lista,
        ventas: Math.round(ventas * 100) / 100,
        documentos,
        ultimaVenta: ultima,
      };
    })
    .sort((a, b) => b.ventas - a.ventas || a.clave.localeCompare(b.clave));
}

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE NO ES DE NADIE — por qué los aportes de una meta grupal no dan 100%
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Desde qué porción se explica el faltante. Debajo de medio punto redondearía a
 * "0%" y una frase que dice "el 0% que falta" se lee como un error del sistema.
 */
export const APORTE_NO_ASIGNADO_MINIMO = 0.005;

/**
 * La línea que explica por qué los aportes NO suman 100%, o `null` cuando sí
 * suman (entonces no hay nada que explicar y la línea no se dibuja).
 *
 * 🔴 EXISTE PORQUE LA CONSECUENCIA HAY QUE MOSTRARLA, NO ESCONDERLA. Una meta
 * grupal mide la tienda entera, así que lo facturado con el código de gente que
 * ya no trabaja acá entra en el avance y no le pertenece a ninguna participante.
 * Medido may-jul 2026: las 4 vendedoras pusieron el 95,9% y el 4,1% restante
 * salió de códigos viejos que siguen abiertos en Switch. Sin esta línea, una
 * lista que suma 96% se lee como una cuenta mal hecha y se desconfía del número
 * entero.
 *
 * ⚠️ El porcentaje ENTRA calculado del período de la meta — acá no hay ningún 4%
 * escrito a mano. El día que esos códigos se cierren, la línea desaparece sola.
 *
 * ⚠️ LA FRASE AFIRMA EL HECHO Y OFRECE LA CAUSA COMO LO HABITUAL, no como una
 * certeza. Lo que SIEMPRE es cierto es que esa venta salió con el código de
 * alguien que no está en la lista; que sea gente que ya no trabaja acá es lo que
 * pasa hoy (medido) pero no lo que pasa siempre — sobre sep-dic 2025, con estas
 * mismas 4 elegidas, el faltante da 59,3% y ahí son personas que en ese momento
 * sí trabajaban. Escribir la causa como afirmación haría que la pantalla mienta
 * en cuanto cambie el período.
 *
 * Vive en el módulo puro para que la tarjeta y la pestaña de Vendedoras digan
 * exactamente lo mismo: dos redacciones del mismo hecho se separan con el tiempo.
 */
export function textoAporteNoAsignado(fraccion: number): string | null {
  if (!Number.isFinite(fraccion) || fraccion < APORTE_NO_ASIGNADO_MINIMO) return null;
  const pct = Math.round(Math.min(1, fraccion) * 100);
  return (
    `El ${pct}% que falta son ventas hechas con el código de alguien que no está en ` +
    `esta lista — casi siempre, gente que ya no trabaja aquí. Cuentan para la meta igual.`
  );
}

/**
 * Suma las ventas de las claves elegidas. Lo que no está elegido NO suma —
 * incluido `DEFAULT` y cualquier nombre que Daniel no haya marcado.
 */
export function ventasDeParticipantes(
  filas: FilaVendedor[],
  claves: readonly string[],
): Map<string, number> {
  const buscadas = new Set(claves);
  const out = new Map<string, number>();
  for (const clave of buscadas) out.set(clave, 0);
  for (const fila of filas) {
    const clave = claveVendedora(fila.vendedor);
    if (clave == null || !buscadas.has(clave)) continue;
    out.set(clave, (out.get(clave) ?? 0) + (Number(fila.subtotal) || 0));
  }
  for (const [k, v] of out) out.set(k, Math.round(v * 100) / 100);
  return out;
}
