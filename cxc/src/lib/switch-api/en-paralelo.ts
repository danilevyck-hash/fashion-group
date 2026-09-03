/**
 * Corre `fn` sobre `items` de a `limite` a la vez, devolviendo los resultados
 * EN EL ORDEN DE ENTRADA.
 *
 * Módulo PURO y sin dependencias a propósito: lo usa el motor de catálogo, que
 * arrastra Supabase y el cliente de Switch. Acá vive solo la mecánica, así que
 * el candado (`__tests__/lib/catalogo-stock-paralelo.test.ts`) la puede probar
 * sin levantar media aplicación.
 *
 * **El primer error aborta y se propaga**, que es justo lo que el fail-safe del
 * motor necesita: `syncCatalogo` junta TODOS los `/stock` antes de escribir, y
 * una sola llamada fallida tiene que tumbar la empresa entera sin tocar el
 * catálogo. Las llamadas que ya estaban en vuelo terminan solas y se descartan;
 * nunca se escribe con resultados a medias.
 *
 * ⚠️ NO es un pool genérico para cualquier cosa: quien lo use contra Switch
 * tiene que saber que Switch admite **un solo token válido por USUARIO** (PDF
 * del API, p. 6; coincide con «una sesión por empresa» porque cada empresa entra
 * con un único usuario de API) y que la concurrencia solo es segura porque
 * `client.ts` deduplica los logins en vuelo (`loginEnVuelo`). Ver el comentario
 * de `STOCK_CONCURRENCIA`.
 */
export async function enParalelo<T, R>(
  items: readonly T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let siguiente = 0;
  const worker = async () => {
    for (;;) {
      const i = siguiente++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limite, items.length)) }, worker),
  );
  return out;
}
