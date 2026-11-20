// Supabase fabrica la foto reducida la PRIMERA vez que alguien la pide (1-2 s);
// después queda en caché. Al guardar una foto la pedimos nosotros, para que el
// primer cliente no espere. Mismo tamaño que las tarjetas: supabaseThumb(url, 600).
// Nunca falla ni frena: si no sale, la foto se fabrica cuando alguien la pida.
import { supabaseThumb } from "@/lib/image-thumb";
import { entregarAWaitUntil } from "./envio-en-segundo-plano";

// Una a la vez: un ZIP de miles de fotos no dispara miles de pedidos juntos.
let cola: Promise<unknown> = Promise.resolve();

export function calentarFoto(url: string | null | undefined): void {
  const thumb = supabaseThumb(url, 600);
  if (!thumb || thumb === url) return; // vacía o no es de Supabase Storage
  const p = (cola = cola.then(() =>
    fetch(thumb, { cache: "no-store" })
      .then((r) => r.arrayBuffer())
      .catch(() => undefined),
  ));
  entregarAWaitUntil(p);
}
