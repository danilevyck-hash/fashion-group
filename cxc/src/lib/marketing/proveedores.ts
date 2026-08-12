// ============================================================================
// Marketing — el PROVEEDOR es a quien le reportás el gasto, y es la unidad que
// se cierra.
//
// 🔑 EL MODELO, en palabras de Daniel: *"le reportas ese gasto al proveedor"*,
// *"cada proveedor solo su parte"*, *"calvin y tommy y karl son de la misma
// compañia, asi que esas las cierro juntas. reebok es de otro proveedor, eso lo
// cierro en otro momento"*.
//
// O sea: la marca NO es la unidad de negocio del módulo. Tommy, Calvin y Karl
// son tres marcas de UNA sola compañía (PVH), y el reporte que sale es uno solo
// con las tres adentro. Reebok es otra compañía y se cierra en otro momento.
//
// 🔴 EL MAPA ES EXPLÍCITO Y VA POR CÓDIGO, NO POR NOMBRE. `mk_marcas.codigo` es
// único en la base (UNIQUE desde `marketing.sql`) y no lo edita nadie desde la
// pantalla; el `nombre` sí se cambia —de hecho `French Connection` se renombró
// a `Karl Lagerfeld` el 11-ago-2026— y atar el reparto de plata a un texto
// editable es atarlo a que nadie corrija una falta de ortografía.
//
// ⚠️ NADA de `startsWith` ni de prefijos: es el colador que ya documentó
// `multifashion/marcas-grupo.ts`. Igualdad exacta del código, en mayúsculas.
//
// 🩸 UNA MARCA SIN PROVEEDOR NO SE ESCONDE Y NO SE ADIVINA. `Otros` (OTR) no
// tiene empresa (`empresa_codigo` NULL) y hoy nadie sabe a qué compañía se le
// reporta. Meterla en PVH "porque sus facturas se parecen" mandaría plata en un
// reporte a un proveedor que no la pidió; dejarla afuera en silencio la volvería
// invisible. Cae en `SIN_PROVEEDOR`, que se dibuja aparte, sin período y sin
// botón de cerrar, y DICE que falta decidirla.
//
// Medido en producción el 11-ago-2026: la única factura de `Otros` ($4.264,80,
// "letrero acs") vive dentro del proyecto Multifashion, o sea que hoy ya está
// contada en el bucket Multifashion y NO afecta a ningún proveedor. Por eso se
// puede publicar esta pantalla sin haber decidido su grupo.
//
// Módulo PURO. Sin base, sin I/O.
// ============================================================================

/** Clave estable de un proveedor. Se guarda en `mk_periodos.proveedor_key`. */
export type ProveedorKey = "pvh" | "reebok" | "joybees";

/** Bucket de las marcas que todavía no tienen proveedor decidido. */
export const SIN_PROVEEDOR = "sin_proveedor" as const;

/** Bucket de Multifashion: tienda propia, no se le reporta a nadie. */
export const MULTIFASHION_KEY = "multifashion" as const;

/** Cualquiera de los bloques que dibuja el inicio. */
export type BloqueKey = ProveedorKey | typeof SIN_PROVEEDOR | typeof MULTIFASHION_KEY;

export interface Proveedor {
  key: ProveedorKey;
  /** Cómo se llama en pantalla y en el reporte que se le manda. */
  nombre: string;
  /** Códigos de `mk_marcas.codigo` que le pertenecen. */
  codigos: readonly string[];
}

/**
 * Los proveedores del módulo, en el orden en que se dibujan.
 *
 * El orden es por peso en el negocio (medido 11-ago-2026: PVH $92.825,
 * Joybees $1.540, Reebok $0) y es fijo — que un bloque salte de lugar porque
 * este mes gastó menos hace que la pantalla se lea distinta cada vez.
 */
export const PROVEEDORES: readonly Proveedor[] = [
  { key: "pvh", nombre: "PVH", codigos: ["TH", "CK", "KL"] },
  { key: "reebok", nombre: "Reebok", codigos: ["RBK"] },
  { key: "joybees", nombre: "Joybees", codigos: ["J"] },
] as const;

const PROVEEDOR_POR_CODIGO: ReadonlyMap<string, ProveedorKey> = new Map(
  PROVEEDORES.flatMap((p) => p.codigos.map((c) => [c.toUpperCase(), p.key] as const)),
);

/** ¿Es una `ProveedorKey` conocida? */
export function esProveedorKey(x: unknown): x is ProveedorKey {
  return typeof x === "string" && PROVEEDORES.some((p) => p.key === x);
}

export function proveedorPorKey(key: string): Proveedor | null {
  return PROVEEDORES.find((p) => p.key === key) ?? null;
}

/**
 * A qué proveedor le corresponde una marca, por su CÓDIGO.
 *
 * Devuelve `SIN_PROVEEDOR` para todo código que no esté en el mapa — incluido
 * uno que aparezca mañana en `mk_marcas`. Nunca inventa un grupo.
 */
export function proveedorDeCodigo(codigo: string | null | undefined): BloqueKey {
  const c = (codigo ?? "").trim().toUpperCase();
  if (!c) return SIN_PROVEEDOR;
  return PROVEEDOR_POR_CODIGO.get(c) ?? SIN_PROVEEDOR;
}

/** Marca del catálogo, tal como la necesita el agrupador. */
export interface MarcaParaProveedor {
  id: string;
  codigo?: string | null;
}

/**
 * Índice `marca_id → bloque`, que es como el resto del módulo tiene los datos
 * (las facturas y las entregas guardan `marca_id`, no el código).
 */
export function indiceProveedorPorMarcaId(
  marcas: ReadonlyArray<MarcaParaProveedor>,
): Map<string, BloqueKey> {
  const out = new Map<string, BloqueKey>();
  for (const m of marcas) out.set(String(m.id), proveedorDeCodigo(m.codigo));
  return out;
}

/**
 * Marcas de un proveedor, en el orden del mapa.
 *
 * Se usa para el subtítulo del bloque ("Tommy Hilfiger · Calvin Klein · Karl
 * Lagerfeld") — que no es decorativo: es lo que le dice a Daniel qué entra en
 * el reporte que está por generar.
 */
export function marcasDeProveedor<T extends MarcaParaProveedor & { nombre?: string }>(
  key: ProveedorKey,
  marcas: ReadonlyArray<T>,
): T[] {
  const prov = proveedorPorKey(key);
  if (!prov) return [];
  const orden = new Map(prov.codigos.map((c, i) => [c.toUpperCase(), i]));
  return marcas
    .filter((m) => orden.has((m.codigo ?? "").trim().toUpperCase()))
    .sort(
      (a, b) =>
        (orden.get((a.codigo ?? "").toUpperCase()) ?? 99) -
        (orden.get((b.codigo ?? "").toUpperCase()) ?? 99),
    );
}
