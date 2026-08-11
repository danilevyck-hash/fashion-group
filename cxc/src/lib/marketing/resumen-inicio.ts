// ============================================================================
// Marketing — qué proyectos y cuánta plata le tocan a cada MARCA en el inicio.
//
// 🩸 EL BUG QUE ORIGINÓ ESTE MÓDULO (11-ago-2026). Daniel creó el proyecto
// "Apertura" para Nova Lux, S.a., le registró una entrega de muebles de
// $1.040 asignada a Calvin Klein, y el proyecto NO APARECÍA EN NINGUNA PARTE
// del inicio de Marketing. Textual: *"puse generar un proyecto nuevo y no lo
// veo en calvin klein… no veo nova lux, dónde lo encuentro?"*.
//
// La causa: las tarjetas de marca y el filtro de la lista se armaban SOLO
// desde `mk_factura_marcas`. Un proyecto sin facturas no tenía marca y no caía
// en ninguna tarjeta — aunque su entrega de muebles SÍ tuviera marca asignada.
// El dato existía; la pantalla no lo miraba.
//
// 🔑 EL MODELO NO CAMBIA, y no debe cambiar. Daniel, textual: *"un proyecto es
// por cliente, y puedo trabajar varias marcas, una factura por marca, una
// venta de muebles por marca también, todo dentro del mismo cliente"*.
// `mk_proyectos` NO tiene marca y NO se le agrega una. La marca vive en los
// documentos: `mk_factura_marcas.marca_id` y `mk_entregas_muebles.
// total_por_marca`. Un proyecto multi-marca aparece en VARIAS tarjetas, y eso
// es correcto: medido el 11-ago-2026, 14 de 16 proyectos con facturas tienen
// más de una marca (casi siempre Tommy + Calvin).
//
// 🔴 POR QUÉ ES UN MÓDULO PURO Y COMPARTIDO. La tarjeta dice "11 proyectos" y
// al tocarla se abre `proyectos-lista` con el filtro de esa marca. Si las dos
// reglas viven en dos archivos, el día que difieran la tarjeta va a prometer
// un número de proyectos que la lista no enseña — y eso es peor que el bug de
// origen, porque se ve como si un proyecto se hubiera borrado. Acá la regla es
// UNA: `proyectoEsDeMarca()`, y la usan los dos lados.
//
// Sin base, sin I/O.
// ============================================================================

/** Fila mínima de `mk_facturas` que necesita el resumen (ya sin anuladas). */
export interface FacturaResumen {
  id: string;
  proyecto_id: string | null;
  total: number | null;
  grupo_legacy?: boolean | null;
  impulsadora_id?: string | null;
}

/** Fila de `mk_factura_marcas`. */
export interface FacturaMarcaResumen {
  factura_id: string;
  marca_id: string;
  porcentaje: number | null;
}

/** Fila mínima de `mk_entregas_muebles`. */
export interface EntregaResumen {
  proyecto_id: string | null;
  total: number | null;
  total_por_marca: Record<string, number> | null;
  total_por_empresa_interna?: Record<string, number> | null;
}

/** Marca del catálogo (`mk_marcas`), solo lo que hace falta acá. */
export interface MarcaResumen {
  id: string;
  empresa_codigo?: string | null;
}

/** Conteo + monto de un bucket. */
export interface Bucket {
  count: number;
  total: number;
}

export interface ResumenInicio {
  /** Archivo "Gastos Tommy y Calvin" — facturas legacy, SIN Multifashion. */
  legacy: Bucket;
  /** Bucket independiente Multifashion. `count` = facturas (como siempre). */
  multifashion: Bucket & { entregas: number; muebles: number };
  /** Facturas NO-legacy por marca. **Este número no cambió con el fix.** */
  porMarca: Record<string, Bucket>;
  /** Sub-total de impulsadoras por marca (subconjunto de `porMarca`). */
  impulsadoraPorMarca: Record<string, Bucket>;
  /** Entregas de muebles por marca. `count` = entregas, no facturas. */
  mueblesPorMarca: Record<string, Bucket>;
  /** Proyectos vivos de cada marca (facturas no-legacy ∪ entregas). */
  proyectosPorMarca: Record<string, number>;
  /** Total del módulo para la tarjeta de Mobiliario. */
  mobiliario: { entregas: number; total: number };
}

function num(x: unknown): number {
  const n = Number(x ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

/**
 * Marcas a las que una entrega de muebles le atribuye plata.
 *
 * ⚠️ Solo las de monto POSITIVO. `total_por_marca` es un objeto JSON escrito
 * por la pantalla de entregas: una clave con 0 significa "esta marca no llevó
 * nada en esta entrega", y contarla metería el proyecto en una tarjeta donde
 * no tiene un centavo.
 */
export function marcasDeEntrega(e: EntregaResumen): string[] {
  const tpm = e.total_por_marca ?? {};
  return Object.keys(tpm).filter((k) => num(tpm[k]) > 0);
}

/**
 * Porción de una entrega que le toca a UNA marca.
 *
 * Es `total_por_marca[marca]` + el "otro 50%" que absorbe la empresa interna
 * pareja (`total_por_empresa_interna[empresa_codigo]`). Es exactamente el
 * mismo reparto que ya usa `proyectos-lista` para el desglose por marca de la
 * columna "Gastado" — no una segunda cuenta.
 */
export function porcionEntregaParaMarca(
  e: EntregaResumen,
  marcaId: string,
  empresaCodigo?: string | null,
): number {
  const propio = num((e.total_por_marca ?? {})[marcaId]);
  if (propio <= 0) return 0;
  const tpe = e.total_por_empresa_interna ?? {};
  const interna = empresaCodigo ? num(tpe[empresaCodigo]) : 0;
  return propio + interna;
}

/**
 * Marcas por las que un PROYECTO tiene que aparecer en el inicio.
 *
 * Facturas NO-legacy ∪ entregas de muebles. Las legacy quedan afuera a
 * propósito: viven en su propio archivo ("Gastos Tommy y Calvin"), que no se
 * tocó. Un proyecto puede estar en el archivo Y en una marca a la vez — son
 * documentos distintos del mismo cliente, y no se suman dos veces en ningún
 * lado (el archivo cuenta solo facturas legacy; la marca, solo no-legacy y
 * entregas).
 */
export function marcasDeProyecto(args: {
  /** marca_id de las facturas NO-legacy de ese proyecto */
  porFacturas: Iterable<string>;
  /** marca_id de las entregas de muebles de ese proyecto */
  porEntregas: Iterable<string>;
}): Set<string> {
  const out = new Set<string>();
  for (const m of args.porFacturas) out.add(String(m));
  for (const m of args.porEntregas) out.add(String(m));
  return out;
}

export interface EntradaResumen {
  /** Facturas NO anuladas. */
  facturas: ReadonlyArray<FacturaResumen>;
  facturaMarcas: ReadonlyArray<FacturaMarcaResumen>;
  /** Entregas de muebles (de proyectos vivos). */
  entregas: ReadonlyArray<EntregaResumen>;
  marcas: ReadonlyArray<MarcaResumen>;
  /** Ids de proyectos vivos (no anulados). */
  proyectosVivos: ReadonlySet<string>;
  /** Ids de proyectos que son Multifashion (bucket independiente). */
  proyectosMultifashion: ReadonlySet<string>;
}

/**
 * Arma TODO lo que dibuja el inicio de Marketing, de una sola pasada.
 *
 * Invariantes que sostiene el candado (`marketing-inicio-marcas.test.ts`):
 *  - `porMarca` (facturas) es idéntico a lo que devolvía la ruta antes del fix:
 *    ningún monto de factura se mueve de tarjeta.
 *  - los muebles van en `mueblesPorMarca`, APARTE. No se suman a `porMarca`:
 *    una factura pagada a un proveedor y un mueble entregado del inventario
 *    son cosas distintas, y fundirlas en un solo `$` cambiaría el número que
 *    Daniel ya conoce sin explicar por qué.
 *  - `proyectosPorMarca` cuenta el MISMO conjunto que filtra `proyectos-lista`.
 */
export function agregarResumenInicio(inp: EntradaResumen): ResumenInicio {
  const empresaDeMarca = new Map<string, string | null>(
    inp.marcas.map((m) => [String(m.id), m.empresa_codigo ?? null]),
  );

  const esMf = (pid: string | null): boolean =>
    !!pid && inp.proyectosMultifashion.has(String(pid));

  const facturaById = new Map<string, FacturaResumen>(
    inp.facturas.map((f) => [String(f.id), f]),
  );

  // --- Buckets planos de facturas (legacy / multifashion) ---
  const legacy: Bucket = { count: 0, total: 0 };
  const multifashion = { count: 0, total: 0, entregas: 0, muebles: 0 };
  for (const f of inp.facturas) {
    if (esMf(f.proyecto_id)) {
      multifashion.count += 1;
      multifashion.total += num(f.total);
      continue;
    }
    if (f.grupo_legacy) {
      legacy.count += 1;
      legacy.total += num(f.total);
    }
  }

  // --- Facturas por marca (reparto por porcentaje dentro de cada factura) ---
  const rowsByFactura = new Map<string, FacturaMarcaResumen[]>();
  for (const r of inp.facturaMarcas) {
    const fid = String(r.factura_id);
    if (!facturaById.has(fid)) continue;
    const arr = rowsByFactura.get(fid) ?? [];
    arr.push(r);
    rowsByFactura.set(fid, arr);
  }

  const porMarca: Record<string, Bucket> = {};
  const impulsadoraPorMarca: Record<string, Bucket> = {};
  const mueblesPorMarca: Record<string, Bucket> = {};
  const proyectosPorMarca = new Map<string, Set<string>>();

  const bump = (acc: Record<string, Bucket>, mid: string, monto: number) => {
    const cur = acc[mid] ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += monto;
    acc[mid] = cur;
  };
  const anotarProyecto = (mid: string, pid: string | null) => {
    if (!pid) return;
    const set = proyectosPorMarca.get(mid) ?? new Set<string>();
    set.add(String(pid));
    proyectosPorMarca.set(mid, set);
  };

  for (const [fid, rows] of rowsByFactura) {
    const info = facturaById.get(fid)!;
    if (esMf(info.proyecto_id)) continue; // Multifashion tiene su propia tarjeta
    if (info.grupo_legacy) continue; // el archivo Tommy/Calvin no alimenta marcas
    const sumPct = rows.reduce((s, x) => s + num(x.porcentaje), 0) || 1;
    for (const r of rows) {
      const mid = String(r.marca_id);
      const monto = num(info.total) * (num(r.porcentaje) / sumPct);
      bump(porMarca, mid, monto);
      if (info.impulsadora_id) bump(impulsadoraPorMarca, mid, monto);
      // Los pagos de impulsadora son gastos SUELTOS (proyecto_id NULL): suman
      // plata a la marca pero no son un proyecto. `anotarProyecto` los ignora.
      if (inp.proyectosVivos.has(String(info.proyecto_id ?? ""))) {
        anotarProyecto(mid, info.proyecto_id);
      }
    }
  }

  // --- Entregas de muebles ---
  for (const e of inp.entregas) {
    const pid = e.proyecto_id ? String(e.proyecto_id) : null;
    // Una entrega sin proyecto vivo no se atribuye: no hay a dónde llevar al
    // usuario si toca la tarjeta, y contarla inflaría un total inalcanzable.
    if (!pid || !inp.proyectosVivos.has(pid)) continue;
    if (esMf(pid)) {
      multifashion.entregas += 1;
      multifashion.muebles += num(e.total);
      continue;
    }
    for (const mid of marcasDeEntrega(e)) {
      const monto = porcionEntregaParaMarca(e, mid, empresaDeMarca.get(mid));
      if (monto <= 0) continue;
      bump(mueblesPorMarca, mid, monto);
      anotarProyecto(mid, pid);
    }
  }

  // Total del módulo para la tarjeta de Mobiliario: TODAS las entregas de
  // proyectos vivos (Multifashion incluida — es mobiliario que salió igual).
  const mobiliario = { entregas: 0, total: 0 };
  for (const e of inp.entregas) {
    const pid = e.proyecto_id ? String(e.proyecto_id) : null;
    if (!pid || !inp.proyectosVivos.has(pid)) continue;
    mobiliario.entregas += 1;
    mobiliario.total += num(e.total);
  }

  const redondear = (acc: Record<string, Bucket>) => {
    for (const k of Object.keys(acc)) acc[k].total = round2(acc[k].total);
    return acc;
  };

  const proyectos: Record<string, number> = {};
  for (const [mid, set] of proyectosPorMarca) proyectos[mid] = set.size;

  return {
    legacy: { count: legacy.count, total: round2(legacy.total) },
    multifashion: {
      count: multifashion.count,
      total: round2(multifashion.total),
      entregas: multifashion.entregas,
      muebles: round2(multifashion.muebles),
    },
    porMarca: redondear(porMarca),
    impulsadoraPorMarca: redondear(impulsadoraPorMarca),
    mueblesPorMarca: redondear(mueblesPorMarca),
    proyectosPorMarca: proyectos,
    mobiliario: { entregas: mobiliario.entregas, total: round2(mobiliario.total) },
  };
}
