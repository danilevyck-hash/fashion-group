"use client";

/* eslint-disable @next/next/no-img-element */

// Buscador de productos para AGREGAR líneas a un pedido en borrador — el "+
// Agregar productos" del detalle abre esto en vez de irse al catálogo (donde
// "Agregar al pedido" mete al CARRITO y el checkout crea un pedido NUEVO).
//
// Compartido por las 3 marcas: lee /api/catalogo/<marca>/products?active=true
// y filtra en el navegador por nombre o código. El agregado real lo hace el
// padre (PATCH /orders/[id]/item, que respeta el candado Switch) — acá solo se
// busca y se toca "Agregar".

import { useState, useEffect, useMemo } from "react";
import { ModalOverlay } from "@/components/ui";
import { useEscapeClose } from "@/lib/hooks/useModalDismiss";
import { supabaseThumb } from "@/lib/image-thumb";
import { fmt } from "@/lib/format";
import type { MarcaTheme } from "@/lib/catalogo/marcas-ui";

export interface ProductoAgregable {
  id: string;
  sku: string | null;
  name: string;
  price?: number | null;
  image_url: string | null;
  category?: string | null;
  bulto_pzas?: number | null;
  badge?: string | null;
  disponibilidad?: number | null;
}

const MAX_VISIBLES = 60;

interface Props {
  theme: MarcaTheme;
  /** product_id → bultos que YA tiene el pedido (para "+1 bulto"). */
  enPedido: Map<string, number>;
  /** Agrega la línea (PATCH /item). Devuelve true si quedó agregada. */
  onAgregar: (p: ProductoAgregable) => Promise<boolean>;
  onClose: () => void;
}

export default function AgregarProductosModal({ theme, enPedido, onAgregar, onClose }: Props) {
  const [productos, setProductos] = useState<ProductoAgregable[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [agregandoId, setAgregandoId] = useState<string | null>(null);
  useEscapeClose(true, onClose, agregandoId === null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`${theme.api}/products?active=true`);
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (vivo) setProductos(Array.isArray(d) ? d : []);
      } catch {
        if (vivo) setErrorCarga(true);
      }
      if (vivo) setCargando(false);
    })();
    return () => { vivo = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter(
      (p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q),
    );
  }, [productos, busqueda]);

  async function agregar(p: ProductoAgregable) {
    if (agregandoId) return;
    setAgregandoId(p.id);
    await onAgregar(p);
    setAgregandoId(null);
  }

  return (
    <ModalOverlay onBackdropClick={() => { if (!agregandoId) onClose(); }}>
      <div
        className="bg-white sm:rounded-lg rounded-t-2xl p-4 sm:p-6 max-w-lg w-full mx-0 sm:mx-4 border border-gray-200 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-medium mb-1">Agregar productos al pedido</h3>
        <p className="text-xs text-gray-500 mb-3">
          Cada toque en “Agregar” suma 1 bulto. Las cantidades se ajustan después en la tabla del pedido.
        </p>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o código..."
          autoComplete="off"
          className="w-full border border-gray-200 rounded-md px-3 py-2 min-h-[44px] text-base sm:text-sm outline-none focus:border-black transition mb-3"
        />
        <div className="border border-gray-100 rounded-md divide-y divide-gray-50 overflow-y-auto flex-1 min-h-[120px]">
          {cargando ? (
            <div className="px-3 py-6 text-center text-sm text-gray-400">Cargando productos...</div>
          ) : errorCarga ? (
            <div className="px-3 py-6 text-center text-sm text-red-500">
              No se pudo cargar el catálogo. Cierra y vuelve a intentar.
            </div>
          ) : filtrados.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-gray-400">
              No encontramos productos con ese nombre o código.
            </div>
          ) : (
            filtrados.slice(0, MAX_VISIBLES).map((p) => {
              const bultosYa = enPedido.get(p.id) || 0;
              const bulto = theme.bulto(p.category || theme.pdfFallbackCategory, p.bulto_pzas);
              return (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="w-10 h-10 bg-gray-50 rounded overflow-hidden flex-shrink-0">
                    {p.image_url ? (
                      <img
                        src={supabaseThumb(p.image_url, 160) ?? p.image_url}
                        alt=""
                        className="w-full h-full object-contain"
                      />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{p.name}</div>
                    <div className="text-xs text-gray-400">
                      <span className="font-mono">{p.sku}</span>
                      {" · "}
                      <span className="tabular-nums">${fmt(Number(p.price) || 0)}</span> por pieza · bulto de {bulto}
                      {bultosYa > 0 && (
                        <span className="text-emerald-600 font-medium"> · en el pedido: {bultosYa}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => agregar(p)}
                    disabled={agregandoId !== null}
                    className="flex-shrink-0 text-xs font-medium border border-gray-300 text-black px-3 py-2 rounded-md hover:border-gray-500 active:scale-[0.97] transition disabled:opacity-40 min-h-[44px] min-w-[44px]"
                  >
                    {agregandoId === p.id ? "Agregando..." : bultosYa > 0 ? "+1 bulto" : "Agregar"}
                  </button>
                </div>
              );
            })
          )}
          {!cargando && !errorCarga && filtrados.length > MAX_VISIBLES && (
            <div className="px-3 py-2 text-xs text-gray-400 text-center">
              Mostrando {MAX_VISIBLES} de {filtrados.length} — escribe más para afinar la búsqueda.
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          disabled={agregandoId !== null}
          className="w-full border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 transition disabled:opacity-50 min-h-[44px] mt-3"
        >
          Listo
        </button>
      </div>
    </ModalOverlay>
  );
}
