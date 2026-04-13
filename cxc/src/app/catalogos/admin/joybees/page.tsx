"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import Image from "next/image";
import Link from "next/link";
import * as XLSX from "xlsx-js-style";

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
  is_new: boolean;
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

interface ImportRow {
  sku: string;
  name: string;
  price: number;
  stock: number;
  gender: string;
  category?: string;
}

interface ImportPreview {
  rows: ImportRow[];
  toUpdate: number;
  toCreate: number;
  toZero: number;
}

interface PhotoMatch {
  file: File;
  sku: string;
  matched: boolean;
  preview: string;
}

type Tab = "productos" | "pedidos" | "importar";

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

  // Import state
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ updated: number; created: number; zeroed: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Photo batch state
  const [photoMatches, setPhotoMatches] = useState<PhotoMatch[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

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

  async function handleToggle(product: JoybeesProduct, field: "popular" | "is_new") {
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

  // --- IMPORT: Download template ---
  function handleDownloadTemplate() {
    const rows = products.map(p => ({
      SKU: p.sku,
      Nombre: p.name,
      Precio: p.price,
      Cantidad: p.stock,
      Genero: p.gender,
      Categoria: p.category,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    // Column widths
    ws["!cols"] = [
      { wch: 18 }, // SKU
      { wch: 30 }, // Nombre
      { wch: 10 }, // Precio
      { wch: 10 }, // Cantidad
      { wch: 14 }, // Genero
      { wch: 16 }, // Categoria
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, `Joybees_Plantilla_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast("Plantilla descargada");
  }

  // --- IMPORT: Parse file ---
  function handleImportFile(file: File) {
    setImportLoading(true);
    setImportResult(null);
    setImportPreview(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

        if (json.length === 0) {
          showToast("El archivo esta vacio");
          setImportLoading(false);
          return;
        }

        // Map columns (flexible naming)
        const rows: ImportRow[] = json.map(row => {
          const sku = String(row["SKU"] || row["sku"] || row["Sku"] || "").trim();
          const name = String(row["Nombre"] || row["nombre"] || row["Name"] || row["name"] || "").trim();
          const price = parseFloat(String(row["Precio"] || row["precio"] || row["Price"] || row["price"] || 0));
          const stock = parseInt(String(row["Cantidad"] || row["cantidad"] || row["Stock"] || row["stock"] || row["Qty"] || 0));
          const gender = String(row["Genero"] || row["genero"] || row["Gender"] || row["gender"] || "unisex").trim();
          const category = String(row["Categoria"] || row["categoria"] || row["Category"] || row["category"] || "clogs").trim();
          return { sku, name, price: isNaN(price) ? 0 : price, stock: isNaN(stock) ? 0 : stock, gender, category };
        }).filter(r => r.sku);

        if (rows.length === 0) {
          showToast("No se encontraron filas con SKU valido");
          setImportLoading(false);
          return;
        }

        const existingSkus = new Set(products.map(p => p.sku));
        const importedSkus = new Set(rows.map(r => r.sku));

        const toUpdate = rows.filter(r => existingSkus.has(r.sku)).length;
        const toCreate = rows.filter(r => !existingSkus.has(r.sku)).length;
        const toZero = products.filter(p => !importedSkus.has(p.sku)).length;

        setImportPreview({ rows, toUpdate, toCreate, toZero });
      } catch (err) {
        console.error("Parse error:", err);
        showToast("Error al leer el archivo");
      } finally {
        setImportLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // --- IMPORT: Confirm ---
  async function handleConfirmImport() {
    if (!importPreview) return;
    setImportLoading(true);
    try {
      const res = await fetch("/api/catalogo/joybees/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importPreview.rows }),
      });
      if (res.ok) {
        const result = await res.json();
        setImportResult({ updated: result.updated, created: result.created, zeroed: result.zeroed });
        setImportPreview(null);
        showToast("Importacion completada");
        await loadProducts();
      } else {
        const err = await res.json();
        showToast(err.error || "Error al importar");
      }
    } catch {
      showToast("Error al importar");
    } finally {
      setImportLoading(false);
    }
  }

  // --- PHOTOS: Select files ---
  function handlePhotoFiles(files: FileList) {
    const skuSet = new Set(products.map(p => p.sku));
    const matches: PhotoMatch[] = [];

    Array.from(files).forEach(file => {
      // Extract SKU from filename: "UAACG.BLK-M.jpg" → try matching
      const nameWithoutExt = file.name.replace(/\.[^.]+$/, "");
      // Try exact match first, then with dashes replaced
      const matchedSku = products.find(p =>
        p.sku === nameWithoutExt ||
        p.sku.replace(/-/g, ".") === nameWithoutExt ||
        p.sku.replace(/-/g, "") === nameWithoutExt.replace(/[.\-_]/g, "") ||
        nameWithoutExt.replace(/[.\-_]/g, "").toUpperCase() === p.sku.replace(/[.\-_]/g, "").toUpperCase()
      );

      matches.push({
        file,
        sku: matchedSku?.sku || nameWithoutExt,
        matched: !!matchedSku || skuSet.has(nameWithoutExt),
        preview: URL.createObjectURL(file),
      });
    });

    setPhotoMatches(matches);
  }

  // --- PHOTOS: Upload ---
  async function handleUploadBatchPhotos() {
    const matched = photoMatches.filter(m => m.matched);
    if (matched.length === 0) {
      showToast("No hay fotos con SKU valido");
      return;
    }

    setUploadingPhotos(true);
    let uploaded = 0;

    for (const match of matched) {
      const product = products.find(p =>
        p.sku === match.sku ||
        p.sku.replace(/-/g, ".") === match.sku ||
        p.sku.replace(/[.\-_]/g, "").toUpperCase() === match.sku.replace(/[.\-_]/g, "").toUpperCase()
      );
      if (!product) continue;

      const formData = new FormData();
      formData.append("file", match.file);
      try {
        const res = await fetch("/api/catalogo/joybees/upload", { method: "POST", body: formData });
        if (res.ok) {
          const { url } = await res.json();
          await fetch("/api/catalogo/joybees/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...product, image_url: url }),
          });
          uploaded++;
        }
      } catch { /* continue */ }
    }

    showToast(`${uploaded} foto${uploaded !== 1 ? "s" : ""} subida${uploaded !== 1 ? "s" : ""}`);
    setPhotoMatches([]);
    setUploadingPhotos(false);
    await loadProducts();
  }

  if (!authChecked) return null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "productos", label: "Productos" },
    { key: "pedidos", label: "Pedidos" },
    { key: "importar", label: "Importar" },
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
                  <p className="text-sm text-gray-500">{products.filter(p => p.stock > 0).length} con stock &middot; {products.length} total</p>
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
                        onClick={() => handleSaveProduct({ ...newProduct, active: true, popular: false, is_new: false, stock: 0 })}
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
                              {product.is_new && (
                                <span className="text-[10px] font-medium bg-green-50 text-green-600 px-1.5 py-0.5 rounded">Nuevo</span>
                              )}
                              {product.stock === 0 && (
                                <span className="text-[10px] font-medium bg-red-50 text-red-500 px-1.5 py-0.5 rounded">Sin stock</span>
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
                              onClick={() => handleToggle(product, "popular")}
                              title={product.popular ? "Quitar popular" : "Marcar popular"}
                              className={`text-lg transition ${product.popular ? "text-[#FFE443]" : "text-gray-300 hover:text-gray-400"}`}
                            >
                              ★
                            </button>
                            <button
                              onClick={() => handleToggle(product, "is_new")}
                              title={product.is_new ? "Quitar nuevo" : "Marcar nuevo"}
                              className={`text-xs font-bold px-1.5 py-0.5 rounded transition ${product.is_new ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400 hover:text-gray-500"}`}
                            >
                              NEW
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

            {/* IMPORTAR TAB */}
            {tab === "importar" && (
              <div className="space-y-6">

                {/* Section 1: Import Excel/CSV */}
                <div className="bg-white border border-gray-200 rounded-lg p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">Actualizar inventario</h3>
                  <p className="text-xs text-gray-400 mb-4">Descarga la plantilla, llena los datos y subela para actualizar inventario</p>

                  <div className="flex flex-wrap gap-3 mb-4">
                    <button
                      onClick={handleDownloadTemplate}
                      className="px-4 py-2 bg-[#404041] text-white text-sm font-medium rounded-lg hover:bg-[#404041]/90 active:scale-[0.97] transition flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Descargar plantilla
                    </button>
                  </div>

                  {/* Drop zone */}
                  <div
                    className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center hover:border-[#FFE443] transition cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("border-[#FFE443]", "bg-[#FFE443]/5"); }}
                    onDragLeave={e => { e.preventDefault(); e.currentTarget.classList.remove("border-[#FFE443]", "bg-[#FFE443]/5"); }}
                    onDrop={e => {
                      e.preventDefault();
                      e.currentTarget.classList.remove("border-[#FFE443]", "bg-[#FFE443]/5");
                      const file = e.dataTransfer.files[0];
                      if (file) handleImportFile(file);
                    }}
                  >
                    <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-gray-500">Arrastra un archivo .xlsx o .csv aqui</p>
                    <p className="text-xs text-gray-400 mt-1">o haz click para seleccionar</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleImportFile(file);
                      e.target.value = "";
                    }}
                  />

                  {/* Import loading */}
                  {importLoading && !importPreview && (
                    <div className="flex items-center gap-2 mt-4 text-sm text-gray-500">
                      <div className="w-4 h-4 border-2 border-[#FFE443] border-t-transparent rounded-full animate-spin" />
                      Procesando archivo...
                    </div>
                  )}

                  {/* Import preview */}
                  {importPreview && (
                    <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                        <p className="text-sm font-medium text-gray-700">Vista previa de importacion</p>
                        <div className="flex gap-4 mt-1 text-xs">
                          <span className="text-blue-600">{importPreview.toUpdate} a actualizar</span>
                          <span className="text-green-600">{importPreview.toCreate} nuevos</span>
                          <span className="text-red-500">{importPreview.toZero} se pondran en 0</span>
                        </div>
                      </div>

                      {/* Preview table */}
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-white">
                            <tr className="border-b border-gray-100">
                              <th className="text-left px-3 py-2 font-medium text-gray-500">SKU</th>
                              <th className="text-left px-3 py-2 font-medium text-gray-500">Nombre</th>
                              <th className="text-right px-3 py-2 font-medium text-gray-500">Precio</th>
                              <th className="text-right px-3 py-2 font-medium text-gray-500">Cant</th>
                              <th className="text-left px-3 py-2 font-medium text-gray-500">Estado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {importPreview.rows.slice(0, 50).map((row, i) => {
                              const exists = products.some(p => p.sku === row.sku);
                              return (
                                <tr key={i} className="hover:bg-gray-50">
                                  <td className="px-3 py-1.5 font-mono text-gray-600">{row.sku}</td>
                                  <td className="px-3 py-1.5 text-gray-900">{row.name}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums">${fmtMoney(row.price)}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums">{row.stock}</td>
                                  <td className="px-3 py-1.5">
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${exists ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"}`}>
                                      {exists ? "Actualizar" : "Nuevo"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {importPreview.rows.length > 50 && (
                          <p className="text-xs text-gray-400 px-3 py-2">... y {importPreview.rows.length - 50} mas</p>
                        )}
                      </div>

                      <div className="flex gap-2 px-4 py-3 bg-gray-50 border-t border-gray-200">
                        <button
                          onClick={handleConfirmImport}
                          disabled={importLoading}
                          className="px-4 py-2 bg-[#FFE443] text-[#404041] text-sm font-semibold rounded-lg hover:bg-[#FFE443]/80 active:scale-[0.97] transition disabled:opacity-50"
                        >
                          {importLoading ? "Importando..." : "Confirmar importacion"}
                        </button>
                        <button
                          onClick={() => setImportPreview(null)}
                          className="px-4 py-2 text-gray-500 text-sm rounded-lg hover:bg-gray-100 transition"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Import result */}
                  {importResult && (
                    <div className="mt-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                      <p className="text-sm font-medium text-green-800">Importacion completada</p>
                      <p className="text-xs text-green-600 mt-1">
                        {importResult.updated} actualizados &middot; {importResult.created} nuevos &middot; {importResult.zeroed} puestos en 0
                      </p>
                    </div>
                  )}
                </div>

                {/* Section 2: Batch photos */}
                <div className="bg-white border border-gray-200 rounded-lg p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">Subir fotos en batch</h3>
                  <p className="text-xs text-gray-400 mb-4">Selecciona imagenes nombradas por SKU (ej: UA-ACG-BLK.jpg)</p>

                  <div
                    className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center hover:border-[#FFE443] transition cursor-pointer"
                    onClick={() => photoInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("border-[#FFE443]", "bg-[#FFE443]/5"); }}
                    onDragLeave={e => { e.preventDefault(); e.currentTarget.classList.remove("border-[#FFE443]", "bg-[#FFE443]/5"); }}
                    onDrop={e => {
                      e.preventDefault();
                      e.currentTarget.classList.remove("border-[#FFE443]", "bg-[#FFE443]/5");
                      if (e.dataTransfer.files.length > 0) handlePhotoFiles(e.dataTransfer.files);
                    }}
                  >
                    <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm text-gray-500">Selecciona o arrastra imagenes</p>
                    <p className="text-xs text-gray-400 mt-1">Nombra cada archivo con el SKU del producto</p>
                  </div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => {
                      if (e.target.files && e.target.files.length > 0) handlePhotoFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />

                  {/* Photo preview */}
                  {photoMatches.length > 0 && (
                    <div className="mt-4">
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-4">
                        {photoMatches.map((match, i) => (
                          <div key={i} className={`relative rounded-lg overflow-hidden border-2 ${match.matched ? "border-green-300" : "border-red-300"}`}>
                            <Image
                              src={match.preview}
                              alt={match.sku}
                              width={100}
                              height={100}
                              className="w-full aspect-square object-cover"
                              unoptimized
                            />
                            <div className={`absolute bottom-0 left-0 right-0 px-1.5 py-1 text-[10px] font-mono truncate ${match.matched ? "bg-green-500/90 text-white" : "bg-red-500/90 text-white"}`}>
                              {match.sku}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-3">
                        <p className="text-xs text-gray-500">
                          {photoMatches.filter(m => m.matched).length} de {photoMatches.length} coinciden con un producto
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={handleUploadBatchPhotos}
                            disabled={uploadingPhotos || photoMatches.filter(m => m.matched).length === 0}
                            className="px-4 py-2 bg-[#FFE443] text-[#404041] text-sm font-semibold rounded-lg hover:bg-[#FFE443]/80 active:scale-[0.97] transition disabled:opacity-50"
                          >
                            {uploadingPhotos ? "Subiendo..." : "Subir fotos"}
                          </button>
                          <button
                            onClick={() => setPhotoMatches([])}
                            className="px-4 py-2 text-gray-500 text-sm rounded-lg hover:bg-gray-100 transition"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

