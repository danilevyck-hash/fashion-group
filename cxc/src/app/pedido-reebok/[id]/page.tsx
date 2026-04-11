"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";

interface CartItem {
  product_id: string;
  sku: string;
  name: string;
  image_url: string;
  quantity: number;
  unit_price: number;
}

interface Order {
  id: number;
  short_id: string;
  items: CartItem[];
  total: number;
  created_at: string;
}

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
}

export default function PedidoReebokPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/catalogo/reebok/pedido-publico/${id}`);
        if (!res.ok) {
          setError("Pedido no encontrado");
          return;
        }
        const data = await res.json();
        setOrder(data);
      } catch {
        setError("Error al cargar el pedido");
      } finally {
        setLoading(false);
      }
    }
    if (id) load();
  }, [id]);

  async function handleDownloadPdf() {
    if (!order || generatingPdf) return;
    setGeneratingPdf(true);
    try {
      const { generateReebokOrderPdf } = await import("@/lib/pdf-reebok-order");
      await generateReebokOrderPdf(order.items);
    } catch {
      // silent fail
    } finally {
      setGeneratingPdf(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1A2656] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-8 text-center max-w-sm w-full">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-[#1A2656] font-semibold text-lg mb-1">Pedido no encontrado</p>
          <p className="text-[#1A2656]/50 text-sm">Este enlace puede haber expirado o ser incorrecto.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-[#1A2656] rounded-t-xl px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-white font-bold text-xl tracking-wide">REEBOK</h1>
            <p className="text-white/50 text-xs mt-0.5">Panama</p>
          </div>
          <div className="text-right">
            <p className="text-white/80 text-sm font-medium">Pedido</p>
            <p className="text-white/40 text-xs">{fmtDate(order.created_at)}</p>
          </div>
        </div>

        {/* Items */}
        <div className="bg-white border-x border-[#1A2656]/10">
          <div className="divide-y divide-gray-100">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 px-4 py-3">
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-lg bg-[#F5F0E8] flex-shrink-0 overflow-hidden">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.name}
                      width={56}
                      height={56}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#1A2656]/20">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1A2656] truncate">{item.name}</p>
                  <p className="text-xs text-[#1A2656]/40 mt-0.5">{item.sku}</p>
                </div>

                {/* Qty + Price */}
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-[#1A2656] tabular-nums">
                    ${fmtMoney(item.quantity * item.unit_price)}
                  </p>
                  <p className="text-xs text-[#1A2656]/40 tabular-nums">
                    {item.quantity} x ${fmtMoney(item.unit_price)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Total */}
        <div className="bg-[#1A2656] rounded-b-xl px-6 py-4 flex items-center justify-between">
          <span className="text-white/70 text-sm font-medium">Total</span>
          <span className="text-white font-bold text-xl tabular-nums">${fmtMoney(order.total)}</span>
        </div>

        {/* Download PDF button */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={handleDownloadPdf}
            disabled={generatingPdf}
            className="flex items-center gap-2 px-6 py-3 bg-[#1A2656] text-white rounded-lg font-medium text-sm hover:bg-[#1A2656]/90 active:scale-[0.97] transition disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {generatingPdf ? "Generando..." : "Descargar PDF"}
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-[#1A2656]/25 text-xs mt-8">fashiongr.com</p>
      </div>
    </div>
  );
}
