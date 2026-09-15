// ─────────────────────────────────────────────────────────────────────────────
// LA COLA DEL TELÉFONO — marcar sin señal (14-sep-2026).
//
// Daniel: *«sin señal marca igual»*, y las marcas *«se mandan solas al volver
// internet, sin que ella haga nada»*.
//
// ⚠️ ESTO REABRE EL MODO SIN CONEXIÓN, Y SOLO PARA ESTA PANTALLA. El Modo
// Viaje se eliminó en julio-2026 y la regla de la casa es «la app es SIEMPRE
// online» con un service worker mínimo (ver CLAUDE.md › PWA). Acá no se toca
// el service worker ni se cachea una sola página: lo único que queda guardado
// en el teléfono son LAS MARCAS QUE TODAVÍA NO SE PUDIERON MANDAR, en
// IndexedDB, y se borran en cuanto el servidor las confirma. Es la excepción
// más chica posible, y existe porque la alternativa —que Ana pierda su entrada
// porque el local no tiene señal— le cuesta plata a ella.
//
// 🔑 INDEXEDDB Y NO `localStorage`: acá viaja una FOTO. `localStorage` guarda
// texto, tiene ~5 MB y obligaría a convertir la selfie a base64 (un tercio más
// grande). IndexedDB guarda el Blob tal cual.
//
// ⚠️ ESTO NO ES UN `localStorage` DE DATOS COMPARTIDOS (regla de la casa: lo
// que alguien agrega queda para todos). Una marca en la cola es una marca que
// NO existe todavía: no es un dato del sistema hasta que el servidor la
// confirma. Lo que se guarda en el teléfono es el pedido, no el hecho.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "fg-marcacion";
const TIENDA = "pendientes";
const VERSION = 1;

export interface MarcaPendiente {
  /** El uuid que acuñó el teléfono. Es la llave, acá y en la base. */
  eventoId: string;
  tipo: "entrada" | "salida";
  /** La hora de la FOTO, que es la del teléfono. La que va a contar. */
  horaTelefono: string;
  lat: number;
  lng: number;
  precisionM: number | null;
  selfie: Blob;
  /** Cuántas veces se intentó mandar. Solo para poder decirlo en pantalla. */
  intentos: number;
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Este teléfono no puede guardar marcas sin señal."));
      return;
    }
    const req = indexedDB.open(BASE, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TIENDA)) {
        db.createObjectStore(TIENDA, { keyPath: "eventoId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("No se pudo abrir el guardado del teléfono."));
  });
}

function conTienda<T>(modo: IDBTransactionMode, fn: (t: IDBObjectStore) => IDBRequest): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(TIENDA, modo);
        const req = fn(tx.objectStore(TIENDA));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error ?? new Error("No se pudo guardar en el teléfono."));
        tx.oncomplete = () => db.close();
      }),
  );
}

/** Guarda una marca que no se pudo mandar. La llave es el `eventoId`: guardar
 *  dos veces la misma marca deja UNA sola. */
export async function guardarPendiente(m: MarcaPendiente): Promise<void> {
  await conTienda<IDBValidKey>("readwrite", (t) => t.put(m));
}

/** Todo lo que espera señal, de lo más viejo a lo más nuevo. */
export async function leerPendientes(): Promise<MarcaPendiente[]> {
  const todo = await conTienda<MarcaPendiente[]>("readonly", (t) => t.getAll());
  return (todo ?? []).slice().sort((a, b) => (a.horaTelefono < b.horaTelefono ? -1 : 1));
}

/** Cuántas esperan. Es lo que la pantalla dice sin abrir nada. */
export async function contarPendientes(): Promise<number> {
  try {
    return (await leerPendientes()).length;
  } catch {
    return 0;
  }
}

/** Sale de la cola. Se llama SOLO cuando el servidor confirmó. */
export async function borrarPendiente(eventoId: string): Promise<void> {
  await conTienda<undefined>("readwrite", (t) => t.delete(eventoId));
}

/** Suma un intento fallido, para poder decir «se va a enviar sola». */
export async function anotarIntento(m: MarcaPendiente): Promise<void> {
  await guardarPendiente({ ...m, intentos: m.intentos + 1 });
}
