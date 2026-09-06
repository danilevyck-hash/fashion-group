"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL PANEL DE COMPROBANTES — UNO SOLO, PARA LOS TRES ROLES (25-ago-2026)
//
// Daniel, textual: *"En pedidos de los catálogos. En administrar y pedidos
// debería ser la misma pestaña, no dos aparte."*
//
// Antes vivía en `app/catalogos/admin/[marca]/PedidosTab.tsx` y solo lo veían
// admin y secretaria; el vendedor tenía OTRA lista, con otros filtros, otro
// endpoint y —medido— otros números. Ahora es UNA pantalla, en la ruta por la
// que se entra a trabajar (`/catalogo/<marca>/pedidos`), y **lo que cada quien
// puede hacer ahí depende de SU ROL, no de por qué puerta entró**.
//
// 🩸 `puedeAdministrar` NO ES EL CANDADO. Es cosmética: esconde botones que de
// todos modos mueren en 403 en el SERVIDOR (borrar y borrado masivo →
// `DELETE_ROLES`/`requireRole(["admin","secretaria"])`; exportar →
// `pedidos-export`). Medido rol por rol con cookies firmadas: el vendedor recibe
// 403 en los tres. Esconderlos es para que no se ofrezca lo que no se puede, no
// para impedirlo — lo impide el servidor, y ninguna acción se movió de un lado
// al otro en este cambio.
//
// Lo que el vendedor SÍ puede, y sigue pudiendo: ver la lista, buscar, abrir,
// editar, duplicar y convertir un pedido del link.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 Y BODEGA ENTRÓ — SOLO A MIRAR (25-ago-2026)
//
// Daniel, textual: ***"Dale acceso a bodega a la lista de pedidos."***
//
// Hacen falta DOS gates, no uno, y por eso llegó `puedeEditar`: «Editar» y
// «Duplicar» se dibujaban en TODAS las filas, y para bodega serían **botones
// muertos** —`PUT /orders/<id>` (`EDIT_ROLES`), `POST /pedidos-publicos/<id>/
// convertir` y `POST /orders` le responden 403—. Un botón que muere en 403 hace
// creer que se perdió el trabajo; es peor que no ofrecerlo.
//
// A bodega la fila le dice **«Ver»** y la abre en SOLO LECTURA:
//   · fila interna (`orders`) → el detalle de siempre, que `PedidoDetalleClient`
//     ya sabía dibujar sin editor (`isEditorRole`, anterior a esto, sin tocar);
//   · fila del LINK sin convertir → la vista PÚBLICA, que es lo que esa fila ES.
//     Llamar a `convertir` sería pedirle al servidor una escritura que le niega.
//
// 🩸 Sigue sin ser el candado: el 403 lo pone el SERVIDOR y ninguna acción
// cambió de mano en este cambio. Medido con cookies firmadas en las 4 marcas:
// bodega 200 en el GET de `orders`, 403 en las 10 rutas de escritura.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal, ConfirmDeleteModal } from "@/components/ui";
import BulkDeletePedidosModal from "@/components/catalogo/BulkDeletePedidosModal";
import DuplicarPedidoModal from "@/components/catalogo/DuplicarPedidoModal";
import type { ClienteSwitchOpcion } from "@/components/catalogo/ClienteSwitchPicker";
import { filasDeOrders, type FilaComprobante, type FilaDeOrders } from "@/lib/catalogo/fila-comprobante";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { precioTexto } from "@/lib/catalogo/precio";
import { partirPorVentana } from "@/lib/catalogo/comprobantes-ventana";
import {
  contarComprobantes,
  estaEnSwitch,
  FILTRO_COMPROBANTE_DEFAULT,
  FILTROS_COMPROBANTE,
  pasaFiltroComprobante,
  textoBuscablePedido,
  textoEnSwitch,
  textoNumeroPedido,
  tieneNumeroPropio,
  VACIO_NINGUNO_COINCIDE,
  VACIO_SIN_COMPROBANTES,
  type FiltroComprobante,
  type NumerosDePedido,
} from "@/lib/catalogo/numeros-pedido";

// La fila que se pinta. Su forma vive en `lib/catalogo/fila-comprobante.ts`,
// junto al mapeo desde el feed — el tipo y la traducción no pueden separarse.
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

// Agrupación por MES (fecha local, igual que fmtDate).
function mesKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function mesLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PA", { month: "long", year: "numeric" });
}

type OrigenFilter = "todos" | "link" | "mio";

function OrigenBadge({ marca, origen, confirmadoCliente }: { marca: MarcaUiKey; origen: "mio" | "link"; confirmadoCliente?: boolean }) {
  const theme = getMarcaTheme(marca)!;
  if (origen === "link") {
    return (
      <span
        data-chip="del-link"
        title={confirmadoCliente ? "Del link · Confirmado por el cliente" : undefined}
        className={theme.admin.pedidos.linkBadge}
      >
        Del link
        {confirmadoCliente && (
          <svg className={theme.admin.pedidos.linkBadgeCheck} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
      Mío
    </span>
  );
}

// 🔴 LOS DOS NÚMEROS, DEBAJO DEL NOMBRE — NO EN COLUMNAS NUEVAS (24-ago-2026)
//
// Daniel necesitaba cruzar un pedido de esta lista contra Switch sin abrirlos de
// a uno. Dos columnas más (el número de la casa y el del ERP) ensanchan la tabla
// justo en el iPad acostado (1024), que es el ancho donde este repo ya se quemó
// y el que nadie mira. Así que los números van como SEGUNDA LÍNEA bajo el
// cliente: la tabla crece hacia ABAJO, que es gratis, y no hacia el costado.
//
// Los textos NO se escriben acá: salen de `lib/catalogo/numeros-pedido.ts`. Un
// pedido que no salió dice «No se ha mandado a Switch» y no «—» (un guion en la
// columna de un número se lee como un cero), y el que sí salió dice SIEMPRE si
// fue pedido o COTIZACIÓN — una cotización no aparta mercancía y las dos se
// verían idénticas con solo el número.
// La tabla física manda sobre el badge: una pública convertida vive en
// <marca>_orders aunque se muestre como "Del link". Vive a nivel de módulo
// porque los conteos del filtro por tipo lo necesitan antes de renderizar.
function esFilaOrders(p: FilaComprobante): boolean {
  return p.fuente ? p.fuente === "orders" : p.origen === "mio";
}

function datosNumeros(pedido: FilaComprobante, esOrders: boolean): NumerosDePedido {
  return {
    numeroPedido: pedido.numero_pedido ?? null,
    switchNumero: pedido.switch_numero ?? null,
    switchDocumento: pedido.switch_documento ?? null,
    status: pedido.status ?? null,
    enSwitch: pedido.en_switch,
    fuente: esOrders ? "orders" : "publicos",
  };
}

function NumerosPedido({ pedido, esOrders }: { pedido: FilaComprobante; esOrders: boolean }) {
  const datos = datosNumeros(pedido, esOrders);
  const propio = tieneNumeroPropio(datos);
  const enSwitch = estaEnSwitch(datos);
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs leading-snug">
      <span className={propio ? "font-medium text-gray-600 tabular-nums" : "text-gray-400"}>
        {textoNumeroPedido(datos)}
      </span>
      <span className="text-gray-300" aria-hidden="true">
        ·
      </span>
      <span className={enSwitch ? "text-gray-600 tabular-nums" : "text-gray-400"}>
        {textoEnSwitch(datos)}
      </span>
    </div>
  );
}

// Header de mes colapsable (patrón TimeGroupHeader). Mes actual abierto por
// defecto; los demás cerrados. Controlado por el padre: la selección masiva
// necesita saber qué meses están expandidos ("Seleccionar todos" solo toma
// filas visibles — un mes colapsado no aporta).
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
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-1 py-2 text-left"
      >
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M6 4l8 6-8 6V4z" />
        </svg>
        <span className="text-sm font-semibold text-gray-700 capitalize">{label}</span>
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
   *  —hoy solo **bodega**— la fila dice «Ver» en vez de «Editar», no se ofrece
   *  «Duplicar», y todo abre en SOLO LECTURA. Tampoco es el candado. */
  puedeEditar: boolean;
}) {
  const theme = getMarcaTheme(marca)!;
  const router = useRouter();
  const [origenFilter, setOrigenFilter] = useState<OrigenFilter>("todos");
  // 🔴 Qué es cada fila: Pedidos · Cotizaciones · Borradores. NO hay «Todos»
  // (Daniel lo pidió fuera), así que el filtro SIEMPRE está puesto y abre en
  // «Pedidos», que es lo que más se mira. Los tres baldes particionan: ninguna
  // fila viva se queda sin chip — ver `numeros-pedido.ts`.
  const [tipoFilter, setTipoFilter] = useState<FiltroComprobante>(FILTRO_COMPROBANTE_DEFAULT);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<FilaComprobante | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);
  // Selección masiva. `selected` guarda keys fuente-id; qué cuenta de verdad
  // es la intersección con las filas VISIBLES (filtro actual + mes expandido)
  // — lo que no se ve nunca se elimina. `openMeses` controla los MesGroup
  // (default: solo el mes actual abierto).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openMeses, setOpenMeses] = useState<Record<string, boolean>>({});
  const [bulkOpen, setBulkOpen] = useState(false);
  // «Ver más»: la lista arranca en los últimos 90 días. Ver `comprobantes-ventana.ts`.
  const [verTodo, setVerTodo] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  // Duplicar: el botón abre el mini-modal, se elige el cliente y "Usar este
  // cliente" confirma. Viene de la lista del vendedor, que era la única que lo
  // tenía — al quedar una sola pantalla, lo tienen los tres roles (el POST
  // /orders ya los aceptaba: `createRoles`).
  const [dupTarget, setDupTarget] = useState<FilaComprobante | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  // El error se ve DENTRO del modal: tocar el cliente ya es la acción, así que
  // un fallo silencioso se sentiría como "no pasó nada".
  const [dupError, setDupError] = useState<string | null>(null);

  // "Editar del link": convierte la pública en <marca>_orders (idempotente) y
  // redirige a la maquinaria de edición existente. El origen se conserva —
  // el pedido sigue mostrándose como "Del link".
  async function handleEditLink(p: FilaComprobante) {
    if (converting) return;
    setConverting(p.id_natural);
    try {
      const res = await fetch(
        `${theme.api}/pedidos-publicos/${p.id_natural}/convertir`,
        { method: "POST" },
      );
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
   * del CLIENTE DE SWITCH elegido en el mini-modal. El cliente es siempre una
   * elección explícita (`null` = Contado); el VENDEDOR, en cambio, se hereda del
   * original y lo resuelve el SERVIDOR — de él depende la comisión, así que su
   * id NO se manda desde el navegador (ver `duplicar_de` en POST /orders).
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

  const counts = {
    todos: pedidos.length,
    link: pedidos.filter((p) => p.origen === "link").length,
    mio: pedidos.filter((p) => p.origen === "mio").length,
  };

  // Los conteos del filtro por TIPO. Una pasada sobre lo que ya está en
  // memoria: `documento` viaja en la fila desde el #593, así que no hay ni una
  // consulta nueva (la base está en compute Micro).
  const countsTipo = contarComprobantes(pedidos.map((p) => datosNumeros(p, esFilaOrders(p))));

  const filtered = pedidos.filter((p) => {
    if (origenFilter !== "todos" && p.origen !== origenFilter) return false;
    if (!pasaFiltroComprobante(datosNumeros(p, esFilaOrders(p)), tipoFilter)) return false;
    if (search) {
      // Se busca por cliente Y por los DOS números: el que Daniel tiene a mano
      // puede ser el de la casa (PED-017) o el que le dice el ERP
      // (16-000000503). Buscar solo por cliente obligaba a saber el nombre.
      const q = search.trim().toLowerCase();
      if (
        !textoBuscablePedido({
          cliente: p.cliente,
          numeroPedido: p.numero_pedido ?? null,
          switchNumero: p.switch_numero ?? null,
        }).includes(q)
      )
        return false;
    }
    return true;
  });

  // El detalle se enruta por la tabla física (fuente), no por el badge: una
  // pública convertida vive en <marca>_orders y se abre en el detalle interno.
  // Fallback por `origen` si la vista aún no expone `fuente`.
  function isOrdersRow(p: FilaComprobante): boolean {
    return esFilaOrders(p);
  }

  // 🩸 LA FILA Y EL BOTÓN "Editar" LLEVAN AL MISMO LADO (23-ago-2026).
  // Antes la fila tenía su propio `detailHref`: en un pedido "Del link" sin
  // convertir, TOCAR LA FILA abría la vista que ve el CLIENTE
  // (`pedidoPublicoBase/...`, de solo lectura y sin cliente, precio ni envío a
  // Switch) mientras que el botón "Editar" de esa MISMA fila abría la pantalla
  // interna. Dos destinos distintos para la misma cosa, sin nada que avisara
  // cuál era cuál — y el que caía en la del cliente creía que el pedido no se
  // podía trabajar. Ahora los dos pasan por `handleEdit`.
  //
  // Abrir el editor de un pedido. Del link (público sin convertir) → convierte y
  // redirige (handleEditLink); interno/orders → abre su detalle directo.
  //
  // 🔴 SIN PERMISO DE EDITAR (bodega) NO SE CONVIERTE NADA. `convertir` es un
  // POST que le responde 403, así que tocar la fila terminaría en "no se pudo
  // abrir" sin que nada estuviera roto. La fila del link se abre en la vista
  // PÚBLICA —que es exactamente lo que esa fila es— y la interna en su detalle,
  // que ya se dibuja sin editor para quien no lo tiene.
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
   * 🩸 SE MIRA EL RESULTADO, Y SE DICE CUÁL FUE. La ventana se cierra y la lista
   * se recarga SOLO si el servidor dijo que sí; con un 500 o el WiFi caído se
   * queda abierta con el motivo escrito y el botón listo para reintentar. Antes
   * de este arreglo (auditoría del 23-ago) se cerraba pasara lo que pasara: el
   * pedido seguía ahí y la persona creía haberlo borrado — o lo borraba dos
   * veces buscando que "agarrara".
   *
   * Los DOS mensajes distintos vienen de la lista del vendedor, que es la que
   * los tenía: "revisa tu conexión" y "intenta de nuevo" mandan a hacer cosas
   * distintas, y un solo texto para los dos casos manda a la equivocada.
   */
  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    // Borrado SOFT por tabla física (fuente): orders → <marca>_orders,
    // publicos → <marca>_pedidos_publicos. Ninguno toca Switch.
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

  const filterTabs: { key: OrigenFilter; label: string }[] = [
    { key: "todos", label: `Todos (${counts.todos})` },
    { key: "link", label: `Del link (${counts.link})` },
    { key: "mio", label: `Míos (${counts.mio})` },
  ];

  // 🔴 LA VENTANA DE 90 DÍAS (4-sep-2026). La lista muestra lo de los últimos
  // 90 días y el resto queda detrás de «Ver más» — sin texto explicativo al
  // lado (Daniel: *«no me gustan tantas palabras extras»*; el botón dice lo que
  // hace). Nada se borra: un pedido guarda lo que Switch no tiene y son pocos
  // (23 Reebok · 38 Tommy · 21 Calvin · 41 Joybees en todo 2026). Lo que se
  // recorta es la LISTA, no los datos. El corte va DESPUÉS del filtro y de la
  // búsqueda, así que «Ver más» siempre trae lo que falta de lo que se está
  // mirando ahora.
  const { recientes, viejos } = partirPorVentana(filtered, new Date());
  const visibles = verTodo ? filtered : recientes;
  const hayMas = !verTodo && viejos.length > 0;

  // Agrupar por mes (el API ya viene ordenado por fecha desc → los grupos salen
  // en orden descendente). Mes actual expandido, los demás colapsados.
  const grupos: { key: string; label: string; items: FilaComprobante[] }[] = [];
  for (const p of visibles) {
    const k = mesKey(p.created_at);
    const last = grupos[grupos.length - 1];
    if (last && last.key === k) last.items.push(p);
    else grupos.push({ key: k, label: mesLabel(p.created_at), items: [p] });
  }
  const mesActual = mesKey(new Date().toISOString());

  const isMesOpen = (k: string) => openMeses[k] ?? (k === mesActual);
  const rowKey = (p: FilaComprobante) => `${p.fuente ?? p.origen}-${p.id_natural}`;
  const clienteLabel = (p: FilaComprobante) =>
    p.cliente === "Sin nombre" || !p.cliente?.trim() ? "Sin nombre" : p.cliente;

  // Filas elegibles para selección masiva = las VISIBLES ahora mismo: pasan el
  // filtro/búsqueda actual Y su mes está expandido. Cambiar filtro o colapsar
  // un mes las saca de la selección efectiva automáticamente.
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

  // Eliminación masiva: soft-delete por fuente en un solo POST. Igual que el
  // individual, NUNCA toca Switch — los ya enviados solo se ocultan.
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

  return (
    <div>
      {/* Acciones. «Exportar Excel» es de admin/secretaria: al vendedor el
          endpoint le responde 403 (medido), así que ofrecérselo sería ofrecer
          un botón que no funciona. */}
      {puedeAdministrar && (
      <div className="flex justify-end mb-4">
        <button
          onClick={handleExport}
          disabled={exporting || pedidos.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 active:scale-[0.97] transition disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {exporting ? "Generando..." : "Descargar Excel"}
        </button>
      </div>
      )}

      {/* Filtros por origen */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
        {filterTabs.map((ft) => {
          const active = origenFilter === ft.key;
          return (
            <button
              key={ft.key}
              onClick={() => setOrigenFilter(ft.key)}
              className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 whitespace-nowrap transition ${
                active
                  ? theme.admin.pedidos.filterActive
                  : "text-gray-400 border-transparent hover:text-gray-600"
              }`}
            >
              {ft.label}
            </button>
          );
        })}
      </div>

      {/* 🔴 FILTRO POR TIPO DE COMPROBANTE — TRES CHIPS, SIN «TODOS» (25-ago-2026)
          Daniel, textual: "haz un tap de borrador, para q esté organizado. No
          quiero opción de todos". Quedan Pedidos · Cotizaciones · Borradores, y
          el panel abre en «Pedidos».
          Los rótulos, el default y los conteos salen de `numeros-pedido.ts`:
          escribirlos acá sería una segunda definición de qué es cada cosa.
          🔴 Los tres PARTICIONAN. Sin «Todos», una fila que no cayera en ningún
          chip sería una fila invisible, así que «Pedidos» es el balde de resto.
          ⚠️ «Borradores» es `status = 'borrador'`, NO "no salió a Switch": hay
          pedidos EN Switch cuyo status nunca se cerró. */}
      <div data-medir="filtro-tipo-comprobante" className="flex flex-wrap gap-2 mb-4">
        {FILTROS_COMPROBANTE.map((f) => {
          const active = tipoFilter === f.clave;
          return (
            <button
              key={f.clave}
              onClick={() => setTipoFilter(f.clave)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-full border text-sm font-medium whitespace-nowrap transition ${
                active
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {f.label}
              <span className={`tabular-nums text-xs ${active ? "text-white/70" : "text-gray-400"}`}>
                {countsTipo[f.clave]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Buscador por cliente */}
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

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">
            {/* 🩸 La vara es si el PANEL está vacío, no si hay un filtro puesto:
                sin «Todos» el filtro por tipo SIEMPRE está puesto y la condición
                vieja habría dicho "ningún comprobante coincide" hasta con cero
                comprobantes en la marca. */}
            {pedidos.length === 0 ? VACIO_SIN_COMPROBANTES : VACIO_NINGUNO_COINCIDE}
          </p>
        </div>
      ) : (
        <>
        {/* Selección masiva: "todos" = filas visibles (filtro actual + meses
            expandidos). El botón rojo aparece solo con selección. Todo el
            bloque es de admin/secretaria — `bulk-delete` responde 403 al
            vendedor. */}
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
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] transition"
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
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className={puedeAdministrar ? "w-8 pl-4 pr-1 py-3" : "w-0 p-0"}></th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Origen</th>
                <th className="text-left px-2 lg:px-4 py-3 font-medium text-gray-500">Cliente</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Total</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Fecha</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {grupo.items.map((pedido) => (
                <tr
                  key={`${pedido.fuente ?? pedido.origen}-${pedido.id_natural}`}
                  // Hooks ESTABLES para los candados de conducta: el número (o el
                  // short_id cuando todavía no tiene) y la tabla física. Sin
                  // ellos, un candado que quiera "la fila de PED-018" termina
                  // agarrando el contenedor de todas — ya pasó.
                  data-pedido={pedido.numero_pedido ?? pedido.id_natural}
                  data-fuente={pedido.fuente ?? "orders"}
                  onClick={() => handleEdit(pedido)}
                  className="hover:bg-gray-50 transition cursor-pointer"
                >
                  <td className="w-8 pl-4 pr-1 py-3" onClick={(e) => e.stopPropagation()}>
                    {puedeAdministrar && (
                      <input
                        type="checkbox"
                        checked={selected.has(rowKey(pedido))}
                        onChange={() => toggleRow(pedido)}
                        className="w-4 h-4 accent-black cursor-pointer align-middle"
                        aria-label={`Seleccionar pedido de ${clienteLabel(pedido)}`}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <OrigenBadge marca={marca} origen={pedido.origen} confirmadoCliente={!!pedido.confirmado_cliente_at} />
                  </td>
                  {/* Los gutters de ESTA columna se aprietan por debajo de `lg`: la
                      segunda línea trae el número de Switch, y con `px-4` la tabla
                      pedía 13 px más de los que hay en el iPad de 834. De `lg` para
                      arriba no cambia nada. */}
                  <td className="px-2 lg:px-4 py-3 text-gray-900">
                    {clienteLabel(pedido) === "Sin nombre" ? (
                      <span className="text-gray-300 italic">Sin nombre</span>
                    ) : (
                      pedido.cliente
                    )}
                    <NumerosPedido pedido={pedido} esOrders={isOrdersRow(pedido)} />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                    ${fmtMoney(pedido.total)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(pedido.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {/* Editar en TODAS las filas (Mío y Del link): orders → abre
                        su detalle; público sin convertir → convierte y abre.
                        Duplicar solo en las INTERNAS: una del link sin convertir
                        todavía no existe como pedido, así que tocarlo pediría
                        algo que no está. Eliminar es de admin/secretaria.
                        🔴 Sin permiso de editar (bodega) el botón dice «Ver» y
                        no hay «Duplicar»: duplicar es un POST /orders que le
                        responde 403. */}
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(pedido);
                        }}
                        disabled={converting === pedido.id_natural}
                        className="px-2.5 py-1 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
                      >
                        {converting === pedido.id_natural
                          ? "Abriendo..."
                          : puedeEditar ? "Editar" : "Ver"}
                      </button>
                      {puedeEditar && isOrdersRow(pedido) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDupTarget(pedido);
                          }}
                          className="px-2.5 py-1 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition"
                        >
                          Duplicar
                        </button>
                      )}
                      {puedeAdministrar && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleting(pedido);
                          }}
                          className="px-2.5 py-1 rounded-md border border-red-200 text-xs text-red-600 hover:bg-red-50 transition"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </MesGroup>
        ))}
        {/* 🔴 Solo el botón — sin texto explicativo al lado (Daniel: «no me
            gustan tantas palabras extras»). Dice cuántos faltan porque ese
            número es lo único que la persona no puede ver por sí misma. */}
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
