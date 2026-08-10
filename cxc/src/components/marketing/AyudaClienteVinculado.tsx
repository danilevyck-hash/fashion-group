"use client";

// El "elige del directorio para vincular; si no, se guarda como texto" estaba
// escrito DOS veces —el formulario de nuevo proyecto y el modal de editar—, y
// dos copias de la misma frase se separan sola la primera vez que alguien
// corrige una. Ahora es UNA, y vive en el ⓘ: es metodología (cómo se guarda
// el cliente), no un aviso, así que puede esconderse detrás de un toque.

import { Ayuda } from "@/components/shared/Ayuda";

export function AyudaClienteVinculado() {
  return (
    <Ayuda titulo="Cómo se guarda el cliente" className="-my-2">
      <p>
        Elige del directorio para vincular; si no está, se guarda como texto (sin vincular).
      </p>
    </Ayuda>
  );
}
