"use client";

// Detalle de pedido interno /catalogo/[marca]/pedido/[id] — página única para
// todas las marcas, parametrizada por MARCA_THEME (los gemelos diferían ~9%:
// bulto por categoría vs fijo, orden de items, guard legacy rol 'cliente',
// draft-id de Joybees y micro-clases del tema).

import { useState, useEffect, useCallback, useRef } from "react";
import { resolverLineas } from "@/lib/catalogo/lineas-pedido";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { fmt } from "@/lib/format";
import { ConfirmDeleteModal, ModalOverlay, Toast } from "@/components/ui";
import DuplicarPedidoModal from "@/components/catalogo/DuplicarPedidoModal";
import ClienteSwitchPicker, { type ClienteSwitchOpcion, nombreDeCliente } from "@/components/catalogo/ClienteSwitchPicker";
import { supabaseThumb } from "@/lib/image-thumb";
import { formatBultosPiezas } from "@/lib/catalogo/piezas";
import { useEscapeClose } from "@/lib/hooks/useModalDismiss";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { hrefCatalogoAgregando } from "@/lib/catalogo/modo-pedido";
import { avisosBloqueantes, hayQueDetenerse, type AvisoEnvio } from "@/lib/catalogo/switch-prevalidacion";
import { fmtPrecio } from "@/lib/catalogo/precio";

interface OrderItem { id?: string; product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number; category?: string;
  /** Precio de lista del catálogo (`<marca>_products.price`, sincronizado de
   *  Switch). Sirve SOLO para el aviso inline "≠ lista" al editar. */
  precio_lista?: number | null;
  /** Foto del stock al confirmar el pedido del link (piezas que HABÍA en ese
   *  momento). undefined = pedido presencial o DDL 20260725130000 pendiente. */
  disponible_pzas?: number; bulto_pzas?: number; }
interface Order { id: string; order_number: string; client_name: string; client_email?: string | null; comment: string; status: string; total: number; created_at: string; updated_at?: string | null; [itemsField: string]: unknown; }
interface DirClient { nombre: string; empresa: string; }
interface SwitchEnvio { estado: string; pedido_switch_id: number | null; numero_interno: string | null; error_detalle: string | null; }
interface SwitchPreviewLinea { sku: string; descripcionSwitch: string; bultos: number; piezas: number; precioCatalogo: number; precioSwitch: number; }
interface SwitchPreview { cliente: string; vendedor: string; lineas: SwitchPreviewLinea[]; warnings: string[]; avisos?: AvisoEnvio[]; totalPiezas: number; totalEstimado: number; }
/** Lo que se enseña cuando el toque SE DETIENE: qué pasó, y el pedido resuelto
 *  debajo para poder mirarlo sin volver a consultar Switch. */
interface SwitchProblema {
  errores: string[];
  avisos: AvisoEnvio[];
  lineas: SwitchPreviewLinea[];
  /** ¿Se puede crear igual? (avisos bloqueantes sí; errores no.) */
  puedeSeguir: boolean;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const fecha = d.toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
  const hora = d.toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit" });
  return `${fecha} ${hora}`;
}

export default function PedidoDetalleClient({ marca }: { marca: MarcaUiKey }) {
  const theme = getMarcaTheme(marca)!;
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  // Bulto por item: fallback de category heredado por marca (Reebok "apparel"
  // — NUNCA inflar a 12 a ciegas; Joybees ignora la category, siempre 12).
  // Línea RESUELTA del item: piezas y subtotal ya calculados por el único
  // lugar del sistema que multiplica (lineas-pedido.ts). Acá no se multiplica.
  const linea = useCallback(
    (item: OrderItem) =>
      resolverLineas([item], {
        bultoSize: theme.bulto,
        fallbackCategory: theme.pdfFallbackCategory,
      })[0],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const bs = useCallback((item: OrderItem): number => linea(item).bulto_pzas, [linea]);
  // Orden canónico de items (Reebok: categoría+SKU; default: SKU ascendente).
  const sortItems = useCallback((items: OrderItem[]): OrderItem[] =>
    theme.sortOrderItems
      ? theme.sortOrderItems(items)
      : [...items].sort((a, b) => (a.sku || "").localeCompare(b.sku || "")),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  const [role, setRole] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [clientName, setClientName] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [enviandoAviso, setEnviandoAviso] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<DirClient[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"saved" | "saving" | "dirty" | "error" | null>(null);
  // ── Envío a Switch (ERP) ──
  const [switchEnvio, setSwitchEnvio] = useState<SwitchEnvio | null>(null);
  const [switchProblema, setSwitchProblema] = useState<SwitchProblema | null>(null);
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [switchSending, setSwitchSending] = useState(false);
  /** Qué está pasando MIENTRAS corre el toque único (la pre-validación viva
   *  contra Switch tarda: maxDuration=300). */
  const [pasoSwitch, setPasoSwitch] = useState<string | null>(null);
  /** Permiso 0001 de la empresa (cambiar precio). null = todavía no se preguntó. */
  const [permisoPrecio, setPermisoPrecio] = useState<{ permiso: boolean; verificado: boolean; mensaje: string | null } | null>(null);
  /** Un solo envío por toque, aunque el botón se toque dos veces muy rápido.
   *  Es la primera de las CUATRO capas: acá, el `disabled` del botón, el índice
   *  parcial de la tabla de envíos y el 409 del server. El candado de verdad es
   *  el del servidor y NO se toca. */
  const enviandoRef = useRef(false);
  // ── Cliente Switch del pedido (cliente real en vez de Contado) ──
  const [clienteSwitch, setClienteSwitch] = useState<{ id: number; nombre: string | null; codigo: string | null } | null>(null);
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [clienteGuardando, setClienteGuardando] = useState(false);
  // ── Candado post-envío a Switch + reemplazo (Duplicar y corregir) ──
  const [reemplazadoPor, setReemplazadoPor] = useState<{ id: string; order_number: string } | null>(null);
  const [pedidoOriginal, setPedidoOriginal] = useState<{ id: string; order_number: string; switch_numero: string | null } | null>(null);
  const [duplicando, setDuplicando] = useState(false);
  const [showDupModal, setShowDupModal] = useState(false);
  // El error se ve DENTRO del modal: tocar el cliente ya es la acción, así que
  // un fallo silencioso se sentiría como "no pasó nada".
  const [dupError, setDupError] = useState<string | null>(null);
  const switchLockRef = useRef(false);
  const [editedAt, setEditedAt] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const nameRef = useRef<HTMLDivElement>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlight = useRef(false);
  const pendingSave = useRef(false);
  // Refs con los ultimos valores para que el guardado (auto o manual) nunca
  // mande datos viejos por culpa de closures de un render anterior.
  const itemsRef = useRef<OrderItem[]>([]);
  const clientNameRef = useRef("");

  // Escape cierra los dos modales de Switch igual que el clic fuera, con el
  // MISMO guard: mientras hay algo en vuelo no se puede cerrar. Escape nunca
  // envia nada al ERP, solo cancela. Los hooks van ANTES del early return de
  // `loading` (reglas de hooks).
  useEscapeClose(showSwitchModal, () => setShowSwitchModal(false), !switchSending);
  useEscapeClose(showClienteModal, () => setShowClienteModal(false), !clienteGuardando);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const isEditorRole = ["admin", "secretaria", "vendedor"].includes(role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${theme.api}/orders/${id}`);
      if (res.ok) {
        const d = await res.json();
        const r = sessionStorage.getItem("cxc_role") || "";
        // QUIRK legacy Reebok: el rol 'cliente' solo puede ver SU pedido.
        if (theme.features.roleClienteGuard && r === "cliente") {
          const userName = sessionStorage.getItem("fg_user_name") || "";
          if (userName && d.client_name && d.client_name.toLowerCase() !== userName.toLowerCase()) {
            router.push(theme.catalogoHref); return;
          }
        }
        setOrder(d); setItems(sortItems((d[theme.itemsField] as OrderItem[]) || [])); setClientName(d.client_name || "");
        setReemplazadoPor(d.reemplazado_por || null); setPedidoOriginal(d.original || null);
        if (d.client_email) setClientEmail(d.client_email);
        // Estado del envío a Switch (admin/secretaria/vendedor — el vendedor
        // también necesita ver el candado post-envío; otros roles se ignoran)
        if (["admin", "secretaria", "vendedor"].includes(r)) {
          try {
            const er = await fetch(`${theme.api}/orders/${id}/enviar-switch`);
            if (er.ok) { const ed = await er.json(); setSwitchEnvio(ed.envio || null); }
          } catch { /* no bloquea la carga del pedido */ }
          // Cliente Switch asignado al pedido (null = Contado). Lo ve —y lo
          // cambia— cualquiera que arme pedidos, VENDEDOR INCLUIDO: con el
          // selector cerrado a admin/secretaria, todo lo del vendedor se iba a
          // Contado sin forma de elegir. El endpoint ya abrió a esos roles.
          try {
            const cr = await fetch(`${theme.api}/clientes-switch?orderId=${id}`);
            if (cr.ok) {
              const cd = await cr.json();
              setClienteSwitch(cd.clienteSwitchId ? { id: cd.clienteSwitchId, nombre: cd.nombre || null, codigo: cd.codigo || null } : null);
            }
          } catch { /* no bloquea la carga del pedido */ }
        }
      } else router.push(theme.pedidosHref);
    } catch { router.push(theme.pedidosHref); }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  useEffect(() => { setRole(sessionStorage.getItem("cxc_role") || ""); load(); }, [load]);

  // Client autocomplete (directorio de clientes, 300ms debounce)
  useEffect(() => {
    if (clientName.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${theme.api}/clientes-search?q=${encodeURIComponent(clientName)}`);
        if (r.ok) { const d = await r.json(); setSuggestions(d || []); setShowSugg((d || []).length > 0); }
      } catch { /* */ }
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientName]);

  useEffect(() => {
    function h(e: MouseEvent) { if (nameRef.current && !nameRef.current.contains(e.target as Node)) setShowSugg(false); }
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  // (La búsqueda de clientes Switch vive en ClienteSwitchPicker — la MISMA
  // pieza que usa el modal de Duplicar; dos buscadores se separan solos.)

  // ── PRECIO ≠ LISTA: el aviso se adelanta al momento de EDITAR (12-ago-2026) ──
  //
  // Daniel, con captura de la tabla mientras editaba precios: *"porque lo
  // cazaria en ese modal y no antes? en esta foto la hubiese cazado no?"*.
  //
  // La diferencia contra el precio de lista se ve INLINE y sin llamar a Switch:
  // `<marca>_products.price` ya está en la base local (el catálogo se alimenta
  // de Switch), y viaja con cada item como `precio_lista`.
  const hayPrecioEditado = items.some(
    (i) => typeof i.precio_lista === "number" && i.precio_lista > 0 &&
      Math.abs(Number(i.unit_price || 0) - i.precio_lista) >= 0.01,
  );

  // El permiso 0001 SÍ hay que preguntárselo a Switch, y se pregunta en cuanto
  // aparece el primer precio editado — no al final, cuando el pedido ya está
  // armado.
  //
  // ⚠️ Abre sesión en Switch (SESIÓN ÚNICA POR EMPRESA): por eso se dispara
  // solo cuando hay un precio editado de verdad, con debounce (nunca en bucle
  // mientras se teclea) y UNA vez por sesión de navegador y marca. El servidor
  // cachea además la respuesta y la comparte con el envío, así que preguntar
  // acá NO agrega una sesión al total.
  useEffect(() => {
    if (!hayPrecioEditado || !isEditorRole || permisoPrecio) return;
    const clave = `fg_permiso_precio_${marca}`;
    try {
      const guardado = sessionStorage.getItem(clave);
      if (guardado) { setPermisoPrecio(JSON.parse(guardado)); return; }
    } catch { /* sessionStorage no disponible: se consulta igual */ }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${theme.api}/permiso-precio`);
        if (!r.ok) return; // fail-open: sin respuesta no se dice nada
        const d = await r.json();
        const valor = { permiso: d.permiso !== false, verificado: d.verificado === true, mensaje: d.mensaje ?? null };
        setPermisoPrecio(valor);
        try { sessionStorage.setItem(clave, JSON.stringify(valor)); } catch { /* */ }
      } catch { /* fail-open: no se bloquea nada por no poder preguntar */ }
    }, 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hayPrecioEditado, isEditorRole, permisoPrecio]);

  // Mantener refs sincronizados con el ultimo estado.
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { clientNameRef.current = clientName; }, [clientName]);

  // Candado post-envío: con envío activo a Switch ('enviado' o 'verificado')
  // el contenido del pedido queda de solo lectura ('pendiente' no bloquea).
  const switchLock = !!switchEnvio && ["enviado", "verificado"].includes(switchEnvio.estado);
  useEffect(() => { switchLockRef.current = switchLock; }, [switchLock]);

  // ── AUTO-SAVE (2s debounce) ──
  const changeCount = useRef(0);
  useEffect(() => {
    changeCount.current++;
    // Editar funciona en cualquier estado (incluso confirmado). El PUT no
    // manda status, asi que el pedido NO cambia de estado al guardar.
    if (changeCount.current <= 1 || !order || switchLockRef.current) return;
    setAutoSaveStatus("dirty");
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { performSave(); }, 2000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, clientName]);

  // Guardado unico para auto-save y boton manual. Evita PUT simultaneos via
  // saveInFlight; si llega otra peticion mientras guarda, encola un trailing
  // save con los datos mas recientes (refs). No manda status ni envia correo.
  // Devuelve `true` si lo que había pendiente quedó guardado (o no había nada
  // que guardar). Lo usa "+ Agregar productos" para no irse al catálogo con
  // ediciones sin guardar — el debounce de 2 s convierte "toqué y me fui" en
  // trabajo perdido.
  async function performSave(): Promise<boolean> {
    // Pedido bloqueado por Switch: no hay nada editable que guardar.
    if (switchLockRef.current) { setAutoSaveStatus(null); return true; }
    if (saveInFlight.current) { pendingSave.current = true; return true; }
    if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); autoSaveTimer.current = null; }
    saveInFlight.current = true;
    setAutoSaveStatus("saving");
    let guardado = false;
    try {
      const res = await fetch(`${theme.api}/orders/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_name: clientNameRef.current, items: itemsRef.current }),
      });
      // El server respondio pero con error (ej. 500): NO mostrar "Guardado".
      // Marcamos error visible para que el vendedor reintente y no crea que
      // se guardo. El boton "Guardar" sigue activo para reintentar.
      if (res.status === 409) {
        // Candado del server: el pedido ya esta en Switch. Refrescar el estado
        // para que la UI pase a solo lectura con el banner.
        setAutoSaveStatus(null);
        showToast("Este pedido ya está en Switch — no se puede editar aquí.");
        load();
      } else if (!res.ok) {
        setAutoSaveStatus("error");
        showToast("No se pudo guardar. Revisa tu conexion e intenta de nuevo.");
      } else {
        const now = new Date().toISOString();
        setAutoSaveStatus("saved");
        setLastSavedAt(now);
        guardado = true;
        // Marca de editado para pedidos confirmados (registro interno difiere
        // de lo enviado). No reenvia correo: solo persiste y deja constancia.
        if (order?.status === "confirmado") setEditedAt(now);
      }
    } catch {
      // Fallo de red: tampoco se guardo. Error visible, no "Guardado".
      setAutoSaveStatus("error");
      showToast("No se pudo guardar. Revisa tu conexion e intenta de nuevo.");
    }
    saveInFlight.current = false;
    if (pendingSave.current) { pendingSave.current = false; performSave(); }
    return guardado;
  }

  // ── AGREGAR PRODUCTOS: al CATÁLOGO de la marca, en modo pedido ──
  // Daniel, 12-ago-2026: *"¿por qué al agregar me sale así? en vez de mandarme
  // al catálogo?"*. Ahí están las fotos grandes, los filtros y el stock; cada
  // "Agregar" del catálogo escribe en ESTE pedido (mismo PATCH /item que hacía
  // el buscador que se retiró) y "Listo, volver al pedido" trae de vuelta acá.
  async function irAlCatalogoAgregando() {
    const ok = await performSave();
    if (!ok) {
      showToast("No se pudo guardar lo que cambiaste — intenta de nuevo antes de agregar productos.");
      return;
    }
    router.push(hrefCatalogoAgregando(theme.catalogoHref, id));
  }

  // Aviso nativo si hay cambios sin guardar al cerrar/navegar.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (autoSaveStatus === "dirty" || autoSaveStatus === "error" || saveInFlight.current) { e.preventDefault(); e.returnValue = ""; }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [autoSaveStatus]);

  // ── ENVIAR A SWITCH — UN SOLO TOQUE (12-ago-2026) ──
  //
  // Daniel: *"porque doble? se puede hacer en un solo paso?"* y, tras entender
  // qué revisaba el modal de preview, *"nos podemos ahorrar un paso"*. Él mismo
  // cazó por qué el modal se sentía redundante: *"si esta en el catalogo obvio
  // estan en switch no? porque me saldria dos precios distintos si esta siendo
  // alimentado por switch"*.
  //
  // El toque hace el camino COMPLETO: PUT status:"confirmado" → pre-validación
  // VIVA (dry-run, cero escrituras — resuelve sku→codigoBarraId y es necesaria
  // de todos modos para armar el payload) → y si todo está limpio, CREA el
  // pedido sin parar a preguntar.
  //
  // 🔴 Solo se detiene cuando hay algo que decidir (`hayQueDetenerse`): un SKU
  // que no cruza, precio 0 en Switch, el permiso 0001 negado, cualquier
  // `errores[]`. Ahí sí se ve la pantalla de detalle, con el problema arriba.
  //
  // 🔴 CERO CAMBIOS EN EL CANDADO at-most-once del servidor: el registro del
  // intento ANTES del POST, el índice parcial y el 409 de las 3 capas siguen
  // exactamente igual. El PUT va PRIMERO porque `enviar-switch` sigue exigiendo
  // status==='confirmado'.
  async function enviarASwitch() {
    if (enviandoRef.current) return; // doble toque: el segundo no hace nada
    enviandoRef.current = true;
    setConfirming(true);
    setSwitchProblema(null);
    try {
      // 1. Confirmar (el envío lo exige). Si ya está confirmado se salta.
      if (!isConfirmed) {
        setPasoSwitch("Confirmando el pedido...");
        try {
          const confirmRes = await fetch(`${theme.api}/orders/${id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client_name: clientName, items, status: "confirmado" }),
          });
          if (!confirmRes.ok) { showToast("No se pudo confirmar el pedido. Intenta de nuevo."); return; }
        } catch {
          showToast("No se pudo confirmar el pedido. Revisa tu conexion."); return;
        }
        setJustConfirmed(true);
      }

      // 2. Pre-validación viva contra Switch (dry-run, cero escrituras).
      setPasoSwitch("Revisando el pedido contra Switch...");
      let pre: { ok: boolean; status: number; d: Record<string, unknown> };
      try {
        const res = await fetch(`${theme.api}/orders/${id}/enviar-switch`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dry: true }),
        });
        pre = { ok: res.ok, status: res.status, d: await res.json() };
      } catch {
        showToast("No se pudo consultar Switch. Revisa tu conexion."); return;
      }

      const preview = pre.d.preview as SwitchPreview | undefined;
      if (!pre.ok || !preview) {
        // 422 = pre-validación con errores; cualquier otro fallo (preventa,
        // Switch caído, ya enviado) también DETIENE y se muestra con su texto:
        // un problema que impide crear el pedido no puede irse en un toast de
        // 3 segundos.
        setSwitchProblema({
          errores: (pre.d.errores as string[] | undefined) ?? [String(pre.d.error || "No se pudo consultar Switch. Intenta de nuevo.")],
          avisos: (pre.d.avisos as AvisoEnvio[] | undefined) ?? [],
          lineas: (pre.d.lineas as SwitchPreviewLinea[] | undefined) ?? [],
          puedeSeguir: false,
        });
        setShowSwitchModal(true);
        return;
      }

      // 3. ¿Algo que decidir? Solo entonces se para.
      const avisos = preview.avisos ?? [];
      if (hayQueDetenerse({ errores: [], avisos })) {
        setSwitchProblema({ errores: [], avisos: avisosBloqueantes(avisos), lineas: preview.lineas, puedeSeguir: true });
        setShowSwitchModal(true);
        return;
      }

      // 4. Todo limpio → se crea el pedido REAL, sin preguntar.
      setPasoSwitch("Creando el pedido en Switch...");
      await crearEnSwitch();
    } finally {
      enviandoRef.current = false;
      setConfirming(false);
      setPasoSwitch(null);
      load();
    }
  }

  // El POST real. Un solo envío por pedido (el candado vive en el server).
  async function crearEnSwitch() {
    setSwitchSending(true);
    try {
      const res = await fetch(`${theme.api}/orders/${id}/enviar-switch`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        setSwitchEnvio({ estado: d.verificado ? "verificado" : "enviado", pedido_switch_id: d.pedidoSwitchId, numero_interno: d.numeroInterno, error_detalle: null });
        setShowSwitchModal(false); setSwitchProblema(null);
        showToast(`Listo — pedido creado en Switch: ${d.numeroInterno}`);
      } else if (d.ambiguo) {
        setSwitchEnvio({ estado: "enviado", pedido_switch_id: null, numero_interno: null, error_detalle: d.error });
        setShowSwitchModal(false); setSwitchProblema(null);
        showToast("Switch no respondio — revisa el panel antes de reintentar.");
      } else {
        setSwitchEnvio({ estado: "error", pedido_switch_id: null, numero_interno: null, error_detalle: d.error || null });
        setSwitchProblema({
          errores: [String(d.error || "Switch rechazo el pedido.")],
          avisos: [], lineas: [], puedeSeguir: false,
        });
        setShowSwitchModal(true);
      }
    } catch {
      // Se perdio la respuesta: el server pudo haber completado el envio.
      // Refrescar el estado real desde la DB en vez de asumir.
      setShowSwitchModal(false); setSwitchProblema(null);
      try {
        const er = await fetch(`${theme.api}/orders/${id}/enviar-switch`);
        if (er.ok) { const ed = await er.json(); setSwitchEnvio(ed.envio || null); }
      } catch { /* sin red */ }
      showToast("Error de conexion — revisa el estado del envio antes de reintentar.");
    }
    setSwitchSending(false);
  }

  // Correo interno, APARTE y opcional.
  async function avisarPorCorreo() {
    setEnviandoAviso(true);
    try {
      const emailRes = await fetch(`${theme.api}/send-order`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: id }),
      });
      showToast(emailRes.ok ? "Aviso enviado por correo a Fashion Group." : "No se pudo enviar el correo. Intenta de nuevo.");
    } catch {
      showToast("No se pudo enviar el correo. Revisa tu conexion.");
    }
    setEnviandoAviso(false);
  }

  // ── EDIT (revert to borrador) ──
  async function editOrder() {
    setSaving(true);
    try {
      const res = await fetch(`${theme.api}/orders/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "borrador" }),
      });
      if (!res.ok) { showToast("Error al editar pedido"); setSaving(false); return; }
    } catch { showToast("Error de conexion"); setSaving(false); return; }
    setSaving(false);
    showToast("Pedido en modo edicion");
    load();
  }

  // ── CLIENTE SWITCH ──
  // Los clientes nuevos se crean desde el panel de Switch — aquí solo se
  // busca y asigna un cliente existente (el sync llena switch_clientes).
  function abrirClienteModal() {
    setShowClienteModal(true);
  }

  // Asigna (o quita, con Contado) el cliente Switch del pedido.
  async function asignarClienteSwitch(c: ClienteSwitchOpcion) {
    setClienteGuardando(true);
    try {
      const res = await fetch(`${theme.api}/clientes-switch`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: id, clienteSwitchId: c.id }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        setClienteSwitch(c.id != null ? { id: c.id, nombre: c.nombre, codigo: c.codigo } : null);
        setShowClienteModal(false);
        showToast(`Cliente Switch: ${nombreDeCliente(c)}`);
      } else {
        showToast(d.error || "No se pudo guardar el cliente. Intenta de nuevo.");
      }
    } catch {
      showToast("No se pudo guardar el cliente. Revisa tu conexion.");
    }
    setClienteGuardando(false);
  }

  // ── DUPLICAR Y CORREGIR (pedido bloqueado por envío a Switch) ──
  // Clona el pedido como borrador NUEVO editable (reemplaza_a = este) y navega.
  // `nombre` y `cliente` vienen del mini-modal: el cliente de Switch es una
  // ELECCIÓN explícita (nunca se hereda del original) y el server la persiste.
  async function duplicarPedido(nombre: string, cliente: ClienteSwitchOpcion) {
    setDuplicando(true);
    setDupError(null);
    try {
      const res = await fetch(`${theme.api}/orders/${id}/duplicar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_name: nombre, cliente_switch_id: cliente.id }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        setShowDupModal(false);
        showToast(d.yaExistia ? `Ya existe ${d.order_number} — te llevo a ese pedido` : `Pedido duplicado: ${d.order_number}`);
        router.push(`/catalogo/${marca}/pedido/${d.id}`);
      } else {
        showToast(d.error || "No se pudo duplicar el pedido. Intenta de nuevo.");
        setDupError(d.error || "No se pudo duplicar el pedido. Intenta de nuevo.");
      }
    } catch {
      showToast("Error de conexion. Intenta de nuevo.");
      setDupError("Error de conexion. Intenta de nuevo.");
    }
    setDuplicando(false);
  }

  async function deleteOrder() {
    setDeletingOrder(true);
    try {
      const res = await fetch(`${theme.api}/orders/${id}`, { method: "DELETE" });
      if (!res.ok) { showToast("Error al eliminar pedido"); setDeletingOrder(false); return; }
    } catch { showToast("Error de conexion"); setDeletingOrder(false); return; }
    setDeletingOrder(false);
    setShowDeleteModal(false);
    router.push(theme.pedidosHref);
  }

  /** Precio de lista del catálogo SOLO si difiere del que tiene la línea. */
  function precioDeLista(item: OrderItem): number | null {
    const lista = typeof item.precio_lista === "number" ? item.precio_lista : null;
    if (lista === null || !(lista > 0)) return null;
    return Math.abs(Number(item.unit_price || 0) - lista) >= 0.01 ? lista : null;
  }

  function updateItem(idx: number, field: string, value: number) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  }
  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  // ── SHARE: PDF + email to client ──
  const [clientEmail, setClientEmail] = useState("");
  const [sendingToClient, setSendingToClient] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [justConfirmed, setJustConfirmed] = useState(false);

  async function downloadPDF() {
    if (!order) return;
    showToast("Generando PDF...");
    try {
      // Lib única de PDF de pedido (mismo layout que el endpoint /pdf y el
      // adjunto de send-order). Imágenes reducidas a ~200px antes de embeber.
      const { downloadCatalogoOrderPdf } = await import("@/lib/catalogo/order-pdf-client");
      const prefix = order.status === "confirmado" ? "Pedido" : "Cotizacion";
      const dateStr = new Date().toISOString().slice(0, 10);
      await downloadCatalogoOrderPdf({
        marca,
        orderNumber: order.order_number,
        clientName,
        createdAt: order.created_at,
        items: items.map(i => ({
          sku: i.sku || "", name: i.name, quantity: i.quantity, unit_price: Number(i.unit_price),
          image_url: i.image_url || "", category: i.category || theme.pdfFallbackCategory,
        })),
        bultoSize: (c, bultoPzas) => theme.bulto(c || theme.pdfFallbackCategory, bultoPzas),
        filename: `${prefix}-${order.order_number}-${dateStr}.pdf`,
      });
      showToast("PDF listo — revisa tu carpeta de descargas");
    } catch {
      showToast("No se pudo generar el PDF. Intenta de nuevo.");
    }
  }

  async function sendToClient() {
    if (!clientEmail.trim() || !clientEmail.includes("@")) {
      showToast("Ingresa un email valido"); return;
    }
    setSendingToClient(true);
    try {
      const res = await fetch(`${theme.api}/send-order`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: id, clientEmail: clientEmail.trim() }),
      });
      if (res.ok) {
        showToast(`Pedido enviado a ${clientEmail.trim()}`);
        setShowEmailInput(false);
        setClientEmail("");
      } else {
        showToast("No se pudo enviar. Intenta de nuevo.");
      }
    } catch {
      showToast("Error de conexion. Intenta de nuevo.");
    }
    setSendingToClient(false);
  }

  // El candado post-envío a Switch deja TODO el contenido de solo lectura.
  const canEdit = isEditorRole && !switchLock;
  const canDelete = ["admin", "secretaria"].includes(role);
  const isConfirmed = order?.status === "confirmado";
  // El cliente solo se cambia mientras el pedido NO tenga un envío vivo en el
  // ERP (el PATCH responde 409; acá no se ofrece un botón que va a fallar).
  const puedeCambiarCliente = isEditorRole && (!switchEnvio || switchEnvio.estado === "error");

  // ── LOADING SKELETON ──
  if (loading || !order) return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="h-4 shimmer w-24 mb-6" />
        <div className="h-7 shimmer w-56 mb-2" />
        <div className="h-4 shimmer w-36 mb-8" />
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-4 py-4 border-b border-gray-50" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="w-14 h-14 shimmer rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 shimmer" style={{ width: `${70 - i * 5}%` }} />
              <div className="h-3 shimmer" style={{ width: `${40 - i * 3}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const totalBultos = items.reduce((s, i) => s + (i.quantity || 0), 0);
  const totalPiezas = items.reduce((s, i) => s + (i.quantity || 0) * bs(i), 0);
  const totalMoney = items.reduce((s, i) => s + (i.quantity || 0) * bs(i) * Number(i.unit_price || 0), 0);

  const suggList = theme.pedido.suggLimit ? suggestions.slice(0, theme.pedido.suggLimit) : suggestions;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Back button */}
      <button onClick={() => router.push(theme.pedidosHref)} className="text-sm text-gray-400 hover:text-black transition mb-4 inline-block">
        ← Volver a Pedidos
      </button>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3" ref={theme.pedido.nameRefEnContenedor ? nameRef : undefined}>
          <span className="text-sm font-mono text-gray-400">{order.order_number}</span>
          <div className="relative flex-1" ref={theme.pedido.nameRefEnContenedor ? undefined : nameRef}>
            {canEdit ? (
              <>
                <input value={clientName} onChange={e => setClientName(e.target.value)}
                  onFocus={() => { if (suggestions.length) setShowSugg(true); }}
                  placeholder={theme.pedido.clientNamePlaceholder ?? undefined}
                  className="text-xl font-semibold border-b border-transparent outline-none transition w-full bg-transparent hover:border-gray-200 focus:border-black" />
                {showSugg && suggestions.length > 0 && (
                  <div className={theme.pedido.suggDropdownClass}>
                    {suggList.map((c, i) => (
                      <button key={i} onClick={() => { setClientName(c.nombre); setShowSugg(false); }}
                        className={theme.pedido.suggItemClass}>{c.nombre}</button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <span className="text-xl font-semibold">{clientName}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Add more products — lleva al CATÁLOGO de la marca en modo
              "agregando a este pedido" (?agregarA=<id>): fotos grandes,
              filtros y stock, y cada Agregar escribe en ESTE pedido. */}
          {canEdit && (
            <button onClick={irAlCatalogoAgregando}
              className="text-xs bg-gray-100 text-gray-600 px-3 py-2.5 rounded-full hover:bg-gray-200 transition min-h-[44px]">
              + Agregar productos
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-4">{new Date(order.created_at).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }).replace(".", "")}</p>

      {/* Candado post-envío a Switch: solo lectura + salida clara (duplicar) */}
      {switchLock && switchEnvio && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 mb-4">
          <p className="text-sm text-amber-900 font-medium">
            Este pedido ya está en Switch como #{switchEnvio.numero_interno || switchEnvio.pedido_switch_id || "?"} — no se puede editar aquí.
          </p>
          {reemplazadoPor ? (
            <p className="text-sm text-amber-800 mt-2">
              Reemplazado por{" "}
              <Link href={`/catalogo/${marca}/pedido/${reemplazadoPor.id}`} className="font-medium underline hover:text-black transition">
                {reemplazadoPor.order_number}
              </Link>
            </p>
          ) : isEditorRole ? (
            <div className="mt-3">
              <button onClick={() => setShowDupModal(true)} disabled={duplicando}
                className="bg-black text-white text-sm font-medium px-4 py-2.5 rounded-md hover:bg-gray-800 active:scale-[0.97] transition disabled:opacity-50 min-h-[44px]">
                {duplicando ? "Duplicando..." : "Duplicar y corregir"}
              </button>
              <p className="text-xs text-amber-700 mt-2">o edítalo directamente en el panel de Switch</p>
            </div>
          ) : null}
        </div>
      )}

      {/* Señal de guardado — DISCRETA (12-ago-2026).
          Daniel: *"quita el autoguardar"*, refiriéndose a que deje de pedir
          atención: se fueron el botón "Guardar" y el letrero verde "Guardado a
          las 15:26". 🔴 EL MECANISMO SE QUEDA, y no es opcional: "+ Agregar
          productos" escribe DIRECTO en el servidor (PATCH /item) mientras las
          cantidades y los precios viven en memoria — sin autoguardado quedaría
          un estado mixto y el correo, el PDF y Switch leerían algo distinto de
          lo que está en pantalla.
          Lo único que sigue pidiendo acción es el FALLO, con su Reintentar. */}
      {canEdit && autoSaveStatus === "error" ? (
        <div className="flex items-center justify-between gap-3 mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          <span className="text-sm text-red-700 font-medium">No se pudo guardar tu cambio</span>
          <button
            onClick={() => performSave()}
            className="bg-black text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-gray-800 active:scale-[0.97] transition min-h-[44px]"
          >
            Reintentar
          </button>
        </div>
      ) : canEdit && (autoSaveStatus === "saving" || autoSaveStatus === "dirty") ? (
        <p className="text-xs text-gray-400 mb-4">Guardando…</p>
      ) : canEdit && autoSaveStatus === "saved" && lastSavedAt ? (
        <p className="text-xs text-gray-400 mb-4">Guardado</p>
      ) : null}

      {/* Items table */}
      {items.length > 0 ? (
        <div className="mb-4">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-gray-200">
                <th className="py-2 text-left text-xs uppercase text-gray-400 font-normal w-12"></th>
                <th className="py-2 text-left text-xs uppercase text-gray-400 font-normal">Producto</th>
                <th className="py-2 text-center text-xs uppercase text-gray-400 font-normal w-16">Bultos</th>
                <th className="py-2 text-center text-xs uppercase text-gray-400 font-normal w-14">Pzas</th>
                <th className="py-2 text-right text-xs uppercase text-gray-400 font-normal w-16">Precio</th>
                <th className="py-2 text-right text-xs uppercase text-gray-400 font-normal w-20">Subtotal</th>
                {canEdit && <th className="w-8"></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-50">
                  <td className="py-2">
                    <div className="w-10 h-10 bg-gray-50 rounded overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {item.image_url ? <img src={supabaseThumb(item.image_url, 160) ?? item.image_url} alt="" className="w-full h-full object-contain" onError={(e) => { const el = e.currentTarget; if (el.src !== item.image_url) el.src = item.image_url; }} /> : null}
                    </div>
                  </td>
                  <td className="py-2">
                    <div className="text-sm">{item.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{item.sku}</div>
                    {/* Pedidos del link: cantidad REAL que había al confirmar.
                        Solo se muestra cuando faltaban piezas — que nadie crea
                        que recibe 12 si hay 8. */}
                    {typeof item.disponible_pzas === "number" &&
                      item.disponible_pzas < linea(item).piezas && (
                        <div className="mt-1 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 tabular-nums">
                          Disponible al confirmar: {formatBultosPiezas(item.disponible_pzas, item.bulto_pzas || bs(item))}
                        </div>
                      )}
                  </td>
                  <td className="py-2 text-center">
                    {canEdit ? (
                      <input type="number" min={1} step={1} value={item.quantity}
                        onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                        className={theme.pedido.qtyInputClass} />
                    ) : (
                      <span className="tabular-nums">{item.quantity}</span>
                    )}
                  </td>
                  <td className="py-2 text-center text-xs text-gray-400 tabular-nums">{linea(item).piezas}</td>
                  <td className="py-2 text-right align-top">
                    {canEdit ? (
                      <input type="number" step={1} min={0} value={item.unit_price}
                        onChange={e => updateItem(idx, "unit_price", parseFloat(e.target.value) || 0)}
                        className="w-14 text-right border-b border-gray-200 text-sm py-0.5 outline-none focus:border-black tabular-nums" />
                    ) : (
                      <span className="tabular-nums">${fmt(item.unit_price)}</span>
                    )}
                    {/* El precio de lista, ahí mismo y sin bloquear: editar el
                        precio es una función legítima. Solo se dice cuando
                        DIFIERE — repetirlo cuando coincide sería ruido. */}
                    {precioDeLista(item) !== null && (
                      <div className="text-xs text-amber-600 tabular-nums mt-0.5 leading-tight">
                        ← lista {fmtPrecio(precioDeLista(item)!)}
                      </div>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums text-sm">${fmt(linea(item).subtotal)}</td>
                  {canEdit && (
                    <td className="py-2 text-center">
                      <button onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500 transition text-xs">x</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-12 text-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg mb-4">
          {canEdit ? (
            <>No hay productos. <button onClick={irAlCatalogoAgregando} className="text-black underline min-h-[44px]">Agregar productos</button></>
          ) : (
            <>No hay productos.</>
          )}
        </div>
      )}

      {/* Totals */}
      <div className="flex items-center justify-between py-3 border-t border-gray-200 mb-6">
        <span className="text-sm text-gray-500">{totalBultos} bultos · {totalPiezas} piezas</span>
        <span className="text-lg font-semibold tabular-nums">${fmt(totalMoney)}</span>
      </div>

      {/* ── CLIENTE DE SWITCH — visible también en BORRADOR (12-ago-2026) ──
          Antes vivía adentro de la rama `isConfirmed` y encima gated a
          admin/secretaria: el vendedor armaba el pedido, lo confirmaba y recién
          ahí alguien más podía ver a qué cliente iba. Ahora se ve —y se
          cambia— desde el primer momento y por quien arma el pedido.
          Con un envío activo a Switch NO se puede cambiar: el pedido YA vive en
          el ERP con el cliente con que se envió (el server responde 409). */}
      {isEditorRole && (
        <div className="border border-gray-200 rounded-lg px-4 py-3 mb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wide text-gray-400">Cliente de Switch</div>
              <div className="text-sm text-gray-800 mt-0.5">
                {nombreDeCliente(clienteSwitch)}
                {clienteSwitch?.codigo && clienteSwitch.nombre ? (
                  <span className="text-gray-400 font-mono text-xs"> · {clienteSwitch.codigo}</span>
                ) : null}
              </div>
            </div>
            {puedeCambiarCliente ? (
              <button onClick={abrirClienteModal}
                className="flex-shrink-0 border border-gray-200 rounded-md px-3 min-h-[44px] text-sm text-gray-700 hover:border-gray-400 transition">
                Cambiar
              </button>
            ) : (
              <span className="flex-shrink-0 text-xs text-gray-400">ya está en Switch</span>
            )}
          </div>
        </div>
      )}

      {/* Actions — ONE primary button */}
      {switchLock ? null : (
        // Bajo candado de Switch la única acción protagonista es "Duplicar y
        // corregir" (en el banner de arriba).
        <div className="space-y-3">
          {isConfirmed && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-center"
              style={justConfirmed ? { animation: "confirmBannerPulse 0.8s ease-out" } : undefined}>
              <div className="flex items-center justify-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 flex-shrink-0"
                  style={justConfirmed ? { animation: "confirmPulse 0.5s ease-out" } : undefined}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </span>
                <span className="text-emerald-700 font-medium text-sm">Pedido confirmado</span>
              </div>
              {(editedAt || order.updated_at) && (
                <span className={`text-xs block mt-1 ${editedAt ? "text-amber-600 font-medium" : "text-emerald-600/70"}`}>
                  {editedAt
                    ? `Editado despues de confirmar: ${fmtDateTime(editedAt)}`
                    : `Ultima edicion interna: ${fmtDateTime(order.updated_at!)}`}
                </span>
              )}
            </div>
          )}

          {/* ERP Switch — el estado del envío, o EL botón. Escritura real en el
              ERP: un envio no-fallido por pedido; el server tiene el candado. */}
          {isEditorRole && (
            switchEnvio && switchEnvio.estado === "verificado" ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Pedido creado en Switch: <span className="font-mono">{switchEnvio.numero_interno}</span> · verificado
              </div>
            ) : switchEnvio && switchEnvio.estado === "enviado" ? (
              <div className="text-sm text-amber-700">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  {switchEnvio.numero_interno
                    ? <>Enviado a Switch: <span className="font-mono">{switchEnvio.numero_interno}</span> (sin verificar)</>
                    : "Envio en revision — confirma en el panel de Switch si el pedido se creo"}
                </div>
                {switchEnvio.error_detalle && <p className="text-xs text-amber-600 mt-1">{switchEnvio.error_detalle}</p>}
              </div>
            ) : (
              <div>
                {switchEnvio?.estado === "error" && switchEnvio.error_detalle && (
                  <p className="text-xs text-red-600 mb-2">Intento anterior fallo: {switchEnvio.error_detalle}</p>
                )}

                {/* Permiso 0001 NEGADO: se dice ACÁ, con el pedido todavía
                    editable, no al final. El botón NO se apaga — el pedido se
                    puede enviar con los precios de lista. */}
                {hayPrecioEditado && permisoPrecio && !permisoPrecio.permiso && permisoPrecio.mensaje && (
                  <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">
                    <p className="text-xs text-red-700">{permisoPrecio.mensaje}</p>
                  </div>
                )}

                {/* Recordatorio anti-duplicado ANTES del toque: este pedido
                    reemplaza a uno que YA está en Switch. Vivía adentro del
                    modal de preview; con un solo toque ese modal ya no aparece
                    en el caso normal, así que el aviso se habría perdido. */}
                {pedidoOriginal?.switch_numero && (
                  <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">
                    <p className="text-xs text-red-700 font-medium">
                      Este pedido reemplaza al {pedidoOriginal.order_number}. Borra el pedido #{pedidoOriginal.switch_numero} en el panel de Switch para no duplicar.
                    </p>
                  </div>
                )}

                {/* UN SOLO TOQUE: confirma, revisa contra Switch y crea el
                    pedido. Solo se detiene si hay algo que decidir. */}
                <button onClick={enviarASwitch} disabled={confirming || !items.length}
                  className="w-full bg-emerald-600 text-white py-3.5 rounded-lg text-sm font-medium hover:bg-emerald-700 active:scale-[0.97] transition disabled:opacity-40">
                  {confirming
                    ? (pasoSwitch ?? "Enviando a Switch...")
                    : switchEnvio?.estado === "error"
                      ? "Reintentar envío a Switch"
                      : "Enviar a Switch"}
                </button>
                {/* El aviso va ANTES del toque, no en un modal después. */}
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Crea el pedido de verdad en Switch ({theme.empresaKey}). Si sale mal, hay que borrarlo a mano en el panel de Switch.
                </p>
              </div>
            )
          )}

          {/* Compartir + aviso interno — secundarios, opcionales */}
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">Compartir pedido</p>
            <div className="flex flex-col gap-2">
              <button onClick={downloadPDF} className="text-xs text-gray-500 hover:text-black transition text-left flex items-center gap-2 min-h-[44px]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Descargar PDF
              </button>
              {/* El correo interno a Fashion Group ya NO sale solo al confirmar:
                  Daniel confirmó que es solo suyo y nadie lo usa como lista de
                  trabajo. Queda como botón aparte, cuando lo quiera. */}
              <button onClick={avisarPorCorreo} disabled={enviandoAviso}
                className="text-xs text-gray-500 hover:text-black transition text-left flex items-center gap-2 min-h-[44px] disabled:opacity-40">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                {enviandoAviso ? "Enviando aviso..." : "Avisar por correo a Fashion Group"}
              </button>
              {!showEmailInput ? (
                <button onClick={() => setShowEmailInput(true)} className="text-xs text-gray-500 hover:text-black transition text-left flex items-center gap-2 min-h-[44px]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  Enviar por email al cliente
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)}
                    placeholder="cliente@email.com" autoFocus
                    onKeyDown={e => e.key === "Enter" && sendToClient()}
                    className="flex-1 border border-gray-200 rounded-md px-2.5 min-h-[44px] text-xs outline-none focus:border-black transition" />
                  <button onClick={sendToClient} disabled={sendingToClient}
                    className="text-xs bg-black text-white px-4 min-h-[44px] rounded-md hover:bg-gray-800 transition disabled:opacity-40">
                    {sendingToClient ? "Enviando..." : "Enviar"}
                  </button>
                  <button onClick={() => { setShowEmailInput(false); setClientEmail(""); }}
                    className="text-xs text-gray-400 hover:text-black transition min-h-[44px] px-2">x</button>
                </div>
              )}
            </div>
          </div>

          {/* Volver a borrador: mientras no haya un envío VIVO en el ERP (un
              intento fallido no cuenta — de ahí se sale editando y reenviando). */}
          {isConfirmed && canEdit && (!switchEnvio || switchEnvio.estado === "error") && (
            <button onClick={editOrder} disabled={saving}
              className="w-full border border-gray-300 text-black py-2.5 rounded-lg text-sm hover:border-gray-500 transition disabled:opacity-40 min-h-[44px]">
              Volver a borrador para editar
            </button>
          )}
        </div>
      )}

      {/* Delete — discreto. Bajo candado de Switch el soft-delete es solo
          OCULTAR local (no toca Switch), y el label lo dice claro. */}
      {canDelete && (!isConfirmed || switchLock) && (
        <button onClick={() => setShowDeleteModal(true)}
          className="text-xs text-gray-400 hover:text-red-500 transition mt-6 py-1 block mx-auto">
          {switchLock ? "Ocultar de la lista (el pedido sigue en Switch)" : "Eliminar pedido"}
        </button>
      )}

      <ConfirmDeleteModal
        open={showDeleteModal}
        title={switchLock ? `Ocultar pedido ${order?.order_number || ""} de la lista?` : `Eliminar pedido ${order?.order_number || ""}?`}
        description={switchLock
          ? `El pedido sigue en Switch como #${switchEnvio?.numero_interno || switchEnvio?.pedido_switch_id || "?"} — aquí solo se oculta de la lista. Para anularlo de verdad, hazlo en el panel de Switch.`
          : `Se eliminara el pedido de ${clientName} con ${items.length} productos ($${fmt(totalMoney)}).`}
        confirmLabel={switchLock ? "Ocultar" : undefined}
        loadingLabel={switchLock ? "Ocultando..." : undefined}
        onConfirm={deleteOrder}
        onCancel={() => setShowDeleteModal(false)}
        loading={deletingOrder}
      />

      {/* PANTALLA DE PROBLEMA — solo aparece cuando el toque SE DETUVO.
          En el camino normal (todo limpio) el pedido se crea sin este modal:
          Daniel *"nos podemos ahorrar un paso"*. Lo que se ve acá es lo que
          hay que decidir ARRIBA, y debajo el pedido resuelto para poder
          mirarlo sin volver a consultar Switch. */}
      {showSwitchModal && switchProblema && (
        <ModalOverlay onBackdropClick={() => { if (!switchSending) setShowSwitchModal(false); }}>
          <div className="bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-lg w-full mx-0 sm:mx-4 border border-gray-200 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-medium mb-2">
              {switchProblema.puedeSeguir ? "Revisa esto antes de enviar" : "No se puede enviar a Switch"}
            </h3>

            {switchProblema.errores.length > 0 && (
              <ul className="text-sm text-red-600 space-y-1.5 mb-4 list-disc pl-4">
                {switchProblema.errores.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
            {switchProblema.avisos.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
                {switchProblema.avisos.map((a, i) => (
                  <p key={i} className="text-xs text-amber-700 py-0.5">⚠ {a.texto}</p>
                ))}
              </div>
            )}

            {/* Las líneas que SÍ cruzaron con Switch, debajo del problema. */}
            {switchProblema.lineas.length > 0 && (
              <>
                <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Lo que sí cruzó con Switch</p>
                <table className="w-full text-xs mb-4">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-400">
                      <th className="py-1.5 text-left font-normal">SKU</th>
                      <th className="py-1.5 text-center font-normal">Piezas</th>
                      <th className="py-1.5 text-right font-normal">Precio Switch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {switchProblema.lineas.map((l, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1.5">
                          <span className="font-mono">{l.sku}</span>
                          <span className="block text-gray-400 truncate max-w-[220px]">{l.descripcionSwitch}</span>
                        </td>
                        <td className="py-1.5 text-center tabular-nums">{l.piezas} <span className="text-gray-400">({l.bultos} bultos)</span></td>
                        <td className="py-1.5 text-right tabular-nums">${fmt(l.precioSwitch)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {switchProblema.puedeSeguir ? (
              <div className="flex gap-3">
                <button onClick={crearEnSwitch} disabled={switchSending}
                  className="flex-1 bg-black text-white px-4 py-2.5 rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition disabled:opacity-50 min-h-[44px]">
                  {switchSending ? "Enviando a Switch..." : "Crear pedido en Switch"}
                </button>
                <button onClick={() => setShowSwitchModal(false)} disabled={switchSending}
                  className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 transition disabled:opacity-50 min-h-[44px]">
                  Cancelar
                </button>
              </div>
            ) : (
              <button onClick={() => setShowSwitchModal(false)}
                className="w-full border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 transition min-h-[44px]">
                Entendido
              </button>
            )}
          </div>
        </ModalOverlay>
      )}

      {/* Modal de cliente Switch: buscador sobre la tabla local switch_clientes.
          Los clientes nuevos se crean desde el panel de Switch (aquí no hay alta). */}
      {showClienteModal && (
        <ModalOverlay onBackdropClick={() => { if (!clienteGuardando) setShowClienteModal(false); }}>
          <div className="bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-lg w-full mx-0 sm:mx-4 border border-gray-200 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-medium mb-1">Cliente de Switch del pedido</h3>
            <p className="text-xs text-gray-500 mb-3">El pedido se creará en Switch a nombre de este cliente.</p>
            <ClienteSwitchPicker
              api={theme.api}
              directorioLabel={theme.switchDirectorioLabel}
              valor={clienteSwitch ? { id: clienteSwitch.id, nombre: clienteSwitch.nombre, codigo: clienteSwitch.codigo } : { id: null, nombre: null, codigo: null }}
              onElegir={asignarClienteSwitch}
              disabled={clienteGuardando}
            />
            <button onClick={() => setShowClienteModal(false)} disabled={clienteGuardando}
              className="mt-3 w-full border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 transition disabled:opacity-40 min-h-[44px]">
              Cerrar
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* Mini-modal de "Duplicar y corregir": una sola decisión y un solo toque
          — tocar el cliente de Switch duplica (el nombre sale de ahí). */}
      {showDupModal && (
        <DuplicarPedidoModal
          orderNumber={order.order_number}
          api={theme.api}
          directorioLabel={theme.switchDirectorioLabel}
          duplicando={duplicando}
          error={dupError}
          onElegir={duplicarPedido}
          onCancel={() => { setShowDupModal(false); setDupError(null); }}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}
