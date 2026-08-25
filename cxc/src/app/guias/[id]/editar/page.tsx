"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EL CAMINO VIEJO, QUE NO SE PIERDE: `/guias/[id]/editar` → `/guias/[id]?editar=1`
//
// Acá vivía una PANTALLA APARTE para cambiar los envíos. Daniel: *"quiero botón
// de editar y que se me abra la guía para editar así mismo como si estuviese
// haciendo la guía, no algo diferente"* — o sea, el formulario dejó de estar un
// nivel más adentro y se abre DENTRO de la guía (`/guias/[id]`), con
// «Despachar» en la misma pantalla.
//
// 🔑 La ruta NO se borra: se REDIRIGE. Un enlace guardado, una pestaña vieja o
// un "atrás" del navegador siguen abriendo lo que abrían — solo que ahora en la
// pantalla única. Borrarla habría dejado un 404 donde antes había trabajo.
//
// ⚠️ `replace` y no `push`: si fuera `push`, el "atrás" del navegador volvería
// acá y volvería a redirigir, dejando a la persona encerrada.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

export default function GuiaEditarPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? null;

  useEffect(() => {
    if (id) router.replace(`/guias/${id}?editar=1`);
  }, [id, router]);

  return null;
}
