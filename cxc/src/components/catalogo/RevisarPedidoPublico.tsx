"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EL CLIENTE REVISA ANTES DE CONFIRMAR — /catalogo-publico/<marca>/revisar
// (7-sep-2026).
//
// 🩸 ANTES ATERRIZABA EN SU PEDIDO YA CONFIRMADO, DE UN TOQUE. Desde el
// catálogo público, «Confirmar pedido» creaba el pedido, lo mandaba a Switch y
// llevaba al cliente a una página donde ya no había nada que cambiar. El
// VENDEDOR, en cambio, pasa por su checkout y revisa líneas, cantidades y
// precio antes de mandar. Daniel aprobó darle la misma revisión al cliente:
// *«así puede agregar, quitar o editar»*.
//
// 🔑 ES LA MISMA PANTALLA, NO UNA SEGUNDA. Las líneas las dibuja
// `LineasPedidoEditables` —la lista que salió del checkout del vendedor— y el
// nombre y el botón de confirmar viven en `CatalogoStickyCartBar`, la MISMA
// barra del catálogo. Acá no se dibujó ni un control nuevo.
//
// 🔴 EL PRECIO NO SE TOCA. «Editar» es cantidades y quitar líneas, nada más.
// Y no depende de esta pantalla: el servidor REESCRIBE los precios desde la
// base al recibir el pedido del link, así que un carrito adulterado no pasa.
// Eso no se tocó.
//
// ⚠️ LA CARTERA DE CLIENTES SIGUE CERRADA: el cliente escribe su propio nombre
// (`validarNombreCliente`, la regla de siempre) y NUNCA elige del directorio.
// ⚠️ El pedido del link SIGUE sin salir solo a Switch — alguien de adentro le
// pone el cliente (decisión del 14-ago-2026).
//
// «Volver al catálogo» no pierde nada: el carrito vive en la SESIÓN de la
// pestaña (`lib/catalogo/carrito`) y el nombre en `localStorage`, igual que
// antes.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { resolverLineas, resumirDesdeItems } from "@/lib/catalogo/lineas-pedido";
import { leerCarrito, guardarCarrito, limpiarCarrito } from "@/lib/catalogo/carrito";
import { validarNombreCliente } from "@/lib/catalogo/nombre-cliente";
import { rutaCatalogoPublico } from "@/lib/catalogo/rutas-publicas";
import { precioTexto } from "@/lib/catalogo/precio";
import { Toast } from "@/components/ui";
import CatalogoHeader from "./CatalogoHeader";
import CatalogoStickyCartBar from "./CatalogoStickyCartBar";
import LineasPedidoEditables, { type LineaEnPantalla } from "./LineasPedidoEditables";
import type { CatalogoCartItem, CatalogoProducto } from "./types";

export default function RevisarPedidoPublico({ marca }: { marca: MarcaUiKey }) {
  const theme = getMarcaTheme(marca)!;
  const router = useRouter();
  const hrefCatalogo = rutaCatalogoPublico(marca);

  const [cart, setCart] = useState<CatalogoCartItem[]>([]);
  const [cargado, setCargado] = useState(false);
  const [clientName, setClientName] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // short_id del pedido YA creado en el server: si la confirmación falla y el
  // cliente reintenta, se reusa (no se duplica el pedido).
  const [pendingShortId, setPendingShortId] = useState<string | null>(null);
  // El espacio de abajo sale del alto REAL de la barra, medido — nunca de un
  // número escrito a mano. Acá importa más que en ninguna parte: la barra lleva
  // encima el bloque «Tu nombre *», que es obligatorio y siempre visible.
  const [altoBarra, setAltoBarra] = useState(0);

  // ── Carrito y nombre, tal como los dejó el catálogo ──
  useEffect(() => {
    setCart(leerCarrito<CatalogoCartItem>(theme.publicCartKey));
    try {
      const guardado = localStorage.getItem(theme.publicClientNameKey);
      if (guardado) setClientName(guardado);
    } catch { /* ignore */ }
    setCargado(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cargado) return;
    try { localStorage.setItem(theme.publicClientNameKey, clientName); } catch { /* */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientName, cargado]);

  // Si el cliente cambia el carrito o su nombre, el pedido pendiente ya no
  // representa lo que ve → se creará uno nuevo al confirmar.
  useEffect(() => { setPendingShortId(null); }, [cart, clientName]);

  // Confirmar hace DOS llamadas (crear + confirmar) y la segunda sale a Switch:
  // son ~5 s en los que cerrar la pestaña deja el pedido a medias.
  useEffect(() => {
    if (!enviando) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [enviando]);

  const guardar = useCallback((siguiente: CatalogoCartItem[]) => {
    setCart(siguiente);
    guardarCarrito(theme.publicCartKey, siguiente);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `qty <= 0` quita la línea — la misma regla que el checkout del vendedor.
  const cambiarQty = useCallback((productId: string, qty: number) => {
    guardar(
      qty <= 0
        ? cart.filter((i) => i.product_id !== productId)
        : cart.map((i) => (i.product_id === productId ? { ...i, quantity: qty } : i)),
    );
  }, [cart, guardar]);

  // La barra pide `(productId, qty, product)`; acá el producto ya está en la
  // línea, así que se ignora. Un solo camino para cambiar cantidades.
  const cambiarQtyBarra = useCallback(
    (productId: string, qty: number, _product: CatalogoProducto) => cambiarQty(productId, qty),
    [cambiarQty],
  );

  const lineas: LineaEnPantalla[] = useMemo(
    // Sin `fallbackCategory`: el total grande de abajo sale de
    // `resumirDesdeItems` con estas MISMAS opciones, así que las líneas suman
    // exactamente lo que dice el total. Una sola forma de multiplicar por
    // pantalla (lib/catalogo/lineas-pedido).
    () => resolverLineas(cart, { bultoSize: theme.bulto }).map((l) => ({
      product_id: l.product_id,
      sku: l.sku,
      name: l.name,
      image_url: l.image_url,
      quantity: l.bultos,
      unit_price: l.unit_price,
      bulto: l.bulto_pzas,
      piezas: l.piezas,
      subtotal: l.subtotal,
      is_preorder: l.is_preorder,
    })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart],
  );

  const resumen = resumirDesdeItems(cart, { bultoSize: theme.bulto });
  const cartCount = resumen.bultos;
  const fmt = precioTexto;

  async function confirmar() {
    if (cart.length === 0 || enviando) return;
    // Cinturón: la barra ya bloquea el botón y escribe el motivo, pero el
    // nombre puede llegar sucio desde localStorage.
    const nombre = validarNombreCliente(clientName);
    if (!nombre.ok) { setToast(nombre.error); return; }

    setEnviando(true);
    try {
      let shortId = pendingShortId;
      if (!shortId) {
        const res = await fetch(`${theme.api}/pedido-publico`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: cart, cliente_nombre: nombre.nombre }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.short_id) {
          setToast((data?.error as string) || "No pudimos guardar tu pedido. Intenta de nuevo en unos segundos.");
          return;
        }
        shortId = data.short_id as string;
        setPendingShortId(shortId);
      }

      const conf = await fetch(`${theme.api}/pedido-publico/${shortId}/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const confData = await conf.json().catch(() => null);
      if (!conf.ok || !confData?.numero) {
        setToast((confData?.error as string) || "No se pudo confirmar el pedido. Intenta de nuevo.");
        return;
      }

      // Confirmado → vaciar carrito y abrir su página permanente del pedido.
      setCart([]);
      limpiarCarrito(theme.publicCartKey);
      window.location.href = `${theme.pedidoPublicoBase}/${shortId}`;
    } catch {
      setToast("No pudimos guardar tu pedido. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  // Con el carrito vacío la barra no existe y no se reserva nada (+16 px de
  // aire para que la última línea no quede pegada a la barra).
  const reservaAbajo = cartCount > 0 && altoBarra > 0 ? altoBarra + 16 : 0;

  if (!cargado) return null;

  return (
    <div className={theme.grid.pageBg}>
      <div className="mx-auto w-full max-w-3xl px-4 py-6" style={{ paddingBottom: reservaAbajo || undefined }}>
        <CatalogoHeader marca={marca} variant="public" />

        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Revisa tu pedido</h1>
            <p className="text-sm text-gray-500">{theme.label}</p>
          </div>
          {/* La salida está SIEMPRE a la vista: agregar más no cuesta perder lo
              que ya lleva. */}
          <Link href={hrefCatalogo} className="text-sm text-gray-500 hover:text-black transition">
            ← Seguir viendo
          </Link>
        </div>

        {cart.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-10 text-center">
            <p className="text-sm text-gray-500">Todavía no agregaste nada.</p>
            <Link href={hrefCatalogo} className="mt-3 inline-block bg-black text-white text-sm px-4 py-2.5 min-h-[44px] rounded-md hover:bg-gray-800 transition">
              Ver el catálogo
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <LineasPedidoEditables lineas={lineas} onQty={cambiarQty} />

            <section className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="text-xs uppercase tracking-[0.05em] text-gray-400">Total del pedido</div>
              <div className="text-2xl font-semibold tabular-nums">${fmt(resumen.total)}</div>
              <div className="text-xs text-gray-400 tabular-nums">
                {resumen.referencias} producto{resumen.referencias === 1 ? "" : "s"} · {resumen.bultos} bulto{resumen.bultos === 1 ? "" : "s"} · {resumen.piezas} piezas
              </div>
            </section>

            <Link
              href={hrefCatalogo}
              className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 min-h-[44px] text-center text-sm font-medium text-gray-700 hover:border-gray-400 transition"
            >
              Agregar más productos
            </Link>
          </div>
        )}

        <Toast message={toast} type="error" onDismiss={() => setToast(null)} />

        {/* La MISMA barra del catálogo: el nombre obligatorio, el aviso de
            «no cierres esta pantalla» y el botón de confirmar ya viven ahí. */}
        <CatalogoStickyCartBar
          marca={marca}
          cart={cart}
          cartCount={cartCount}
          cartTotal={resumen.total}
          onQtyChange={cambiarQtyBarra}
          onClearCart={() => { guardar([]); router.push(hrefCatalogo); }}
          variant="public"
          onSubmitOrder={() => { void confirmar(); }}
          clientName={clientName}
          onClientNameChange={setClientName}
          saving={enviando}
          actionLabel={enviando ? theme.publico.confirmingLabel : undefined}
          onAltoChange={setAltoBarra}
          formatTotal={fmt}
        />
      </div>
    </div>
  );
}
