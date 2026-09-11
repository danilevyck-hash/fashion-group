"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import useSWR from "swr";
import { opcionesDelServidor, useSembrarDelServidor } from "@/lib/swr-servidor";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { ConfirmDeleteModal, PullToRefresh } from "@/components/ui";
import UndoToast from "@/components/UndoToast";
import { useUndoAction } from "@/lib/hooks/useUndoAction";
import { useDraftAutoSave } from "@/lib/hooks/useDraftAutoSave";
import { hoyPanama } from "@/lib/fecha-panama";
import { Reclamo, RItem, LocalFoto, Contacto, RView } from "./components/types";
import { validateFotoFile, uploadReclamoFoto, compressImage } from "./components/fotoUpload";

export interface ReclamosInitialData {
  reclamos: Reclamo[];
  contactos: Contacto[];
  detail: Reclamo | null;
}
import { EMPRESAS_MAP, emptyItem, reclamoTaxes, calcSub } from "./components/constants";
import EmpresaSelector from "./components/EmpresaSelector";
import EmpresaList from "./components/EmpresaList";
import ReclamoForm from "./components/ReclamoForm";
import ReclamoDetail from "./components/ReclamoDetail";
import SettlementModal, { SettlementInput } from "./components/SettlementModal";
import { validateReclamoFull, validateReclamoNuevo } from "@/lib/reclamos/validate";
import { facturasATexto, facturasDe } from "@/lib/reclamos/facturas";
import { itemsAGuardar, type LineaFactura } from "@/lib/reclamos/lineas-factura";

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

  // List state — support ?empresa= from search quick actions. El filtro y la
  // búsqueda de la página de empresa viven en la URL, adentro de EmpresaList.
  const [activeEmpresa, setActiveEmpresa] = useState<string | null>(() => {
    const urlEmpresa = searchParams.get("empresa");
    return urlEmpresa ? decodeURIComponent(urlEmpresa) : null;
  });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Borrado unificado (single + bulk): lista de ids pendientes de confirmar.
  // null = modal cerrado. UN solo modal en todo el flujo (lista y detalle).
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [globalSearch, setGlobalSearch] = useState("");
  const [settleOpen, setSettleOpen] = useState(false);
  const [settling, setSettling] = useState(false);
  // Form state (Nuevo reclamo). La fecha del reclamo (`fecha_reclamo`) ya no se
  // teclea: es el día en que se crea; la que importa es la FECHA DE FACTURA.
  const [fEmpresa, setFEmpresa] = useState("");
  const [fFacturas, setFFacturas] = useState<string[]>([]);
  const [fFechaFactura, setFFechaFactura] = useState("");
  const [fPedido, setFPedido] = useState(""); const [fNotas, setFNotas] = useState("");
  const [fItems, setFItems] = useState<RItem[]>([emptyItem()]);
  const [fLineas, setFLineas] = useState<LineaFactura[]>([]);
  const [fSeleccion, setFSeleccion] = useState<Record<number, RItem>>({});
  const [fFacturaPdfPath, setFFacturaPdfPath] = useState<string | null>(null);
  const [savedReclamoId, setSavedReclamoId] = useState<string | null>(null); const [savedNroReclamo, setSavedNroReclamo] = useState("");
  // Fotos seleccionadas ANTES de guardar (preview local) — se suben al crear el
  // reclamo, con estado por foto. uploadingDetailFoto = spinner en modo edición.
  const [pendingFotos, setPendingFotos] = useState<LocalFoto[]>([]);
  const [uploadingDetailFoto, setUploadingDetailFoto] = useState(false);
  // Detail state
  const [nota, setNota] = useState(""); const [editMode, setEditMode] = useState(false);
  const [editEmpresa, setEditEmpresa] = useState(""); const [editFacturas, setEditFacturas] = useState<string[]>([]);
  const [editPedido, setEditPedido] = useState(""); const [editFecha, setEditFecha] = useState("");
  const [editFechaFactura, setEditFechaFactura] = useState("");
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
  //
  // 🔑 `opcionesDelServidor` apaga SOLO la petición inicial — la que repetía la
  // consulta que el server component ACABA de hacer (481 ms medidos por visita).
  // `revalidateOnFocus: true` SE QUEDA, y no es un detalle: los reclamos los
  // editan varias personas a la vez y no hay realtime, así que volver a la
  // pestaña es cómo cada uno se entera de lo que hicieron los demás.
  const { data: reclamosData, isLoading: reclamosLoading, mutate: mutateReclamos } = useSWR<Reclamo[]>(
    authChecked ? SWR_KEY : null,
    fetchReclamos,
    {
      ...opcionesDelServidor(initialData.reclamos),
      dedupingInterval: 60_000,
      revalidateOnFocus: true,
      onError: (err: FetchError) => {
        if (err?.status === 401) { sessionStorage.clear(); router.push("/"); return; }
        setToast("No se pudo actualizar. Verifica tu conexión."); setTimeout(() => setToast(null), 3000);
      },
    },
  );
  useSembrarDelServidor(mutateReclamos, initialData.reclamos);

  const reclamos = reclamosData ?? [];
  const loading = reclamosLoading;
  const loadReclamos = useCallback(async () => { await mutateReclamos(); }, [mutateReclamos]);

  // 🔴 EL BORRADO SE PUEDE DESHACER 5 SEGUNDOS (el patrón de la casa). Estaba
  // cableado y no se disparaba nunca: el modal decía «no se puede deshacer» y
  // el servidor hacía soft delete. Ahora: confirmar → el reclamo sale de la
  // lista al instante → 5 s para «Deshacer» → recién ahí se borra en la base.
  const { pendingUndo: pendingUndoReclamo, scheduleAction: scheduleUndoReclamo, undoAction: undoActionReclamo } = useUndoAction();

  // Borrador del reclamo NUEVO (reintroducido 4-jul a pedido de Daniel — es el
  // form más largo del sistema). Dos guardas: (1) post-guardado el autosave se
  // considera vacío y no re-crea el borrador, y (2) el save exitoso lo limpia.
  const reclamoDraftData = useMemo(
    () => ({ fEmpresa, fFacturas, fFechaFactura, fPedido, fNotas, fItems, fLineas, fSeleccion, fFacturaPdfPath }),
    [fEmpresa, fFacturas, fFechaFactura, fPedido, fNotas, fItems, fLineas, fSeleccion, fFacturaPdfPath],
  );
  const isReclamoDraftEmpty = useCallback((d: typeof reclamoDraftData) => {
    if (savedReclamoId) return true;
    return !d.fEmpresa && d.fFacturas.length === 0 && !d.fPedido && !d.fNotas && !d.fFacturaPdfPath &&
      d.fItems.every(i => !i.referencia && !i.descripcion && !i.motivo && !(Number(i.precio_unitario) > 0));
  }, [savedReclamoId]);
  const { draft: reclamoDraft, hasDraft: hasReclamoDraft, clearDraft: clearReclamoDraft, draftTimeAgo: reclamoDraftTimeAgo } =
    useDraftAutoSave("reclamo", reclamoDraftData, isReclamoDraftEmpty);
  function restoreReclamoDraft() {
    if (!reclamoDraft) return;
    setFEmpresa(reclamoDraft.fEmpresa || "");
    setFFacturas(Array.isArray(reclamoDraft.fFacturas) ? reclamoDraft.fFacturas : []);
    setFFechaFactura(reclamoDraft.fFechaFactura || "");
    setFPedido(reclamoDraft.fPedido || "");
    setFNotas(reclamoDraft.fNotas || "");
    setFItems(reclamoDraft.fItems?.length ? reclamoDraft.fItems : [emptyItem()]);
    setFLineas(Array.isArray(reclamoDraft.fLineas) ? reclamoDraft.fLineas : []);
    setFSeleccion(reclamoDraft.fSeleccion && typeof reclamoDraft.fSeleccion === "object" ? reclamoDraft.fSeleccion : {});
    setFFacturaPdfPath(reclamoDraft.fFacturaPdfPath || null);
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
  // El filtro y la búsqueda de la página de empresa van con `replace` (useUrlState).
  function setView(v: RView, id?: string) {
    _setView(v);
    router.push(buildUrl(v, id, activeEmpresa));
  }

  function changeEmpresa(empresa: string | null, opts?: { view?: RView; id?: string | null }) {
    setActiveEmpresa(empresa);
    const v = opts?.view ?? view;
    const id = opts?.id ?? (v === "detail" ? current?.id : null);
    _setView(v);
    router.push(buildUrl(v, id, empresa));
  }

  const loadDetail = useCallback(async (id: string): Promise<Reclamo | null> => {
    try {
      const res = await fetch(`/api/reclamos/${id}`, { cache: "no-store" });
      if (res.ok) { const d = await res.json(); if (d?.id) { setCurrent(d); _setView("detail"); return d as Reclamo; } }
    } catch { setToast("Sin conexión. Verifica tu internet e intenta de nuevo."); setTimeout(() => setToast(null), 3000); }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enterEdit = useCallback((r: Reclamo) => {
    setEditEmpresa(r.empresa);
    setEditFacturas(facturasDe(r.nro_factura));
    setEditPedido(r.nro_orden_compra || "");
    setEditFecha(r.fecha_reclamo || "");
    setEditFechaFactura(r.fecha_factura || "");
    setEditNotas(r.notas || "");
    setEditFacturaPdfPath(r.factura_pdf_path ?? null);
    setEditItems((r.reclamo_items || []).map((i) => ({ ...i })));
    setEditMode(true);
  }, []);

  useEffect(() => {
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

  const initialLoadDetailRef = useRef(true);
  useEffect(() => {
    if (!authChecked) return;
    if (initialLoadDetailRef.current) { initialLoadDetailRef.current = false; return; }
    if (urlId && view === "detail") loadDetail(urlId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, urlId, loadDetail]);

  const initialLoadListRef = useRef(true);
  useEffect(() => {
    if (!authChecked) return;
    if (initialLoadListRef.current) { initialLoadListRef.current = false; return; }
    loadContactos();
  }, [authChecked, loadContactos]);

  if (!authChecked) return null;

  function resetForm() {
    setFEmpresa(""); setFFacturas([]); setFFechaFactura(""); setFPedido(""); setFNotas("");
    setFItems([emptyItem()]); setFLineas([]); setFSeleccion({}); setFFacturaPdfPath(null); setError(null);
    setSavedReclamoId(null); setSavedNroReclamo("");
    setPendingFotos((prev) => { prev.forEach((f) => URL.revokeObjectURL(f.previewUrl)); return []; });
  }

  // ── Fotos del formulario (adjuntar ANTES de guardar) ──────────────────────
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
  function removePendingFoto(lf: LocalFoto) {
    setPendingFotos((prev) => prev.filter((x) => x.localId !== lf.localId));
    URL.revokeObjectURL(lf.previewUrl);
    if (lf.uploaded && savedReclamoId) {
      fetch(`/api/reclamos/${savedReclamoId}/fotos`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ foto_id: lf.uploaded.id, storage_path: lf.uploaded.storage_path }) }).catch(() => {});
    }
  }
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
    const items = itemsAGuardar(fSeleccion, fItems, fLineas.length > 0);
    const nro_factura = facturasATexto(fFacturas);
    if (!reclamoId) {
      const vErr = validateReclamoNuevo(
        { empresa: fEmpresa, nro_factura, fecha_factura: fFechaFactura, fecha_reclamo: hoyPanama(), nro_orden_compra: fPedido, factura_pdf_path: fFacturaPdfPath },
        items,
      );
      if (vErr) { setError(vErr); return; }
    }
    setSaving(true);
    try {
      if (!reclamoId) {
        const empInfo = EMPRESAS_MAP[fEmpresa];
        const res = await fetch("/api/reclamos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: fEmpresa, proveedor: empInfo?.proveedor || "", marca: empInfo?.marca || "", nro_factura, fecha_factura: fFechaFactura || null, nro_orden_compra: fPedido, fecha_reclamo: hoyPanama(), notas: fNotas, items, factura_pdf_path: fFacturaPdfPath }) });
        if (!res.ok) { const err = await res.json().catch(() => null); setError(err?.error || "No se pudo guardar. Intenta de nuevo en unos segundos."); setSaving(false); return; }
        const saved = await res.json();
        reclamoId = saved.id;
        setSavedReclamoId(saved.id); setSavedNroReclamo(saved.nro_reclamo || "");
        clearReclamoDraft();
        loadReclamos();
      }
      if (reclamoId) {
        const allOk = await uploadPendingFotos(reclamoId);
        if (!allOk) setError("El reclamo se guardó, pero algunas fotos no subieron. Reintenta abajo.");
      }
    } catch { setError("Sin conexión. Verifica tu internet e intenta de nuevo."); }
    setSaving(false);
  }

  async function addNota() {
    if (!current || !nota.trim()) return;
    try {
      const res = await fetch(`/api/reclamos/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seguimiento_nota: nota, autor: role }) });
      if (!res.ok) { setToast("No se pudo agregar la nota. Intenta de nuevo."); setTimeout(() => setToast(null), 3000); return; }
      setNota(""); await loadDetail(current.id);
      setToast("Nota agregada"); setTimeout(() => setToast(null), 3000);
    } catch { setToast("No se pudo agregar la nota. Intenta de nuevo."); setTimeout(() => setToast(null), 3000); }
  }

  // Dos movimientos de estado desde la pantalla: marcar Pagado (con comprobante y
  // nota de crédito, vía el modal) y «Volver a por cobrar» si fue un error.
  // «En proceso» ya no se ofrece (0 usos en 3 meses).
  async function changeEstado(e: string) {
    if (!current || current.estado === e) return;
    if (e === "Pagado") { setSettleOpen(true); return; }
    const prevEstado = current.estado;
    setCurrent({ ...current, estado: e });
    try {
      const res = await fetch(`/api/reclamos/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: e }) });
      if (!res.ok) { setCurrent(prev => prev ? { ...prev, estado: prevEstado } : prev); setToast("No se pudo cambiar el estado. Intenta de nuevo."); setTimeout(() => setToast(null), 3000); return; }
      setToast("Listo, vuelve a estar por cobrar"); setTimeout(() => setToast(null), 3000);
      loadReclamos();
    } catch { setCurrent(prev => prev ? { ...prev, estado: prevEstado } : prev); setToast("Sin conexión. Verifica tu internet e intenta de nuevo."); setTimeout(() => setToast(null), 3000); }
  }

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
      setToast("Listo, cobrado — reclamo Pagado"); setTimeout(() => setToast(null), 3000);
    } catch { setToast("Sin conexión. Verifica tu internet e intenta de nuevo."); setTimeout(() => setToast(null), 5000); }
    finally { setSettling(false); }
  }

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
    } catch { setToast("Sin conexión. Verifica tu internet e intenta de nuevo."); setTimeout(() => setToast(null), 5000); }
  }

  async function removeSettlement(sid: string) {
    if (!current) return;
    try {
      const res = await fetch(`/api/reclamos/${current.id}/settlements?sid=${sid}`, { method: "DELETE" });
      if (!res.ok) { setToast("No se pudo quitar la nota de crédito."); setTimeout(() => setToast(null), 3000); return; }
      await loadDetail(current.id); loadReclamos();
      setToast("Nota de crédito quitada"); setTimeout(() => setToast(null), 3000);
    } catch { setToast("Sin conexión. Verifica tu internet e intenta de nuevo."); setTimeout(() => setToast(null), 3000); }
  }

  function requestDeleteReclamo(id: string) { setPendingDelete([id]); }
  function requestDeleteSelected(ids: string[]) { if (ids.length > 0) setPendingDelete([...ids]); }

  function confirmDelete() {
    if (!pendingDelete || pendingDelete.length === 0) return;
    const ids = pendingDelete;
    setPendingDelete(null);
    setSelectionMode(false); setSelectedIds([]);
    if (current && ids.includes(current.id)) { setCurrent(null); setView("list"); }
    // Optimista: salen de la lista ya; la base recién se toca a los 5 s.
    mutateReclamos((prev) => (prev ?? []).filter((r) => !ids.includes(r.id)), { revalidate: false });
    scheduleUndoReclamo({
      id: ids.join(","),
      message: ids.length > 1 ? `${ids.length} reclamos eliminados` : "Reclamo eliminado",
      execute: async () => {
        const results = await Promise.allSettled(ids.map((id) => fetch(`/api/reclamos/${id}`, { method: "DELETE" })));
        const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
        if (failed > 0) { setToast(failed === ids.length ? "No se pudo eliminar. Intenta de nuevo." : `Se eliminaron ${ids.length - failed} de ${ids.length}. Reintenta los demás.`); setTimeout(() => setToast(null), 4000); }
        await loadReclamos();
      },
      onRevert: () => { void loadReclamos(); },
    });
  }

  async function uploadFoto(files: File[]) {
    if (!current || files.length === 0) return;
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
        try { await uploadReclamoFoto(current.id, file); }
        catch (e) { errores.push(e instanceof Error ? e.message : "No se pudo subir una foto."); }
      }
      await loadDetail(current.id);
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
    } catch { setToast("No se pudo eliminar la foto. Intenta de nuevo."); setTimeout(() => setToast(null), 3000); }
  }

  async function saveEdit() {
    if (!current) return;
    const nro_factura = facturasATexto(editFacturas);
    const vErr = validateReclamoFull(
      { empresa: editEmpresa, nro_factura, fecha_factura: editFechaFactura, fecha_reclamo: editFecha, nro_orden_compra: editPedido },
      editItems,
    );
    if (vErr) { setToast(vErr); setTimeout(() => setToast(null), 5000); return; }
    setEditSaving(true);
    try {
      const patchRes = await fetch(`/api/reclamos/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: editEmpresa, proveedor: EMPRESAS_MAP[editEmpresa]?.proveedor || current.proveedor, marca: EMPRESAS_MAP[editEmpresa]?.marca || current.marca, nro_factura, fecha_factura: editFechaFactura || null, nro_orden_compra: editPedido, fecha_reclamo: editFecha, notas: editNotas, factura_pdf_path: editFacturaPdfPath }) });
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => null);
        setToast(err?.error || "No se pudo guardar el reclamo."); setTimeout(() => setToast(null), 5000);
        setEditSaving(false); return;
      }
      const itemsRes = await fetch(`/api/reclamos/${current.id}/items`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: editItems }) });
      if (!itemsRes.ok) {
        const err = await itemsRes.json().catch(() => null);
        setToast(err?.error || "Se guardaron los datos pero no los renglones. Revisa e intenta de nuevo."); setTimeout(() => setToast(null), 5000);
        await loadDetail(current.id); loadReclamos();
        setEditSaving(false); return;
      }
      setEditMode(false); await loadDetail(current.id); loadReclamos();
      setToast("Listo, guardado"); setTimeout(() => setToast(null), 3000);
    } catch { setToast("Sin conexión. Verifica tu internet e intenta de nuevo."); setTimeout(() => setToast(null), 3000); }
    setEditSaving(false);
  }

  // ── Confirm modal — UN solo modal, usado por lista (single + bulk) y detalle ──
  // Dice la verdad: el borrado se puede deshacer 5 segundos (y es soft delete).
  const pendingCount = pendingDelete?.length ?? 0;
  const deleteModal = (
    <ConfirmDeleteModal
      open={pendingCount > 0}
      onCancel={() => setPendingDelete(null)}
      onConfirm={confirmDelete}
      title={pendingCount > 1 ? "Eliminar reclamos" : "Eliminar reclamo"}
      description={
        pendingCount > 1
          ? `¿Eliminar los ${pendingCount} reclamos seleccionados? Tendrás 5 segundos para deshacerlo.`
          : "¿Eliminar este reclamo? Tendrás 5 segundos para deshacerlo."
      }
    />
  );
  const undoToast = pendingUndoReclamo
    ? <UndoToast message={pendingUndoReclamo.message} startedAt={pendingUndoReclamo.startedAt} onUndo={undoActionReclamo} />
    : null;

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
            onNewReclamo={() => { resetForm(); setView("form"); }}
            onSelectEmpresa={(empresa) => { changeEmpresa(empresa); }}
            onLoadDetail={(id, empresa) => { setEditMode(false); changeEmpresa(empresa, { view: "detail", id }); loadDetail(id); }}
          />
          {deleteModal}
          {undoToast}
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
          selectionMode={selectionMode}
          setSelectionMode={setSelectionMode}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          onBack={() => changeEmpresa(null)}
          onNewReclamo={() => { resetForm(); setFEmpresa(activeEmpresa); setView("form"); }}
          onLoadDetail={(id) => { setEditMode(false); setView("detail", id); loadDetail(id); }}
          onEditReclamo={(id) => { setView("detail", id); loadDetail(id).then((r) => { if (r) enterEdit(r); }); }}
          onDeleteReclamo={(id) => requestDeleteReclamo(id)}
          onDeleteSelected={requestDeleteSelected}
          onReload={loadReclamos}
        />
        {deleteModal}
        {undoToast}
      </PullToRefresh>
    );
  }

  // ── FORM VIEW ──
  if (view === "form") {
    return (
      <>
      <ReclamoForm
        draftBanner={!savedReclamoId && hasReclamoDraft ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 flex items-center justify-between gap-4">
            <p className="text-sm text-amber-800">Tienes un borrador guardado de {reclamoDraftTimeAgo}. ¿Restaurar?</p>
            <div className="flex items-center gap-3 flex-shrink-0">
              <button onClick={restoreReclamoDraft} className="bg-black text-white text-sm px-4 py-1.5 rounded-md hover:bg-gray-800 transition min-h-[44px]">Restaurar</button>
              <button onClick={clearReclamoDraft} className="text-sm text-amber-700 hover:text-amber-900 transition min-h-[44px] px-2">Descartar</button>
            </div>
          </div>
        ) : null}
        fEmpresa={fEmpresa} setFEmpresa={setFEmpresa}
        fFacturas={fFacturas} setFFacturas={setFFacturas}
        fFechaFactura={fFechaFactura} setFFechaFactura={setFFechaFactura}
        fPedido={fPedido} setFPedido={setFPedido}
        fNotas={fNotas} setFNotas={setFNotas}
        fItems={fItems} setFItems={setFItems}
        fLineas={fLineas} setFLineas={setFLineas}
        fSeleccion={fSeleccion} setFSeleccion={setFSeleccion}
        facturaPdfPath={fFacturaPdfPath} setFacturaPdfPath={setFFacturaPdfPath}
        savedReclamoId={savedReclamoId}
        savedNroReclamo={savedNroReclamo}
        pendingFotos={pendingFotos}
        onAddFoto={addPendingFoto} onRemoveFoto={removePendingFoto} onRetryFotos={retryFotos}
        saving={saving}
        error={error}
        onSave={saveReclamo}
        onCancel={() => { resetForm(); setView("list"); }}
        onViewSaved={() => { const id = savedReclamoId; resetForm(); setEditMode(false); loadReclamos(); if (id) { setView("detail", id); loadDetail(id); } }}
        onResetAndCreateAnother={resetForm}
      />
      {undoToast}
      </>
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
        editFacturas={editFacturas} setEditFacturas={setEditFacturas}
        editPedido={editPedido} setEditPedido={setEditPedido}
        editFechaFactura={editFechaFactura} setEditFechaFactura={setEditFechaFactura}
        editNotas={editNotas} setEditNotas={setEditNotas}
        editFacturaPdfPath={editFacturaPdfPath} setEditFacturaPdfPath={setEditFacturaPdfPath}
        editItems={editItems} setEditItems={setEditItems}
        editSaving={editSaving}
        onStartEdit={() => enterEdit(current)}
        toast={toast}
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
        onReload={loadReclamos}
        showToast={(msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); }}
      />
      <SettlementModal
        open={settleOpen}
        reclamado={current.monto_reclamado_snapshot ?? reclamoTaxes(current.empresa, calcSub(current.reclamo_items ?? [])).total}
        submitting={settling}
        requireComprobante={!current.comprobante_url && !current.comprobante_path}
        onClose={() => setSettleOpen(false)}
        onSubmit={submitSettlement}
      />
      {undoToast}
      {deleteModal}
    </>
  );
}
