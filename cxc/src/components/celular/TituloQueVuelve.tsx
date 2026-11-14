"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EL TÍTULO DEL CELULAR QUE VUELVE A LA LISTA (revisión 110, n.º 15 · 50 · 53).
//
// En el detalle de un cliente o un proveedor, el celular decía dos veces dónde
// estabas: el título del módulo y debajo «‹ Clientes» en azul. Ahora es UNA
// fila: el título mismo «‹ Clientes» vuelve, y a su derecha va la acción de la
// pantalla si la hay («Estado de cuenta»). Solo en el celular (`sm:hidden`): en
// la computadora manda el camino de migas del encabezado.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { CLASE_TITULO_BARRA, TextoQueCabe } from "@/components/celular/BarraDeControles";

export default function TituloQueVuelve({
  href,
  rotulo,
  accion,
}: {
  href: string;
  rotulo: string;
  /** La acción de la pantalla, a la derecha del título. */
  accion?: ReactNode;
}) {
  return (
    <div data-fila-del-avatar data-titulo-que-vuelve className="flex min-w-0 items-center gap-2 px-3 pt-3 sm:hidden">
      <Link
        href={href}
        className={`flex min-h-[44px] min-w-0 flex-1 items-center gap-0.5 active:opacity-60 ${CLASE_TITULO_BARRA}`}
      >
        <ChevronLeft className="h-6 w-6 shrink-0 text-gray-400" strokeWidth={2.25} aria-hidden />
        <TextoQueCabe>{rotulo}</TextoQueCabe>
      </Link>
      {accion}
    </div>
  );
}
