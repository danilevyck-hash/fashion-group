"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { getBultoSize } from "@/lib/reebok-bulto";
import { calculateReebokOrderTotal } from "@/lib/reebok-order-total";
import { buildPedidoWhatsappUrl } from "@/lib/catalogo/whatsapp-msg";

interface CartItem {
  product_id: string;
  sku: string;
  name: string;
  image_url: string;
  quantity: number;
  unit_price: number;
  category?: string;
  is_preorder?: boolean;
}

interface Order {
  id: number;
  short_id: string;
  items: CartItem[];
  total: number;
  created_at: string;
  cliente_nombre: string | null;
  convertida?: boolean;
  ped_order_number?: string | null;
  estado_cliente?: "Confirmado" | "En proceso" | null;
  confirmado_cliente_at?: string | null;
}

interface StockLinea {
  product_id: string;
  name: string;
  sku: string;
  pedido_bultos: number;
  pedido_pzas: number;
  disponible_pzas: number;
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
  const [confirming, setConfirming] = useState(false);
  const [stockLineas, setStockLineas] = useState<StockLinea[] | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

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
      // Lib única de PDF de pedido (mismo layout que el flujo interno).
      const { downloadCatalogoOrderPdf } = await import("@/lib/catalogo/order-pdf-client");
      await downloadCatalogoOrderPdf({
        marca: "reebok",
        orderNumber: order.ped_order_number || order.short_id || "PEDIDO",
        clientName: order.cliente_nombre || "Sin nombre",
        createdAt: order.created_at,
        items: order.items.map((i) => ({
          sku: i.sku || "", name: i.name, quantity: i.quantity, unit_price: Number(i.unit_price),
          image_url: i.image_url || "", is_preorder: i.is_preorder === true,
          category: i.category || "footwear",
        })),
        bultoSize: (c) => getBultoSize(c || "footwear"),
        filename: `Pedido-Reebok-${new Date().toISOString().slice(0, 10)}.pdf`,
      });
    } catch {
      // silent fail
    } finally {
      setGeneratingPdf(false);
    }
  }

  // Confirmar el pedido: entra directo al proceso (se convierte en PED-###).
  // Si hay productos con stock corto, el server responde 409 con el detalle y
  // el cliente puede "Confirmar de todas formas" (aceptar=true).
  async function handleConfirm(aceptar: boolean) {
    if (!order || confirming) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const res = await fetch(`/api/catalogo/reebok/pedido-publico/${order.short_id}/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aceptar_stock: aceptar }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 409 && data?.lineas) {
        setStockLineas(data.lineas as StockLinea[]);
        return;
      }
      if (!res.ok || !data?.numero) {
        setConfirmError(
          (data?.error as string) || "No se pudo confirmar el pedido. Intenta de nuevo en unos segundos.",
        );
        return;
      }
      setStockLineas(null);
      setOrder({
        ...order,
        convertida: true,
        ped_order_number: data.numero as string,
        estado_cliente: "Confirmado",
      });
    } catch {
      setConfirmError("No se pudo confirmar el pedido. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setConfirming(false);
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

  const confirmado = !!order.convertida && !!order.ped_order_number;
  const estadoLabel = order.estado_cliente || "Confirmado";
  const totalBultos = order.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const totalPedido = calculateReebokOrderTotal(order.items);
  const whatsappUrl = confirmado
    ? buildPedidoWhatsappUrl({
        marca: "Reebok",
        clienteNombre: order.cliente_nombre || "cliente",
        numero: order.ped_order_number || "",
        itemCount: order.items.length,
        bultos: totalBultos,
        total: totalPedido,
        link: `https://www.fashiongr.com/pedido-reebok/${order.short_id}`,
      })
    : "";

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
            <p className="text-white/80 text-sm font-medium">
              {confirmado ? `Tu pedido #${order.ped_order_number}` : "Tu pedido"}
            </p>
            {confirmado && (
              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                {estadoLabel}
              </span>
            )}
            {order.cliente_nombre && (
              <p className="text-white text-xs mt-0.5">{order.cliente_nombre}</p>
            )}
            <p className="text-white/40 text-xs">{fmtDate(order.created_at)}</p>
          </div>
        </div>

        {/* Items */}
        <div className="bg-white border-x border-[#1A2656]/10">
          {(() => {
            const regular = order.items.filter((i) => !i.is_preorder);
            const preorders = order.items.filter((i) => i.is_preorder);
            const hasPreorders = preorders.length > 0;
            const renderItem = (item: CartItem, idx: number) => (
              <div key={idx} className="flex items-center gap-3 px-4 py-3">
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
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1A2656] truncate">{item.name}</p>
                  <p className="text-xs text-[#1A2656]/40 mt-0.5">{item.sku}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {(() => {
                    const bs = getBultoSize(item.category || "footwear");
                    const lineTotal = item.quantity * bs * item.unit_price;
                    return (
                      <>
                        <p className="text-base font-semibold text-[#1A2656] tabular-nums">
                          ${fmtMoney(item.unit_price)}<span className="text-xs font-normal text-[#1A2656]/40"> c/u</span>
                        </p>
                        <p className="text-xs text-[#1A2656]/40 tabular-nums">
                          {item.quantity} bulto{item.quantity !== 1 ? "s" : ""} ({item.quantity * bs} pzas) · ${fmtMoney(lineTotal)}
                        </p>
                      </>
                    );
                  })()}
                </div>
              </div>
            );

            const sectionHeader = (label: string, color: string) => (
              <div className={`px-4 py-2 ${color} text-white text-xs font-bold uppercase tracking-wide`}>
                {label}
              </div>
            );

            return (
              <div className="divide-y divide-gray-100">
                {hasPreorders && regular.length > 0 && sectionHeader("Pedido", "bg-[#1A2656]")}
                {regular.map(renderItem)}
                {hasPreorders && (
                  <>
                    {sectionHeader("Pre-orden", "bg-amber-500")}
                    {preorders.map(renderItem)}
                  </>
                )}
              </div>
            );
          })()}
        </div>

        {/* Total */}
        <div className="bg-[#1A2656] rounded-b-xl px-6 py-4 flex items-center justify-between">
          <span className="text-white/70 text-sm font-medium">Total</span>
          <span className="text-white font-bold text-xl tabular-nums">
            ${fmtMoney(totalPedido)}
          </span>
        </div>

        {/* Aviso de stock corto */}
        {!confirmado && stockLineas && stockLineas.length > 0 && (
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-amber-800 mb-2">
              Algunos productos no tienen todas las piezas disponibles
            </p>
            <ul className="space-y-1 mb-3">
              {stockLineas.map((l) => (
                <li key={l.product_id} className="text-xs text-amber-800/90">
                  <span className="font-medium">{l.name}</span> — pediste {l.pedido_pzas} pzas, hay {l.disponible_pzas}
                </li>
              ))}
            </ul>
            <p className="text-xs text-amber-700/80 mb-3">
              Puedes confirmarlo igual y te contactamos por la diferencia.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleConfirm(true)}
                disabled={confirming}
                className="flex-1 bg-[#1A2656] text-white text-sm font-semibold rounded-lg min-h-[44px] active:scale-[0.97] transition disabled:opacity-50"
              >
                {confirming ? "Confirmando..." : "Confirmar de todas formas"}
              </button>
              <button
                onClick={() => setStockLineas(null)}
                disabled={confirming}
                className="flex-1 bg-white border border-amber-300 text-amber-800 text-sm font-semibold rounded-lg min-h-[44px] active:scale-[0.97] transition disabled:opacity-50"
              >
                Volver
              </button>
            </div>
          </div>
        )}

        {/* Confirmar / Confirmado */}
        {!confirmado && !stockLineas && (
          <div className="mt-6 bg-white rounded-xl p-5 text-center">
            <button
              onClick={() => handleConfirm(false)}
              disabled={confirming}
              className="w-full bg-[#1A2656] text-white text-base font-bold rounded-xl min-h-[52px] active:scale-[0.98] transition disabled:opacity-50"
            >
              {confirming ? "Confirmando..." : "Confirmar pedido"}
            </button>
            <p className="text-xs text-[#1A2656]/45 mt-2.5">
              Al confirmar, tu pedido entra a proceso con Fashion Group.
            </p>
            {confirmError && (
              <p className="text-xs text-red-600 mt-2">{confirmError}</p>
            )}
          </div>
        )}

        {confirmado && (
          <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
            <p className="text-sm font-semibold text-emerald-800">
              {estadoLabel === "En proceso"
                ? `Tu pedido #${order.ped_order_number} está en proceso`
                : `Listo — tu pedido #${order.ped_order_number} quedó confirmado`}
            </p>
            <p className="text-xs text-emerald-700/70 mt-1 mb-3">
              Ya lo recibimos. Si quieres, avísanos también por WhatsApp (opcional).
            </p>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full bg-[#25D366] text-white text-sm font-bold rounded-xl min-h-[48px] active:scale-[0.98] transition"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Avisar por WhatsApp
            </a>
          </div>
        )}

        {/* Download PDF button */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={handleDownloadPdf}
            disabled={generatingPdf}
            className="flex items-center gap-2 px-6 py-3 bg-white border border-[#1A2656]/15 text-[#1A2656] rounded-lg font-medium text-sm hover:bg-[#1A2656]/5 active:scale-[0.97] transition disabled:opacity-50"
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
