// ─────────────────────────────────────────────────────────────────────────────
// ¿Qué foto de Storage está EN USO y qué foto no? NÚCLEO PURO.
//
// Escrito para responder el pedido de Daniel: "revisa todas mis fotos del
// catalogo de fashion shoes tommy, y borra solo las que no esten en uso".
// ⚠️ Este módulo SOLO CLASIFICA. No borra nada, y a propósito: el borrado se
// aprueba aparte. Daniel subió 389 fotos a mano — una foto borrada no vuelve.
//
// CUATRO CLASES, y el nombre importa porque tres de ellas SÍ están en uso:
//
//   EN USO       · su ruta exacta aparece en `image_url` de algún producto.
//   BANCO VIVO   · es una variante `_v/{sku}/{n}.jpg` de un SKU que EXISTE como
//                  fila. NO está referenciada, y eso es NORMAL: el selector de
//                  variantes muestra todas las vistas del banco B2B para que se
//                  pueda cambiar de foto sin volver a subir el ZIP. Borrarlas
//                  rompería el selector.
//   REEMPLAZADA  · objeto de nivel raíz cuyo SKU existe como fila Y esa fila
//                  tiene OTRA foto. Es la foto anterior del producto: la única
//                  clase que se puede borrar sin dejar a nadie sin foto.
//   HUÉRFANA     · no se pudo atar a ninguna fila de la tabla.
//
// 🩸 POR QUÉ LA HUÉRFANA **NO** SE BORRA. Una foto sin fila no significa "esto
// no sirve": significa "no encontré la fila". Las dos formas conocidas de eso
// terminan con la foto necesitándose de nuevo:
//   · Switch deja de traer un artículo un rato (existencia 0 sostenida, cambio
//     de proveedor, artículo dado de baja y reactivado). Estar fuera del
//     catálogo es el estado NORMAL y reversible de un producto agotado.
//   · Un SKU con guión que se corrige en Switch (precedente real: 12 SKU de
//     Tommy perdieron la foto por eso). La fila cambia de SKU, la foto vieja
//     queda "sin dueño", y es exactamente la foto que hay que volver a atar.
// El housekeeping semanal ya borra el caso más acotado y verificable —la carpeta
// `_v/{sku}/` de un SKU que desapareció de la tabla, ver
// variantes-housekeeping.ts—. Acá no se amplía eso: se informa y se deja.
//
// GUARD ANTI-CATÁSTROFE, igual que el housekeeping: sin filas de la tabla no se
// propone borrar NADA. "La query falló" y "la marca no tiene productos" se ven
// igual desde acá, y solo una de las dos es segura.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizarSkuStorage } from "./fotos-b2b";

export interface ObjetoStorage {
  /** Ruta completa dentro del bucket. ej. `tommy/_v/fw0fw05034dw5/1.jpg`. */
  path: string;
  bytes: number;
}

export interface ProductoConFoto {
  sku: string | null;
  /** URL pública o ruta guardada. Puede traer `?v=` y venir url-encodeada. */
  image_url: string | null;
}

export type ClaseFoto = "en-uso" | "banco-vivo" | "reemplazada" | "huerfana";

export interface FotoClasificada extends ObjetoStorage {
  clase: ClaseFoto;
  /** SKU (crudo, como está en la tabla) al que se pudo atar. null = huérfana. */
  sku: string | null;
}

export interface PlanLimpiezaFotos {
  fotos: FotoClasificada[];
  /** Lo único que se propone borrar: las REEMPLAZADAS. */
  aBorrar: FotoClasificada[];
  bytesLiberados: number;
  /** Motivo por el que no se propone nada (null = plan normal). */
  abortado: string | null;
}

/**
 * Ruta dentro del bucket a partir de un `image_url`. Acepta la URL pública
 * completa (`…/object/public/product-images/tommy/x.jpg?v=123`) y una ruta ya
 * relativa. Devuelve null si no se puede leer.
 */
export function pathDeImageUrl(imageUrl: string | null | undefined, bucket = "product-images"): string | null {
  const raw = String(imageUrl ?? "").trim();
  if (!raw) return null;
  const sinQuery = raw.split("?")[0];
  const i = sinQuery.indexOf(`${bucket}/`);
  const rel = i >= 0 ? sinQuery.slice(i + bucket.length + 1) : sinQuery;
  if (!rel) return null;
  try {
    return decodeURIComponent(rel);
  } catch {
    return rel;
  }
}

/** Carpeta de variante (`{prefijo}/_v/{skuStorage}/…`) → skuStorage. */
function skuStorageDeVariante(path: string, prefijo: string): string | null {
  const m = path.match(new RegExp(`^${prefijo}/_v/([^/]+)/`));
  return m ? m[1] : null;
}

/**
 * Nombre de un objeto de nivel raíz → skuStorage candidato.
 *
 * Tolera las TRES formas que existen en producción para Tommy (medidas
 * 30-jul-2026): `{skuStorage}.jpg` (foto elegida por el selector),
 * `{skuNormalizado}` sin extensión (endpoint legacy /upload con SKU) y
 * `{epoch}-{archivo original}` (subida masiva legacy SIN SKU — el nombre lleva
 * el SKU adentro y sin el prefijo no se ata a nada).
 */
export function candidatosSkuStorageDeRaiz(nombreArchivo: string): string[] {
  const base = nombreArchivo.replace(/\.[^.]+$/, "");
  const cands = [base];
  const m = base.match(/^\d{10,}-(.+)$/);
  if (m) cands.push(m[1]);
  return cands.map((c) => normalizarSkuStorage(c)).filter(Boolean);
}

/**
 * Clasifica todos los objetos de una marca.
 *
 * @param objetos  todo lo que hay bajo `{prefijo}/` en el bucket
 * @param productos TODAS las filas de la marca (activas e inactivas, ocultas o
 *                  no): un producto agotado u oculto sigue vivo y sus fotos NO
 *                  se tocan.
 * @param prefijo  raíz de la marca en el bucket ("tommy", "joybees", "products")
 */
export function planLimpiezaFotos(
  objetos: readonly ObjetoStorage[],
  productos: readonly ProductoConFoto[],
  prefijo: string,
): PlanLimpiezaFotos {
  const vacio: PlanLimpiezaFotos = { fotos: [], aBorrar: [], bytesLiberados: 0, abortado: null };
  if (objetos.length === 0) return vacio;
  if (productos.length === 0) {
    return { ...vacio, abortado: "sin productos que comparar" };
  }

  const skuPorStorage = new Map<string, ProductoConFoto>();
  const referenciadas = new Set<string>();
  for (const p of productos) {
    const key = normalizarSkuStorage(p.sku ?? "");
    if (key) skuPorStorage.set(key, p);
    const path = pathDeImageUrl(p.image_url);
    if (path) referenciadas.add(path);
  }

  const fotos: FotoClasificada[] = objetos.map((o) => {
    if (referenciadas.has(o.path)) {
      const varKey = skuStorageDeVariante(o.path, prefijo);
      const dueño = varKey ? skuPorStorage.get(varKey) : undefined;
      return { ...o, clase: "en-uso" as ClaseFoto, sku: dueño?.sku ?? null };
    }
    const varKey = skuStorageDeVariante(o.path, prefijo);
    if (varKey) {
      const dueño = skuPorStorage.get(varKey);
      return dueño
        ? { ...o, clase: "banco-vivo" as ClaseFoto, sku: dueño.sku }
        : { ...o, clase: "huerfana" as ClaseFoto, sku: null };
    }
    const nombre = o.path.startsWith(`${prefijo}/`) ? o.path.slice(prefijo.length + 1) : o.path;
    // Un objeto en una subcarpeta que no es `_v/` no se reconoce: huérfana, y
    // por tanto NO se borra.
    if (nombre.includes("/")) return { ...o, clase: "huerfana" as ClaseFoto, sku: null };
    for (const cand of candidatosSkuStorageDeRaiz(nombre)) {
      const dueño = skuPorStorage.get(cand);
      if (!dueño) continue;
      // REEMPLAZADA exige reemplazo DEMOSTRABLE: la fila tiene otra foto. Si el
      // producto no tiene ninguna, este archivo es la única que le queda por
      // atar y borrarlo dejaría al producto sin foto para siempre.
      const tieneOtra = !!pathDeImageUrl(dueño.image_url);
      return tieneOtra
        ? { ...o, clase: "reemplazada" as ClaseFoto, sku: dueño.sku }
        : { ...o, clase: "huerfana" as ClaseFoto, sku: dueño.sku };
    }
    return { ...o, clase: "huerfana" as ClaseFoto, sku: null };
  });

  const aBorrar = fotos.filter((f) => f.clase === "reemplazada");
  return {
    fotos,
    aBorrar,
    bytesLiberados: aBorrar.reduce((s, f) => s + (f.bytes || 0), 0),
    abortado: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BORRAR LAS ALTERNATIVAS DEL BANCO — decisión de Daniel, 30-jul-2026.
//
// Textual, reafirmado tras advertirle dos veces que pierde la posibilidad de
// cambiar la foto: "sobre las fotos de tommy que hay varias opciones y una
// seleccionada para mostrar al catalogo, ya escogi la que utilizare, asi que ya
// no necesito tenerla como opcion. solo ayudame a borrar las fotos esas".
//
// 🩸 EL PELIGRO, MEDIDO ANTES DE ESCRIBIR UNA LÍNEA: "borrar las variantes de un
// SKU" es una frase que suena inofensiva y NO lo es. En Tommy, **383 de las 468
// fotos elegidas VIVEN dentro de `_v/`** — el selector guarda en `image_url` la
// ruta de la variante elegida, no una copia aparte. Barrer la carpeta entera
// habría borrado la foto que el catálogo muestra en 383 de 490 productos.
// Por eso la unidad NO es la carpeta: es el OBJETO, y la foto elegida se salva
// una por una comparando la ruta exacta.
//
// SEGURA POR CONSTRUCCIÓN — solo se borra la alternativa de un SKU que ya tiene
// una foto elegida VIVA. "Viva" = `image_url` apunta a un objeto que EXISTE de
// verdad en Storage; que la columna traiga una ruta no prueba que el archivo
// esté ahí. De ahí sale la garantía que importa: después de esto, **ningún
// producto puede quedar sin foto**, porque a cada SKU que pierde alternativas le
// queda su elegida, y a los que no tienen elegida NO se les toca nada.
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanBorradoAlternativas {
  /** Alternativas del banco a borrar (nunca la elegida). */
  aBorrar: FotoClasificada[];
  bytesLiberados: number;
  /** SKUs cuyas variantes se conservan porque NO tienen foto elegida viva. */
  skusProtegidos: string[];
  abortado: string | null;
}

/**
 * Alternativas del banco de variantes que se pueden borrar.
 *
 * @param objetos   todo lo que hay bajo `{prefijo}/`
 * @param productos TODAS las filas de la marca
 * @param prefijo   raíz de la marca en el bucket
 */
export function planBorradoAlternativas(
  objetos: readonly ObjetoStorage[],
  productos: readonly ProductoConFoto[],
  prefijo: string,
): PlanBorradoAlternativas {
  const vacio: PlanBorradoAlternativas = {
    aBorrar: [], bytesLiberados: 0, skusProtegidos: [], abortado: null,
  };
  if (objetos.length === 0) return vacio;
  // Mismo guard anti-catástrofe que planLimpiezaFotos: sin filas no se borra nada.
  if (productos.length === 0) return { ...vacio, abortado: "sin productos que comparar" };

  const existentes = new Set(objetos.map((o) => o.path));
  /** skuStorage → ruta de su foto elegida, SOLO si el archivo existe. */
  const elegidaViva = new Map<string, string>();
  const porStorage = new Map<string, ProductoConFoto>();
  for (const p of productos) {
    const key = normalizarSkuStorage(p.sku ?? "");
    if (!key) continue;
    porStorage.set(key, p);
    const elegida = pathDeImageUrl(p.image_url);
    if (elegida && existentes.has(elegida)) elegidaViva.set(key, elegida);
  }

  const aBorrar: FotoClasificada[] = [];
  const protegidos = new Set<string>();
  for (const o of objetos) {
    const varKey = skuStorageDeVariante(o.path, prefijo);
    if (!varKey) continue;                       // no es del banco → no es asunto de esta función
    const elegida = elegidaViva.get(varKey);
    if (!elegida) {
      // Sin foto elegida viva (o SKU que ya no existe): se queda TODO. Borrarlas
      // dejaría al producto sin ninguna imagen y sin manera de recuperarla.
      const p = porStorage.get(varKey);
      protegidos.add(p?.sku ?? varKey);
      continue;
    }
    if (o.path === elegida) continue;            // ES la elegida — jamás se borra
    aBorrar.push({ ...o, clase: "banco-vivo", sku: porStorage.get(varKey)?.sku ?? null });
  }

  return {
    aBorrar,
    bytesLiberados: aBorrar.reduce((s, f) => s + (f.bytes || 0), 0),
    skusProtegidos: [...protegidos].sort(),
    abortado: null,
  };
}

/** Conteo y bytes por clase — para el informe. */
export function resumenPorClase(fotos: readonly FotoClasificada[]): Record<ClaseFoto, { n: number; bytes: number }> {
  const out: Record<ClaseFoto, { n: number; bytes: number }> = {
    "en-uso": { n: 0, bytes: 0 },
    "banco-vivo": { n: 0, bytes: 0 },
    reemplazada: { n: 0, bytes: 0 },
    huerfana: { n: 0, bytes: 0 },
  };
  for (const f of fotos) {
    out[f.clase].n++;
    out[f.clase].bytes += f.bytes || 0;
  }
  return out;
}
