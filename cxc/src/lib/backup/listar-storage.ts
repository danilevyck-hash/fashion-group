/**
 * Lista TODOS los archivos de un bucket de Storage, recursivo y POR PÁGINAS.
 *
 * 🩸 24-nov-2026: el respaldo pedía cada carpeta con `limit: 1000` y sin la
 * página siguiente; `product-images/products` tiene 1.654 fotos de Reebok y
 * 654 nunca llegaban a R2. Ahora se pide de a `PAGINA_STORAGE` con `offset`
 * hasta que una página venga incompleta (el list ordena por nombre: estable).
 */

export const PAGINA_STORAGE = 1000;

export interface FileEntry {
  path: string;
  size: number;
  updated_at: string;
  mimetype: string;
}

interface EntradaStorage {
  name: string;
  id: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Lo mínimo del `storage.from(bucket).list` de supabase-js. */
export type ListarCarpeta = (
  prefix: string,
  opts: { limit: number; offset: number },
) => PromiseLike<{ data: EntradaStorage[] | null; error: { message: string } | null }>;

export async function listarTodoElBucket(
  bucket: string,
  listar: ListarCarpeta,
  prefix = "",
  pagina = PAGINA_STORAGE,
): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  for (let offset = 0; ; offset += pagina) {
    const { data, error } = await listar(prefix, { limit: pagina, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    const lote = data ?? [];
    for (const e of lote) {
      const path = prefix ? `${prefix}/${e.name}` : e.name;
      if (!e.id) {
        // Carpeta → descender
        out.push(...(await listarTodoElBucket(bucket, listar, path, pagina)));
      } else {
        out.push({
          path,
          size: (e.metadata as { size?: number } | null)?.size ?? 0,
          updated_at: e.updated_at || e.created_at || "",
          mimetype: (e.metadata as { mimetype?: string } | null)?.mimetype || "application/octet-stream",
        });
      }
    }
    if (lote.length < pagina) break;
  }
  return out;
}
