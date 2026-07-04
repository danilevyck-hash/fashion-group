"use client";

// Checkout ÚNICO de los catálogos (Reebok y Joybees) — mockup aprobado:
// carrito → esta pantalla → confirmación. Items editables, cliente del
// directorio Switch (default Contado), vendedor AUTOMÁTICO por login, total y
// UN botón "Confirmar y enviar a Switch". SIN validación de stock aquí
// (decisión de Daniel 5-jul: el stock del sync <24h basta; flujo rápido).
// El carrito vive en localStorage y NUNCA se limpia antes de que el pedido
// quede guardado en DB.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseThumb } from "@/lib/image-thumb";
import { fmt } from "@/lib/format";

export interface CheckoutCartItem {
  product_id: string;
  sku: string;
  name: string;
  image_url: string;
  quantity: number; // bultos
  unit_price: number;
  category?: string;
  is_preorder?: boolean;
}

interface BrandCfg {
  label: string;
  catalogHref: string;
  confirmBase: string;
  /** storage keys que contienen el carrito (se leen en orden, se escriben todas) */
  cartLocal: string;
  cartSession: string | null;
  /** llaves extra a limpiar tras crear el pedido (flujo viejo reebok) */
  clearKeys: string[];
  bulto: (category?: string) => number;
  accent: string;
}

const BRANDS: Record<string, BrandCfg> = {
  reebok: {
    label: "REEBOK",
    catalogHref: "/catalogo/reebok/productos",
    confirmBase: "/catalogo/reebok/confirmacion",
    cartLocal: "reebok_cart",
    cartSession: "reebok_cart",
    clearKeys: ["reebok_draft_id", "reebok_draft_client", "reebok_draft_client_email", "reebok_create_token"],
    bulto: (c) => (c === "footwear" ? 12 : 6),
    accent: "#1A2656",
  },
  joybees: {
    label: "JOYBEES",
    catalogHref: "/catalogo/joybees",
    confirmBase: "/catalogo/joybees/confirmacion",
    cartLocal: "joybees_cart",
    cartSession: null,
    clearKeys: [],
    bulto: () => 12,
    accent: "#404041",
  },
};

interface Cliente { id: number; codigo: string | null; nombre: string }

const CONTADO: Cliente = { id: 1, codigo: null, nombre: "Contado" };

export default function CheckoutClient({ marca }: { marca: "reebok" | "joybees" }) {
  const cfg = BRANDS[marca];
  const router = useRouter();

  const [cart, setCart] = useState<CheckoutCartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [cliente, setCliente] = useState<Cliente>(CONTADO);
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [clientePickerOpen, setClientePickerOpen] = useState(false);
  const [clienteQuery, setClienteQuery] = useState("");
  const [vendedor, setVendedor] = useState<{ id: number; nombre: string | null } | null | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [erroresDetalle, setErroresDetalle] = useState<string[]>([]);

  // ── Carrito desde storage ──
  useEffect(() => {
    try {
      const raw = (cfg.cartSession ? sessionStorage.getItem(cfg.cartSession) : null) || localStorage.getItem(cfg.cartLocal);
      const parsed = raw ? JSON.parse(raw) : [];
      setCart(Array.isArray(parsed) ? parsed : []);
    } catch { setCart([]); }
    setLoaded(true);
  }, [cfg.cartLocal, cfg.cartSession]);

  const persistCart = useCallback((next: CheckoutCartItem[]) => {
    setCart(next);
    try {
      localStorage.setItem(cfg.cartLocal, JSON.stringify(next));
      if (cfg.cartSession) sessionStorage.setItem(cfg.cartSession, JSON.stringify(next));
    } catch { /* */ }
  }, [cfg.cartLocal, cfg.cartSession]);

  // ── Vendedor automático por login ──
  useEffect(() => {
    const empresa = marca === "reebok" ? "active_shoes" : "joystep";
    fetch(`/api/catalogo/mi-vendedor?empresa=${empresa}`)
      .then((r) => (r.ok ? r.json() : { vendedor: null }))
      .then((d) => setVendedor(d.vendedor ?? null))
      .catch(() => setVendedor(null));
  }, [marca]);

  // ── Directorio de clientes (al abrir el selector) ──
  useEffect(() => {
    if (!clientePickerOpen || clientes !== null) return;
    fetch(`/api/catalogo/switch-clientes?marca=${marca}`)
      .then((r) => (r.ok ? r.json() : { clientes: [] }))
      .then((d) => setClientes(d.clientes ?? []))
      .catch(() => setClientes([]));
  }, [clientePickerOpen, clientes, marca]);

  // ── Derivados ──
  const lineas = useMemo(() => cart.map((i) => {
    const bulto = cfg.bulto(i.category);
    const piezas = i.quantity * bulto;
    return { ...i, bulto, piezas, subtotal: piezas * i.unit_price };
  }), [cart, cfg]);
  const total = lineas.reduce((s, l) => s + l.subtotal, 0);
  const totalPiezas = lineas.reduce((s, l) => s + l.piezas, 0);
  const preorders = lineas.filter((l) => l.is_preorder === true);
  const puedeConfirmar = loaded && cart.length > 0 && vendedor != null && preorders.length === 0 && !sending;

  const setQty = (productId: string, qty: number) => {
    if (qty <= 0) persistCart(cart.filter((i) => i.product_id !== productId));
    else persistCart(cart.map((i) => (i.product_id === productId ? { ...i, quantity: qty } : i)));
  };

  // ── Confirmar y enviar ──
  async function confirmar() {
    if (!puedeConfirmar) return;
    setSending(true);
    setError(null);
    setErroresDetalle([]);
    // Token idempotente: sobrevive reintentos de red sin duplicar pedidos.
    let token = "";
    try {
      token = sessionStorage.getItem(`${marca}_checkout_token`) || crypto.randomUUID();
      sessionStorage.setItem(`${marca}_checkout_token`, token);
    } catch { token = crypto.randomUUID(); }

    try {
      const res = await fetch("/api/catalogo/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marca, cliente: { id: cliente.id, nombre: cliente.nombre }, items: cart, idempotency_key: token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "No se pudo crear el pedido. Intenta de nuevo.");
        if (Array.isArray(data?.errores)) setErroresDetalle(data.errores);
        return; // carrito intacto
      }
      // Pedido guardado en DB (con o sin Switch ok) → limpiar carrito y token.
      try {
        localStorage.removeItem(cfg.cartLocal);
        if (cfg.cartSession) sessionStorage.removeItem(cfg.cartSession);
        sessionStorage.removeItem(`${marca}_checkout_token`);
        for (const k of cfg.clearKeys) { sessionStorage.removeItem(k); localStorage.removeItem(k); }
      } catch { /* */ }
      router.push(`${cfg.confirmBase}/${data.order_id}`);
    } catch {
      setError("Sin conexión — el carrito sigue guardado, intenta de nuevo.");
    } finally {
      setSending(false);
    }
  }

  const clientesFiltrados = useMemo(() => {
    if (!clientes) return [];
    const q = clienteQuery.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) => c.nombre.toLowerCase().includes(q) || (c.codigo || "").toLowerCase().includes(q));
  }, [clientes, clienteQuery]);

  if (!loaded) return null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Confirmar pedido</h1>
          <p className="text-sm text-gray-500">{cfg.label} · revisa, elige cliente y envía a Switch</p>
        </div>
        <Link href={cfg.catalogHref} className="text-sm text-gray-500 hover:text-black transition">← Catálogo</Link>
      </div>

      {cart.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm text-gray-500">El carrito está vacío.</p>
          <Link href={cfg.catalogHref} className="mt-3 inline-block bg-black text-white text-sm px-4 py-2 rounded-md hover:bg-gray-800 transition">
            Ir al catálogo
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Items */}
          <section className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
            {lineas.map((l) => {
              return (
                <div key={l.product_id} className="flex gap-3 p-3">
                  <div className="h-16 w-16 shrink-0 rounded-md bg-gray-50 overflow-hidden">
                    {l.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={supabaseThumb(l.image_url, 160) ?? l.image_url} alt="" className="h-full w-full object-contain" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{l.name}</p>
                        <p className="text-xs text-gray-400 tabular-nums">{l.sku} · ${fmt(l.unit_price)}/pza · bulto de {l.bulto}</p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">${fmt(l.subtotal)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setQty(l.product_id, l.quantity - 1)} aria-label="Menos" className="min-h-[44px] min-w-[44px] rounded-md border border-gray-200 text-lg leading-none hover:border-gray-300 transition">−</button>
                        <span className="w-14 text-center text-sm tabular-nums">{l.quantity} {l.quantity === 1 ? "bulto" : "bultos"}</span>
                        <button onClick={() => setQty(l.product_id, l.quantity + 1)} aria-label="Más" className="min-h-[44px] min-w-[44px] rounded-md border border-gray-200 text-lg leading-none hover:border-gray-300 transition">+</button>
                        <button onClick={() => setQty(l.product_id, 0)} className="ml-2 min-h-[44px] px-2 text-xs text-gray-400 hover:text-red-600 transition">Quitar</button>
                      </div>
                      <div className="text-right text-xs tabular-nums">
                        <span className="text-gray-400">{l.piezas} pzas</span>
                        {l.is_preorder && <span className="ml-2 text-amber-700 font-medium">preventa</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>

          {/* Cliente */}
          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.05em] text-gray-400">Cliente</div>
                <div className="mt-0.5 text-sm font-medium">{cliente.nombre}{cliente.codigo ? <span className="ml-1.5 text-xs text-gray-400">{cliente.codigo}</span> : null}</div>
              </div>
              <button onClick={() => setClientePickerOpen((v) => !v)} className="rounded-md border border-gray-200 px-3 min-h-[44px] text-sm text-gray-700 hover:border-gray-300 transition">
                {clientePickerOpen ? "Cerrar" : "Cambiar"}
              </button>
            </div>
            {clientePickerOpen && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <input
                  type="search"
                  value={clienteQuery}
                  onChange={(e) => setClienteQuery(e.target.value)}
                  placeholder="Buscar cliente…"
                  className="w-full border border-gray-200 rounded-md px-3 min-h-[44px] text-sm outline-none focus:border-black transition"
                />
                <ul className="mt-2 max-h-56 overflow-y-auto divide-y divide-gray-50">
                  <li>
                    <button onClick={() => { setCliente(CONTADO); setClientePickerOpen(false); }} className="w-full px-2 py-2.5 text-left text-sm hover:bg-gray-50 transition">
                      Contado <span className="text-xs text-gray-400">(default)</span>
                    </button>
                  </li>
                  {clientes === null ? (
                    <li className="px-2 py-3 text-sm text-gray-400">Cargando directorio…</li>
                  ) : clientesFiltrados.map((c) => (
                    <li key={c.id}>
                      <button onClick={() => { setCliente(c); setClientePickerOpen(false); }} className="w-full px-2 py-2.5 text-left text-sm hover:bg-gray-50 transition">
                        {c.nombre} {c.codigo && <span className="text-xs text-gray-400">{c.codigo}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Vendedor automático */}
          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-xs uppercase tracking-[0.05em] text-gray-400">Vendedor</div>
            {vendedor === undefined ? (
              <div className="mt-0.5 text-sm text-gray-400">Cargando…</div>
            ) : vendedor === null ? (
              <p className="mt-1 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                No tienes vendedor de Switch asignado — pídele al admin asignarlo en Sistema → Usuarios.
              </p>
            ) : (
              <div className="mt-0.5 text-sm font-medium">{vendedor.nombre || `Vendedor ${vendedor.id}`} <span className="text-xs text-gray-400">· automático por tu usuario</span></div>
            )}
          </section>

          {/* Preventa bloquea */}
          {preorders.length > 0 && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {preorders.length} producto(s) en preventa — quítalos para enviar a Switch (se piden aparte).
            </p>
          )}

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
              {erroresDetalle.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-xs">{erroresDetalle.map((e, i) => <li key={i}>{e}</li>)}</ul>
              )}
            </div>
          )}

          {/* Total + confirmar */}
          <section className="rounded-lg border-2 p-4" style={{ borderColor: cfg.accent }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.05em] text-gray-400">Total del pedido</div>
                <div className="text-2xl font-semibold tabular-nums">${fmt(total)}</div>
                <div className="text-xs text-gray-400 tabular-nums">{cart.length} producto(s) · {totalPiezas} piezas</div>
              </div>
              <button
                onClick={confirmar}
                disabled={!puedeConfirmar}
                className="rounded-md bg-black px-5 min-h-[48px] text-sm font-medium text-white hover:bg-gray-800 active:scale-[0.97] transition disabled:opacity-40"
              >
                {sending ? "Enviando…" : "Confirmar y enviar a Switch"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
