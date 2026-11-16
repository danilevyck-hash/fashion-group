"use client";

// La cara de /referencia: el MISMO buscador del tab Ventas › Referencia
// (`ReferenciaView`), con su header de módulo. Acá no hay lógica propia — si
// esta pantalla dijera algo distinto que el tab de Ventas, serían dos verdades.

import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import VideosAyuda from "@/components/VideosAyuda";
import { VIDEOS_AYUDA_2026_11 } from "@/lib/ui/videos-ayuda-2026-11";
import { tieneVideos } from "@/lib/videos-ayuda/manifiesto";
import { ReferenciaView } from "@/components/referencia/ReferenciaView";

export default function ReferenciaClient() {
  // «Cómo se usa» en la PORTADA del módulo (videos en formato celular).
  const [verVideos, setVerVideos] = useState(false);
  const conVideos = VIDEOS_AYUDA_2026_11 && tieneVideos("referencia");
  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Consulta de artículos" />
      {conVideos && <VideosAyuda modulo="referencia" open={verVideos} onClose={() => setVerVideos(false)} />}
      <main className="mx-auto max-w-5xl px-4 py-6 pb-[env(safe-area-inset-bottom)]">
        {/* Sin título grande (#510): "Referencia" ya lo dicen la barra sticky
            (celular) y el breadcrumb (escritorio). Queda sr-only para no dejar
            la página sin encabezado.
            Y sin bajada: la caja del buscador ya dice "Puedes pegar hasta N
            códigos juntos" y la ficha enseña lo que llegó, lo vendido y lo que
            hay en stock — narrarlo antes no le agrega nada a quien llega por
            primera vez. Sin el `<div className="mb-5">` de antes: con el h1
            invisible y sin bajada, ese contenedor era 20 px de hueco. */}
        <h1 className="sr-only">Consulta de artículos</h1>
        <ReferenciaView onComoSeUsa={conVideos ? () => setVerVideos(true) : undefined} />
      </main>
    </div>
  );
}
