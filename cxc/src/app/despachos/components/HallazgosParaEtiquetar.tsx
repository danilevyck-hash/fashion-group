"use client";

// 25-nov-2026 (`ETIQUETAS_BUSCA_PARA_ETIQUETAR_2026_11`, Daniel aprobó): el buscador de la lista de Etiquetas
// también ETIQUETA. Arriba, las facturas de Switch que coinciden (las MISMAS
// reglas de «Nuevo envío»: `facturas-cliente?buscar=`) y los clientes; debajo
// sigue la lista de envíos ya creados. Tocar una factura sin etiqueta abre el
// nuevo envío con ella marcada; una ya etiquetada lleva a su envío.

import { useEffect, useState } from "react";
import { facturaParaMostrar } from "@/lib/guias/numero-factura";
import { fechaDeLaFactura } from "@/lib/guias/atajos-facturas";
import { hoyPanama } from "@/lib/fecha-panama";
import { etiquetaDeLaFactura, type EtiquetaFila } from "@/lib/guias/etiquetas";
import { useBusquedaClientes, type ClienteHit } from "@/lib/hooks/useBusquedaClientes";
import { consultaDeNumero, type DocumentoHallado } from "./ResultadosDocumento";

interface Props {
  consulta: string;
  etiquetas: readonly EtiquetaFila[];
  onEtiquetar: (d: DocumentoHallado) => void;
  onCliente: (c: ClienteHit) => void;
  onVer: (secuencial: string) => void;
}

export default function HallazgosParaEtiquetar({ consulta, etiquetas, onEtiquetar, onCliente, onVer }: Props) {
  const numero = consultaDeNumero(consulta);
  const texto = !numero && consulta.trim().length >= 3 ? consulta.trim() : "";
  const { hits } = useBusquedaClientes(texto, texto !== "");
  const [docs, setDocs] = useState<{ para: string; lista: DocumentoHallado[] | null } | null>(null);

  useEffect(() => {
    if (!numero) return;
    let vigente = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/guias/facturas-cliente?buscar=${encodeURIComponent(numero)}`, { cache: "no-store" });
        const d = (await r.json().catch(() => null)) as { coincidencias?: DocumentoHallado[] } | null;
        if (vigente) setDocs({ para: numero, lista: r.ok ? (d?.coincidencias ?? []) : null });
      } catch {
        if (vigente) setDocs({ para: numero, lista: null });
      }
    }, 250);
    return () => { vigente = false; clearTimeout(t); };
  }, [numero]);

  if (!numero && !texto) return null;
  const lista = numero && docs?.para === numero ? docs.lista : undefined;
  const hoy = hoyPanama();
  const clientes = texto ? hits.slice(0, 3) : [];
  if (texto && clientes.length === 0) return null;

  return (
    <section aria-label="Para etiquetar" className="mb-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
      <p className="border-b border-gray-100 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-900">
        {numero ? "Facturas en Switch" : "Clientes"}
      </p>
      {numero && lista === undefined && <p className="px-3 py-3 text-sm text-gray-400">Buscando la factura…</p>}
      {numero && lista === null && <p className="px-3 py-3 text-sm text-amber-700">No se pudo buscar. Revisa el internet.</p>}
      {numero && lista?.length === 0 && (
        <p className="px-3 py-3 text-sm text-gray-500">Ninguna factura termina en {numero} en el último año.</p>
      )}
      <ul className="divide-y divide-gray-100">
        {lista?.map((d) => {
          const ya = d.switch_factura_id != null ? etiquetaDeLaFactura(etiquetas, d.empresa_key, d.switch_factura_id) : null;
          return (
            <li key={`${d.tipo}-${d.empresa_key}-${d.secuencial}`}>
              <button
                type="button"
                data-factura-hallada
                onClick={() => (ya ? onVer(ya.secuencial) : onEtiquetar(d))}
                className="flex min-h-[52px] w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-gray-50 active:bg-gray-100"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gray-900">
                    Factura {facturaParaMostrar(d.secuencial)}
                    <span className="font-normal text-gray-500">{` · ${fechaDeLaFactura(d.fecha, hoy)}`}</span>
                  </span>
                  <span className="block truncate text-xs text-gray-500">
                    {d.cliente_nombre} · {d.empresa}
                    {d.pedido ? ` · Pedido ${facturaParaMostrar(d.pedido)}` : ""}
                  </span>
                </span>
                {ya ? (
                  <span className="shrink-0 text-sm text-gray-500">Ya etiquetada · Ver envío ›</span>
                ) : (
                  <span className="shrink-0 rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white">Etiquetar</span>
                )}
              </button>
            </li>
          );
        })}
        {clientes.map((c) => (
          <li key={c.codigo}>
            <button
              type="button"
              onClick={() => onCliente(c)}
              className="flex min-h-[52px] w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-gray-50"
            >
              <span className="min-w-0 truncate text-sm font-medium text-gray-900">
                {c.nombre} <span className="font-normal text-gray-500">· {c.codigo}</span>
              </span>
              <span className="shrink-0 text-sm text-gray-500">Ver sus facturas ›</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
