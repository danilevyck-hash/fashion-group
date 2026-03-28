"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { Reclamo, RItem, Foto, Contacto, RView } from "./components/types";
import { EMPRESAS_MAP, calcSub, daysSince, emptyItem, loadCustomMotivos } from "./components/constants";
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

  const { authChecked, role } = useAuth({ moduleKey: "reclamos", allowedRoles: ["admin", "upload", "secretaria"] });
  const [view, _setView] = useState<RView>((searchParams.get("view") as RView) || "list");
  const [urlId] = useState(searchParams.get("id") || "");
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Reclamo | null>(null);
  const [saving, setSaving] = useState(false);

  // List state
  const [activeEmpresa, setActiveEmpresa] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState(""); const [filterEstado, setFilterEstado] = useState("all");
  const [confirmingEstado, setConfirmingEstado] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
  const [customMotivos, setCustomMotivos] = useState<string[]>([]);
  const [addingMotivo, setAddingMotivo] = useState<number | null>(null);
  const [addingEditMotivo, setAddingEditMotivo] = useState<number | null>(null); const [newMotivoText, setNewMotivoText] = useState("");

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
    } catch { setToast("Error de conexión"); setTimeout(() => setToast(null), 3000); }
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
    } catch { setToast("Error de conexión"); setTimeout(() => setToast(null), 3000); }
    setLoading(false);
  }, [router]);

  const loadContactos = useCallback(async () => {
    try { const res = await fetch("/api/reclamos/contactos"); if (res.ok) setContactos(await res.json()); } catch { setToast("Error de conexión"); setTimeout(() => setToast(null), 3000); }
  }, []);

  useEffect(() => {
    if (authChecked && urlId && view === "detail") loadDetail(urlId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, urlId, loadDetail]);

  useEffect(() => {
    if (authChecked) { loadReclamos(); loadContactos(); setCustomMotivos(loadCustomMotivos()); }
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
      if (res.ok) { const saved = await res.json(); setSavedReclamoId(saved.id); setSavedNroReclamo(saved.nro_reclamo || ""); setFormFotos([]); loadReclamos(); }
      else { const err = await res.json().catch(() => null); setError(err?.error || "Error al guardar."); }
    } catch { setError("Error de conexión."); }
    setSaving(false);
  }

  async function addNota() {
    if (!current || !nota.trim()) return;
    await fetch(`/api/reclamos/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seguimiento_nota: nota, autor: role }) });
    setNota(""); await loadDetail(current.id);
  }
  async function changeEstado(e: string) {
    if (!current || current.estado === e) return;
    setConfirmingEstado(null);
    await fetch(`/api/reclamos/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: e }) });
    setToast(`Estado actualizado a ${e}`); setTimeout(() => setToast(null), 3000);
    await loadDetail(current.id); loadReclamos();
  }
  async function deleteReclamo(id: string) {
    if (!confirm("¿Seguro que deseas eliminar este reclamo?")) return;
    setShowDeleteConfirm(false);
    await fetch(`/api/reclamos/${id}`, { method: "DELETE" });
    setCurrent(null); setView("list"); loadReclamos();
  }

  async function uploadFoto(file: File) {
    if (!current) return;
    const fd = new FormData(); fd.append("file", file);
    await fetch(`/api/reclamos/${current.id}/fotos`, { method: "POST", body: fd });
    await loadDetail(current.id);
  }
  async function deleteFoto(fotoId: string, path: string) {
    if (!current) return;
    await fetch(`/api/reclamos/${current.id}/fotos`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ foto_id: fotoId, storage_path: path }) });
    await loadDetail(current.id);
  }

  async function saveEdit() {
    if (!current) return;
    setEditSaving(true);
    try {
      await fetch(`/api/reclamos/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: editEmpresa, proveedor: EMPRESAS_MAP[editEmpresa]?.proveedor || current.proveedor, marca: EMPRESAS_MAP[editEmpresa]?.marca || current.marca, nro_factura: editFactura, nro_orden_compra: editPedido, fecha_reclamo: editFecha, notas: editNotas, estado: editEstado }) });
      await fetch(`/api/reclamos/${current.id}/items`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: editItems }) });
      setEditMode(false); await loadDetail(current.id); loadReclamos();
    } catch { setToast("Error de conexión"); setTimeout(() => setToast(null), 3000); }
    setEditSaving(false);
  }

  async function handleAplicadaConfirm() {
    if (!current || !aplicadaNc.trim() || !aplicadaMonto) return;
    await fetch(`/api/reclamos/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado: "Resuelto con NC" }) });
    await fetch(`/api/reclamos/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seguimiento_nota: `Resuelto con NC — N/C ${aplicadaNc} por $${parseFloat(aplicadaMonto).toFixed(2)}`, autor: role }) });
    setShowAplicadaModal(false); setAplicadaNc(""); setAplicadaMonto("");
    await loadDetail(current.id); loadReclamos();
  }

  const pendientes = reclamos.filter((r) => r.estado !== "Resuelto con NC" && r.estado !== "Rechazado");
  const totalPendiente = pendientes.reduce((s, r) => s + calcSub(r.reclamo_items ?? []) * 1.177, 0);
  const alertas = pendientes.filter((r) => daysSince(r.fecha_reclamo) > 45).length;
  // ── LIST VIEW ──
  if (view === "list") {
    if (!activeEmpresa) {
      return (
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
      );
    }

    return (
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
        onDeleteReclamo={(id) => deleteReclamo(id)}
      />
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
      />
    );
  }

  // ── DETAIL VIEW ──
  if (!current) return null;

  return (
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
      onDeleteReclamo={deleteReclamo}
      onSaveEdit={saveEdit}
      onUploadFoto={uploadFoto}
      onDeleteFoto={deleteFoto}
      onAplicadaConfirm={handleAplicadaConfirm}
    />
  );
}
