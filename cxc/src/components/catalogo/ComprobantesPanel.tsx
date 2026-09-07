"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL PANEL DE COMPROBANTES — UNO SOLO, PARA LOS TRES ROLES (25-ago-2026)
//
// Daniel, textual: *"En pedidos de los catálogos. En administrar y pedidos
// debería ser la misma pestaña, no dos aparte."*
//
// 🩸 `puedeAdministrar` NO ES EL CANDADO. Es cosmética: esconde botones que de
// todos modos mueren en 403 en el SERVIDOR (borrar y borrado masivo →
// `DELETE_ROLES`; exportar → `pedidos-export`). Esconderlos es para que no se
// ofrezca lo que no se puede, no para impedirlo.
//
// Y BODEGA ENTRÓ — SOLO A MIRAR (25-ago-2026). Daniel: ***"Dale acceso a bodega
// a la lista de pedidos."*** Hacen falta DOS gates: con `puedeEditar` en false
// la fila dice «Ver», no hay «Duplicar» ni «Reenviar el correo», y todo abre en
// SOLO LECTURA. Tampoco es el candado: el 403 lo pone el servidor.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL REDISEÑO DE LA LISTA (6-sep-2026) — siete cambios aprobados uno por uno
//
// 1. **Los dos filtros con el MISMO aspecto** (`chips-comprobantes.ts`): dos
//    grupos de píldoras con su rótulo chico, y **lo que está en cero no
//    aparece**. Antes uno era una barra de pestañas subrayadas y el otro
//    píldoras — dos aspectos para dos preguntas del mismo rango.
// 2. **«Del cliente» y «Del vendedor»** en vez de «Del link» y «Míos». Daniel:
//    *«no me gusta la palabra del link y míos, no suena profesional»*. Se
//    verificó primero QUÉ filtra cada uno: «Míos» no era del usuario que entró
//    sino de la casa entera (ver `origen-comprobante.ts`).
// 3. **El PDF sale a la fila y las acciones se van al «···»** — con «Eliminar»
//    adentro, que era el botón más a la vista. Ver `AccionesComprobante.tsx`.
// 4. **Los que no llegaron a Switch se notan**: chip «Sin mandar» y la frase de
//    la fila en rojo con los días (`sin-mandar.ts`).
// 5. **El pedido del link que nadie confirmó se va a los 30 días** detrás del
//    «Ver más» que ya existía (`comprobantes-ventana.ts`). Nada se borra.
// 6. **La lista abre en el mes que TIENE comprobantes** (`mes-comprobantes.ts`)
//    y el encabezado dice «Julio de 2026», no «Julio De 2026».
// 7. **Los conteos cuentan lo que se está mirando**, no todo el listado.
// 8. **Ficha en vez de tabla por debajo de 1024 px** (`FilaComprobante.tsx`):
//    en el iPad las acciones quedaban fuera de la pantalla.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal, ConfirmDeleteModal } from "@/components/ui";
import BulkDeletePedidosModal from "@/components/catalogo/BulkDeletePedidosModal";
import DuplicarPedidoModal from "@/components/catalogo/DuplicarPedidoModal";
import ReenviarCorreoModal from "@/components/catalogo/comprobantes/ReenviarCorreoModal";
import FiltrosComprobantes from "@/components/catalogo/comprobantes/FiltrosComprobantes";
import { FichaFila, FilaTabla, datosNumeros, type PropsFila } from "@/components/catalogo/comprobantes/FilaComprobante";
import type { ClienteSwitchOpcion } from "@/components/catalogo/ClienteSwitchPicker";
import { filasDeOrders, type FilaComprobante, type FilaDeOrders } from "@/lib/catalogo/fila-comprobante";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { precioTexto } from "@/lib/catalogo/precio";
import { partirPorVentana } from "@/lib/catalogo/comprobantes-ventana";
import { agruparPorMes, mesQueAbre } from "@/lib/catalogo/mes-comprobantes";
import { hoyPanama } from "@/lib/fecha-panama";
import {
  gruposDeChips,
  pasaLosDosFiltros,
  type VistaComprobante,
} from "@/lib/catalogo/chips-comprobantes";
import { pasaFiltroOrigen, type FiltroOrigen } from "@/lib/catalogo/origen-comprobante";
import {
  FILTRO_COMPROBANTE_DEFAULT,
  textoBuscablePedido,
  VACIO_NINGUNO_COINCIDE,
  VACIO_SIN_COMPROBANTES,
} from "@/lib/catalogo/numeros-pedido";

// La fila que se pinta. Su forma vive en `lib/catalogo/fila-comprobante.ts`.
export type { FilaComprobante, FilaDeOrders };
export { filasDeOrders };
/** Nombre viejo del tipo, mientras quedan candados que lo importan así. */
export type UnifiedPedido = FilaComprobante;

// Precio de catálogo: sin `.00` y sin redondear (`35`, `12.50`, `4,422`).
const fmtMoney = precioTexto;

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
}

// La tabla física manda sobre la etiqueta: una pública convertida vive en
// <marca>_orders aunque se muestre como "Del cliente".
function esFilaOrders(p: FilaComprobante): boolean {
  return p.fuente ? p.fuente === "orders" : p.origen === "mio";
}

// Header de mes colapsable (patrón TimeGroupHeader). Controlado por el padre:
// la selección masiva necesita saber qué meses están expandidos.
function MesGroup({
  label,
  count,
  open,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-1 py-2 text-left">
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M6 4l8 6-8 6V4z" />
        </svg>
        {/* Sin `capitalize`: esa clase de CSS ponía «Julio De 2026». El texto ya
            viene con la mayúscula donde va (`mes-comprobantes.ts`). */}
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <span className="text-xs text-gray-400 tabular-nums">
          ({count} {count === 1 ? "comprobante" : "comprobantes"})
        </span>
      </button>
      {open && children}
    </div>
  );
}

export default function ComprobantesPanel({
  marca,
  pedidos,
  onRefresh,
  showToast,
  puedeAdministrar,
  puedeEditar,
}: {
  marca: MarcaUiKey;
  pedidos: FilaComprobante[];
  onRefresh: () => Promise<void>;
  showToast: (msg: string, tono?: "error" | "success") => void;
  /** admin o secretaria. Esconde borrar/borrado masivo/exportar. NO es el
   *  candado: el servidor ya responde 403 a los demás (ver la cabecera). */
  puedeAdministrar: boolean;
  /** admin, secretaria o vendedor (`COMPROBANTES_EDITAR_ROLES`). Con `false`
   *  —hoy solo **bodega**— la fila dice «Ver», no se ofrece «Duplicar» ni
   *  «Reenviar el correo», y todo abre en SOLO LECTURA. Tampoco es el candado. */
  puedeEditar: boolean;
}) {
  const theme = getMarcaTheme(marca)!;
  const router = useRouter();
  const [origenFilter, setOrigenFilter] = useState<FiltroOrigen>("todos");
  // 🔴 Qué es cada fila: Pedidos · Cotizaciones · Borradores · Sin mandar. NO
  // hay «Todos» (Daniel lo pidió fuera), así que el filtro SIEMPRE está puesto
  // y abre en «Pedidos», que es lo que más se mira.
  const [vista, setVista] = useState<VistaComprobante>(FILTRO_COMPROBANTE_DEFAULT);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<FilaComprobante | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);
  // Selección masiva. Lo que cuenta es la intersección con las filas VISIBLES.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openMeses, setOpenMeses] = useState<Record<string, boolean>>({});
  const [bulkOpen, setBulkOpen] = useState(false);
  // «Ver más»: la lista arranca en la ventana. Ver `comprobantes-ventana.ts`.
  const [verTodo, setVerTodo] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [dupTarget, setDupTarget] = useState<FilaComprobante | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [dupError, setDupError] = useState<string | null>(null);
  // Reenviar el correo desde la fila.
  const [correoTarget, setCorreoTarget] = useState<FilaComprobante | null>(null);
  const [correoInicial, setCorreoInicial] = useState("");
  const [correoBuscando, setCorreoBuscando] = useState(false);
  const [correoEnviando, setCorreoEnviando] = useState(false);
  const [correoError, setCorreoError] = useState<string | null>(null);

  // El «hoy» de PANAMÁ: los días que dice la fila no pueden depender de la hora
  // del navegador (el mismo pedido diría 64 o 65 según a qué hora se mire).
  const hoy = hoyPanama();

  // "Editar del link": convierte la pública en <marca>_orders (idempotente) y
  // redirige a la maquinaria de edición existente.
  async function handleEditLink(p: FilaComprobante) {
    if (converting) return;
    setConverting(p.id_natural);
    try {
      const res = await fetch(`${theme.api}/pedidos-publicos/${p.id_natural}/convertir`, { method: "POST" });
      if (!res.ok) throw new Error("convert failed");
      const data = await res.json();
      if (!data?.order_id) throw new Error("sin order_id");
      router.push(`/catalogo/${marca}/pedido/${data.order_id}`);
    } catch {
      showToast("No se pudo abrir el pedido para editar. Intenta de nuevo.");
      setConverting(null);
    }
  }

  /**
   * Duplica copiando los items del original y creando un pedido NUEVO a nombre
   * del CLIENTE DE SWITCH elegido. El VENDEDOR se hereda del original y lo
   * resuelve el SERVIDOR — de él depende la comisión.
   */
  async function duplicateOrder(pedido: FilaComprobante, clientName: string, cliente: ClienteSwitchOpcion) {
    setDuplicating(true);
    setDupError(null);
    try {
      const res = await fetch(`${theme.api}/orders/${pedido.id_natural}`);
      if (!res.ok) {
        setDupError("No se pudo leer el pedido original. Intenta de nuevo.");
        setDuplicating(false);
        return;
      }
      const full = await res.json();
      const items = (full[theme.itemsField] || []).map(
        (i: { product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number }) => ({
          product_id: i.product_id, sku: i.sku, name: i.name,
          image_url: i.image_url, quantity: i.quantity, unit_price: i.unit_price,
        }),
      );
      const createRes = await fetch(`${theme.api}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: clientName,
          vendor_name: typeof window !== "undefined" ? sessionStorage.getItem("fg_user_name") || null : null,
          items,
          cliente_switch_id: cliente.id,
          duplicar_de: pedido.id_natural,
        }),
      });
      if (!createRes.ok) {
        setDupError("No se pudo duplicar el pedido. Intenta de nuevo.");
        setDuplicating(false);
        return;
      }
      const nuevo = await createRes.json();
      setDupTarget(null);
      showToast("Pedido duplicado");
      router.push(`/catalogo/${marca}/pedido/${nuevo.id}`);
    } catch {
      setDupError("Error de conexion. Intenta de nuevo.");
    }
    setDuplicating(false);
  }

  /**
   * Abre la ventana de reenviar el correo con el correo YA ESCRITO: primero el
   * que el pedido tenga guardado; si no, el del cliente en el directorio. Nada
   * se manda hasta que alguien toque «Enviar».
   */
  async function abrirCorreo(p: FilaComprobante) {
    setCorreoTarget(p);
    setCorreoError(null);
    setCorreoInicial((p.client_email ?? "").trim());
    if ((p.client_email ?? "").trim()) return;
    setCorreoBuscando(true);
    try {
      const r = await fetch(`${theme.api}/clientes-switch?orderId=${p.id_natural}`);
      if (r.ok) {
        const d = await r.json();
        if (d?.correo) setCorreoInicial(String(d.correo));
      }
    } catch {
      /* sin correo del directorio se teclea a mano, como siempre */
    }
    setCorreoBuscando(false);
  }

  async function enviarCorreo(correo: string) {
    if (!correoTarget) return;
    setCorreoEnviando(true);
    setCorreoError(null);
    try {
      const res = await fetch(`${theme.api}/send-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: correoTarget.id_natural, clientEmail: correo }),
      });
      if (!res.ok) {
        setCorreoError("No se pudo enviar. Intenta de nuevo.");
        setCorreoEnviando(false);
        return;
      }
      setCorreoTarget(null);
      showToast(`Correo enviado a ${correo}`, "success");
      await onRefresh();
    } catch {
      setCorreoError("Error de conexión. Intenta de nuevo.");
    }
    setCorreoEnviando(false);
  }

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch(`${theme.api}/pedidos-export`, { method: "POST" });
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${theme.admin.pedidos.exportFilename}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Excel listo — revisa tu carpeta de descargas");
    } catch {
      showToast("No se pudo generar el Excel. Intenta de nuevo.");
    } finally {
      setExporting(false);
    }
  }

  // ── LO QUE SE VE, EN EL ORDEN EN QUE SE DECIDE ─────────────────────────────
  //
  // 🔴 LOS CONTEOS CUENTAN LO QUE SE ESTÁ MIRANDO (4.6). Las «candidatas» son
  // las filas que pasan la BÚSQUEDA y la VENTANA, con los dos filtros todavía
  // SIN aplicar — ése es el universo sobre el que se cuentan los chips. Contar
  // sobre `pedidos` entero decía 20 donde la lista muestra 5 en cuanto la
  // ventana empezara a morder (octubre, con los pedidos de julio afuera).
  const buscadas = pedidos.filter((p) => {
    if (!search) return true;
    // Se busca por cliente Y por los DOS números: el de la casa (PED-017) o el
    // que dice el ERP (16-000000503).
    const q = search.trim().toLowerCase();
    return textoBuscablePedido({
      cliente: p.cliente,
      numeroPedido: p.numero_pedido ?? null,
      switchNumero: p.switch_numero ?? null,
    }).includes(q);
  });

  // 🔴 LA VENTANA (4-sep-2026, ampliada el 6-sep). La lista muestra los últimos
  // 90 días —y solo 30 para el pedido del link que nadie confirmó— y el resto
  // queda detrás de «Ver más», sin texto explicativo al lado (Daniel: *«no me
  // gustan tantas palabras extras»*). Nada se borra.
  const { recientes, viejos } = partirPorVentana(buscadas, new Date());
  const candidatas = verTodo ? buscadas : recientes;
  const hayMas = !verTodo && viejos.length > 0;

  const estadoFiltros = { origen: origenFilter, vista };
  const paraChips = candidatas.map((p) => ({ ...datosNumeros(p, esFilaOrders(p)), origen: p.origen, created_at: p.created_at }));
  const chips = gruposDeChips(paraChips, estadoFiltros);

  const visibles = candidatas.filter((p) =>
    pasaLosDosFiltros({ ...datosNumeros(p, esFilaOrders(p)), origen: p.origen, created_at: p.created_at }, estadoFiltros),
  );
  // ¿Hay algo que mirar con este filtro de ORIGEN puesto? Decide el vacío.
  const hayConEsteOrigen = pedidos.some((p) => pasaFiltroOrigen(p.origen, origenFilter));

  // Agrupar por mes (el feed viene por fecha desc → los grupos salen del más
  // nuevo al más viejo).
  const grupos = agruparPorMes(visibles);
  // 🔴 Abre el mes MÁS RECIENTE CON COMPROBANTES, no el del calendario: Joybees
  // no vende todos los meses y abría con tres encabezados y cero filas.
  const mesAbierto = mesQueAbre(grupos);

  function isOrdersRow(p: FilaComprobante): boolean {
    return esFilaOrders(p);
  }

  // 🩸 LA FILA Y EL BOTÓN "Editar" LLEVAN AL MISMO LADO (23-ago-2026).
  //
  // 🔴 SIN PERMISO DE EDITAR (bodega) NO SE CONVIERTE NADA. `convertir` es un
  // POST que le responde 403: la fila del link se abre en la vista PÚBLICA, que
  // es exactamente lo que esa fila es.
  function handleEdit(p: FilaComprobante) {
    if (isOrdersRow(p)) {
      router.push(`/catalogo/${marca}/pedido/${p.id_natural}`);
    } else if (puedeEditar) {
      handleEditLink(p);
    } else {
      router.push(`${theme.pedidoPublicoBase}/${p.id_natural}`);
    }
  }

  /**
   * 🩸 SE MIRA EL RESULTADO, Y SE DICE CUÁL FUE. La ventana se cierra y la
   * lista se recarga SOLO si el servidor dijo que sí.
   */
  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    // Borrado SOFT por tabla física. Ninguno toca Switch.
    const url = isOrdersRow(deleting)
      ? `${theme.api}/orders/${deleting.id_natural}`
      : `${theme.api}/pedidos-publicos/${deleting.id_natural}`;
    try {
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        setDeleteLoading(false);
        showToast("No se pudo eliminar el pedido. Intenta de nuevo.", "error");
        return;
      }
    } catch {
      setDeleteLoading(false);
      showToast("No se pudo eliminar. Revisa tu conexión e intenta de nuevo.", "error");
      return;
    }
    setDeleteLoading(false);
    setDeleting(null);
    showToast("Pedido eliminado", "success");
    await onRefresh();
  }

  const isMesOpen = (k: string) => openMeses[k] ?? k === mesAbierto;
  const rowKey = (p: FilaComprobante) => `${p.fuente ?? p.origen}-${p.id_natural}`;
  const clienteLabel = (p: FilaComprobante) =>
    p.cliente === "Sin nombre" || !p.cliente?.trim() ? "Sin nombre" : p.cliente;

  // Filas elegibles para selección masiva = las VISIBLES ahora mismo.
  const visibleRows = grupos.filter((g) => isMesOpen(g.key)).flatMap((g) => g.items);
  const selectedRows = visibleRows.filter((p) => selected.has(rowKey(p)));
  const allSelected = visibleRows.length > 0 && selectedRows.length === visibleRows.length;
  const selEnviados = selectedRows.filter((p) => !!p.switch_numero);
  const selSinEnviar = selectedRows.length - selEnviados.length;

  function toggleRow(p: FilaComprobante) {
    const k = rowKey(p);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(visibleRows.map(rowKey)));
  }

  // Eliminación masiva: soft-delete por fuente en un solo POST. NUNCA toca Switch.
  async function handleBulkDelete() {
    if (bulkLoading || selectedRows.length === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch(`${theme.api}/orders/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pedidos: selectedRows.map((p) => ({
            id: p.id_natural,
            fuente: isOrdersRow(p) ? "orders" : "publicos",
          })),
        }),
      });
      if (!res.ok) throw new Error("bulk delete failed");
      const data = await res.json();
      const n = Number(data?.eliminados) || 0;
      const f = Number(data?.fallidos) || 0;
      showToast(
        f > 0
          ? `${n} ${n === 1 ? "pedido eliminado" : "pedidos eliminados"} — ${f} no se ${f === 1 ? "pudo" : "pudieron"} eliminar`
          : `${n} ${n === 1 ? "pedido eliminado" : "pedidos eliminados"}`,
      );
      setBulkOpen(false);
      setSelected(new Set());
      await onRefresh();
    } catch {
      showToast("No se pudieron eliminar los pedidos. Intenta de nuevo.");
    } finally {
      setBulkLoading(false);
    }
  }

  const deleteMsg = deleting
    ? `¿Eliminar el pedido de ${clienteLabel(deleting) === "Sin nombre" ? "cliente sin nombre" : deleting.cliente} por $${fmtMoney(deleting.total)}? Desaparecerá de la lista. No se envía nada a Switch.`
    : "";

  const propsDeFila = (pedido: FilaComprobante): PropsFila => ({
    pedido,
    marca,
    theme,
    esOrders: isOrdersRow(pedido),
    hoy,
    puedeAdministrar,
    puedeEditar,
    seleccionado: selected.has(rowKey(pedido)),
    abriendo: converting === pedido.id_natural,
    fmtMoney,
    fmtDate,
    clienteLabel,
    onAbrir: () => handleEdit(pedido),
    onSeleccionar: () => toggleRow(pedido),
    onDuplicar: () => setDupTarget(pedido),
    onReenviarCorreo: () => abrirCorreo(pedido),
    onEliminar: () => setDeleting(pedido),
    showToast,
  });

  return (
    <div>
      {/* Acciones. «Descargar Excel» es de admin/secretaria: al vendedor el
          endpoint le responde 403 (medido). */}
      {puedeAdministrar && (
        <div className="flex justify-end mb-4">
          <button
            onClick={handleExport}
            disabled={exporting || pedidos.length === 0}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 text-sm font-medium rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 active:scale-[0.97] transition disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {exporting ? "Generando..." : "Descargar Excel"}
          </button>
        </div>
      )}

      {/* 🔴 LOS DOS FILTROS, MISMO ASPECTO, LO QUE ESTÁ EN CERO NO APARECE.
          Qué chips existen y cuánto vale cada conteo sale de
          `chips-comprobantes.ts`: escribirlo acá sería una segunda definición. */}
      <FiltrosComprobantes
        origen={chips.origen}
        vista={chips.vista}
        onOrigen={setOrigenFilter}
        onVista={setVista}
      />

      {/* Buscador por cliente o número */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cliente o número…"
          className={theme.admin.pedidos.searchFocus}
        />
      </div>

      {visibles.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">
            {/* 🩸 La vara es si el PANEL está vacío, no si hay un filtro puesto:
                el filtro por tipo SIEMPRE está puesto. */}
            {pedidos.length === 0 ? VACIO_SIN_COMPROBANTES : VACIO_NINGUNO_COINCIDE}
          </p>
          {hayMas && hayConEsteOrigen && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setVerTodo(true)}
                className="min-h-[44px] px-4 rounded-md border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 active:scale-[0.97] transition"
              >
                Ver más ({viejos.length})
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Selección masiva: "todos" = filas visibles. Todo el bloque es de
              admin/secretaria — `bulk-delete` responde 403 al vendedor. */}
          {puedeAdministrar && (
            <div className="flex items-center justify-between gap-3 mb-3 min-h-[38px]">
              <label className="inline-flex items-center gap-2 px-1 text-sm text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="w-4 h-4 accent-black cursor-pointer"
                />
                Seleccionar todos
              </label>
              {selectedRows.length > 0 && (
                <button
                  onClick={() => setBulkOpen(true)}
                  className="inline-flex items-center gap-2 min-h-[44px] px-4 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] transition"
                >
                  Eliminar seleccionados ({selectedRows.length})
                </button>
              )}
            </div>
          )}
          {grupos.map((grupo) => (
            <MesGroup
              key={grupo.key}
              label={grupo.label}
              count={grupo.items.length}
              open={isMesOpen(grupo.key)}
              onToggle={() => setOpenMeses((prev) => ({ ...prev, [grupo.key]: !isMesOpen(grupo.key) }))}
            >
              {/* 🔴 FICHA por debajo de 1024 px, TABLA de ahí para arriba. En el
                  iPad la tira de acciones quedaba fuera de la pantalla. */}
              <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 lg:hidden">
                {grupo.items.map((pedido) => (
                  <FichaFila key={`f-${pedido.fuente ?? pedido.origen}-${pedido.id_natural}`} {...propsDeFila(pedido)} />
                ))}
              </div>
              <div className="hidden lg:block bg-white border border-gray-200 rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className={puedeAdministrar ? "w-8 pl-4 pr-1 py-3" : "w-0 p-0"}></th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Origen</th>
                      <th className="text-left px-2 lg:px-4 py-3 font-medium text-gray-500">Cliente</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Vendedor</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Total</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Fecha</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {grupo.items.map((pedido) => (
                      <FilaTabla key={`${pedido.fuente ?? pedido.origen}-${pedido.id_natural}`} {...propsDeFila(pedido)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </MesGroup>
          ))}
          {/* 🔴 Solo el botón — sin texto explicativo al lado (Daniel: «no me
              gustan tantas palabras extras»). */}
          {hayMas && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setVerTodo(true)}
                className="min-h-[44px] px-4 rounded-md border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 active:scale-[0.97] transition"
              >
                Ver más ({viejos.length})
              </button>
            </div>
          )}
        </>
      )}

      {dupTarget && (
        <DuplicarPedidoModal
          orderNumber={dupTarget.numero_pedido ?? ""}
          api={theme.api}
          directorioLabel={theme.switchDirectorioLabel}
          duplicando={duplicating}
          error={dupError}
          onElegir={(nombre, cliente) => duplicateOrder(dupTarget, nombre, cliente)}
          onCancel={() => { setDupTarget(null); setDupError(null); }}
        />
      )}

      {correoTarget && (
        <ReenviarCorreoModal
          numero={correoTarget.numero_pedido ?? ""}
          cliente={clienteLabel(correoTarget)}
          correoInicial={correoInicial}
          buscandoCorreo={correoBuscando}
          enviando={correoEnviando}
          error={correoError}
          onEnviar={enviarCorreo}
          onCancel={() => { setCorreoTarget(null); setCorreoError(null); setCorreoInicial(""); }}
        />
      )}

      <BulkDeletePedidosModal
        open={bulkOpen}
        sinEnviar={selSinEnviar}
        enviados={selEnviados.map((p) => ({
          key: rowKey(p),
          cliente: clienteLabel(p),
          numero: p.switch_numero as string,
        }))}
        onConfirm={handleBulkDelete}
        onCancel={() => !bulkLoading && setBulkOpen(false)}
        loading={bulkLoading}
      />

      {/* Modal de borrado individual — estilo por marca (quirk heredado):
          Reebok usa ConfirmModal; Joybees ConfirmDeleteModal (delay 1s). */}
      {theme.admin.pedidos.deleteModal === "confirm" ? (
        <ConfirmModal
          open={!!deleting}
          onClose={() => !deleteLoading && setDeleting(null)}
          onConfirm={handleDelete}
          title="¿Eliminar pedido?"
          message={deleteMsg}
          confirmLabel="Eliminar pedido"
          destructive
          loading={deleteLoading}
        />
      ) : (
        <ConfirmDeleteModal
          open={!!deleting}
          onCancel={() => !deleteLoading && setDeleting(null)}
          onConfirm={handleDelete}
          title="¿Eliminar pedido?"
          description={deleteMsg}
          loading={deleteLoading}
        />
      )}
    </div>
  );
}
