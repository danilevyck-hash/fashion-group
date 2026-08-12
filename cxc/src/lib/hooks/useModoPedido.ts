"use client";

// El catálogo, "agregando a ESTE pedido" — la parte con red del modo (el
// contrato puro vive en `lib/catalogo/modo-pedido.ts`).
//
// Cada cambio de cantidad en una tarjeta escribe en el pedido con el MISMO
// endpoint que ya existía (`PATCH /orders/[id]/item`), que respeta el candado
// post-envío a Switch (409). NUNCA se toca el carrito: en modo pedido el
// carrito ni se lee ni se escribe, así que lo que el vendedor tuviera armado
// aparte queda intacto y no se mezcla con el pedido.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MarcaTheme } from "@/lib/catalogo/marcas-ui";
import type { CatalogoProducto } from "@/components/catalogo/types";
import {
  envioBloquea, hrefPedidoDetalle, mapaEnPedido, puedeAgregarAlPedido,
} from "@/lib/catalogo/modo-pedido";

export type EstadoModoPedido = "cargando" | "listo" | "bloqueado" | "error";

export const AVISO_BLOQUEADO = "Este pedido ya está en Switch — no se le pueden agregar productos.";
export const AVISO_SIN_PEDIDO = "No se pudo abrir el pedido. Vuelve al pedido e intenta de nuevo.";

interface Linea { quantity: number; unit_price: number }

export interface ModoPedido {
  /** El catálogo está en modo pedido (la URL lo pide y el rol puede editar). */
  activo: boolean;
  estado: EstadoModoPedido;
  pedido: { id: string; order_number: string; client_name: string } | null;
  /** product_id → bultos en el pedido (lo que las tarjetas muestran). */
  enPedido: Map<string, number>;
  totalBultos: number;
  /** A dónde vuelve "Listo, volver al pedido". */
  hrefVolver: string;
  setQty: (productId: string, qty: number, product: CatalogoProducto) => void;
}

const MODO_APAGADO: ModoPedido = {
  activo: false,
  estado: "listo",
  pedido: null,
  enPedido: new Map(),
  totalBultos: 0,
  hrefVolver: "",
  setQty: () => {},
};

export function useModoPedido({
  marca, theme, role, orderId, onAviso,
}: {
  marca: string;
  theme: MarcaTheme;
  role: string;
  orderId: string | null;
  onAviso: (mensaje: string) => void;
}): ModoPedido {
  const activo = !!orderId && puedeAgregarAlPedido(role);
  const [estado, setEstado] = useState<EstadoModoPedido>("cargando");
  const [pedido, setPedido] = useState<{ id: string; order_number: string; client_name: string } | null>(null);
  const [lineas, setLineas] = useState<Map<string, Linea>>(new Map());

  // Última cantidad DESEADA por producto + una cola por producto: dos toques
  // seguidos en "+" no pueden cruzarse y dejar el pedido en la cantidad vieja.
  const deseado = useRef(new Map<string, Linea>());
  const colas = useRef(new Map<string, Promise<void>>());
  const estadoRef = useRef<EstadoModoPedido>("cargando");
  const avisoRef = useRef(onAviso);
  useEffect(() => { avisoRef.current = onAviso; }, [onAviso]);
  useEffect(() => { estadoRef.current = estado; }, [estado]);

  // ── Cargar el pedido (líneas + estado del envío a Switch) ──
  useEffect(() => {
    if (!activo || !orderId) return;
    let vivo = true;
    setEstado("cargando");
    (async () => {
      try {
        const [rPedido, rEnvio] = await Promise.all([
          fetch(`${theme.api}/orders/${orderId}`, { cache: "no-store" }),
          fetch(`${theme.api}/orders/${orderId}/enviar-switch`, { cache: "no-store" }).catch(() => null),
        ]);
        if (!vivo) return;
        if (!rPedido.ok) { setEstado("error"); return; }
        const d = await rPedido.json();
        const items = (d[theme.itemsField] as { product_id: string; quantity?: number; unit_price?: number }[]) || [];
        const m = new Map<string, Linea>();
        for (const i of items) {
          if (!i?.product_id) continue;
          m.set(i.product_id, { quantity: Number(i.quantity) || 0, unit_price: Number(i.unit_price) || 0 });
        }
        if (!vivo) return;
        setLineas(m);
        deseado.current = new Map(m);
        setPedido({ id: orderId, order_number: d.order_number || "", client_name: d.client_name || "" });
        // El pedido ya en Switch se dice ANTES de tocar nada: enterarse recién
        // al primer 409 sería descubrirlo después de intentar.
        let envioActivo = false;
        if (rEnvio && rEnvio.ok) {
          try {
            const ed = await rEnvio.json();
            envioActivo = envioBloquea(ed?.envio?.estado);
          } catch { /* sin dato de envío: el 409 del PATCH sigue siendo el candado */ }
        }
        if (!vivo) return;
        setEstado(envioActivo ? "bloqueado" : "listo");
      } catch {
        if (vivo) setEstado("error");
      }
    })();
    return () => { vivo = false; };
  }, [activo, orderId, theme.api, theme.itemsField]);

  const enPedido = useMemo(() => {
    const m = new Map<string, number>();
    lineas.forEach((l, id) => { if (l.quantity > 0) m.set(id, l.quantity); });
    return m;
  }, [lineas]);

  const totalBultos = useMemo(() => {
    let t = 0;
    enPedido.forEach((q) => { t += q; });
    return t;
  }, [enPedido]);

  const setQty = useCallback((productId: string, qty: number, product: CatalogoProducto) => {
    if (!activo || !orderId) return;
    if (estadoRef.current === "bloqueado") { avisoRef.current(AVISO_BLOQUEADO); return; }
    if (estadoRef.current === "error") { avisoRef.current(AVISO_SIN_PEDIDO); return; }
    const cantidad = Math.max(0, Math.floor(qty));
    const previa = deseado.current.get(productId);
    // Precio: si la línea ya existe se respeta el suyo (pudo editarse a mano en
    // el pedido); línea nueva sale con el precio del catálogo.
    const unitPrice = previa && previa.quantity > 0 ? previa.unit_price : Number(product.price) || 0;
    const anterior = new Map(deseado.current);
    deseado.current.set(productId, { quantity: cantidad, unit_price: unitPrice });
    setLineas(new Map(deseado.current));

    const tarea = async () => {
      const objetivo = deseado.current.get(productId);
      if (!objetivo) return;
      try {
        const res = await fetch(`${theme.api}/orders/${orderId}/item`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: productId,
            sku: product.sku || "",
            name: product.name,
            image_url: product.image_url || "",
            quantity: objetivo.quantity,
            unit_price: objetivo.unit_price,
            ...(theme.features.preorder ? { is_preorder: product.badge === "proximamente" } : {}),
          }),
        });
        if (res.status === 409) {
          deseado.current = anterior;
          setLineas(new Map(anterior));
          estadoRef.current = "bloqueado";
          setEstado("bloqueado");
          avisoRef.current(AVISO_BLOQUEADO);
          return;
        }
        if (!res.ok) throw new Error("patch fallo");
      } catch {
        deseado.current = anterior;
        setLineas(new Map(anterior));
        avisoRef.current("No se pudo agregar al pedido. Revisa tu conexión e intenta de nuevo.");
      }
    };

    const cola = colas.current.get(productId) ?? Promise.resolve();
    colas.current.set(productId, cola.then(tarea, tarea));
  }, [activo, orderId, theme.api, theme.features.preorder]);

  const hrefVolver = orderId ? hrefPedidoDetalle(marca, orderId) : "";

  if (!activo) return MODO_APAGADO;
  return { activo, estado, pedido, enPedido, totalBultos, hrefVolver, setQty };
}
