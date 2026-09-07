// ─────────────────────────────────────────────────────────────────────────────
// LA COLA DEL CUADRO ÚNICO PARA SUBIR FOTOS (6-sep-2026). Módulo PURO.
//
// Daniel, textual: *«¿no se puede hacer un solo campo? En la que dropeo el zip,
// dropeo varias fotos, y toco el mismo cuadro y selecciono una foto y después
// al volver a tocarlo selecciono otra foto sin que se me borre la anterior»*.
//
// 🩸 EL DEFECTO QUE ARREGLA: la pantalla vieja tenía DOS cajas —una solo para
// el ZIP del portal, otra solo para fotos sueltas— y la de fotos hacía
// `setAssignment(a)`: REEMPLAZABA la lista. Elegir una foto y volver a tocar
// para elegir otra BORRABA la primera, sin decir nada.
//
// Las reglas que este módulo hace cumplir:
//
//   🔴 LA LISTA SUMA, NUNCA REEMPLAZA. `agregarFotos` recibe la cola que ya
//      había y devuelve una NUEVA con lo de antes más lo nuevo.
//   🔴 EL MISMO ARCHIVO NO ENTRA DOS VECES. La llave es nombre + tamaño +
//      fecha del archivo (no el nombre solo: dos fotos distintas del mismo
//      código se llaman igual con frecuencia... y dos archivos idénticos
//      arrastrados dos veces también).
//   🔴 LA FOTO QUE NO COINCIDE CON NINGÚN CÓDIGO NO SE DESCARTA: se queda en la
//      lista, en estado «pendiente», y se le puede elegir el producto a mano.
//      Antes se listaba en rojo bajo «No se subirán» y ahí moría.
//   🔴 DOS FOTOS AL MISMO CÓDIGO NO SE PISAN SOLAS: la segunda queda pendiente
//      y hay que decir a qué producto va. Subir dos al mismo código sobrescribe
//      —la ruta del archivo es determinística— y eso no puede pasar sin que
//      alguien lo decida.
//
// El módulo NO sube nada ni toca la red: solo decide qué hay en la cola y en
// qué estado está cada línea. Quien sube es `SubirFotos.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo mínimo que se le pide a un archivo. Un `File` del navegador lo cumple. */
export interface ArchivoElegido {
  name: string;
  size: number;
  lastModified: number;
}

export interface ProductoParaEmparejar {
  id: string;
  sku: string | null;
  name: string;
  image_url: string | null;
}

export type EstadoFoto =
  /** Falta decir a qué producto va. */
  | "pendiente"
  /** Tiene producto y está en la fila para subirse sola. */
  | "esperando"
  | "subiendo"
  | "lista"
  | "error";

export interface ItemFoto<F extends ArchivoElegido = ArchivoElegido> {
  clave: string;
  archivo: F;
  /** A qué producto va. `null` = todavía hay que elegirlo. */
  productoId: string | null;
  sku: string | null;
  nombreProducto: string | null;
  /** Ese producto YA tenía foto: esta la reemplaza. */
  reemplaza: boolean;
  estado: EstadoFoto;
  /** Por qué está pendiente o por qué falló. Se muestra tal cual. */
  motivo?: string;
}

/** Llave de un archivo dentro de la cola. */
export function claveDeArchivo(a: ArchivoElegido): string {
  return `${a.name}|${a.size}|${a.lastModified}`;
}

/** ¿Es el ZIP del portal? Se reconoce por la extensión, como siempre. */
export function esZip(a: ArchivoElegido): boolean {
  return /\.zip$/i.test(a.name);
}

/**
 * Separa lo que cayó en el cuadro. Si vienen mezclados se hacen las dos cosas
 * — el cuadro es uno solo y no pregunta qué le soltaste.
 */
export function separarPorTipo<F extends ArchivoElegido>(archivos: readonly F[]): {
  zips: F[];
  fotos: F[];
} {
  const zips: F[] = [];
  const fotos: F[] = [];
  for (const a of archivos) (esZip(a) ? zips : fotos).push(a);
  return { zips, fotos };
}

/**
 * Códigos candidatos a partir del nombre del archivo. Exacto primero; después
 * los sufijos que pone el explorador de archivos y el guion/espacio.
 */
export function candidatosDeSku(nombreArchivo: string): string[] {
  const base = nombreArchivo.replace(/\.[^.]+$/, "").trim();
  const out: string[] = [];
  const push = (s: string) => {
    const u = s.trim().toUpperCase();
    if (u && !out.includes(u)) out.push(u);
  };
  push(base); // exacto
  push(base.replace(/\s*\(\d+\)\s*$/, "")); // "GH8228 (1)" → GH8228
  push(base.replace(/[\s_-]+\d+\s*$/, "")); // "GH8228-1" / "GH8228_1" → GH8228
  push(base.replace(/\s+/g, "")); // "GH 8228" → GH8228
  return out;
}

/** Índice código → producto. Se arma UNA vez por lote, no por archivo. */
export function indicePorSku<P extends ProductoParaEmparejar>(
  productos: readonly P[],
): Map<string, P> {
  const m = new Map<string, P>();
  for (const p of productos) if (p.sku) m.set(p.sku.trim().toUpperCase(), p);
  return m;
}

/** El producto cuyo código es el nombre del archivo, o `null`. */
export function emparejar<P extends ProductoParaEmparejar>(
  nombreArchivo: string,
  indice: ReadonlyMap<string, P>,
): P | null {
  for (const c of candidatosDeSku(nombreArchivo)) {
    const hit = indice.get(c);
    if (hit) return hit;
  }
  return null;
}

function tieneFotoPuesta(p: ProductoParaEmparejar): boolean {
  return !!(p.image_url && p.image_url.trim());
}

/** Los productos que ya tienen una línea VIVA en la cola (no fallada). */
function productosOcupados(cola: readonly ItemFoto[]): Set<string> {
  const s = new Set<string>();
  for (const it of cola) if (it.productoId && it.estado !== "error") s.add(it.productoId);
  return s;
}

/**
 * Agrega fotos a la cola que YA había. Nunca reemplaza, nunca repite.
 *
 * `validar` decide si el archivo sirve como foto (tipo y tamaño); devuelve el
 * motivo si no sirve. Se inyecta para que este módulo no dependa del navegador.
 */
export function agregarFotos<F extends ArchivoElegido, P extends ProductoParaEmparejar>(
  cola: readonly ItemFoto<F>[],
  nuevos: readonly F[],
  productos: readonly P[],
  validar: (archivo: F) => string | null,
): ItemFoto<F>[] {
  const indice = indicePorSku(productos);
  const yaEstan = new Set(cola.map((i) => i.clave));
  const ocupados = productosOcupados(cola);
  const salida: ItemFoto<F>[] = [...cola];

  for (const archivo of nuevos) {
    const clave = claveDeArchivo(archivo);
    if (yaEstan.has(clave)) continue; // el mismo archivo dos veces no entra dos veces
    yaEstan.add(clave);

    const malo = validar(archivo);
    if (malo) {
      salida.push({
        clave, archivo, productoId: null, sku: null, nombreProducto: null,
        reemplaza: false, estado: "error", motivo: malo,
      });
      continue;
    }

    const hit = emparejar(archivo.name, indice);
    if (!hit) {
      salida.push({
        clave, archivo, productoId: null, sku: null, nombreProducto: null,
        reemplaza: false, estado: "pendiente",
        motivo: "El nombre no coincide con ningún código — elige el producto",
      });
      continue;
    }
    if (ocupados.has(hit.id)) {
      salida.push({
        clave, archivo, productoId: null, sku: null, nombreProducto: null,
        reemplaza: false, estado: "pendiente",
        motivo: `Ya hay otra foto para ${hit.sku} — elige el producto`,
      });
      continue;
    }
    ocupados.add(hit.id);
    salida.push({
      clave, archivo, productoId: hit.id, sku: hit.sku, nombreProducto: hit.name,
      reemplaza: tieneFotoPuesta(hit), estado: "esperando",
    });
  }
  return salida;
}

/** Elegir a mano el producto de una línea pendiente. Pasa a la fila de subida. */
export function asignarProducto<F extends ArchivoElegido>(
  cola: readonly ItemFoto<F>[],
  clave: string,
  producto: ProductoParaEmparejar,
): ItemFoto<F>[] {
  return cola.map((it) =>
    it.clave === clave
      ? {
          ...it,
          productoId: producto.id,
          sku: producto.sku,
          nombreProducto: producto.name,
          reemplaza: tieneFotoPuesta(producto),
          estado: "esperando" as EstadoFoto,
          motivo: undefined,
        }
      : it,
  );
}

/** Quitar UNA línea sin tocar las demás. */
export function quitarDeLaCola<F extends ArchivoElegido>(
  cola: readonly ItemFoto<F>[],
  clave: string,
): ItemFoto<F>[] {
  return cola.filter((it) => it.clave !== clave);
}

/** Cambiar el estado de UNA línea. Una que falla no toca a las demás. */
export function marcarEstado<F extends ArchivoElegido>(
  cola: readonly ItemFoto<F>[],
  clave: string,
  estado: EstadoFoto,
  motivo?: string,
): ItemFoto<F>[] {
  return cola.map((it) => (it.clave === clave ? { ...it, estado, motivo } : it));
}

/** La siguiente que toca subir, o `null` si no queda ninguna esperando. */
export function siguienteParaSubir<F extends ArchivoElegido>(
  cola: readonly ItemFoto<F>[],
): ItemFoto<F> | null {
  return cola.find((it) => it.estado === "esperando") ?? null;
}

export interface ResumenCola {
  total: number;
  esperando: number;
  subiendo: number;
  listas: number;
  pendientes: number;
  conError: number;
}

/** Los números de la línea de estado. Se CALCULAN, no se llevan aparte. */
export function resumenCola(cola: readonly ItemFoto[]): ResumenCola {
  const cuenta = (e: EstadoFoto) => cola.filter((i) => i.estado === e).length;
  return {
    total: cola.length,
    esperando: cuenta("esperando"),
    subiendo: cuenta("subiendo"),
    listas: cuenta("lista"),
    pendientes: cuenta("pendiente"),
    conError: cuenta("error"),
  };
}
