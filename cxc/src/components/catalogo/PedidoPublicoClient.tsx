"use client";

// Página PERMANENTE del pedido público /pedido-<marca>/[short_id] (link del
// cliente) — componente único para todas las marcas, parametrizado por
// MARCA_THEME. Las secciones Pedido/Pre-orden son feature (preorder, Reebok).
//
// CERO colores de marca hardcodeados: TODO sale de theme.pedidoPublico. Hasta
// jul-2026 el navy de Reebok (#1A2656) estaba escrito a mano 16 veces acá, así
// que el link de Joybees y el de Tommy le mostraban al cliente los colores de
// Reebok. Si agregás un color nuevo, va al tema — no acá.

import { useEffect, useRef, useState } from "react";
import { resolverLineas } from "@/lib/catalogo/lineas-pedido";
import { useParams } from "next/navigation";
import Image from "next/image";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { buildPedidoWhatsappUrl, WHATSAPP_CONTACTOS } from "@/lib/catalogo/whatsapp-msg";
import { formatBultosPiezas } from "@/lib/catalogo/piezas";
import type { StockLinea } from "./types";
import { precioTexto } from "@/lib/catalogo/precio";

interface OrderItem {
  product_id: string;
  sku: string;
  name: string;
  image_url: string;
  quantity: number;
  unit_price: number;
  category?: string;
  is_preorder?: boolean;
  /** Tommy: piezas por bulto congeladas al confirmar el pedido. Vacío = 12. */
  bulto_pzas?: number | null;
}

interface Order {
  id: number;
  short_id: string;
  items: OrderItem[];
  total: number;
  created_at: string;
  cliente_nombre: string | null;
  convertida?: boolean;
  ped_order_number?: string | null;
  estado_cliente?: "Confirmado" | "En proceso" | null;
  confirmado_cliente_at?: string | null;
  /** Foto del stock en el momento de confirmar (null si aún no se confirmó o
   *  la DDL 20260725130000 no corrió). Es la cantidad REAL del momento, no la
   *  de hoy: por eso se guarda con el pedido y no se recalcula. */
  stock_confirmacion?: StockLinea[] | null;
}

// Precio de catálogo: sin `.00` y sin redondear (`35`, `12.50`, `4,422`).
const fmtMoney = precioTexto;

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
}

export default function PedidoPublicoClient({ marca }: { marca: MarcaUiKey }) {
  const theme = getMarcaTheme(marca)!;
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  // Dos fallas MUY distintas: el link no existe (404) vs. no hubo red. Antes
  // las dos caían en la misma pantalla "Pedido no encontrado · Este enlace
  // puede haber expirado" — o sea que a quien se le cayó el 4G se le decía que
  // su pedido no existe. `error` incluso se calculaba y no se mostraba nunca.
  const [error, setError] = useState<"no-existe" | "sin-red" | null>(null);
  const [reintento, setReintento] = useState(0);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  // Barra de progreso del guardado. Medido: ~5 s entre crear el pedido y
  // verificar el envío a Switch, así que el cliente se queda mirando una
  // pantalla que antes no decía nada y podía cerrarla (Daniel, 25-jul-2026).
  const [progreso, setProgreso] = useState(0);
  // Candado de doble toque: `confirming` es estado y no se ve hasta el
  // siguiente render — dos taps rápidos entrarían los dos. El ref sí.
  const confirmandoRef = useRef(false);

  // Mientras se guarda, el navegador pregunta antes de cerrar la pestaña.
  useEffect(() => {
    if (!confirming) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [confirming]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${theme.api}/pedido-publico/${id}`);
        if (!res.ok) {
          // 5xx = el servidor tuvo un problema, el pedido puede existir
          // perfectamente: no se le dice al cliente que su link está vencido.
          setError(res.status >= 500 ? "sin-red" : "no-existe");
          return;
        }
        const data = await res.json();
        setOrder(data);
      } catch {
        setError("sin-red");
      } finally {
        setLoading(false);
      }
    }
    if (id) load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reintento]);

  async function handleDownloadPdf() {
    if (!order || generatingPdf) return;
    setGeneratingPdf(true);
    setPdfError(false);
    try {
      // Lib única de PDF de pedido (mismo layout que el flujo interno).
      const { downloadCatalogoOrderPdf } = await import("@/lib/catalogo/order-pdf-client");
      await downloadCatalogoOrderPdf({
        marca,
        orderNumber: order.ped_order_number || order.short_id || "PEDIDO",
        clientName: order.cliente_nombre || "Sin nombre",
        createdAt: order.created_at,
        items: order.items.map((i) => ({
          sku: i.sku || "", name: i.name, quantity: i.quantity, unit_price: Number(i.unit_price),
          image_url: i.image_url || "",
          ...(theme.features.preorder ? { is_preorder: i.is_preorder === true } : {}),
          category: i.category || "footwear",
        })),
        bultoSize: (c, bultoPzas) => theme.bulto(c || "footwear", bultoPzas),
        filename: `Pedido-${theme.label}-${new Date().toISOString().slice(0, 10)}.pdf`,
      });
    } catch {
      // Antes esto era un `silent fail`: el botón volvía a decir "Descargar
      // PDF" y no pasaba NADA. El cliente lo tocaba una y otra vez sin saber
      // que había fallado.
      setPdfError(true);
    } finally {
      setGeneratingPdf(false);
    }
  }

  // Confirmar el pedido: entra DIRECTO al proceso (se convierte en pedido
  // interno numerado y sale a Switch). Ya no hay paso intermedio de "stock
  // corto": si algún producto tiene menos piezas, el pedido igual entra y la
  // respuesta trae la cantidad REAL disponible del momento, que se muestra en
  // cada línea (misma foto que ve la secretaria en el admin).
  async function handleConfirm() {
    if (!order || confirmandoRef.current) return;
    confirmandoRef.current = true;
    setConfirming(true);
    setConfirmError(null);
    // Arranca visible y avanza hacia 92% durante la espera: nunca miente
    // llegando a 100 antes de que el servidor conteste.
    setProgreso(8);
    const arranque = setTimeout(() => setProgreso(92), 60);
    try {
      const res = await fetch(`${theme.api}/pedido-publico/${order.short_id}/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.numero) {
        setProgreso(0);
        setConfirmError(
          (data?.error as string) || "No se pudo confirmar el pedido. Intenta de nuevo en unos segundos.",
        );
        return;
      }
      setProgreso(100);
      const stock = Array.isArray(data.stock) ? (data.stock as StockLinea[]) : null;
      setOrder({
        ...order,
        convertida: true,
        ped_order_number: data.numero as string,
        estado_cliente: "Confirmado",
        stock_confirmacion: stock?.length ? stock : order.stock_confirmacion ?? null,
      });
    } catch {
      setProgreso(0);
      setConfirmError("No se pudo confirmar el pedido. Revisa tu conexión e intenta de nuevo.");
    } finally {
      clearTimeout(arranque);
      confirmandoRef.current = false;
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className={`${theme.pedidoPublico.pageBg} flex items-center justify-center`}>
        <div className={theme.pedidoPublico.spinner} />
      </div>
    );
  }

  if (error || !order) {
    const sinRed = error === "sin-red";
    return (
      <div className={`${theme.pedidoPublico.pageBg} flex items-center justify-center p-4`}>
        <div className="bg-white rounded-xl p-8 text-center max-w-sm w-full" role="alert">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className={`${theme.pedidoPublico.textStrong} font-semibold text-lg mb-1`}>
            {sinRed ? "No pudimos abrir tu pedido" : "Pedido no encontrado"}
          </p>
          <p className={`${theme.pedidoPublico.textSoft} text-sm`}>
            {sinRed
              ? "Revisa tu conexión a internet y vuelve a intentar. Tu pedido no se perdió."
              : "Este enlace puede haber expirado o ser incorrecto."}
          </p>
          {sinRed && (
            <button
              onClick={() => setReintento((n) => n + 1)}
              className={`${theme.pedidoPublico.confirmBtn} mt-5`}
            >
              Reintentar
            </button>
          )}
        </div>
      </div>
    );
  }

  const confirmado = !!order.convertida && !!order.ped_order_number;
  // Foto del stock al confirmar, por producto. Solo interesa cuando hay MENOS
  // piezas de las pedidas: es lo que hay que decirle al cliente de frente.
  const stockPorProducto = new Map<string, StockLinea>(
    (order.stock_confirmacion || []).map((l) => [l.product_id, l]),
  );
  const lineasCortas = (order.stock_confirmacion || []).filter(
    (l) => l.disponible_pzas < l.pedido_pzas,
  );
  const estadoLabel = order.estado_cliente || "Confirmado";
  const totalBultos = order.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const totalPedido = theme.calcTotal(order.items);
  // El mensaje es UNO solo; lo que elige el cliente es a QUIÉN se lo manda.
  const whatsappInfo = {
    marca: theme.label,
    clienteNombre: order.cliente_nombre || "cliente",
    numero: order.ped_order_number || "",
    itemCount: order.items.length,
    bultos: totalBultos,
    total: totalPedido,
    link: `https://www.fashiongr.com${theme.pedidoPublicoBase}/${order.short_id}`,
  };

  const renderItem = (item: OrderItem, idx: number) => {
    const l = resolverLineas([item], { bultoSize: theme.bulto, fallbackCategory: "footwear" })[0];
    const bs = l.bulto_pzas;
    const lineTotal = l.subtotal;
    const stock = stockPorProducto.get(item.product_id);
    const corto = !!stock && stock.disponible_pzas < stock.pedido_pzas;
    return (
      <div key={idx} className="flex items-center gap-3 px-4 py-3">
        <div className={theme.pedidoPublico.itemImageBg}>
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
            <div className={`w-full h-full flex items-center justify-center ${theme.pedidoPublico.placeholderIcon}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${theme.pedidoPublico.textStrong} truncate`}>{item.name}</p>
          {/* truncate: sin esto el código se metía debajo de la línea de
              bultos en pantalla de teléfono y se leían encimados. */}
          <p className={`text-xs ${theme.pedidoPublico.textSoft} mt-0.5 truncate`}>{item.sku}</p>
          {corto && stock && (
            <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
              Disponible ahora: {formatBultosPiezas(stock.disponible_pzas, stock.bulto_pzas || bs)}
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-base font-semibold ${theme.pedidoPublico.textStrong} tabular-nums`}>
            ${fmtMoney(item.unit_price)}<span className={`text-xs font-normal ${theme.pedidoPublico.textSoft}`}> c/u</span>
          </p>
          <p className={`text-xs ${theme.pedidoPublico.textSoft} tabular-nums`}>
            {item.quantity} bulto{item.quantity !== 1 ? "s" : ""} ({l.piezas} pzas) · ${fmtMoney(lineTotal)}
          </p>
        </div>
      </div>
    );
  };

  const regular = theme.features.preorder ? order.items.filter((i) => !i.is_preorder) : order.items;
  const preorders = theme.features.preorder ? order.items.filter((i) => i.is_preorder) : [];
  const hasPreorders = preorders.length > 0;

  const sectionHeader = (label: string, color: string) => (
    <div className={`px-4 py-2 ${color} text-white text-xs font-bold uppercase tracking-wide`}>
      {label}
    </div>
  );

  return (
    <div className={theme.pedidoPublico.pageBg}>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        {/* `flex-wrap` + hijos `shrink-0`: el logo NUNCA se aplasta. El de
            Tommy es un wordmark ancho (relación 14:1) y en pantalla de
            teléfono no cabe al lado del número de pedido — antes flexbox lo
            comprimía a la mitad y deformaba las letras. Ahora baja de línea.
            Reebok y Joybees, cuyos logos sí caben, no se mueven. */}
        <div className={`${theme.pedidoPublico.headerBg} rounded-t-xl px-6 py-5 flex flex-wrap items-center justify-between gap-3`}>
          {theme.logos.pedidoPublico()}
          <div className="text-right shrink-0 grow">
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
        <div className={`bg-white border-x ${theme.pedidoPublico.panelBorder}`}>
          <div className="divide-y divide-gray-100">
            {hasPreorders && regular.length > 0 && sectionHeader("Pedido", theme.pedidoPublico.sectionBg)}
            {regular.map(renderItem)}
            {hasPreorders && (
              <>
                {sectionHeader("Pre-orden", "bg-amber-500")}
                {preorders.map(renderItem)}
              </>
            )}
          </div>
        </div>

        {/* Total */}
        <div className={`${theme.pedidoPublico.headerBg} rounded-b-xl px-6 py-4 flex items-center justify-between`}>
          <span className="text-white/70 text-sm font-medium">Total</span>
          <span className={theme.pedidoPublico.totalValue}>
            ${fmtMoney(totalPedido)}
          </span>
        </div>

        {/* Confirmar / Confirmado */}
        {!confirmado && (
          <div className="mt-6 bg-white rounded-xl p-5 text-center">
            <button
              onClick={() => handleConfirm()}
              disabled={confirming}
              aria-busy={confirming}
              className={theme.pedidoPublico.confirmBtn}
            >
              {confirming ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Guardando...
                </span>
              ) : (
                "Confirmar pedido"
              )}
            </button>

            {/* Mientras guarda: el cliente tiene que saber que NO cierre la
                pantalla. Son ~5 s reales — al confirmar también sale el pedido
                a Switch — así que el silencio de antes lo invitaba a cerrar. */}
            {confirming ? (
              <div className="mt-3" role="status" aria-live="assertive">
                <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-[6000ms] ease-out"
                    style={{ width: `${progreso}%` }}
                  />
                </div>
                <p className="text-sm font-bold text-emerald-700 mt-2">
                  Guardando tu pedido, no cierres esta pantalla
                </p>
                <p className={`text-xs ${theme.pedidoPublico.textHelp} mt-0.5`}>
                  Puede tardar unos segundos.
                </p>
              </div>
            ) : (
              <p className={`text-xs ${theme.pedidoPublico.textHelp} mt-2.5`}>
                Al confirmar, tu pedido entra a proceso con Fashion Group.
              </p>
            )}
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
            <p className="sr-only" id="wa-ayuda">
              Toca a la persona a la que le quieres escribir por WhatsApp.
            </p>
            {lineasCortas.length > 0 && (
              <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-left">
                <p className="text-xs font-semibold text-amber-900">
                  Ojo: hay {lineasCortas.length} producto{lineasCortas.length === 1 ? "" : "s"} con
                  menos piezas de las que pediste
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {lineasCortas.map((l) => (
                    <li key={l.product_id} className="text-xs text-amber-800 tabular-nums">
                      <span className="font-medium">{l.sku || l.name}</span> — pediste{" "}
                      {formatBultosPiezas(l.pedido_pzas, l.bulto_pzas || 12)}, hay{" "}
                      {formatBultosPiezas(l.disponible_pzas, l.bulto_pzas || 12)}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-xs text-amber-700">
                  Te contactamos por la diferencia.
                </p>
              </div>
            )}
            {/* El cliente elige a quién le avisa: las dos personas, con nombre
                y número visibles, para que sepa a quién le está escribiendo. */}
            <p className="text-xs font-semibold text-emerald-900 mb-2">¿A quién le avisas?</p>
            <div className="flex flex-col gap-2">
              {WHATSAPP_CONTACTOS.map((c) => (
                <a
                  key={c.telefono}
                  href={buildPedidoWhatsappUrl(whatsappInfo, c.telefono)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-describedby="wa-ayuda"
                  className="flex items-center justify-between gap-3 w-full bg-[#25D366] text-white rounded-xl min-h-[52px] px-4 py-2.5 active:scale-[0.98] transition"
                >
                  <span className="flex items-center gap-2">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    <span className="text-sm font-bold">Escribirle a {c.nombre}</span>
                  </span>
                  <span className="text-xs font-medium text-white/85 tabular-nums whitespace-nowrap">
                    {c.telefonoLabel}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Download PDF button */}
        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            onClick={handleDownloadPdf}
            disabled={generatingPdf}
            className={theme.pedidoPublico.pdfBtn}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {generatingPdf ? "Generando..." : "Descargar PDF"}
          </button>
          {pdfError && (
            <p role="alert" className="text-xs text-red-600 text-center">
              No se pudo generar el PDF. Intenta de nuevo en unos segundos.
            </p>
          )}
        </div>

        {/* Footer */}
        <p className={`text-center ${theme.pedidoPublico.textFaint} text-xs mt-8`}>fashiongr.com</p>
      </div>
    </div>
  );
}
