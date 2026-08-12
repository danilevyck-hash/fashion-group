// ============================================================================
// Marketing — el inicio, agrupado por MARCA y acotado por PERÍODO.
//
// 🔑 LA MARCA ES LA UNIDAD. Daniel, textual: *"ellos facturan a mi bajo
// compañia diferentes. una por marca. cada marca tiene su encargado"*. Cada
// bloque es una marca, con su período, su cierre y su ZIP. Cada una se cierra
// SOLA — el atajo "Cerrar las tres" se retiró el 11-ago-2026 (Daniel: *"que sea
// por separado mejor no?"*). El mapa marca → bloque vive en `bloques.ts` y acá
// se IMPORTA.
//
// 🔴 NO HAY TECHO NI PRESUPUESTO. *"simplemente reportas lo que gastaste"*. Acá
// no se calcula "cuánto queda", ni "cuánto sobra", ni un % de avance: el módulo
// SUMA lo gastado y punto.
//
// 🩸 LA MATEMÁTICA NO SE REESCRIBE. El reparto de una factura entre sus marcas
// (por porcentaje) y la porción de una entrega de muebles que le toca a una
// marca viven en `resumen-inicio.ts` y se IMPORTAN. Escribir acá una segunda
// versión sería la forma exacta en que este repo ya se quemó dos veces con los
// signos de las notas de crédito: dos archivos que dicen cosas distintas sobre
// la misma plata, y nadie se entera hasta que una marca reclama.
//
// 🔴 DEGRADACIÓN SIN LA DDL, Y ES LO QUE SOSTIENE LOS NÚMEROS. La migración
// `20260811180000` la corre Daniel A MANO. Mientras no corra, los 121 sellos
// que existen dicen `'pvh'` / `'reebok'` / `'joybees'`, o sea la clave VIEJA por
// proveedor. Por eso el sello de una marca se busca con `clavesDeSello()`:
// primero el código de marca, después la clave vieja. Si solo se preguntara por
// `'TH'`, los 59 documentos del período CERRADO no se encontrarían, se leerían
// como "del período actual" y **Tommy mostraría $102.904,43 en vez de sus
// $58.365,00 abiertos**. O sea: la plata se movería en pantalla por no haber
// corrido una migración.
//
// Módulo PURO. Sin base, sin I/O.
// ============================================================================

import {
  marcasDeEntrega,
  porcionEntregaParaMarca,
  type EntregaResumen,
  type FacturaMarcaResumen,
  type FacturaResumen,
} from "./resumen-inicio";
import {
  MARCAS_BLOQUE,
  MULTIFASHION_KEY,
  SIN_BLOQUE,
  claveLegacyDeMarca,
  clavesDeSello,
  indiceBloquePorMarcaId,
  nombreDeBloque,
  type BloqueKey,
  type MarcaParaBloque,
} from "./bloques";

/** Nombre del primer período cerrado: el archivo que ya existía. */
export const PERIODO_LEGACY_NOMBRE = "Gastos Tommy y Calvin";

export interface PeriodoRow {
  id: string;
  /** ⚠️ La columna conserva el nombre viejo y guarda el CÓDIGO DE MARCA. */
  proveedor_key: string;
  nombre: string;
  estado: string;
  cerrado_en?: string | null;
}

/** Fila de `mk_periodo_documentos`. */
export interface SelloRow {
  periodo_id: string;
  /** Código de marca, o la clave vieja por proveedor en los 121 sellos viejos. */
  proveedor_key: string;
  tipo: "factura" | "entrega";
  documento_id: string;
}

export interface ProyectoResumenBloque {
  id: string;
  tienda?: string | null;
  tienda_codigo?: string | null;
}

/** Fila de `mk_adjuntos`, solo lo que hace falta para los dos avisos. */
export interface AdjuntoResumen {
  tipo: string;
  factura_id?: string | null;
  proyecto_id?: string | null;
}

export interface Monto {
  count: number;
  total: number;
}

export interface BloqueResumen {
  key: string;
  /** Del catálogo (`mk_marcas.nombre`), con la constante como respaldo. */
  nombre: string;
  /** `null` = este bloque no se le reporta a nadie (Multifashion / sin marca). */
  periodoAbierto: { id: string | null; nombre: string } | null;
  facturas: Monto;
  muebles: Monto;
  total: number;
  proyectos: number;
  /** Gastos del período ABIERTO sin comprobante de pago. */
  sinComprobante: number;
  /** Gastos del período ABIERTO CON CLIENTE y sin foto de instalación. */
  sinFoto: number;
}

export interface PeriodoCerradoResumen {
  id: string | null;
  /** Código de marca. */
  bloqueKey: string;
  bloqueNombre: string;
  nombre: string;
  cerradoEn: string | null;
  facturas: Monto;
  muebles: Monto;
  total: number;
}

export interface FilaPorCliente {
  cliente: string;
  clienteCodigo: string | null;
  /** Monto por bloque (solo períodos ABIERTOS). Clave = código de marca. */
  porBloque: Record<string, number>;
  total: number;
}

export interface ResumenBloques {
  bloques: BloqueResumen[];
  cerrados: PeriodoCerradoResumen[];
  /** Cabecera: lo gastado hoy (períodos abiertos), proyectos y clientes vivos. */
  resumen: { total: number; proyectos: number; clientes: number };
  porCliente: FilaPorCliente[];
  /** Gasto por marca — el "Por marca" del inicio. `marca_id → monto`. */
  porMarca: Record<string, number>;
  /** true = las tablas de período existen y mandan; false = fallback legacy. */
  conPeriodos: boolean;
}

export interface EntradaBloques {
  /** Facturas NO anuladas. */
  facturas: ReadonlyArray<FacturaResumen>;
  facturaMarcas: ReadonlyArray<FacturaMarcaResumen>;
  /** Entregas de muebles con su id (hace falta para el sello). */
  entregas: ReadonlyArray<EntregaResumen & { id: string }>;
  marcas: ReadonlyArray<MarcaParaBloque & { empresa_codigo?: string | null }>;
  proyectos: ReadonlyArray<ProyectoResumenBloque>;
  /** Ids de proyectos que son Multifashion. */
  proyectosMultifashion: ReadonlySet<string>;
  /** Filas de `mk_periodos`. Vacío = la DDL no corrió. */
  periodos?: ReadonlyArray<PeriodoRow>;
  /** Filas de `mk_periodo_documentos`. Vacío = la DDL no corrió. */
  sellos?: ReadonlyArray<SelloRow>;
  /** Filas de `mk_adjuntos`. Vacío = los dos avisos salen en cero. */
  adjuntos?: ReadonlyArray<AdjuntoResumen>;
}

// ----------------------------------------------------------------------------
// LOS DOS PAPELES DEL GASTO — y son distintos
//
// Daniel, textual: *"pero impulsadora tambien necesita comprobante, pero no
// foto. aunq el comprobante sea una foto."*
//
//  · COMPROBANTE del pago  → lo lleva TODO gasto, impulsadoras incluidas.
//  · FOTO DE INSTALACIÓN   → el letrero puesto, el mueble armado. Llega DESPUÉS
//    y solo tiene sentido cuando el gasto es de un CLIENTE.
//
// 🔴 Sin banderas por tipo de gasto. Daniel: *"no todas pero que el modulo no se
// limite a alguna si y algunas no, mantenlo simple"* → el criterio de la foto es
// "tiene cliente o no" (`proyecto_id`), y nada más. Los 17 pagos de impulsadora
// tienen `proyecto_id = NULL`, así que quedan fuera del aviso solos.
// ----------------------------------------------------------------------------

/** ¿Este adjunto es el COMPROBANTE del pago? */
export function esComprobanteDePago(tipo: string): boolean {
  return tipo === "pdf_factura" || tipo === "foto_factura";
}

/**
 * ¿Este adjunto es la FOTO DE INSTALACIÓN del gasto?
 *
 * `foto_instalacion` es el tipo NUEVO (lo habilita la migración). Cuelga de la
 * FACTURA, que es lo que permite decir "este gasto no tiene foto".
 */
export function esFotoDeInstalacion(tipo: string): boolean {
  return tipo === "foto_instalacion";
}

function num(x: unknown): number {
  const n = Number(x ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function round2(n: number): number {
  return Number(n.toFixed(2));
}
function sumar(m: Monto, monto: number) {
  m.count += 1;
  m.total += monto;
}

/**
 * Sello LEGACY de una factura, para cuando `mk_periodo_documentos` no existe.
 *
 * Es literalmente la regla que hoy parte la pantalla en "archivo Tommy y
 * Calvin" contra "tarjetas de marca": `grupo_legacy` y no-Multifashion.
 * Devuelve `true` si la factura pertenece al período CERRADO.
 */
export function periodoLegacyDeFactura(
  f: FacturaResumen,
  esMultifashion: boolean,
): boolean {
  return !esMultifashion && !!f.grupo_legacy;
}

/** Identidad del cliente de un proyecto: el código manda, el texto es respaldo. */
export function claveCliente(p: ProyectoResumenBloque): string {
  const cod = (p.tienda_codigo ?? "").trim().toUpperCase();
  if (cod) return cod;
  return (p.tienda ?? "").trim().toLowerCase().replace(/\s+/g, " ") || "(sin cliente)";
}

/**
 * El CLASIFICADOR de períodos: ¿este documento, para esta marca, pertenece a
 * un período CERRADO o al abierto?
 *
 * 🔴 FUENTE ÚNICA. Lo usan `agregarPorBloques` (las tarjetas del inicio) y
 * `proyectos-lista` (la lista partida en "Período actual" / "Ya reportado",
 * 12-ago-2026). Si cada consumidor escribiera su propia versión, la tarjeta
 * podría decir "abierto" y la lista "reportado" sobre el MISMO documento.
 *
 * 🔑 Tolera el estado SUCIO de los sellos de hoy sin depender de él:
 *  - Un sello a un período ABIERTO —incluido el fantasma `pvh · abierto` que
 *    hoy llevan 16 de los 17 pagos de impulsadora— se lee como "gasto de
 *    ahora" (`null`). Cuando Daniel repare esos sellos hacia TH/CK abiertos,
 *    la respuesta es LA MISMA: sigue siendo un período abierto.
 *  - Un documento con sello DUPLICADO (el caso real: la entrega de Nova Lux,
 *    sellada a CK abierto Y a pvh abierto) se clasifica UNA vez: la primera
 *    clave que aparezca manda, y el monto no se toca acá — clasificar no suma.
 */
export function crearClasificadorPeriodos(
  periodos: ReadonlyArray<PeriodoRow>,
  sellos: ReadonlyArray<SelloRow>,
): {
  conPeriodos: boolean;
  abiertoDeMarca: (k: string) => PeriodoRow | null;
  cerradoPara: (
    tipo: "factura" | "entrega",
    docId: string,
    marcaKey: string,
    legacyFallback: boolean,
  ) => PeriodoRow | { id: null; nombre: string } | null;
} {
  const conPeriodos = periodos.length > 0;

  const periodoById = new Map(periodos.map((p) => [String(p.id), p]));
  const abiertoPorClave = new Map<string, PeriodoRow>();
  for (const p of periodos) {
    if (p.estado === "abierto") abiertoPorClave.set(String(p.proveedor_key), p);
  }
  /**
   * El período ABIERTO de una marca: primero por su código, después por la
   * clave vieja. Sin esto, antes de la migración ningún bloque tendría período
   * y la pantalla perdería el nombre que Daniel ya viene viendo.
   */
  const abiertoDeMarca = (k: string): PeriodoRow | null => {
    for (const clave of clavesDeSello(k)) {
      const p = abiertoPorClave.get(clave);
      if (p) return p;
    }
    return null;
  };

  // `${tipo}::${documento_id}::${clave}` → periodo_id
  const selloDe = new Map<string, string>();
  for (const s of sellos) {
    selloDe.set(
      `${s.tipo}::${String(s.documento_id)}::${String(s.proveedor_key)}`,
      String(s.periodo_id),
    );
  }

  /**
   * ¿A qué período va este documento para esta marca? `null` = el abierto.
   * Devuelve la fila del período CERRADO cuando corresponde.
   *
   * 🔴 Pregunta por las DOS claves (código de marca y clave vieja). Ver el
   * encabezado del archivo: preguntar solo por el código movería $44.539,43 de
   * Tommy del archivo al período actual.
   */
  const cerradoPara = (
    tipo: "factura" | "entrega",
    docId: string,
    marcaKey: string,
    legacyFallback: boolean,
  ): PeriodoRow | { id: null; nombre: string } | null => {
    if (conPeriodos) {
      for (const clave of clavesDeSello(marcaKey)) {
        const pid = selloDe.get(`${tipo}::${docId}::${clave}`);
        if (!pid) continue;
        const p = periodoById.get(pid);
        if (!p) continue;
        // Un sello a un período ABIERTO es "gasto de ahora": el primero que
        // aparezca manda, sea por código o por la clave vieja.
        if (p.estado !== "cerrado") return null;
        return p;
      }
      return null; // sin sello → el abierto (documento nuevo)
    }
    // Sin DDL de períodos: solo las marcas cuya clave HISTÓRICA es 'pvh'
    // (TH/CK/KL) tienen archivo, y solo por `grupo_legacy` — que es la
    // partición que hace la pantalla de hoy. 🔴 Esto es el mapeo LEGACY de
    // `bloques.ts`, no un grupo de cierre: el cierre conjunto ya no existe,
    // pero el archivo "Gastos Tommy y Calvin" sigue siendo de esas marcas.
    if (legacyFallback && claveLegacyDeMarca(marcaKey) === "pvh") {
      return { id: null, nombre: PERIODO_LEGACY_NOMBRE };
    }
    return null;
  };

  return { conPeriodos, abiertoDeMarca, cerradoPara };
}

export function agregarPorBloques(inp: EntradaBloques): ResumenBloques {
  const periodos = inp.periodos ?? [];
  const sellos = inp.sellos ?? [];
  const adjuntos = inp.adjuntos ?? [];
  // El clasificador es la FUENTE ÚNICA (ver `crearClasificadorPeriodos`).
  const { conPeriodos, abiertoDeMarca, cerradoPara } =
    crearClasificadorPeriodos(periodos, sellos);

  const bloquePorMarca = indiceBloquePorMarcaId(inp.marcas);
  const empresaDeMarca = new Map<string, string | null>(
    inp.marcas.map((m) => [String(m.id), m.empresa_codigo ?? null]),
  );

  const proyById = new Map(inp.proyectos.map((p) => [String(p.id), p]));
  const proyectosVivos = new Set(proyById.keys());
  const esMf = (pid: string | null | undefined) =>
    !!pid && inp.proyectosMultifashion.has(String(pid));

  // --- Adjuntos: los dos papeles, cada uno con su set ---
  const facturaConComprobante = new Set<string>();
  const facturaConFotoInstalacion = new Set<string>();
  const proyectoConFoto = new Set<string>();
  for (const a of adjuntos) {
    const tipo = String(a.tipo ?? "");
    const fid = a.factura_id ? String(a.factura_id) : "";
    const pid = a.proyecto_id ? String(a.proyecto_id) : "";
    if (fid && esComprobanteDePago(tipo)) facturaConComprobante.add(fid);
    if (fid && esFotoDeInstalacion(tipo)) facturaConFotoInstalacion.add(fid);
    // Las 60 fotos que ya existen cuelgan del PROYECTO (o sea del cliente) y NO
    // se migran: se siguen leyendo, y un gasto cuyo cliente ya tiene fotos no
    // dispara el aviso.
    if (pid && tipo === "foto_proyecto") proyectoConFoto.add(pid);
  }

  // --- Acumuladores ---
  const bloques = new Map<string, BloqueResumen>();
  const proyectosDeBloque = new Map<string, Set<string>>();
  const cerradosAcc = new Map<string, PeriodoCerradoResumen>();
  const porMarca: Record<string, number> = {};
  const clientes = new Map<string, FilaPorCliente>();
  // Facturas del período ABIERTO por bloque — distintas, para no contar dos
  // veces una factura repartida entre dos marcas DENTRO del mismo bloque.
  const facturasAbiertasDeBloque = new Map<string, Set<string>>();

  const bloque = (k: string): BloqueResumen => {
    let b = bloques.get(k);
    if (!b) {
      const esBucket = k === MULTIFASHION_KEY || k === SIN_BLOQUE;
      const ab = esBucket ? null : abiertoDeMarca(k);
      b = {
        key: k,
        nombre: nombreDeBloque(k, inp.marcas),
        periodoAbierto: esBucket
          ? null
          : { id: ab ? String(ab.id) : null, nombre: ab ? ab.nombre : "Período actual" },
        facturas: { count: 0, total: 0 },
        muebles: { count: 0, total: 0 },
        total: 0,
        proyectos: 0,
        sinComprobante: 0,
        sinFoto: 0,
      };
      bloques.set(k, b);
    }
    return b;
  };

  const anotarProyecto = (k: string, pid: string | null | undefined) => {
    if (!pid || !proyectosVivos.has(String(pid))) return;
    const s = proyectosDeBloque.get(k) ?? new Set<string>();
    s.add(String(pid));
    proyectosDeBloque.set(k, s);
  };

  const anotarCliente = (pid: string | null | undefined, k: string, monto: number) => {
    const p = pid ? proyById.get(String(pid)) : null;
    // 🩸 Un gasto SIN proyecto (los pagos de impulsadora, `proyecto_id` NULL)
    // no tiene cliente, pero SÍ es plata del bloque: si se descartara, la
    // columna de la tabla sumaría menos que el bloque de arriba y la pantalla
    // se contradiría. Medido el 11-ago-2026: son $13.600,00.
    const key = p ? claveCliente(p) : "(sin proyecto)";
    let fila = clientes.get(key);
    if (!fila) {
      fila = {
        cliente: p ? (p.tienda ?? "").trim() || "(sin cliente)" : "Impulsadoras y gastos sueltos",
        clienteCodigo: p ? (p.tienda_codigo ?? "").trim() || null : null,
        porBloque: {},
        total: 0,
      };
      clientes.set(key, fila);
    }
    fila.porBloque[k] = (fila.porBloque[k] ?? 0) + monto;
    fila.total += monto;
  };

  /**
   * Anota una factura del período ABIERTO para los dos avisos.
   *
   * ⚠️ Las ENTREGAS de mobiliario NO pasan por acá: su comprobante se GENERA
   * (`pdf-entrega-mueble.ts`), así que siempre existe y contarlas como "sin
   * comprobante" sería un aviso que nadie puede apagar.
   */
  const anotarPendientes = (k: string, f: FacturaResumen) => {
    const fid = String(f.id);
    const yaContada = facturasAbiertasDeBloque.get(k) ?? new Set<string>();
    if (yaContada.has(fid)) return;
    yaContada.add(fid);
    facturasAbiertasDeBloque.set(k, yaContada);

    const b = bloque(k);
    if (!facturaConComprobante.has(fid)) b.sinComprobante += 1;

    const pid = f.proyecto_id ? String(f.proyecto_id) : null;
    if (!pid) return; // sin cliente no hay instalación que fotografiar
    if (facturaConFotoInstalacion.has(fid)) return;
    if (proyectoConFoto.has(pid)) return;
    b.sinFoto += 1;
  };

  const anotarCerrado = (
    per: PeriodoRow | { id: null; nombre: string },
    marcaKey: string,
    tipo: "factura" | "entrega",
    monto: number,
  ) => {
    // 🔴 La llave lleva la MARCA. Acumular solo por `periodo.id` metería las 59
    // facturas de "mid 2026" en UNA sola entrada y la pantalla no podría decir
    // cuánto le tocó a Tommy y cuánto a Calvin — que es justamente lo que este
    // cambio vino a partir.
    const llave = `${per.id ? String(per.id) : per.nombre}::${marcaKey}`;
    let c = cerradosAcc.get(llave);
    if (!c) {
      c = {
        id: per.id ? String(per.id) : null,
        bloqueKey: marcaKey,
        // 🩸 El nombre sale del BLOQUE, no de `periodo.proveedor_key` — esa
        // columna dice 'pvh' en la fila del cierre conjunto de verdad.
        bloqueNombre: nombreDeBloque(marcaKey, inp.marcas),
        nombre: per.nombre,
        cerradoEn: "cerrado_en" in per ? (per.cerrado_en ?? null) : null,
        facturas: { count: 0, total: 0 },
        muebles: { count: 0, total: 0 },
        total: 0,
      };
      cerradosAcc.set(llave, c);
    }
    sumar(tipo === "factura" ? c.facturas : c.muebles, monto);
    c.total += monto;
  };

  // Los bloques existen aunque no tengan un centavo: una marca a la que no le
  // gastaste nada este período sigue siendo alguien a quien le reportás, y el
  // mockup lo muestra ("Todavía no hay gasto en este período").
  for (const m of MARCAS_BLOQUE) bloque(m.key);
  bloque(MULTIFASHION_KEY);

  // ---------------------------------------------------------------- FACTURAS
  const facturaById = new Map(inp.facturas.map((f) => [String(f.id), f]));
  const rowsByFactura = new Map<string, FacturaMarcaResumen[]>();
  for (const r of inp.facturaMarcas) {
    const fid = String(r.factura_id);
    if (!facturaById.has(fid)) continue;
    const arr = rowsByFactura.get(fid) ?? [];
    arr.push(r);
    rowsByFactura.set(fid, arr);
  }

  for (const f of inp.facturas) {
    const fid = String(f.id);
    const pid = f.proyecto_id ? String(f.proyecto_id) : null;

    const rows = rowsByFactura.get(fid) ?? [];

    // Multifashion es del PROYECTO, no de la marca: es una tienda propia y su
    // gasto no se le reporta a nadie, tenga la marca que tenga la factura. La
    // marca igual se anota en `porMarca` — si no, "Por marca" sumaría menos que
    // el titular de la pantalla y las dos cifras se contradirían.
    if (esMf(pid)) {
      const b = bloque(MULTIFASHION_KEY);
      sumar(b.facturas, num(f.total));
      anotarProyecto(MULTIFASHION_KEY, pid);
      anotarCliente(pid, MULTIFASHION_KEY, num(f.total));
      anotarPendientes(MULTIFASHION_KEY, f);
      const sumPctMf = rows.reduce((s, x) => s + num(x.porcentaje), 0) || 1;
      for (const r of rows) {
        const mid = String(r.marca_id);
        porMarca[mid] = (porMarca[mid] ?? 0) + num(f.total) * (num(r.porcentaje) / sumPctMf);
      }
      continue;
    }

    if (rows.length === 0) continue; // sin marca no hay bloque a quien reportar
    const sumPct = rows.reduce((s, x) => s + num(x.porcentaje), 0) || 1;

    for (const r of rows) {
      const mid = String(r.marca_id);
      const k = bloquePorMarca.get(mid) ?? SIN_BLOQUE;
      const monto = num(f.total) * (num(r.porcentaje) / sumPct);

      // 🔑 El proyecto se anota SIEMPRE, esté el documento en el período
      // abierto o en uno cerrado. "Proyectos" es lo que va a listar
      // "Ver proyectos", y ahí tienen que estar TODOS los de la marca: a un
      // proyecto que hoy solo tiene facturas ya reportadas se le pueden seguir
      // cargando gastos nuevos.
      anotarProyecto(k, pid);

      const cer = cerradoPara("factura", fid, k, periodoLegacyDeFactura(f, false));
      if (cer) {
        anotarCerrado(cer, k, "factura", monto);
        continue;
      }
      // `porMarca` solo cuenta lo ABIERTO, igual que el titular: un desglose
      // que sume más que el número grande de arriba es una pantalla mintiendo.
      porMarca[mid] = (porMarca[mid] ?? 0) + monto;
      const b = bloque(k);
      sumar(b.facturas, monto);
      anotarCliente(pid, k, monto);
      anotarPendientes(k, f);
    }
  }

  // ---------------------------------------------------------------- ENTREGAS
  for (const e of inp.entregas) {
    const pid = e.proyecto_id ? String(e.proyecto_id) : null;
    // Una entrega sin proyecto vivo no se atribuye: no hay a dónde llevar al
    // usuario si toca el bloque, y contarla inflaría un total inalcanzable.
    if (!pid || !proyectosVivos.has(pid)) continue;
    const eid = String(e.id);

    if (esMf(pid)) {
      const b = bloque(MULTIFASHION_KEY);
      sumar(b.muebles, num(e.total));
      anotarProyecto(MULTIFASHION_KEY, pid);
      anotarCliente(pid, MULTIFASHION_KEY, num(e.total));
      for (const mid of marcasDeEntrega(e)) {
        porMarca[mid] =
          (porMarca[mid] ?? 0) + porcionEntregaParaMarca(e, mid, empresaDeMarca.get(mid));
      }
      continue;
    }

    for (const mid of marcasDeEntrega(e)) {
      const k = bloquePorMarca.get(mid) ?? SIN_BLOQUE;
      const monto = porcionEntregaParaMarca(e, mid, empresaDeMarca.get(mid));
      if (monto <= 0) continue;

      anotarProyecto(k, pid); // ver el comentario de las facturas: siempre

      // Los muebles NUNCA caen en el archivo legacy: `grupo_legacy` es una
      // columna de `mk_facturas` y no existe para las entregas. Sin sello, van
      // al período abierto — que es lo que hace la pantalla de hoy.
      const cer = cerradoPara("entrega", eid, k, false);
      if (cer) {
        anotarCerrado(cer, k, "entrega", monto);
        continue;
      }
      porMarca[mid] = (porMarca[mid] ?? 0) + monto;
      const b = bloque(k);
      sumar(b.muebles, monto);
      anotarCliente(pid, k, monto);
    }
  }

  // ---------------------------------------------------------------- CIERRE
  const listaBloques: BloqueResumen[] = [];
  const orden: string[] = [
    ...MARCAS_BLOQUE.map((m) => m.key as string),
    MULTIFASHION_KEY,
    SIN_BLOQUE,
  ];
  for (const k of orden) {
    const b = bloques.get(k);
    if (!b) continue;
    // El bucket "sin marca asignada" solo se dibuja si tiene algo adentro:
    // mostrar un bloque vacío pidiendo una decisión que no cambia nada sería
    // ruido.
    if (k === SIN_BLOQUE && b.facturas.count === 0 && b.muebles.count === 0) continue;
    b.facturas.total = round2(b.facturas.total);
    b.muebles.total = round2(b.muebles.total);
    b.total = round2(b.facturas.total + b.muebles.total);
    b.proyectos = proyectosDeBloque.get(k)?.size ?? 0;
    listaBloques.push(b);
  }

  const cerrados = [...cerradosAcc.values()]
    .map((c) => ({
      ...c,
      facturas: { ...c.facturas, total: round2(c.facturas.total) },
      muebles: { ...c.muebles, total: round2(c.muebles.total) },
      total: round2(c.total),
    }))
    .sort(
      (a, b) =>
        (b.cerradoEn ?? "").localeCompare(a.cerradoEn ?? "") ||
        a.bloqueNombre.localeCompare(b.bloqueNombre),
    );

  const porClienteLista = [...clientes.values()]
    .map((f) => {
      const pb: Record<string, number> = {};
      for (const [k, v] of Object.entries(f.porBloque)) pb[k] = round2(v);
      return { ...f, porBloque: pb, total: round2(f.total) };
    })
    .sort((a, b) => b.total - a.total);

  const porMarcaRedondeado: Record<string, number> = {};
  for (const [k, v] of Object.entries(porMarca)) porMarcaRedondeado[k] = round2(v);

  return {
    bloques: listaBloques,
    cerrados,
    resumen: {
      total: round2(listaBloques.reduce((s, b) => s + b.total, 0)),
      proyectos: proyectosVivos.size,
      clientes: new Set(inp.proyectos.map(claveCliente)).size,
    },
    porCliente: porClienteLista,
    porMarca: porMarcaRedondeado,
    conPeriodos,
  };
}

/** Nombre visible de una marca, para el "Por marca" del inicio. */
export function nombreMarcaSeguro(
  marcas: ReadonlyArray<{ id: string; nombre?: string | null }>,
  id: string,
): string {
  return marcas.find((m) => String(m.id) === String(id))?.nombre ?? "Sin marca";
}
