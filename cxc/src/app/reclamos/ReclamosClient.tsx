"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { ConfirmDeleteModal, PullToRefresh } from "@/components/ui";
import UndoToast from "@/components/UndoToast";
import FreshnessChip from "@/components/FreshnessChip";
import { useUndoAction } from "@/lib/hooks/useUndoAction";
import { persistentCacheSet, persistentCacheGet, CACHE_KEYS } from "@/lib/offlineCache";
import { Reclamo, RItem, Foto, Contacto, RView } from "./components/types";

export interface ReclamosInitialData {
  reclamos: Reclamo[];
  contactos: Contacto[];
  customMotivos: string[];
  detail: Reclamo | null;
}
import { EMPRESAS_MAP, calcSub, daysSince, emptyItem, loadCustomMotivos, fetchCustomMotivos, FACTOR_TOTAL } from "./components/constants";
import EmpresaSelector from "./components/EmpresaSelector";
import EmpresaList from "./components/EmpresaList";
import ReclamoForm from "./components/ReclamoForm";
import ReclamoDetail from "./components/ReclamoDetail";
import SettlementModal, { SettlementInput } from "./components/SettlementModal";

// Clave de caché SWR del listado de Reclamos (Fase 3, mismo patrón que el piloto
// CXC #115). La caché vive a nivel de la app (SWRProvider) y persiste entre
// navegaciones → volver a Reclamos pinta al instante el dato cacheado y revalida
// en background (cero flash), en vez del re-fetch desde cero del fetch-on-mount.
const SWR_KEY = "reclamos-list";

interface FetchError extends Error { status?: number }

/** Fetcher puro del listado (misma llamada que tenía loadReclamos). */
async function fetchReclamos(): Promise<Reclamo[]> {
  const res = await fetch("/api/reclamos");
  if (res.status === 401) {
    const e: FetchError = new Error("401");
    e.status = 401;
    throw e;
  }
  if (!res.ok) throw new Error("Error al cargar reclamos");
  const d = await res.json();
  return Array.isArray(d) ? d : [];
}

export default function ReclamosClient({ initialData }: { initialData: ReclamosInitialData }) {
  return <Suspense><ReclamosPage initialData={initialData} /></Suspense>;
}

function ReclamosPage({ initialData }: { initialData: ReclamosInitialData }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { authChecked, role } = useAuth({ moduleKey: "reclamos", allowedRoles: ["admin", "secretaria"] });
  const [view, _setView] = useState<RView>((searchParams.get("view") as RView) || "list");
  const [urlId] = useState(searchParams.get("id") || "");
  const [error, setError] = useState<string | null>(null);
  // Modo viaje: timestamp del snapshot mostrado + si vino del cache (offline).
  const [dataTs, setDataTs] = useState<number | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [current, setCurrent] = useState<Reclamo | null>(initialData.detail);
  const [saving, setSaving] = useState(false);

  // List state — support ?empresa= from search quick actions
  const [activeEmpresa, setActiveEmpresa] = useState<string | null>(() => {
    const urlEmpresa = searchParams.get("empresa");
    return urlEmpresa ? decodeURIComponent(urlEmpresa) : null;
  });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState(""); const [filterEstado, setFilterEstado] = useState("all");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState("");
  const [settleOpen, setSettleOpen] = useState(false);
  const [settling, setSettling] = useState(false);
  const [sortCol, setSortCol] = useState<"fecha" | "dias" | "total" | "estado">("fecha");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedHistorial, setExpandedHistorial] = useState<Record<string, boolean>>({});
  // Form state
  const [fEmpresa, setFEmpresa] = useState(""); const [fFecha, setFFecha] = useState(new Date().toISOString().slice(0, 10));
  const [fFactura, setFFactura] = useState(""); const [fPedido, setFPedido] = useState(""); const [fNotas, setFNotas] = useState("");
  const [fItems, setFItems] = useState<RItem[]>([emptyItem()]);
  const [savedReclamoId, setSavedReclamoId] = useState<string | null>(null); const [savedNroReclamo, setSavedNroReclamo] = useState("");
  const [formFotos, setFormFotos] = useState<Foto[]>([]); const [uploadingFormFoto, setUploadingFormFoto] = useState(false);
  // Detail state
  const [nota, setNota] = useState(""); const [editMode, setEditMode] = useState(false);
  const [editEmpresa, setEditEmpresa] = useState(""); const [editFactura, setEditFactura] = useState("");
  const [editPedido, setEditPedido] = useState(""); const [editFecha, setEditFecha] = useState("");
  const [editNotas, setEditNotas] = useState(""); const [editEstado, setEditEstado] = useState("");
  const [editItems, setEditItems] = useState<RItem[]>([]); const [editSaving, setEditSaving] = useState(false);
  const [contactos, setContactos] = useState<Contacto[]>(initialData.contactos); const [toast, setToast] = useState<string | null>(null);

  // Listado vía SWR (Fase 3, receta del piloto CXC #115). initialData.reclamos
  // del SSR entra como fallbackData → primer paint instantáneo del server, luego
  // SWR revalida en cliente. Clave condicional por auth (null hasta authChecked):
  // no pega a /api/reclamos antes de confirmar rol. dedupingInterval 60s evita
  // refetch redundante en re-navegaciones rápidas; onSuccess persiste el snapshot
  // de Modo viaje (NO se toca la key de offlineCache). keepPreviousData (global,
  // SWRProvider) mantiene en pantalla el último dato al revalidar (cero flash).
  const { data: reclamosData, isLoading: reclamosLoading, mutate: mutateReclamos } = useSWR<Reclamo[]>(
    authChecked ? SWR_KEY : null,
    fetchReclamos,
    {
      fallbackData: initialData.reclamos,
      dedupingInterval: 60_000,
      revalidateOnFocus: true,
      onSuccess: (arr) => {
        persistentCacheSet(CACHE_KEYS.RECLAMOS, arr);
        setDataTs(Date.now());
        setFromCache(false);
      },
      onError: (err: FetchError) => {
        // 401 mid-sesión: limpiar y volver al login (igual que el loadReclamos viejo).
        if (err?.status === 401) { sessionStorage.clear(); router.push("/"); return; }
        // Sin red: keepPreviousData ya mantiene el último dato; marcar que es
        // stale para el chip de frescura (Modo viaje) y avisar.
        const cached = persistentCacheGet<Reclamo[]>(CACHE_KEYS.RECLAMOS);
        if (cached) setDataTs(cached.ts);
        setFromCache(true);
        setToast("Sin conexión. Mostrando datos guardados."); setTimeout(() => setToast(null), 3000);
      },
    },
  );
  const reclamos = reclamosData ?? [];
  const loading = reclamosLoading; // con fallbackData hay dato → false; sin flash al revalidar
  // loadReclamos → revalidación forzada (mutate). Mismo nombre para no tocar los
  // call-sites (PullToRefresh, onReload, onViewSaved, y los post-escritura).
  const loadReclamos = useCallback(async () => { await mutateReclamos(); }, [mutateReclamos]);

  const { pendingUndo: pendingUndoReclamo, scheduleAction: scheduleUndoReclamo, undoAction: undoActionReclamo } = useUndoAction();
  const [customMotivos, setCustomMotivos] = useState<string[]>(initialData.customMotivos);
  const [addingMotivo, setAddingMotivo] = useState<number | null>(null);
  const [addingEditMotivo, setAddingEditMotivo] = useState<number | null>(null); const [newMotivoText, setNewMotivoText] = useState("");

  // Nuevo Reclamo ya NO usa borrador autosave (el flujo toma ~1 min y el borrador
  // causaba confusión: reaparecía como "borrador de hace X días" tras guardar).
  // Limpieza one-time: borra cualquier borrador zombi que haya quedado en
  // localStorage, para que las secretarias que ya tenían uno no vean el banner
  // una última vez.
  useEffect(() => {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("fg_draft_reclamo_")) localStorage.removeItem(k);
      }
    } catch { /* localStorage no disponible — ignorar */ }
  }, []);

  function buildUrl(v: RView, id: string | null | undefined, empresa: string | null): string {
    const params = new URLSearchParams();
    if (empresa) params.set("empresa", empresa);
    if (v === "form") { params.set("view", "form"); if (id) params.set("id", id); }
    else if (v === "detail" && id) { params.set("view", "detail"); params.set("id", id); }
    const qs = params.toString();
    return qs ? `/reclamos?${qs}` : "/reclamos";
  }

  // Transiciones de NIVEL (list↔form↔detail) → push: cada nivel deja entrada
  // en el historial para que el Back del navegador deshaga un nivel a la vez.
  // Los cambios al MISMO nivel (search, filtro de estado, sort) son useState
  // puro y no tocan la URL, así que no contaminan el historial.
  function setView(v: RView, id?: string) {
    _setView(v);
    router.push(buildUrl(v, id, activeEmpresa));
  }

  // Cambio de empresa = drill-down de nivel (selector ↔ empresa ↔ detalle) → push.
  function changeEmpresa(empresa: string | null, opts?: { view?: RView; id?: string | null }) {
    setActiveEmpresa(empresa);
    const v = opts?.view ?? view;
    const id = opts?.id ?? (v === "detail" ? current?.id : null);
    _setView(v);
    router.push(buildUrl(v, id, empresa));
  }

  // loadDetail SOLO trae datos y muestra el detalle localmente (sin navegar).
  // La entrada de historial la crea el caller (setView/changeEmpresa) una sola
  // vez. Así popstate (Back/Forward) y los refresh inline no pushean de más.
  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/reclamos/${id}`);
      if (res.ok) { const d = await res.json(); if (d?.id) { setCurrent(d); _setView("detail"); } }
    } catch { setToast("Sin conexión. Verifica tu internet e intenta de nuevo."); setTimeout(() => setToast(null), 3000); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Back/Forward: reconstruye los 3 niveles (empresa + view + id) desde la URL.
    function onPopState() {
      const params = new URLSearchParams(window.location.search);
      const v = (params.get("view") as RView) || "list";
      const id = params.get("id") || "";
      const emp = params.get("empresa");
      setActiveEmpresa(emp ? decodeURIComponent(emp) : null);
      _setView(v);
      if (v === "detail" && id) loadDetail(id);
      else if (v === "list") setCurrent(null);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [loadDetail]);

  const loadContactos = useCallback(async () => {
    try { const res = await fetch("/api/reclamos/contactos"); if (res.ok) setContactos(await res.json()); } catch { setToast("Sin conexión. Verifica tu internet e intenta de nuevo."); setTimeout(() => setToast(null), 3000); }
  }, []);

  // initialData viene del SSR fresco al cargar la página → sembrar el snapshot
  // y el timestamp para que el chip de frescura aparezca de inmediato.
  useEffect(() => {
    persistentCacheSet(CACHE_KEYS.RECLAMOS, initialData.reclamos);
    setDataTs(Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Skipear el primer mount cuando ya tenemos initialData del SSR.
  // initialData.detail está poblado si la URL traía ?view=detail&id=X.
  const initialLoadDetailRef = useRef(true);
  useEffect(() => {
    if (!authChecked) return;
    if (initialLoadDetailRef.current) {
      initialLoadDetailRef.current = false;
      return;
    }
    if (urlId && view === "detail") loadDetail(urlId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, urlId, loadDetail]);

  const initialLoadListRef = useRef(true);
  useEffect(() => {
    if (!authChecked) return;
    if (initialLoadListRef.current) {
      initialLoadListRef.current = false;
      return;
    }
    // El listado lo revalida SWR solo al activarse la clave (authChecked) — sin
    // loadReclamos() redundante aquí. contactos/motivos siguen su carga propia.
    loadContactos();
    fetchCustomMotivos().then(setCustomMotivos);
  }, [authChecked, loadContactos]);

  if (!authChecked) return null;

  function resetForm() {
    setFEmpresa(""); setFFecha(new Date().toISOString().slice(0, 10)); setFFactura("");
    setFPedido(""); setFNotas(""); setFItems([emptyItem()]); setError(null);
    setSavedReclamoId(null); setSavedNroReclamo(""); setFormFotos([]);
  }

  async function saveReclamo() {
    if (!fEmpresa || !fFecha || !fFactura) { setError("Completa empresa, factura y fecha."); return; }
    const items = fItems.filter((i) => i.referencia || i.cantidad > 0);
    if (!items.length) { setError("Agrega al menos un ítem."); return; }
    setSaving(true); setError(null);
    try {
      const empInfo = EMPRESAS_MAP[fEmpresa];
      const res = await fetch("/api/reclamos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: fEmpresa, proveedor: empInfo?.proveedor || "", marca: empInfo?.marca || "", nro_factura: fFactura, nro_orden_compra: fPedido, fecha_reclamo: fFecha, notas: fNotas, items }) });
      if (res.ok) { const saved = await res.json(); setSavedReclamoId(saved.id); setSavedNroReclamo(saved.nro_reclamo || ""); setFormFotos([]); loadReclamos(); }
      else { const err = await res.json().catch(() => null); setError(err?.error || "Error al guardar."); }
    } catch { setError("Error de conexión."); }
    setSaving(false);
  }

  async function addNota() {
    if (!current || !nota.trim()) return;
    try {
      const res = await fetch(`/api/reclamos/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seguimiento_nota: nota, autor: role }) });
      if (!res.ok) { setToast("Error al agregar nota"); setTimeout(() => setToast(null), 3000); return; }
      setNota(""); await loadDetail(current.id);
      setToast("Nota agregada"); setTimeout(() => setToast(null), 3000);
    } catch { setToast("Error al agregar nota"); setTimeout(() => setToast(null), 3000); }
  }
  async function changeEstado(e: string) {
    if (!current || current.estado === e) return;
    // Marcar Pagado no es un flip simple: captura el monto recuperado + NC(s) en
    // un modal y el server hace insert + flip atómico. (Revertir Pagado→Enviado y
    // las demás transiciones siguen el PATCH normal — el settlement se conserva.)
    if (e === "Pagado" && current.estado === "Enviado") { setSettleOpen(true); return; }
    // Optimistic: update estado badge immediately
    const prevEstado = current.estado;
    setCurrent({ ...current, estado: e });
    try {
      const res = await fetch(`/api/reclamos/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: e }) });
      if (!res.ok) { setCurrent(prev => prev ? { ...prev, estado: prevEstado } : prev); setToast("No se pudo cambiar el estado. Intenta de nuevo."); setTimeout(() => setToast(null), 3000); return; }
      setToast(`Estado actualizado a ${e}`); setTimeout(() => setToast(null), 3000);
      loadReclamos();
    } catch { setCurrent(prev => prev ? { ...prev, estado: prevEstado } : prev); setToast("Error de conexion. Intenta de nuevo."); setTimeout(() => setToast(null), 3000); }
  }

  // Settlement: marca Pagado capturando monto recuperado + nota(s) de crédito.
  async function submitSettlement(rows: SettlementInput[]) {
    if (!current) return;
    setSettling(true);
    try {
      const res = await fetch(`/api/reclamos/${current.id}/settlements`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settlements: rows, markPaid: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setToast(data?.error || "No se pudo marcar como Pagado."); setTimeout(() => setToast(null), 5000); return; }
      setSettleOpen(false);
      await loadDetail(current.id); loadReclamos();
      setToast("Recuperación registrada — reclamo Pagado"); setTimeout(() => setToast(null), 3000);
    } catch { setToast("Error de conexión. Intenta de nuevo."); setTimeout(() => setToast(null), 5000); }
    finally { setSettling(false); }
  }

  // Agregar una NC adicional a un reclamo ya Pagado (settlement fraccionado).
  async function addSettlement(rows: SettlementInput[]) {
    if (!current) return;
    try {
      const res = await fetch(`/api/reclamos/${current.id}/settlements`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settlements: rows }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setToast(data?.error || "No se pudo guardar la nota de crédito."); setTimeout(() => setToast(null), 5000); return; }
      await loadDetail(current.id); loadReclamos();
      setToast("Nota de crédito agregada"); setTimeout(() => setToast(null), 3000);
    } catch { setToast("Error de conexión. Intenta de nuevo."); setTimeout(() => setToast(null), 5000); }
  }

  async function removeSettlement(sid: string) {
    if (!current) return;
    try {
      const res = await fetch(`/api/reclamos/${current.id}/settlements?sid=${sid}`, { method: "DELETE" });
      if (!res.ok) { setToast("No se pudo eliminar la nota de crédito."); setTimeout(() => setToast(null), 3000); return; }
      await loadDetail(current.id); loadReclamos();
      setToast("Nota de crédito eliminada"); setTimeout(() => setToast(null), 3000);
    } catch { setToast("Error de conexión. Intenta de nuevo."); setTimeout(() => setToast(null), 3000); }
  }
  function requestDeleteReclamo(id: string) {
    setShowDeleteConfirm(false);
    setConfirmDeleteId(id);
  }

  async function confirmDeleteReclamo() {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`/api/reclamos/${id}`, { method: "DELETE" });
      if (!res.ok) { setToast("No se pudo eliminar el reclamo."); setTimeout(() => setToast(null), 3000); return; }
      setCurrent(null); setView("list"); loadReclamos();
    } catch { setToast("Error de conexion."); setTimeout(() => setToast(null), 3000); }
  }

  async function uploadFoto(file: File) {
    if (!current) return;
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch(`/api/reclamos/${current.id}/fotos`, { method: "POST", body: fd });
      if (!res.ok) { setToast("No se pudo subir la foto."); setTimeout(() => setToast(null), 3000); return; }
      await loadDetail(current.id);
    } catch { setToast("Error al subir foto."); setTimeout(() => setToast(null), 3000); }
  }
  async function deleteFoto(fotoId: string, path: string) {
    if (!current) return;
    try {
      await fetch(`/api/reclamos/${current.id}/fotos`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ foto_id: fotoId, storage_path: path }) });
      await loadDetail(current.id);
    } catch { setToast("Error al eliminar foto."); setTimeout(() => setToast(null), 3000); }
  }

  async function saveEdit() {
    if (!current) return;
    setEditSaving(true);
    try {
      await fetch(`/api/reclamos/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: editEmpresa, proveedor: EMPRESAS_MAP[editEmpresa]?.proveedor || current.proveedor, marca: EMPRESAS_MAP[editEmpresa]?.marca || current.marca, nro_factura: editFactura, nro_orden_compra: editPedido, fecha_reclamo: editFecha, notas: editNotas, estado: editEstado }) });
      await fetch(`/api/reclamos/${current.id}/items`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: editItems }) });
      setEditMode(false); await loadDetail(current.id); loadReclamos();
      setToast("Cambios guardados"); setTimeout(() => setToast(null), 3000);
    } catch { setToast("Sin conexión. Verifica tu internet e intenta de nuevo."); setTimeout(() => setToast(null), 3000); }
    setEditSaving(false);
  }

  // "Pendiente" = reclamo en vuelo con el proveedor = estado "Enviado" (ni Borrador
  // ni Pagado). Antes era `!== "Pagado"`, que incluía Borradores no enviados e
  // inflaba el total, el conteo de abiertos y las alertas. (La lista completa se
  // sigue mostrando desde `reclamos`, así que los borradores siguen visibles/editables.)
  const pendientes = reclamos.filter((r) => r.estado === "Enviado");
  const totalPendiente = pendientes.reduce((s, r) => s + calcSub(r.reclamo_items ?? []) * FACTOR_TOTAL, 0);
  const alertas = pendientes.filter((r) => daysSince(r.fecha_reclamo) > 45).length;
  // ── Confirm modal — always rendered (used by list + detail views) ──
  const deleteModal = (
    <ConfirmDeleteModal
      open={!!confirmDeleteId}
      onCancel={() => setConfirmDeleteId(null)}
      onConfirm={confirmDeleteReclamo}
      title="¿Eliminar reclamo?"
      description={(() => {
        const r = reclamos.find((x) => x.id === confirmDeleteId);
        return r
          ? `Se eliminará el reclamo ${r.nro_reclamo} de ${r.empresa} (Factura: ${r.nro_factura || "—"}). Esta acción no se puede deshacer.`
          : "Esta acción no se puede deshacer.";
      })()}
    />
  );

  // ── LIST VIEW ──
  if (view === "list") {
    if (!activeEmpresa) {
      return (
        <PullToRefresh onRefresh={loadReclamos}>
          <EmpresaSelector
            role={role}
            reclamos={reclamos}
            loading={loading}
            contactos={contactos}
            globalSearch={globalSearch}
            setGlobalSearch={setGlobalSearch}
            expandedHistorial={expandedHistorial}
            setExpandedHistorial={setExpandedHistorial}
            totalPendiente={totalPendiente}
            pendientes={pendientes}
            alertas={alertas}
            onNewReclamo={() => { resetForm(); setView("form"); }}
            onSelectEmpresa={(empresa) => { changeEmpresa(empresa); setSearch(""); setFilterEstado("all"); }}
            onLoadDetail={(id, empresa) => { changeEmpresa(empresa, { view: "detail", id }); loadDetail(id); }}
            freshness={<FreshnessChip ts={dataTs} fromCache={fromCache} />}
          />
          {deleteModal}
        </PullToRefresh>
      );
    }

    return (
      <PullToRefresh onRefresh={loadReclamos}>
        <EmpresaList
          role={role}
          activeEmpresa={activeEmpresa}
          reclamos={reclamos}
          contactos={contactos}
          search={search}
          setSearch={setSearch}
          filterEstado={filterEstado}
          setFilterEstado={setFilterEstado}
          selectionMode={selectionMode}
          setSelectionMode={setSelectionMode}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          sortCol={sortCol}
          setSortCol={setSortCol}
          sortDir={sortDir}
          setSortDir={setSortDir}
          onBack={() => changeEmpresa(null)}
          onNewReclamo={() => { resetForm(); setFEmpresa(activeEmpresa); setView("form"); }}
          onLoadDetail={(id) => { setView("detail", id); loadDetail(id); }}
          onDeleteReclamo={(id) => requestDeleteReclamo(id)}
          onReload={loadReclamos}
        />
        {deleteModal}
      </PullToRefresh>
    );
  }

  // ── FORM VIEW ──
  if (view === "form") {
    return (
      <ReclamoForm
        fEmpresa={fEmpresa} setFEmpresa={setFEmpresa}
        fFecha={fFecha} setFFecha={setFFecha}
        fFactura={fFactura} setFFactura={setFFactura}
        fPedido={fPedido} setFPedido={setFPedido}
        fNotas={fNotas} setFNotas={setFNotas}
        fItems={fItems} setFItems={setFItems}
        savedReclamoId={savedReclamoId}
        savedNroReclamo={savedNroReclamo}
        formFotos={formFotos} setFormFotos={setFormFotos}
        uploadingFormFoto={uploadingFormFoto} setUploadingFormFoto={setUploadingFormFoto}
        saving={saving}
        error={error}
        customMotivos={customMotivos} setCustomMotivos={setCustomMotivos}
        addingMotivo={addingMotivo} setAddingMotivo={setAddingMotivo}
        newMotivoText={newMotivoText} setNewMotivoText={setNewMotivoText}
        onSave={saveReclamo}
        onCancel={() => { resetForm(); setView("list"); }}
        onViewSaved={() => { const id = savedReclamoId; resetForm(); loadReclamos(); if (id) { setView("detail", id); loadDetail(id); } }}
        onResetAndCreateAnother={resetForm}
      />
    );
  }

  // ── DETAIL VIEW ──
  if (!current) return null;

  return (
    <>
      <ReclamoDetail
        current={current}
        role={role}
        contacto={contactos.find((ct) => ct.empresa === current.empresa) || null}
        nota={nota} setNota={setNota}
        editMode={editMode} setEditMode={setEditMode}
        editEmpresa={editEmpresa} setEditEmpresa={setEditEmpresa}
        editFactura={editFactura} setEditFactura={setEditFactura}
        editPedido={editPedido} setEditPedido={setEditPedido}
        editFecha={editFecha} setEditFecha={setEditFecha}
        editNotas={editNotas} setEditNotas={setEditNotas}
        editEstado={editEstado} setEditEstado={setEditEstado}
        editItems={editItems} setEditItems={setEditItems}
        editSaving={editSaving}
        showDeleteConfirm={showDeleteConfirm} setShowDeleteConfirm={setShowDeleteConfirm}
        toast={toast}
        customMotivos={customMotivos} setCustomMotivos={setCustomMotivos}
        addingEditMotivo={addingEditMotivo} setAddingEditMotivo={setAddingEditMotivo}
        newMotivoText={newMotivoText} setNewMotivoText={setNewMotivoText}
        onBack={() => { setCurrent(null); setView("list"); }}
        onBackToEmpresa={() => { setCurrent(null); changeEmpresa(activeEmpresa, { view: "list", id: null }); }}
        onBackToReclamos={() => { setCurrent(null); changeEmpresa(null, { view: "list", id: null }); }}
        onAddNota={addNota}
        onChangeEstado={changeEstado}
        onDeleteReclamo={requestDeleteReclamo}
        onSaveEdit={saveEdit}
        onUploadFoto={uploadFoto}
        onDeleteFoto={deleteFoto}
        onAddSettlement={addSettlement}
        onRemoveSettlement={removeSettlement}
        showToast={(msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); }}
      />
      <SettlementModal
        open={settleOpen}
        reclamado={current.monto_reclamado_snapshot ?? calcSub(current.reclamo_items ?? []) * FACTOR_TOTAL}
        submitting={settling}
        onClose={() => setSettleOpen(false)}
        onSubmit={submitSettlement}
      />
      {pendingUndoReclamo && <UndoToast message={pendingUndoReclamo.message} startedAt={pendingUndoReclamo.startedAt} onUndo={undoActionReclamo} />}
      {deleteModal}
    </>
  );
}
