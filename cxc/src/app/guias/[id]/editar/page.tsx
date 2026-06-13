"use client";

import { useRouter, useParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast } from "@/components/ui";
import GuiaForm from "../../components/GuiaForm";
import { useGuiaFormState } from "../../components/useGuiaFormState";

export default function GuiaEditarPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? null;
  const { authChecked } = useAuth({
    moduleKey: "guias",
    allowedRoles: ["admin", "secretaria", "bodega", "vendedor"],
  });

  const s = useGuiaFormState({ editingId: id });

  if (!authChecked) return null;
  if (!id) return null;

  if (!s.loaded) {
    return (
      <div>
        <AppHeader module="Guías de Transporte" breadcrumbs={[{ label: "Editar guía" }]} />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <div className="h-24 bg-gray-100 rounded-lg animate-pulse mb-4" />
          <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <AppHeader
        module="Guías de Transporte"
        breadcrumbs={[{ label: `GT-${String(s.formNumero).padStart(3, "0")}` }]}
      />
      <GuiaForm
        editingId={id}
        formNumero={s.formNumero}
        fecha={s.fecha}
        setFecha={s.setFecha}
        modoEntrega={s.modoEntrega}
        setModoEntrega={s.setModoEntrega}
        transportistaId={s.transportistaId}
        setTransportistaId={s.setTransportistaId}
        entregadoPor={s.entregadoPor}
        setEntregadoPor={s.setEntregadoPor}
        observaciones={s.observaciones}
        setObservaciones={s.setObservaciones}
        numeroGuiaTransp={s.numeroGuiaTransp}
        setNumeroGuiaTransp={s.setNumeroGuiaTransp}
        items={s.items}
        transportistas={s.transportistas}
        clientes={s.clientes}
        direcciones={s.direcciones}
        validationErrors={s.validationErrors}
        error={s.error}
        saving={s.saving}
        onAddCliente={s.addCliente}
        onAddDireccion={s.addDireccion}
        onUpdateItem={s.updateItem}
        onUpdateItemFields={s.updateItemFields}
        onAddRow={s.addRow}
        onRemoveRow={s.removeRow}
        onSave={s.saveGuia}
        onCancel={() => router.push("/guias")}
        hasDraft={s.hasGuiaDraft}
        draftTimeAgo={s.guiaDraftTimeAgo}
        onRestoreDraft={s.restoreGuiaDraft}
        onDiscardDraft={s.clearGuiaDraft}
      />
      <Toast message={s.toast} />
    </div>
  );
}
