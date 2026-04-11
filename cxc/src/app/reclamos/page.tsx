"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { useDraftAutoSave } from "@/lib/hooks/useDraftAutoSave";
import { ConfirmModal, PullToRefresh } from "@/components/ui";
import UndoToast from "@/components/UndoToast";
import { useUndoAction } from "@/lib/hooks/useUndoAction";
import { Reclamo, RItem, Foto, Contacto, RView } from "./components/types";
import { EMPRESAS_MAP, calcSub, daysSince, emptyItem, loadCustomMotivos, fetchCustomMotivos, FACTOR_TOTAL } from "./components/constants";
import EmpresaSelector from "./components/EmpresaSelector";
import EmpresaList from "./components/EmpresaList";
import ReclamoForm from "./components/ReclamoForm";
import ReclamoDetail from "./components/ReclamoDetail";

export default function ReclamosPageWrapper() {
  return <Suspense><ReclamosPage /></Suspense>;
}

function ReclamosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { authChecked, role } = useAuth({ moduleKey: "reclamos", allowedRoles: ["admin", "secretaria", "director"] });
  const [view, _setView] = useState<RView>((searchParams.get("view") as RView) || "list");
  const [urlId] = useState(searchParams.get("id") || "");
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Reclamo | null>(null);
  const [saving, setSaving] = useState(false);

  // List state — support ?empresa= from search quick actions
  const [activeEmpresa, setActiveEmpresa] = useState<string | null>(() => {
    const urlEmpresa = searchParams.get("empresa");
    return urlEmpresa ? decodeURIComponent(urlEmpresa) : null;
  });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState(""); const [filterEstado, setFilterEstado] = useState("all");
  const [confirmingEstado, setConfirmingEstado] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState("");
  const [sortCol, setSortCol] = useState<"fecha" | "dias" | "total" | "estado">("fecha");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showAplicadaModal, setShowAplicadaModal] = useState(false);
  const [aplicadaNc, setAplicadaNc] = useState(""); const [aplicadaMonto, setAplicadaMonto] = useState("");
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
  const [contactos, setContactos] = useState<Contacto[]>([]); const [toast, setToast] = useState<string | null>(null);
  const { pendingUndo: pendingUndoReclamo, scheduleAction: scheduleUndoReclamo, undoAction: undoActionReclamo } = useUndoAction();
  const [customMotivos, setCustomMotivos] = useState<string[]>([]);
  const [addingMotivo, setAddingMotivo] = useState<number | null>(null);
  const [addingEditMotivo, setAddingEditMotivo] = useState<number | null>(null); const [newMotivoText, setNewMotivoText] = useState("");

  // Draft auto-save for new reclamo form
  const reclamoDraftData = useMemo(() => ({
    empresa: fEmpresa, factura: fFactura, fecha: fFecha, pedido: fPedido, notas: fNotas, items: fItems,
  }), [fEmpresa, fFactura, fFecha, fPedido, fNotas, fItems]);
  const isReclamoDraftEmpty = useCallback((d: typeof reclamoDraftData) => {
    return !d.empresa && !d.factura && !d.pedido && !d.notas && d.items.every(i => !i.referencia && !i.descripcion && i.cantidad === 0 && i.precio_unitario === 0);
  }, []);
  const { draft: reclamoDraft, hasDraft: hasReclamoDraft, clearDraft: clearReclamoDraft, draftTimeAgo: reclamoDraftTimeAgo } = useDraftAutoSave("reclamo", reclamoDraftData, isReclamoDraftEmpty);

  function restoreReclamoDraft() {
    if (!reclamoDraft) return;
    setFEmpresa(reclamoDraft.empresa || "");
    setFFactura(reclamoDraft.factura || "");
    setFFecha(reclamoDraft.fecha || new Date().toISOString().slice(0, 10));
    setFPedido(reclamoDraft.pedido || "");
    setFNotas(reclamoDraft.notas || "");
    if (reclamoDraft.items?.length) setFItems(reclamoDraft.items);
    clearReclamoDraft();
  }

  function setView(v: RView, id?: string) {
    _setView(v);
    if (v === "list") window.history.pushState(null, "", "/reclamos");
    else if (v === "form" && id) window.history.pushState(null, "", `/reclamos?view=form&id=${id}`);
    else if (v === "form") window.history.pushState(null, "", "/reclamos?view=form");
    else if (v === "detail" && id) window.history.pushState(null, "", `/reclamos?view=detail&id=${id}`);
  }

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/reclamos/${id}`);
      if (res.ok) { const d = await res.json(); if (d?.id) { setCurrent(d); setView("detail", d.id); } }
    } catch { setToast("Sin conexión. Verifica tu internet e intenta de nuevo."); setTimeout(() => setToast(null), 3000); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onPopState() {
      const params = new URLSearchParams(window.location.search);
      const v = (params.get("view") as RView) || "list";
      const id = params.get("id") || "";
      _setView(v);
      if (v === "detail" && id) loadDetail(id);
      else if (v === "list") setCurrent(null);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [loadDetail]);

  const loadReclamos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reclamos");
      if (res.status === 401) { sessionStorage.clear(); router.push("/"); return; }
      if (res.ok) { const d = await res.json(); setReclamos(Array.isArray(d) ? d : []); }
    } catch { setToast("Sin conexión. Verifica tu internet e intenta de nuevo."); setTimeout(() => setToast(null), 3000); }
    setLoading(false);
  }, [router]);

  const loadContactos = useCallback(async () => {
    try { const res = await fetch("/api/reclamos/contactos"); if (res.ok) setContactos(await res.json()); } catch { setToast("Sin conexión. Verifica tu internet e intenta de nuevo."); setTimeout(() => setToast(null), 3000); }
  }, []);

  useEffect(() => {
    if (authChecked && urlId && view === "detail") loadDetail(urlId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, urlId, loadDetail]);

  useEffect(() => {
    if (authChecked) { loadReclamos(); loadContactos(); fetchCustomMotivos().then(setCustomMotivos); }
  }, [authChecked, loadReclamos, loadContactos]);

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
      if (res.ok) { clearReclamoDraft(); const saved = await res.json(); setSavedReclamoId(saved.id); setSavedNroReclamo(saved.nro_reclamo || ""); setFormFotos([]); loadReclamos(); }
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
    setConfirmingEstado(null);
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

  async function handleAplicadaConfirm() {
    if (!current || !aplicadaNc.trim() || !aplicadaMonto) return;
    try {
      const r1 = await fetch(`/api/reclamos/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "Aplicado" }) });
      if (!r1.ok) { setToast("Error al aplicar NC."); setTimeout(() => setToast(null), 3000); return; }
      await fetch(`/api/reclamos/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seguimiento_nota: `Aplicado — N/C ${aplicadaNc} por $${parseFloat(aplicadaMonto).toFixed(2)}`, autor: role }) });
      setShowAplicadaModal(false); setAplicadaNc(""); setAplicadaMonto("");
      await loadDetail(current.id); loadReclamos();
    } catch { setToast("Error de conexion."); setTimeout(() => setToast(null), 3000); }
  }

  const pendientes = reclamos.filter((r) => r.estado !== "Aplicado" && r.estado !== "Rechazado");
  const totalPendiente = pendientes.reduce((s, r) => s + calcSub(r.reclamo_items ?? []) * FACTOR_TOTAL, 0);
  const alertas = pendientes.filter((r) => daysSince(r.fecha_reclamo) > 45).length;
  // ── Confirm modal — always rendered (used by list + detail views) ──
  const deleteModal = (
    <ConfirmModal
      open={!!confirmDeleteId}
      onClose={() => setConfirmDeleteId(null)}
      onConfirm={confirmDeleteReclamo}
      title="Eliminar reclamo"
      message="¿Seguro que deseas eliminar este reclamo? Esta acción no se puede deshacer."
      confirmLabel="Eliminar"
      destructive
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
            onSelectEmpresa={(empresa) => { setActiveEmpresa(empresa); setSearch(""); setFilterEstado("all"); }}
            onLoadDetail={(id, empresa) => { setActiveEmpresa(empresa); loadDetail(id); }}
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
          onBack={() => setActiveEmpresa(null)}
          onNewReclamo={() => { resetForm(); setFEmpresa(activeEmpresa); setView("form"); }}
          onLoadDetail={(id) => loadDetail(id)}
          onDeleteReclamo={(id) => requestDeleteReclamo(id)}
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
        onViewSaved={() => { const id = savedReclamoId; resetForm(); loadReclamos(); if (id) loadDetail(id); }}
        onResetAndCreateAnother={resetForm}
        hasDraft={hasReclamoDraft}
        draftTimeAgo={reclamoDraftTimeAgo}
        onRestoreDraft={restoreReclamoDraft}
        onDiscardDraft={clearReclamoDraft}
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
        contactos={contactos}
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
        confirmingEstado={confirmingEstado} setConfirmingEstado={setConfirmingEstado}
        showDeleteConfirm={showDeleteConfirm} setShowDeleteConfirm={setShowDeleteConfirm}
        showAplicadaModal={showAplicadaModal} setShowAplicadaModal={setShowAplicadaModal}
        aplicadaNc={aplicadaNc} setAplicadaNc={setAplicadaNc}
        aplicadaMonto={aplicadaMonto} setAplicadaMonto={setAplicadaMonto}
        toast={toast}
        customMotivos={customMotivos} setCustomMotivos={setCustomMotivos}
        addingEditMotivo={addingEditMotivo} setAddingEditMotivo={setAddingEditMotivo}
        newMotivoText={newMotivoText} setNewMotivoText={setNewMotivoText}
        onBack={() => { setCurrent(null); setView("list"); }}
        onAddNota={addNota}
        onChangeEstado={changeEstado}
        onDeleteReclamo={requestDeleteReclamo}
        onSaveEdit={saveEdit}
        onUploadFoto={uploadFoto}
        onDeleteFoto={deleteFoto}
        onAplicadaConfirm={handleAplicadaConfirm}
        showToast={(msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); }}
      />
      {pendingUndoReclamo && <UndoToast message={pendingUndoReclamo.message} startedAt={pendingUndoReclamo.startedAt} onUndo={undoActionReclamo} />}
      {deleteModal}
    </>
  );
}
