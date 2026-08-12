// ============================================================================
// Marketing — el inicio, agrupado por PROVEEDOR y acotado por PERÍODO.
//
// 🔑 QUÉ ES UN PERÍODO. Daniel, textual: es *"lo que ya le reportaste a ese
// proveedor"*. Al cerrarlo se congela (no entran más documentos), se genera el
// reporte con SOLO la parte de ese proveedor, y se abre uno nuevo en cero con
// el nombre que él escriba. **Los proyectos NO se cierran**: lo que se congela
// es la parte de ESE proveedor dentro de cada proyecto. Un proyecto con Tommy y
// Reebok al cerrar PVH conserva su parte de Reebok viva y editable.
//
// 🔴 NO HAY TECHO NI PRESUPUESTO. *"simplemente reportas lo que gastaste"*. Acá
// no se calcula "cuánto queda", ni "cuánto sobra", ni un % de avance: el módulo
// SUMA lo gastado y punto. Cualquier cosa que se parezca a un presupuesto es una
// idea que Daniel descartó explícitamente.
//
// 🩸 LA MATEMÁTICA NO SE REESCRIBE. El reparto de una factura entre sus marcas
// (por porcentaje) y la porción de una entrega de muebles que le toca a una
// marca viven en `resumen-inicio.ts` y se IMPORTAN. Escribir acá una segunda
// versión sería la forma exacta en que este repo ya se quemó dos veces con los
// signos de las notas de crédito: dos archivos que dicen cosas distintas sobre
// la misma plata, y nadie se entera hasta que un proveedor reclama.
//
// 🔴 DEGRADACIÓN SIN LA DDL. `mk_periodos` / `mk_periodo_documentos` las crea una
// migración que Daniel corre A MANO. Mientras no exista, `sellos` llega vacío y
// `periodos` también, y el módulo cae a `periodoLegacyDeFactura()`: las facturas
// con `grupo_legacy` (fuera de Multifashion) van al período CERRADO "Gastos
// Tommy y Calvin" de PVH y todo lo demás al abierto. Ese fallback reproduce
// EXACTAMENTE los números de hoy — es la misma partición que hace la pantalla
// actual — así que la migración no puede mover un centavo: solo cambia de dónde
// sale la respuesta.
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
  MULTIFASHION_KEY,
  PROVEEDORES,
  SIN_PROVEEDOR,
  indiceProveedorPorMarcaId,
  type BloqueKey,
  type MarcaParaProveedor,
  type ProveedorKey,
} from "./proveedores";

/** Nombre del primer período cerrado de PVH: el archivo que ya existía. */
export const PERIODO_LEGACY_NOMBRE = "Gastos Tommy y Calvin";

export interface PeriodoRow {
  id: string;
  proveedor_key: string;
  nombre: string;
  estado: string;
  cerrado_en?: string | null;
}

/** Fila de `mk_periodo_documentos`. */
export interface SelloRow {
  periodo_id: string;
  proveedor_key: string;
  tipo: "factura" | "entrega";
  documento_id: string;
}

export interface ProyectoResumenProv {
  id: string;
  tienda?: string | null;
  tienda_codigo?: string | null;
}

export interface Monto {
  count: number;
  total: number;
}

export interface BloqueProveedor {
  key: BloqueKey;
  nombre: string;
  /** Marcas que entran en el reporte. Vacío en Multifashion y sin proveedor. */
  marcas: string[];
  /** `null` = este bloque no se le reporta a nadie (Multifashion / sin decidir). */
  periodoAbierto: { id: string | null; nombre: string } | null;
  facturas: Monto;
  muebles: Monto;
  total: number;
  proyectos: number;
}

export interface PeriodoCerrado {
  id: string | null;
  proveedorKey: string;
  proveedorNombre: string;
  nombre: string;
  cerradoEn: string | null;
  facturas: Monto;
  muebles: Monto;
  total: number;
}

export interface FilaPorCliente {
  cliente: string;
  clienteCodigo: string | null;
  /** Monto por bloque (solo períodos ABIERTOS). */
  porBloque: Record<string, number>;
  total: number;
}

export interface ResumenProveedores {
  bloques: BloqueProveedor[];
  cerrados: PeriodoCerrado[];
  /** Cabecera: lo gastado hoy (períodos abiertos), proyectos y clientes vivos. */
  resumen: { total: number; proyectos: number; clientes: number };
  porCliente: FilaPorCliente[];
  /** Gasto por marca — el "Por marca" del inicio. `marca_id → monto`. */
  porMarca: Record<string, number>;
  /** true = las tablas de período existen y mandan; false = fallback legacy. */
  conPeriodos: boolean;
}

export interface EntradaProveedores {
  /** Facturas NO anuladas. */
  facturas: ReadonlyArray<FacturaResumen>;
  facturaMarcas: ReadonlyArray<FacturaMarcaResumen>;
  /** Entregas de muebles con su id (hace falta para el sello). */
  entregas: ReadonlyArray<EntregaResumen & { id: string }>;
  marcas: ReadonlyArray<MarcaParaProveedor & { nombre?: string | null; empresa_codigo?: string | null }>;
  proyectos: ReadonlyArray<ProyectoResumenProv>;
  /** Ids de proyectos que son Multifashion. */
  proyectosMultifashion: ReadonlySet<string>;
  /** Filas de `mk_periodos`. Vacío = la DDL no corrió. */
  periodos?: ReadonlyArray<PeriodoRow>;
  /** Filas de `mk_periodo_documentos`. Vacío = la DDL no corrió. */
  sellos?: ReadonlyArray<SelloRow>;
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
export function claveCliente(p: ProyectoResumenProv): string {
  const cod = (p.tienda_codigo ?? "").trim().toUpperCase();
  if (cod) return cod;
  return (p.tienda ?? "").trim().toLowerCase().replace(/\s+/g, " ") || "(sin cliente)";
}

export function agregarPorProveedor(inp: EntradaProveedores): ResumenProveedores {
  const periodos = inp.periodos ?? [];
  const sellos = inp.sellos ?? [];
  const conPeriodos = periodos.length > 0;

  const bloquePorMarca = indiceProveedorPorMarcaId(inp.marcas);
  const empresaDeMarca = new Map<string, string | null>(
    inp.marcas.map((m) => [String(m.id), m.empresa_codigo ?? null]),
  );
  const nombreDeMarca = new Map<string, string>(
    inp.marcas.map((m) => [String(m.id), String(m.nombre ?? "")]),
  );

  const proyById = new Map(inp.proyectos.map((p) => [String(p.id), p]));
  const proyectosVivos = new Set(proyById.keys());
  const esMf = (pid: string | null | undefined) =>
    !!pid && inp.proyectosMultifashion.has(String(pid));

  // --- Períodos ---
  const periodoById = new Map(periodos.map((p) => [String(p.id), p]));
  const abiertoDe = new Map<string, PeriodoRow>();
  for (const p of periodos) {
    if (p.estado === "abierto") abiertoDe.set(String(p.proveedor_key), p);
  }
  // `${tipo}::${documento_id}::${proveedor_key}` → periodo_id
  const selloDe = new Map<string, string>();
  for (const s of sellos) {
    selloDe.set(`${s.tipo}::${String(s.documento_id)}::${String(s.proveedor_key)}`, String(s.periodo_id));
  }

  /**
   * ¿A qué período va este documento para este proveedor? `null` = el abierto.
   * Devuelve la fila del período CERRADO cuando corresponde.
   */
  const cerradoPara = (
    tipo: "factura" | "entrega",
    docId: string,
    prov: string,
    legacyFallback: boolean,
  ): PeriodoRow | { id: null; nombre: string; proveedor_key: string } | null => {
    if (conPeriodos) {
      const pid = selloDe.get(`${tipo}::${docId}::${prov}`);
      if (!pid) return null; // sin sello → el abierto (documento nuevo)
      const p = periodoById.get(pid);
      if (!p || p.estado !== "cerrado") return null;
      return p;
    }
    // Sin DDL: solo PVH tiene archivo, y solo por `grupo_legacy`.
    if (legacyFallback && prov === "pvh") {
      return { id: null, nombre: PERIODO_LEGACY_NOMBRE, proveedor_key: "pvh" };
    }
    return null;
  };

  // --- Acumuladores ---
  const bloques = new Map<BloqueKey, BloqueProveedor>();
  const proyectosDeBloque = new Map<BloqueKey, Set<string>>();
  const cerradosAcc = new Map<string, PeriodoCerrado>();
  const porMarca: Record<string, number> = {};
  const clientes = new Map<string, FilaPorCliente>();

  const nombreBloque = (k: BloqueKey): string => {
    if (k === MULTIFASHION_KEY) return "Multifashion";
    if (k === SIN_PROVEEDOR) return "Sin proveedor asignado";
    return PROVEEDORES.find((p) => p.key === k)?.nombre ?? k;
  };

  const bloque = (k: BloqueKey): BloqueProveedor => {
    let b = bloques.get(k);
    if (!b) {
      const ab = abiertoDe.get(k);
      b = {
        key: k,
        nombre: nombreBloque(k),
        marcas: [],
        periodoAbierto:
          k === MULTIFASHION_KEY || k === SIN_PROVEEDOR
            ? null
            : { id: ab ? String(ab.id) : null, nombre: ab ? ab.nombre : "Período actual" },
        facturas: { count: 0, total: 0 },
        muebles: { count: 0, total: 0 },
        total: 0,
        proyectos: 0,
      };
      bloques.set(k, b);
    }
    return b;
  };

  const anotarProyecto = (k: BloqueKey, pid: string | null | undefined) => {
    if (!pid || !proyectosVivos.has(String(pid))) return;
    const s = proyectosDeBloque.get(k) ?? new Set<string>();
    s.add(String(pid));
    proyectosDeBloque.set(k, s);
  };

  const anotarCliente = (pid: string | null | undefined, k: BloqueKey, monto: number) => {
    const p = pid ? proyById.get(String(pid)) : null;
    // 🩸 Un gasto SIN proyecto (los pagos de impulsadora, `proyecto_id` NULL)
    // no tiene cliente, pero SÍ es plata del bloque: si se descartara, la
    // columna de la tabla sumaría menos que el bloque de arriba y la pantalla
    // se contradiría. Medido el 11-ago-2026: son $13.600,00 de PVH.
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

  const anotarCerrado = (
    per: PeriodoRow | { id: null; nombre: string; proveedor_key: string },
    prov: string,
    tipo: "factura" | "entrega",
    monto: number,
  ) => {
    const llave = per.id ? String(per.id) : `${prov}::${per.nombre}`;
    let c = cerradosAcc.get(llave);
    if (!c) {
      c = {
        id: per.id ? String(per.id) : null,
        proveedorKey: prov,
        proveedorNombre: nombreBloque(prov as BloqueKey),
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

  // Los bloques existen aunque no tengan un centavo: un proveedor al que no le
  // gastaste nada este período sigue siendo alguien a quien le reportás, y el
  // mockup lo muestra ("Todavía no hay gasto en este período").
  for (const p of PROVEEDORES) bloque(p.key);
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
      const sumPctMf = rows.reduce((s, x) => s + num(x.porcentaje), 0) || 1;
      for (const r of rows) {
        const mid = String(r.marca_id);
        porMarca[mid] = (porMarca[mid] ?? 0) + num(f.total) * (num(r.porcentaje) / sumPctMf);
      }
      continue;
    }

    if (rows.length === 0) continue; // sin marca no hay proveedor a quien reportar
    const sumPct = rows.reduce((s, x) => s + num(x.porcentaje), 0) || 1;

    for (const r of rows) {
      const mid = String(r.marca_id);
      const k = bloquePorMarca.get(mid) ?? SIN_PROVEEDOR;
      const monto = num(f.total) * (num(r.porcentaje) / sumPct);

      // 🔑 El proyecto se anota SIEMPRE, esté el documento en el período
      // abierto o en uno cerrado. "Proyectos" es lo que va a listar
      // "Ver proyectos", y ahí tienen que estar TODOS los del proveedor: a un
      // proyecto que hoy solo tiene facturas ya reportadas se le pueden seguir
      // cargando gastos nuevos. Es la misma regla que ya sostiene
      // `resumen-inicio.ts`: la tarjeta no puede prometer un número que la
      // lista no enseña.
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
      anotarProyecto(k, pid);
      anotarCliente(pid, k, monto);
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
      const k = bloquePorMarca.get(mid) ?? SIN_PROVEEDOR;
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
  const listaBloques: BloqueProveedor[] = [];
  const orden: BloqueKey[] = [
    ...PROVEEDORES.map((p) => p.key as BloqueKey),
    MULTIFASHION_KEY,
    SIN_PROVEEDOR,
  ];
  for (const k of orden) {
    const b = bloques.get(k);
    if (!b) continue;
    // El bucket "sin proveedor" solo se dibuja si tiene algo adentro: mostrar
    // un bloque vacío pidiendo una decisión que no cambia nada sería ruido.
    if (k === SIN_PROVEEDOR && b.facturas.count === 0 && b.muebles.count === 0) continue;
    b.facturas.total = round2(b.facturas.total);
    b.muebles.total = round2(b.muebles.total);
    b.total = round2(b.facturas.total + b.muebles.total);
    b.proyectos = proyectosDeBloque.get(k)?.size ?? 0;
    b.marcas = inp.marcas
      .filter((m) => (bloquePorMarca.get(String(m.id)) ?? SIN_PROVEEDOR) === k)
      .map((m) => String(m.nombre ?? "").trim())
      .filter(Boolean);
    listaBloques.push(b);
  }

  const cerrados = [...cerradosAcc.values()]
    .map((c) => ({
      ...c,
      facturas: { ...c.facturas, total: round2(c.facturas.total) },
      muebles: { ...c.muebles, total: round2(c.muebles.total) },
      total: round2(c.total),
    }))
    .sort((a, b) => (b.cerradoEn ?? "").localeCompare(a.cerradoEn ?? ""));

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
