"use client";

// Espejo Joybees de catalogo/reebok/producto/[id] — ficha individual de
// producto. Adaptación de datos: Joybees no tiene inventario por talla; el
// selector equivalente son las VARIANTES de género del mismo modelo
// (groupByModel: -M / -W / -KIDS / -JUNIOR), cada una con su propio SKU/stock.
// El carrito es el mismo de la página del catálogo (localStorage joybees_cart).

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { JoybeesProduct } from "@/components/joybees/JoybeesProductCard";
import { groupByModel, GroupedProduct } from "@/components/joybees/groupByModel";
import { getBultoSize } from "@/lib/joybees-bulto";

interface CartItem { product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number; }

const BULTO = getBultoSize();

export default function ProductoDetalle() {
  const { id } = useParams();
  const [product, setProduct] = useState<JoybeesProduct | null>(null);
  const [group, setGroup] = useState<GroupedProduct | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch("/api/catalogo/joybees/products?active=true")
      .then(r => { if (!r.ok) throw new Error("Failed to load products"); return r.json(); })
      .then((data: JoybeesProduct[]) => {
        const p = data.find(x => x.id === id) || null;
        if (!p) { setNotFound(true); return; }
        setProduct(p);
        const g = groupByModel(data).find(gr => gr.variants.some(v => v.product.id === p.id)) || null;
        setGroup(g);
        if (p.stock > 0) setSelectedId(p.id);
      })
      .catch(() => setNotFound(true));
  }, [id]);

  const availableVariants = (group?.variants || []).filter(v => v.product.stock > 0);
  const selected = availableVariants.find(v => v.product.id === selectedId)?.product || null;

  // Carrito compartido con la página del catálogo (misma key localStorage)
  function getCart(): CartItem[] {
    try {
      const saved = localStorage.getItem("joybees_cart");
      if (saved) return JSON.parse(saved);
    } catch { /* */ }
    return [];
  }

  function saveCart(cart: CartItem[]) {
    try { localStorage.setItem("joybees_cart", JSON.stringify(cart)); } catch { /* */ }
  }

  const handleAdd = () => {
    if (!selected) return;
    const cart = getCart();
    const existing = cart.find(i => i.product_id === selected.id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.push({
        product_id: selected.id,
        sku: selected.sku || "",
        name: selected.name,
        image_url: selected.image_url || "",
        quantity,
        unit_price: selected.price || 0,
      });
    }
    saveCart(cart);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  if (notFound) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <p className="text-[#404041]/50 text-sm">No encontramos este producto.</p>
      <Link href="/catalogo/joybees" className="text-sm text-[#404041] font-medium hover:underline">← Volver al catálogo</Link>
    </div>
  );

  if (!product) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link href="/catalogo/joybees" className="text-sm text-[#404041] hover:underline mb-6 inline-block">← Volver al catálogo</Link>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="aspect-square bg-[#FFFEF5] border border-[#404041]/10 rounded-lg overflow-hidden">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="w-full h-full object-contain" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <svg className="w-24 h-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>

        <div>
          <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
          {product.sku && <p className="text-sm text-gray-500 mb-4">SKU: {product.sku}</p>}
          <p className="text-2xl font-bold text-[#404041] mb-4">
            {product.price ? `$${product.price.toFixed(2)}` : "Consultar precio"}
          </p>

          {availableVariants.length > 0 ? (
            <>
              {availableVariants.length > 1 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Versión</label>
                  <div className="flex flex-wrap gap-2">
                    {availableVariants.map(v => (
                      <button
                        key={v.product.id}
                        onClick={() => setSelectedId(v.product.id)}
                        className={`px-4 py-2 border rounded text-sm font-medium transition-colors ${
                          selectedId === v.product.id
                            ? "bg-[#404041] text-white border-[#404041]"
                            : "border-gray-300 hover:border-[#404041]"
                        }`}
                      >
                        {v.genderLabel}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Bultos ({BULTO} pzas c/u)</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-10 border rounded flex items-center justify-center text-lg">-</button>
                  <span className="text-lg font-medium w-8 text-center">{quantity}</span>
                  <button onClick={() => setQuantity(quantity + 1)} className="w-10 h-10 border rounded flex items-center justify-center text-lg">+</button>
                </div>
              </div>

              <button
                onClick={handleAdd}
                disabled={!selected}
                className="w-full bg-[#FFE443] text-[#404041] py-3 rounded font-bold text-sm uppercase tracking-wide hover:bg-[#f5d90a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {added ? "Agregado al pedido!" : "Agregar al pedido"}
              </button>
            </>
          ) : (
            <div className="bg-[#FFFEF5] border border-[#404041]/10 p-4 rounded text-center">
              <p className="text-gray-600">Consulta disponibilidad con tu vendedor</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
