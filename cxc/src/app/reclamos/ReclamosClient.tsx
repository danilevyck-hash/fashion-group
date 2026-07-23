"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { ConfirmDeleteModal, PullToRefresh } from "@/components/ui";
import UndoToast from "@/components/UndoToast";
import { useUndoAction } from "@/lib/hooks/useUndoAction";
import { useDraftAutoSave } from "@/lib/hooks/useDraftAutoSave";
import { Reclamo, RItem, Foto, LocalFoto, Contacto, RView } from "./components/types";
import { validateFotoFile, uploadReclamoFoto, compressImage } from "./components/fotoUpload";

export interface ReclamosInitialData {
  reclamos: Reclamo[];
  contactos: Contacto[];
  customMotivos: string[];
  detail: Reclamo | null;
}
import { EMPRESAS_MAP, calcSub, daysSince, emptyItem, loadCustomMotivos, fetchCustomMotivos, reclamoTaxes } from "./components/constants";
import EmpresaSelector from "./components/EmpresaSelector";
import EmpresaList from "./components/EmpresaList";
import ReclamoForm from "./components/ReclamoForm";
import ReclamoDetail from "./components/ReclamoDetail";
import SettlementModal, { SettlementInput } from "./components/SettlementModal";
import ComprobanteModal from "./components/ComprobanteModal";
import { validateReclamoFull } from "@/lib/reclamos/validate";

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
  // Borrado unificado (single + bulk): lista de ids pendientes de confirmar.
  // null = modal cerrado. UN solo modal en todo el flujo (lista y detalle).
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [settleOpen, setSettleOpen] = useState(false);
  const [settling, setSettling] = useState(false);
  const [enProcesoOpen, setEnProcesoOpen] = useState(false);
  const [enProcesoSaving, setEnProcesoSaving] = useState(false);
  const [sortCol, setSortCol] = useState<"fecha" | "dias" | "total" | "estado">("fecha");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedHistorial, setExpandedHistorial] = useState<Record<string, boolean>>({});
  // Form state
  const [fEmpresa, setFEmpresa] = useState(""); const [fFecha, setFFecha] = useState(new Date().toISOString().slice(0, 10));
  const [fFactura, setFFactura] = useState(""); const [fPedido, setFPedido] = useState(""); const [fNotas, setFNotas] = useState("");
  const [fItems, setFItems] = useState<RItem[]>([emptyItem()]);
  const [fFacturaPdfPath, setFFacturaPdfPath] = useState<string | null>(null);
  const [savedReclamoId, setSavedReclamoId] = useState<string | null>(null); const [savedNroReclamo, setSavedNroReclamo] = useState("");
  // Fotos seleccionadas ANTES de guardar (preview local) — se suben al crear el
  // reclamo, con estado por foto. uploadingDetailFoto = spinner en modo edición.
  const [pendingFotos, setPendingFotos] = useState<LocalFoto[]>([]);
  const [uploadingDetailFoto, setUploadingDetailFoto] = useState(false);
  // Detail state
  const [nota, setNota] = useState(""); const [editMode, setEditMode] = useState(false);
  const [editEmpresa, setEditEmpresa] = useState(""); const [editFactura, setEditFactura] = useState("");
  const [editPedido, setEditPedido] = useState(""); const [editFecha, setEditFecha] = useState("");
  const [editNotas, setEditNotas] = useState("");
  const [editFacturaPdfPath, setEditFacturaPdfPath] = useState<string | null>(null);
  const [editItems, setEditItems] = useState<RItem[]>([]); const [editSaving, setEditSaving] = useState(false);
  const [contactos, setContactos] = useState<Contacto[]>(initialData.contactos); const [toast, setToast] = useState<string | null>(null);

  // Listado vía SWR (Fase 3, receta del piloto CXC #115). initialData.reclamos
  // del SSR entra como fallbackData → primer paint instantáneo del server, luego
  // SWR revalida en cliente. Clave condicional por auth (null hasta authChecked):
  // no pega a /api/reclamos antes de confirmar rol. dedupingInterval 60s evita
  // refetch redundante en re-navegaciones rápidas. keepPreviousData (global,
  // SWRProvider) mantiene en pantalla el último dato al revalidar (cero flash).
  const { data: reclamosData, isLoading: reclamosLoading, mutate: mutateReclamos } = useSWR<Reclamo[]>(
    authChecked ? SWR_KEY : null,
    fetchReclamos,
    {
      fallbackData: initialData.reclamos,
      dedupingInterval: 60_000,
      revalidateOnFocus: true,
      onError: (err: FetchError) => {
        // 401 mid-sesión: limpiar y volver al login (igual que el loadReclamos viejo).
        if (err?.status === 401) { sessionStorage.clear(); router.push("/"); return; }
        // Sin red: keepPreviousData ya mantiene el último dato en pantalla.
        setToast("No se pudo actualizar. Verifica tu conexión."); setTimeout(() => setToast(null), 3000);
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

  // Borrador del reclamo NUEVO (reintroducido 4-jul a pedido de Daniel — es el
  // form más largo del sistema). La versión anterior se quitó porque el
  // borrador "reaparecía tras guardar"; eso se corrige aquí con dos guardas:
  // (1) post-guardado (savedReclamoId) el autosave se considera vacío y no
  // re-crea el borrador, y (2) el save exitoso lo limpia explícitamente.
  const reclamoDraftData = useMemo(
    () => ({ fEmpresa, fFecha, fFactura, fPedido, fNotas, fItems }),
    [fEmpresa, fFecha, fFactura, fPedido, fNotas, fItems],
  );
  const isReclamoDraftEmpty = useCallback((d: typeof reclamoDraftData) => {
    if (savedReclamoId) return true; // guarda (1): no re-crear tras guardar
    return !d.fEmpresa && !d.fFactura && !d.fPedido && !d.fNotas &&
      d.fItems.every(i => !i.referencia && !i.descripcion && !i.motivo && !(Number(i.precio_unitario) > 0));
  }, [savedReclamoId]);
  const { draft: reclamoDraft, hasDraft: hasReclamoDraft, clearDraft: clearReclamoDraft, draftTimeAgo: reclamoDraftTimeAgo } =
    useDraftAutoSave("reclamo", reclamoDraftData, isReclamoDraftEmpty);
  function restoreReclamoDraft() {
    if (!reclamoDraft) return;
    setFEmpresa(reclamoDraft.fEmpresa || "");
    setFFecha(reclamoDraft.fFecha || new Date().toISOString().slice(0, 10));
    setFFactura(reclamoDraft.fFactura || "");
    setFPedido(reclamoDraft.fPedido || "");
    setFNotas(reclamoDraft.fNotas || "");
    setFItems(reclamoDraft.fItems?.length ? reclamoDraft.fItems : [emptyItem()]);
    clearReclamoDraft();
  }

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
  const loadDetail = useCallback(async (id: string): Promise<Reclamo | null> => {
    try {
      const res = await fetch(`/api/reclamos/${id}`, { cache: "no-store" });
      if (res.ok) { const d = await res.json(); if (d?.id) { setCurrent(d); _setView("detail"); return d as Reclamo; } }
    } catch { setToast("Sin conexión. Verifica tu internet e intenta de nuevo."); setTimeout(() => setToast(null), 3000); }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Entra a modo edición poblando los campos desde el reclamo dado. Compartido
  // por el botón "Editar" del detalle y la acción "Editar" de cada fila de la
  // lista (que primero carga el detalle y luego entra a edición con ese dato).
  const enterEdit = useCallback((r: Reclamo) => {
    setEditEmpresa(r.empresa);
    setEditFactura(r.nro_factura || "");
    setEditPedido(r.nro_orden_compra || "");
    setEditFecha(r.fecha_reclamo || "");
    setEditNotas(r.notas || "");
    setEditFacturaPdfPath(r.factura_pdf_path ?? null);
    setEditItems((r.reclamo_items || []).map((i) => ({ ...i })));
    setEditMode(true);
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
      if (v === "detail" && id) { setEditMode(false); loadDetail(id); }
      else if (v === "list") setCurrent(null);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [loadDetail]);

  const loadContactos = useCallback(async () => {
    try { const res = await fetch("/api/reclamos/contactos"); if (res.ok) setContactos(await res.json()); } catch { setToast("Sin conexión. Verifica tu internet e intenta de nuevo."); setTimeout(() => setToast(null), 3000); }
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
    setFPedido(""); setFNotas(""); setFItems([emptyItem()]); setFFacturaPdfPath(null); setError(null);
    setSavedReclamoId(null); setSavedNroReclamo("");
    setPendingFotos((prev) => { prev.forEach((f) => URL.revokeObjectURL(f.previewUrl)); return []; });
  }

  // ── Fotos del formulario (adjuntar ANTES de guardar) ──────────────────────
  // Selección MÚLTIPLE: valida cada una y las deja en preview local (no suben
  // todavía). Respeta el tope de 5: toma las que caben y avisa si sobran.
  function addPendingFoto(files: File[]) {
    setPendingFotos((prev) => {
      const slots = 5 - prev.length;
      if (slots <= 0) { setToast("Ya tienes el máximo de 5 fotos."); setTimeout(() => setToast(null), 4000); return prev; }
      const additions: LocalFoto[] = [];
      let rejected = 0;
      for (const file of files) {
        if (additions.length >= slots) break;
        if (validateFotoFile(file)) { rejected++; continue; }
        additions.push({ localId: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), status: "pending" });
      }
      const overflow = files.length - rejected - additions.length;
      if (overflow > 0) { setToast(`Se agregaron ${additions.length}; ${overflow} no caben (máximo 5 fotos).`); setTimeout(() => setToast(null), 5000); }
      else if (rejected > 0) { setToast(`${rejected} archivo(s) no son imágenes válidas y se omitieron.`); setTimeout(() => setToast(null), 5000); }
      return additions.length > 0 ? [...prev, ...additions] : prev;
    });
  }
  // Quita una foto del preview. Si ya estaba subida (reclamo creado), la borra del server.
  function removePendingFoto(lf: LocalFoto) {
    setPendingFotos((prev) => prev.filter((x) => x.localId !== lf.localId));
    URL.revokeObjectURL(lf.previewUrl);
    if (lf.uploaded && savedReclamoId) {
      fetch(`/api/reclamos/${savedReclamoId}/fotos`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ foto_id: lf.uploaded.id, storage_path: lf.uploaded.storage_path }) }).catch(() => {});
    }
  }
  // Sube las fotos pendientes/erróneas a un reclamo ya creado. Estado por foto.
  // Devuelve true si TODAS quedaron subidas.
  async function uploadPendingFotos(reclamoId: string): Promise<boolean> {
    const targets = pendingFotos.filter((f) => f.status === "pending" || f.status === "error");
    let allOk = true;
    for (const lf of targets) {
      setPendingFotos((prev) => prev.map((x) => x.localId === lf.localId ? { ...x, status: "uploading", error: undefined } : x));
      try {
        const uploaded = await uploadReclamoFoto(reclamoId, lf.file);
        setPendingFotos((prev) => prev.map((x) => x.localId === lf.localId ? { ...x, status: "done", uploaded, error: undefined } : x));
      } catch (e) {
        allOk = false;
        const msg = e instanceof Error ? e.message : "No se pudo subir la foto.";
        setPendingFotos((prev) => prev.map((x) => x.localId === lf.localId ? { ...x, status: "error", error: msg } : x));
      }
    }
    return allOk;
  }
  // Reintenta solo las fotos que fallaron (el reclamo ya existe).
  async function retryFotos() {
    if (!savedReclamoId) return;
    setSaving(true);
    const allOk = await uploadPendingFotos(savedReclamoId);
    setError(allOk ? null : "Algunas fotos siguen sin subir. Revísalas y reintenta.");
    setSaving(false);
  }

  async function saveReclamo() {
    setError(null);
    let reclamoId = savedReclamoId;
    // Si el reclamo aún no existe, validar campos y crearlo. Si ya existe (caso
    // reintento de fotos tras un fallo), saltar la creación y solo subir fotos.
    if (!reclamoId) {
      // Obligatoriedad completa (cabecera + cada ítem). Solo notas/PDF/fotos opcionales.
      const vErr = validateReclamoFull(
        { empresa: fEmpresa, nro_factura: fFactura, fecha_reclamo: fFecha, nro_orden_compra: fPedido },
        fItems,
      );
      if (vErr) { setError(vErr); return; }
    }
    setSaving(true);
    try {
      if (!reclamoId) {
        const empInfo = EMPRESAS_MAP[fEmpresa];
        const res = await fetch("/api/reclamos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: fEmpresa, proveedor: empInfo?.proveedor || "", marca: empInfo?.marca || "", nro_factura: fFactura, nro_orden_compra: fPedido, fecha_reclamo: fFecha, notas: fNotas, items: fItems, factura_pdf_path: fFacturaPdfPath }) });
        if (!res.ok) { const err = await res.json().catch(() => null); setError(err?.error || "Error al guardar."); setSaving(false); return; }
        const saved = await res.json();
        reclamoId = saved.id;
        setSavedReclamoId(saved.id); setSavedNroReclamo(saved.nro_reclamo || "");
        clearReclamoDraft(); // guarda (2) del bug original: sin esto reaparecía tras guardar
        loadReclamos();
      }
      // Subir las fotos adjuntas (si hay) al reclamo recién creado — un solo flujo.
      if (reclamoId) {
        const allOk = await uploadPendingFotos(reclamoId);
        if (!allOk) setError("El reclamo se guardó, pero algunas fotos no subieron. Reintenta abajo.");
      }
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
    // Creado → En proceso: modal de comprobante (foto o PDF, OPCIONAL en este paso).
    if (e === "En proceso" && current.estado === "Creado") { setEnProcesoOpen(true); return; }
    // Marcar Pagado (desde Creado = pago inmediato, o desde En proceso): UN solo
    // modal — si falta comprobante, el propio SettlementModal integra la sección
    // de adjuntar (obligatoria). El server (settlements) re-valida ambas cosas.
    // (Los rollbacks de un paso siguen el PATCH normal — comprobante/settlement se conservan.)
    if (e === "Pagado" && (current.estado === "Creado" || current.estado === "En proceso")) {
      setSettleOpen(true); return;
    }
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

  // Creado → En proceso: el comprobante (foto o PDF) es OPCIONAL. Si viene foto se
  // comprime en cliente; el PDF va tal cual (compressImage lo devuelve intacto).
  async function submitEnProceso(file: File | null, nota: string) {
    if (!current) return;
    setEnProcesoSaving(true);
    try {
      const fd = new FormData();
      if (file) fd.append("file", await compressImage(file));
      if (nota) fd.append("nota", nota);
      const res = await fetch(`/api/reclamos/${current.id}/en-proceso`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setToast(data?.error || "No se pudo pasar a En proceso."); setTimeout(() => setToast(null), 5000); return; }
      setEnProcesoOpen(false);
      await loadDetail(current.id); loadReclamos();
      setToast(file ? "Comprobante subido — reclamo En proceso" : "Reclamo En proceso"); setTimeout(() => setToast(null), 3000);
    } catch { setToast("Error de conexión. Intenta de nuevo."); setTimeout(() => setToast(null), 5000); }
    finally { setEnProcesoSaving(false); }
  }

  // Settlement: marca Pagado capturando monto recuperado + nota(s) de crédito.
  // Si el modal trae comprobante (reclamo sin adjunto), se sube PRIMERO — si esa
  // subida falla no se toca el estado; si el settlement falla después, el
  // comprobante queda adjunto y el reintento ya no lo re-pide.
  async function submitSettlement(rows: SettlementInput[], comprobante: File | null) {
    if (!current) return;
    setSettling(true);
    try {
      if (comprobante) {
        const fd = new FormData();
        fd.append("file", await compressImage(comprobante));
        const up = await fetch(`/api/reclamos/${current.id}/comprobante`, { method: "POST", body: fd });
        const upData = await up.json().catch(() => ({}));
        if (!up.ok) { setToast(upData?.error || "No se pudo subir el comprobante."); setTimeout(() => setToast(null), 5000); return; }
      }
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
  // Single (desde detalle o fila) y bulk (desde la barra de selección) abren el
  // MISMO modal de confirmación, vía la lista de ids pendientes.
  function requestDeleteReclamo(id: string) { setPendingDelete([id]); }
  function requestDeleteSelected(ids: string[]) { if (ids.length > 0) setPendingDelete([...ids]); }

  async function confirmDelete() {
    if (!pendingDelete || pendingDelete.length === 0) return;
    const ids = pendingDelete;
    setDeleting(true);
    // Soft-delete (deleted:true) por cada id — el endpoint DELETE es admin-only.
    const results = await Promise.allSettled(
      ids.map((id) => fetch(`/api/reclamos/${id}`, { method: "DELETE" })),
    );
    const failed = results.filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok),
    ).length;
    setDeleting(false);
    setPendingDelete(null);
    setSelectionMode(false); setSelectedIds([]);
    // Si el reclamo abierto fue borrado, vuelve a la lista.
    if (current && ids.includes(current.id)) { setCurrent(null); setView("list"); }
    if (failed === ids.length) {
      setToast("No se pudo eliminar. Intenta de nuevo."); setTimeout(() => setToast(null), 3000);
    } else if (failed > 0) {
      setToast(`Se eliminaron ${ids.length - failed} de ${ids.length}. Reintenta los demás.`); setTimeout(() => setToast(null), 4000);
    } else {
      setToast(ids.length > 1 ? `${ids.length} reclamos eliminados` : "Reclamo eliminado"); setTimeout(() => setToast(null), 3000);
    }
    loadReclamos();
  }

  async function uploadFoto(files: File[]) {
    if (!current || files.length === 0) return;
    // Tope de 5: descuenta las que ya tiene el reclamo y avisa si sobran.
    const slots = 5 - (current.reclamo_fotos?.length ?? 0);
    if (slots <= 0) { setToast("Ya tienes el máximo de 5 fotos."); setTimeout(() => setToast(null), 4000); return; }
    const valid = files.filter((f) => !validateFotoFile(f));
    const invalid = files.length - valid.length;
    const toUpload = valid.slice(0, slots);
    const overflow = valid.length - toUpload.length;
    if (toUpload.length === 0) {
      setToast(invalid > 0 ? "Ningún archivo es una imagen válida." : "Ya tienes el máximo de 5 fotos."); setTimeout(() => setToast(null), 5000); return;
    }
    setUploadingDetailFoto(true);
    const errores: string[] = [];
    try {
      for (const file of toUpload) {
        try {
          await uploadReclamoFoto(current.id, file); // comprime + timeout — nunca cuelga
        } catch (e) {
          errores.push(e instanceof Error ? e.message : "No se pudo subir una foto.");
        }
      }
      await loadDetail(current.id);
      // Feedback honesto: nunca falla en silencio (mensaje real de #191).
      if (errores.length > 0) { setToast(errores[0]); setTimeout(() => setToast(null), 6000); }
      else if (overflow > 0 || invalid > 0) { setToast(`Se subieron ${toUpload.length}; ${overflow + invalid} se omitieron (máximo 5 / no válidas).`); setTimeout(() => setToast(null), 5000); }
    } finally {
      setUploadingDetailFoto(false);
    }
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
    // Obligatoriedad completa al editar (cabecera + cada ítem + >=1 ítem). Bloquea
    // dejar un reclamo incompleto. Solo notas/PDF/fotos opcionales.
    const vErr = validateReclamoFull(
      { empresa: editEmpresa, nro_factura: editFactura, fecha_reclamo: editFecha, nro_orden_compra: editPedido },
      editItems,
    );
    if (vErr) { setToast(vErr); setTimeout(() => setToast(null), 5000); return; }
    setEditSaving(true);
    try {
      // El estado NO se edita desde el form (solo botón de transición / settlement).
      const patchRes = await fetch(`/api/reclamos/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: editEmpresa, proveedor: EMPRESAS_MAP[editEmpresa]?.proveedor || current.proveedor, marca: EMPRESAS_MAP[editEmpresa]?.marca || current.marca, nro_factura: editFactura, nro_orden_compra: editPedido, fecha_reclamo: editFecha, notas: editNotas, factura_pdf_path: editFacturaPdfPath }) });
      if (!patchRes.ok) {
        // No tocar los ítems ni cerrar el form si el header falló: mostrar el error real.
        const err = await patchRes.json().catch(() => null);
        setToast(err?.error || "No se pudo guardar el reclamo."); setTimeout(() => setToast(null), 5000);
        setEditSaving(false); return;
      }
      const itemsRes = await fetch(`/api/reclamos/${current.id}/items`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: editItems }) });
      if (!itemsRes.ok) {
        const err = await itemsRes.json().catch(() => null);
        setToast(err?.error || "Se guardaron los datos pero no los ítems. Revisa e intenta de nuevo."); setTimeout(() => setToast(null), 5000);
        await loadDetail(current.id); loadReclamos();
        setEditSaving(false); return;
      }
      setEditMode(false); await loadDetail(current.id); loadReclamos();
      setToast("Cambios guardados"); setTimeout(() => setToast(null), 3000);
    } catch { setToast("Sin conexión. Verifica tu internet e intenta de nuevo."); setTimeout(() => setToast(null), 3000); }
    setEditSaving(false);
  }

  // "Pendiente" = reclamo abierto (aún no Pagado) = estado "Creado". Pipeline de
  // 2 estados: Creado (abierto) → Pagado (resuelto vía settlement).
  // Pendientes = todo lo que no está Pagado (Creado + En proceso = reclamo abierto).
  const pendientes = reclamos.filter((r) => r.estado !== "Pagado");
  const totalPendiente = pendientes.reduce((s, r) => s + reclamoTaxes(r.empresa, calcSub(r.reclamo_items ?? [])).total, 0);
  const alertas = pendientes.filter((r) => daysSince(r.fecha_reclamo) > 45).length;
  // ── Confirm modal — UN solo modal, usado por lista (single + bulk) y detalle ──
  const pendingCount = pendingDelete?.length ?? 0;
  const deleteModal = (
    <ConfirmDeleteModal
      open={pendingCount > 0}
      loading={deleting}
      onCancel={() => setPendingDelete(null)}
      onConfirm={confirmDelete}
      title={pendingCount > 1 ? "Eliminar reclamos" : "Eliminar reclamo"}
      description={
        pendingCount > 1
          ? `¿Seguro que quieres eliminar los ${pendingCount} reclamos seleccionados? Esta acción no se puede deshacer.`
          : "¿Seguro que quieres eliminar este reclamo? Esta acción no se puede deshacer."
      }
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
            onLoadDetail={(id, empresa) => { setEditMode(false); changeEmpresa(empresa, { view: "detail", id }); loadDetail(id); }}
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
          onLoadDetail={(id) => { setEditMode(false); setView("detail", id); loadDetail(id); }}
          onEditReclamo={(id) => { setView("detail", id); loadDetail(id).then((r) => { if (r) enterEdit(r); }); }}
          onDeleteReclamo={(id) => requestDeleteReclamo(id)}
          onDeleteSelected={requestDeleteSelected}
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
        draftBanner={!savedReclamoId && hasReclamoDraft ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 flex items-center justify-between gap-4">
            <p className="text-sm text-amber-800">Tienes un borrador guardado de {reclamoDraftTimeAgo}. ¿Restaurar?</p>
            <div className="flex items-center gap-3 flex-shrink-0">
              <button onClick={restoreReclamoDraft} className="bg-black text-white text-sm px-4 py-1.5 rounded-md hover:bg-gray-800 transition">Restaurar</button>
              <button onClick={clearReclamoDraft} className="text-sm text-amber-700 hover:text-amber-900 transition">Descartar</button>
            </div>
          </div>
        ) : null}
        fEmpresa={fEmpresa} setFEmpresa={setFEmpresa}
        fFecha={fFecha} setFFecha={setFFecha}
        fFactura={fFactura} setFFactura={setFFactura}
        fPedido={fPedido} setFPedido={setFPedido}
        fNotas={fNotas} setFNotas={setFNotas}
        fItems={fItems} setFItems={setFItems}
        facturaPdfPath={fFacturaPdfPath} setFacturaPdfPath={setFFacturaPdfPath}
        savedReclamoId={savedReclamoId}
        savedNroReclamo={savedNroReclamo}
        pendingFotos={pendingFotos}
        onAddFoto={addPendingFoto} onRemoveFoto={removePendingFoto} onRetryFotos={retryFotos}
        saving={saving}
        error={error}
        customMotivos={customMotivos} setCustomMotivos={setCustomMotivos}
        addingMotivo={addingMotivo} setAddingMotivo={setAddingMotivo}
        newMotivoText={newMotivoText} setNewMotivoText={setNewMotivoText}
        onSave={saveReclamo}
        onCancel={() => { resetForm(); setView("list"); }}
        onViewSaved={() => { const id = savedReclamoId; resetForm(); setEditMode(false); loadReclamos(); if (id) { setView("detail", id); loadDetail(id); } }}
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
        editFacturaPdfPath={editFacturaPdfPath} setEditFacturaPdfPath={setEditFacturaPdfPath}
        editItems={editItems} setEditItems={setEditItems}
        editSaving={editSaving}
        onStartEdit={() => enterEdit(current)}
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
        uploadingFoto={uploadingDetailFoto}
        onDeleteFoto={deleteFoto}
        onAddSettlement={addSettlement}
        onRemoveSettlement={removeSettlement}
        showToast={(msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); }}
      />
      <SettlementModal
        open={settleOpen}
        reclamado={current.monto_reclamado_snapshot ?? reclamoTaxes(current.empresa, calcSub(current.reclamo_items ?? [])).total}
        submitting={settling}
        requireComprobante={!current.comprobante_url}
        onClose={() => setSettleOpen(false)}
        onSubmit={submitSettlement}
      />
      <ComprobanteModal
        open={enProcesoOpen}
        submitting={enProcesoSaving}
        requireFile={false}
        title={'Pasar a "En proceso"'}
        description="Adjunta el comprobante (foto o PDF) si ya lo tienes — en este paso es opcional."
        submitLabel="Pasar a En proceso"
        onClose={() => setEnProcesoOpen(false)}
        onSubmit={submitEnProceso}
      />
      {pendingUndoReclamo && <UndoToast message={pendingUndoReclamo.message} startedAt={pendingUndoReclamo.startedAt} onUndo={undoActionReclamo} />}
      {deleteModal}
    </>
  );
}
