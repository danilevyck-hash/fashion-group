"use client";

// ETIQUETAS › NUEVO ENVÍO — lo que el buscador único encuentra por NÚMERO
// (13-nov-2026, `ETIQUETAS_BUSCADOR_UNICO_2026_11`): facturas y pedidos, arriba
// de los clientes en la MISMA lista de `ClientePicker`. Lee
// `/api/guias/facturas-cliente?buscar=`; solo lee.

import { useEffect, useState } from "react";
import { facturaParaMostrar } from "@/lib/guias/numero-factura";
import { fechaCorta } from "./etiquetas-ui";
import { fechaDeLaFactura } from "@/lib/guias/atajos-facturas";
import { hoyPanama } from "@/lib/fecha-panama";
import { ETIQUETAS_FACTURAS_LISTA_2026_11 } from "@/lib/guias/guias-2026-10";

/** Lo que contesta `facturas-cliente?buscar=`: una fila por factura hallada. */
export interface DocumentoHallado {
  tipo: "factura" | "pedido";
  empresa_key: string;
  empresa: string;
  secuencial: string;
  fecha: string;
  cliente_codigo: string;
  cliente_nombre: string;
  switch_factura_id: number | null;
  pedido: string | null;
  pedidoLeido: boolean;
  pedidoBultos?: number;
}

/** Con al menos 3 dígitos se busca: menos encuentra media base. */
export function consultaDeNumero(consulta: string): string | null {
  const t = consulta.trim();
  return /^[\d\s-]+$/.test(t) && t.replace(/\D/g, "").length >= 3 ? t : null;
}

export default function ResultadosDocumento({
  consulta,
  onElegir,
}: {
  consulta: string;
  onElegir: (d: DocumentoHallado) => void;
}) {
  const numero = consultaDeNumero(consulta);
  const [estado, setEstado] = useState<{ para: string; docs: DocumentoHallado[] | null } | null>(null);

  useEffect(() => {
    if (!numero) return;
    let vigente = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/guias/facturas-cliente?buscar=${encodeURIComponent(numero)}`, { cache: "no-store" });
        const d = (await r.json().catch(() => null)) as { coincidencias?: DocumentoHallado[] } | null;
        if (vigente) setEstado({ para: numero, docs: r.ok ? (d?.coincidencias ?? []) : null });
      } catch {
        if (vigente) setEstado({ para: numero, docs: null });
      }
    }, 250);
    return () => { vigente = false; clearTimeout(t); };
  }, [numero]);

  if (!numero) return null;
  const listo = estado?.para === numero ? estado.docs : undefined;
  return (
    <div className="border-b border-gray-100" data-resultados-documento>
      {listo === undefined && <div className="px-3 py-2 text-xs text-gray-400">Buscando factura o pedido…</div>}
      {listo === null && <div className="px-3 py-2 text-xs text-amber-700">No se pudo buscar. Revisa el internet.</div>}
      {listo && listo.length === 0 && (
        <div className="px-3 py-2 text-xs text-gray-500">Ninguna factura ni pedido termina en {numero} en el último año.</div>
      )}
      {listo?.map((d) => (
        <button
          key={`${d.tipo}-${d.empresa_key}-${d.secuencial}`}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onElegir(d); }}
          className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm transition hover:bg-gray-50"
        >
          <span className="min-w-0">
            <span className="block truncate font-medium">
              {d.tipo === "pedido"
                ? `Pedido ${facturaParaMostrar(d.pedido)} · Factura ${facturaParaMostrar(d.secuencial)}`
                : `Factura ${facturaParaMostrar(d.secuencial)}${d.pedido ? ` · Pedido ${facturaParaMostrar(d.pedido)}` : ""}`}
              {ETIQUETAS_FACTURAS_LISTA_2026_11 && <span className="font-normal text-gray-500">{` · ${fechaDeLaFactura(d.fecha, hoyPanama())}`}</span>}
            </span>
            <span className="block truncate text-xs text-gray-500">{d.cliente_nombre} · {d.empresa}</span>
          </span>
          {!ETIQUETAS_FACTURAS_LISTA_2026_11 && <span className="shrink-0 text-xs tabular-nums text-gray-400">{fechaCorta(d.fecha)}</span>}
        </button>
      ))}
    </div>
  );
}
