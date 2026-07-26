"use client";

// Ficha individual de producto /catalogo/[marca]/producto/[id] — única para
// todas las marcas. Dos estilos por config (theme.producto.estilo):
//   · "tallas" (Reebok): lee el producto directo con el client anon del
//     catálogo + inventario por talla del endpoint /inventory.
//   · "variantes" (Joybees): sin inventario por talla; el selector son las
//     VARIANTES de género del mismo modelo (groupByModel), cada una con su
//     propio SKU/stock.
// El carrito es el mismo del grid (keys históricas por marca).

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { supabase, type Product, type InventoryItem } from "@/components/reebok/supabase";
import { groupByModel, type GroupedProduct, type JoybeesProduct } from "./groupByModel";
import { fmtPrecio } from "@/lib/catalogo/precio";

interface CartItem { product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number; }

export default function ProductoDetalleClient({ marca }: { marca: MarcaUiKey }) {
  const theme = getMarcaTheme(marca)!;
  if (theme.producto.estilo === "tallas") return <DetallePorTallas marca={marca} />;
  return <DetallePorVariantes marca={marca} />;
}

// ── Estilo "tallas" (Reebok) ─────────────────────────────────────────────────

function DetallePorTallas({ marca }: { marca: MarcaUiKey }) {
  const theme = getMarcaTheme(marca)!;
  const { id } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedSize, setSelectedSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    // QUIRK heredado: la ficha Reebok lee products DIRECTO con el client anon
    // del catálogo (patrón original), no via API.
    supabase.from("products").select("*").eq("id", id).single()
      .then(({ data }) => { if (data) setProduct(data); });
    fetch(`${theme.api}/inventory?product_id=${id}`)
      .then(r => { if (!r.ok) throw new Error("Failed to load inventory"); return r.json(); })
      .then(data => setInventory(data))
      .catch(() => { /* inventory load failed, keep empty */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const availableSizes = inventory.filter(i => i.quantity > 0);

  // Read cart from sessionStorage (same keys as the grid page)
  function getCart(): CartItem[] {
    try {
      const saved = theme.cartKeySession ? sessionStorage.getItem(theme.cartKeySession) : null;
      if (saved) return JSON.parse(saved);
    } catch { /* */ }
    return [];
  }

  function saveCart(cart: CartItem[]) {
    if (theme.cartKeySession) sessionStorage.setItem(theme.cartKeySession, JSON.stringify(cart));
    try {
      localStorage.setItem(theme.cartKeyLocal, JSON.stringify(cart));
    } catch { /* */ }
  }

  const handleAdd = () => {
    if (!product || !selectedSize) return;
    const cart = getCart();
    const existing = cart.find(i => i.product_id === product.id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.push({
        product_id: product.id,
        sku: product.sku || "",
        name: product.name,
        image_url: product.image_url || "",
        quantity,
        unit_price: product.price || 0,
      });
    }
    saveCart(cart);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  if (!product) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link href={theme.catalogoHref} className={theme.producto.volverClass}>← Volver al catálogo</Link>

      <div className="grid md:grid-cols-2 gap-8">
        <div className={theme.producto.imageWrap}>
          {product.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
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
          {product.sku && <p className="text-sm text-gray-500 mb-1">SKU: {product.sku}</p>}
          {product.color && <p className="text-sm text-gray-500 mb-4">Color: {product.color}</p>}
          <p className={theme.producto.price}>
            {product.price ? fmtPrecio(product.price) : "Consultar precio"}
          </p>
          {product.description && <p className="text-gray-600 mb-6">{product.description}</p>}

          {availableSizes.length > 0 ? (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Talla</label>
                <div className="flex flex-wrap gap-2">
                  {availableSizes.map(inv => (
                    <button
                      key={inv.size}
                      onClick={() => setSelectedSize(inv.size)}
                      className={`px-4 py-2 border rounded text-sm font-medium transition-colors ${
                        selectedSize === inv.size ? theme.producto.sizeActive : theme.producto.sizeInactive
                      }`}
                    >
                      {inv.size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Cantidad</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-10 border rounded flex items-center justify-center text-lg">-</button>
                  <span className="text-lg font-medium w-8 text-center">{quantity}</span>
                  <button onClick={() => setQuantity(quantity + 1)} className="w-10 h-10 border rounded flex items-center justify-center text-lg">+</button>
                </div>
              </div>

              <button
                onClick={handleAdd}
                disabled={!selectedSize}
                className={theme.producto.addBtn}
              >
                {added ? "Agregado al pedido!" : "Agregar al pedido"}
              </button>
            </>
          ) : (
            <div className={theme.producto.consultaWrap}>
              <p className="text-gray-600">Consulta disponibilidad con tu vendedor</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Estilo "variantes" (Joybees) ─────────────────────────────────────────────

function DetallePorVariantes({ marca }: { marca: MarcaUiKey }) {
  const theme = getMarcaTheme(marca)!;
  const BULTO = theme.bulto();
  const { id } = useParams();
  const [product, setProduct] = useState<JoybeesProduct | null>(null);
  const [group, setGroup] = useState<GroupedProduct | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`${theme.api}/products?active=true`)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const availableVariants = (group?.variants || []).filter(v => v.product.stock > 0);
  const selected = availableVariants.find(v => v.product.id === selectedId)?.product || null;

  // Carrito compartido con la página del catálogo (misma key localStorage)
  function getCart(): CartItem[] {
    try {
      const saved = localStorage.getItem(theme.cartKeyLocal);
      if (saved) return JSON.parse(saved);
    } catch { /* */ }
    return [];
  }

  function saveCart(cart: CartItem[]) {
    try { localStorage.setItem(theme.cartKeyLocal, JSON.stringify(cart)); } catch { /* */ }
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
      <Link href={theme.catalogoHref} className="text-sm text-[#404041] font-medium hover:underline">← Volver al catálogo</Link>
    </div>
  );

  if (!product) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link href={theme.catalogoHref} className={theme.producto.volverClass}>← Volver al catálogo</Link>

      <div className="grid md:grid-cols-2 gap-8">
        <div className={theme.producto.imageWrap}>
          {product.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
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
          <p className={theme.producto.price}>
            {product.price ? fmtPrecio(product.price) : "Consultar precio"}
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
                          selectedId === v.product.id ? theme.producto.sizeActive : theme.producto.sizeInactive
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
                className={theme.producto.addBtn}
              >
                {added ? "Agregado al pedido!" : "Agregar al pedido"}
              </button>
            </>
          ) : (
            <div className={theme.producto.consultaWrap}>
              <p className="text-gray-600">Consulta disponibilidad con tu vendedor</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
