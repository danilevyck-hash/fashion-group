"use client";

// ─────────────────────────────────────────────────────────────────────────────
// UN RENGLÓN DE ENVÍO, LEÍDO COMO FICHA — UNA SOLA FORMA (5-sep-2026).
//
// 🩸 En el acordeón de la lista los renglones salían en una TABLA de 6 columnas
// (`# · Cliente · Dirección · Empresa · Facturas · Bultos`) que pide 600 px
// dentro de una pantalla de 390: **210 px de arrastre lateral para leer los
// bultos**, y casi siempre por UN solo renglón. Medido sobre las 222 guías
// vivas (5-sep-2026): **127 (57%) llevan un renglón y 172 (77%) tres o menos**.
//
// 🔴 NO SE INVENTÓ UN FORMATO NUEVO: es exactamente el que `ListaEnvios` ya usa
// al despachar —nombre del cliente arriba, `destino · empresa · factura` en gris
// debajo, bultos a la derecha—, sacado a un archivo para que las dos pantallas
// dibujen LO MISMO. Por eso `ListaEnvios` no cambia ni un píxel.
//
// ⚠️ En pantalla ancha la tabla SE QUEDA: a partir de `lg:` (1024) la tarjeta
// tiene de sobra para los 600 px y las columnas alineadas se leen mejor de un
// vistazo. Lo que no puede quedar es el arrastre en el teléfono.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import type { GuiaItem } from "./types";
import { facturasParaMostrar } from "@/lib/guias/numero-factura";

export default function ResumenEnvio({
  item,
  /** Con qué se dibuja el nombre. Sin esto, el texto escrito a mano. */
  children,
}: {
  item: GuiaItem;
  children?: ReactNode;
}) {
  const detalle = [item.direccion, item.empresa, facturasParaMostrar(item.facturas)]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="min-w-0">
      {children ?? <span className="text-sm font-medium break-words">{item.cliente || "Sin cliente"}</span>}
      {detalle && <span className="block text-xs text-gray-500 break-words">{detalle}</span>}
    </div>
  );
}
