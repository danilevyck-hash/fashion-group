"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import Image from "next/image";
import Link from "next/link";

interface JoybeesProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  gender: string;
  price: number;
  stock: number;
  image_url: string | null;
  active: boolean;
  popular: boolean;
  is_regalia: boolean;
  created_at: string;
}

interface JoybeesPedido {
  id: string;
  short_id: string;
  items: { product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number }[];
  total: number;
  status: string;
  created_at: string;
}

type Tab = "productos" | "inventario" | "pedidos";

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
}

export default function JoybeesAdminPage() {
  const { authChecked } = useAuth({
    moduleKey: "catalogos",
    allowedRoles: ["admin"],
  });

  const [tab, setTab] = useState<Tab>("productos");
  const [products, setProducts] = useState<JoybeesProduct[]>([]);
  const [pedidos, setPedidos] = useState<JoybeesPedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<JoybeesProduct>>({});

  // New product state
  const [showNew, setShowNew] = useState(false);
  const [newProduct, setNewProduct] = useState({ sku: "", name: "", category: "clogs", gender: "unisex", price: 0 });

  // Inventory edits
  const [stockEdits, setStockEdits] = useState<Record<string, number>>({});
  const [stockDirty, setStockDirty] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/catalogo/joybees/products");
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
        const edits: Record<string, number> = {};
        data.forEach((p: JoybeesProduct) => { edits[p.id] = p.stock; });
        setStockEdits(edits);
      }
    } catch { /* ignore */ }
  }, []);

  const loadPedidos = useCallback(async () => {
    try {
      const res = await fetch("/api/catalogo/joybees/pedidos");
      if (res.ok) {
        const data = await res.json();
        setPedidos(data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    setLoading(true);
    Promise.all([loadProducts(), loadPedidos()]).finally(() => setLoading(false));
  }, [authChecked, loadProducts, loadPedidos]);

  async function handleSaveProduct(product: Partial<JoybeesProduct>) {
    setSaving(true);
    try {
      const res = await fetch("/api/catalogo/joybees/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(product),
      });
      if (res.ok) {
        showToast("Producto guardado");
        setEditingId(null);
        setEditForm({});
        setShowNew(false);
        setNewProduct({ sku: "", name: "", category: "clogs", gender: "unisex", price: 0 });
        await loadProducts();
      } else {
        const err = await res.json();
        showToast(err.error || "Error al guardar");
      }
    } catch {
      showToast("Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(product: JoybeesProduct, field: "active" | "popular") {
    await handleSaveProduct({ ...product, [field]: !product[field] });
  }

  async function handleDelete(product: JoybeesProduct) {
    if (!confirm(`Eliminar ${product.name}?`)) return;
    setSaving(true);
    try {
      const res = await fetch("/api/catalogo/joybees/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...product, active: false, stock: 0 }),
      });
      if (res.ok) {
        showToast("Producto eliminado");
        await loadProducts();
      }
    } catch {
      showToast("Error al eliminar");
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadPhoto(productId: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/catalogo/joybees/upload", { method: "POST", body: formData });
      if (res.ok) {
        const { url } = await res.json();
        const product = products.find(p => p.id === productId);
        if (product) {
          await handleSaveProduct({ ...product, image_url: url });
        }
      } else {
        showToast("Error al subir imagen");
      }
    } catch {
      showToast("Error al subir imagen");
    }
  }

  async function handleSaveAllStock() {
    setSaving(true);
    try {
      const promises = products.map(p => {
        const newStock = stockEdits[p.id];
        if (newStock !== undefined && newStock !== p.stock) {
          return fetch("/api/catalogo/joybees/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...p, stock: newStock }),
          });
        }
        return null;
      }).filter(Boolean);

      await Promise.all(promises);
      showToast("Inventario actualizado");
      setStockDirty(false);
      await loadProducts();
    } catch {
      showToast("Error al guardar inventario");
    } finally {
      setSaving(false);
    }
  }

  if (!authChecked) return null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "productos", label: "Productos" },
    { key: "inventario", label: "Inventario" },
    { key: "pedidos", label: "Pedidos" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Administrar Catalogos" />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#404041] text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-[9999]">
          {toast}
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#FFE443] flex items-center justify-center">
            <span className="text-[#404041] font-extrabold text-sm">JB</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">JOYBEES</h1>
            <p className="text-xs text-gray-400">Administrar catalogo</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                tab === t.key
                  ? "bg-white text-[#404041] shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#FFE443] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* PRODUCTOS TAB */}
            {tab === "productos" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-gray-500">{products.length} productos</p>
                  <button
                    onClick={() => setShowNew(true)}
                    className="px-4 py-2 bg-[#404041] text-white text-sm font-medium rounded-lg hover:bg-[#404041]/90 active:scale-[0.97] transition"
                  >
                    + Nuevo producto
                  </button>
                </div>

                {/* New product form */}
                {showNew && (
                  <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Nuevo producto</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <input
                        placeholder="SKU"
                        value={newProduct.sku}
                        onChange={e => setNewProduct(p => ({ ...p, sku: e.target.value }))}
                        className="border border-gray-200 rounded-md px-3 py-2 text-sm"
                      />
                      <input
                        placeholder="Nombre"
                        value={newProduct.name}
                        onChange={e => setNewProduct(p => ({ ...p, name: e.target.value }))}
                        className="border border-gray-200 rounded-md px-3 py-2 text-sm col-span-2 sm:col-span-1"
                      />
                      <select
                        value={newProduct.category}
                        onChange={e => setNewProduct(p => ({ ...p, category: e.target.value }))}
                        className="border border-gray-200 rounded-md px-3 py-2 text-sm"
                      >
                        <option value="clogs">Clogs</option>
                        <option value="sandalias">Sandalias</option>
                        <option value="slides">Slides</option>
                        <option value="sneakers">Sneakers</option>
                        <option value="otros">Otros</option>
                      </select>
                      <select
                        value={newProduct.gender}
                        onChange={e => setNewProduct(p => ({ ...p, gender: e.target.value }))}
                        className="border border-gray-200 rounded-md px-3 py-2 text-sm"
                      >
                        <option value="unisex">Unisex</option>
                        <option value="hombre">Hombre</option>
                        <option value="mujer">Mujer</option>
                        <option value="nino">Nino</option>
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Precio"
                        value={newProduct.price || ""}
                        onChange={e => setNewProduct(p => ({ ...p, price: parseFloat(e.target.value) || 0 }))}
                        className="border border-gray-200 rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleSaveProduct({ ...newProduct, active: true, popular: false, stock: 0 })}
                        disabled={saving || !newProduct.sku || !newProduct.name}
                        className="px-4 py-2 bg-[#FFE443] text-[#404041] text-sm font-medium rounded-lg hover:bg-[#FFE443]/80 active:scale-[0.97] transition disabled:opacity-50"
                      >
                        {saving ? "Guardando..." : "Guardar producto"}
                      </button>
                      <button
                        onClick={() => setShowNew(false)}
                        className="px-4 py-2 text-gray-500 text-sm font-medium rounded-lg hover:bg-gray-100 transition"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* Products list */}
                <div className="space-y-2">
                  {products.map(product => (
                    <div key={product.id} className="bg-white border border-gray-200 rounded-lg p-4">
                      {editingId === product.id ? (
                        /* Edit mode */
                        <div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                            <input
                              value={editForm.name || ""}
                              onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                              placeholder="Nombre"
                              className="border border-gray-200 rounded-md px-3 py-2 text-sm"
                            />
                            <input
                              type="number"
                              step="0.01"
                              value={editForm.price || ""}
                              onChange={e => setEditForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                              placeholder="Precio"
                              className="border border-gray-200 rounded-md px-3 py-2 text-sm"
                            />
                            <select
                              value={editForm.category || ""}
                              onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                              className="border border-gray-200 rounded-md px-3 py-2 text-sm"
                            >
                              <option value="clogs">Clogs</option>
                              <option value="sandalias">Sandalias</option>
                              <option value="slides">Slides</option>
                              <option value="sneakers">Sneakers</option>
                              <option value="otros">Otros</option>
                            </select>
                            <select
                              value={editForm.gender || ""}
                              onChange={e => setEditForm(f => ({ ...f, gender: e.target.value }))}
                              className="border border-gray-200 rounded-md px-3 py-2 text-sm"
                            >
                              <option value="unisex">Unisex</option>
                              <option value="hombre">Hombre</option>
                              <option value="mujer">Mujer</option>
                              <option value="nino">Nino</option>
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveProduct({ ...product, ...editForm })}
                              disabled={saving}
                              className="px-3 py-1.5 bg-[#FFE443] text-[#404041] text-sm font-medium rounded-md active:scale-[0.97] transition disabled:opacity-50"
                            >
                              {saving ? "Guardando..." : "Guardar"}
                            </button>
                            <button
                              onClick={() => { setEditingId(null); setEditForm({}); }}
                              className="px-3 py-1.5 text-gray-500 text-sm rounded-md hover:bg-gray-100 transition"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* View mode */
                        <div className="flex items-center gap-3">
                          {/* Image */}
                          <label className="w-14 h-14 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden cursor-pointer relative group">
                            {product.image_url ? (
                              <Image
                                src={product.image_url}
                                alt={product.name}
                                width={56}
                                height={56}
                                className="w-full h-full object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-300">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            </div>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadPhoto(product.id, file);
                              }}
                            />
                          </label>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-gray-900 truncate">{product.name}</p>
                              {product.popular && (
                                <span className="text-[10px] font-medium bg-[#FFE443]/30 text-[#404041] px-1.5 py-0.5 rounded">Popular</span>
                              )}
                              {!product.active && (
                                <span className="text-[10px] font-medium bg-red-50 text-red-500 px-1.5 py-0.5 rounded">Inactivo</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {product.sku} &middot; {product.category} &middot; {product.gender} &middot; Stock: {product.stock}
                            </p>
                          </div>

                          {/* Price */}
                          <p className="text-sm font-semibold text-gray-900 tabular-nums flex-shrink-0">
                            ${fmtMoney(product.price)}
                          </p>

                          {/* Toggles */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => handleToggle(product, "active")}
                              title={product.active ? "Desactivar" : "Activar"}
                              className={`w-8 h-5 rounded-full transition relative ${product.active ? "bg-green-500" : "bg-gray-300"}`}
                            >
                              <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] transition-all ${product.active ? "right-[3px]" : "left-[3px]"}`} />
                            </button>
                            <button
                              onClick={() => handleToggle(product, "popular")}
                              title={product.popular ? "Quitar popular" : "Marcar popular"}
                              className={`text-lg transition ${product.popular ? "text-[#FFE443]" : "text-gray-300 hover:text-gray-400"}`}
                            >
                              ★
                            </button>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => {
                                setEditingId(product.id);
                                setEditForm({ name: product.name, price: product.price, category: product.category, gender: product.gender });
                              }}
                              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition"
                              title="Editar"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(product)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition"
                              title="Eliminar"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* INVENTARIO TAB */}
            {tab === "inventario" && (
              <div>
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-3 font-medium text-gray-500">SKU</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-500">Nombre</th>
                        <th className="text-right px-4 py-3 font-medium text-gray-500 w-32">Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {products.map(product => (
                        <tr key={product.id} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-3 text-gray-500 font-mono text-xs">{product.sku}</td>
                          <td className="px-4 py-3 text-gray-900">{product.name}</td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min={0}
                              value={stockEdits[product.id] ?? product.stock}
                              onChange={e => {
                                const val = parseInt(e.target.value) || 0;
                                setStockEdits(prev => ({ ...prev, [product.id]: val }));
                                setStockDirty(true);
                              }}
                              className="w-20 text-right border border-gray-200 rounded-md px-2 py-1.5 text-sm tabular-nums focus:ring-1 focus:ring-[#FFE443] focus:border-[#FFE443] outline-none"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Sticky save bar */}
                {stockDirty && (
                  <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between z-50">
                    <p className="text-sm text-gray-500">Tienes cambios sin guardar</p>
                    <button
                      onClick={handleSaveAllStock}
                      disabled={saving}
                      className="px-5 py-2 bg-[#FFE443] text-[#404041] text-sm font-semibold rounded-lg hover:bg-[#FFE443]/80 active:scale-[0.97] transition disabled:opacity-50"
                    >
                      {saving ? "Guardando..." : "Guardar cambios"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* PEDIDOS TAB */}
            {tab === "pedidos" && (
              <div>
                {pedidos.length === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-gray-400 text-sm">No hay pedidos aun</p>
                  </div>
                ) : (
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left px-4 py-3 font-medium text-gray-500">Fecha</th>
                          <th className="text-left px-4 py-3 font-medium text-gray-500">Pedido</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-500">Items</th>
                          <th className="text-right px-4 py-3 font-medium text-gray-500">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {pedidos.map(pedido => (
                          <tr key={pedido.id} className="hover:bg-gray-50 transition">
                            <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(pedido.created_at)}</td>
                            <td className="px-4 py-3">
                              <Link
                                href={`/pedido-joybees/${pedido.short_id}`}
                                className="text-[#404041] font-medium hover:underline"
                              >
                                {pedido.short_id}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500 tabular-nums">
                              {Array.isArray(pedido.items) ? pedido.items.length : 0}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                              ${fmtMoney(pedido.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
