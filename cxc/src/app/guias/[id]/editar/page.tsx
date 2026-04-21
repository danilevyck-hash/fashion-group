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
    allowedRoles: ["admin", "secretaria", "bodega", "director", "vendedor"],
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
        transportista={s.transportista}
        setTransportista={s.setTransportista}
        transportistaOtro={s.transportistaOtro}
        setTransportistaOtro={s.setTransportistaOtro}
        entregadoPor={s.entregadoPor}
        setEntregadoPor={s.setEntregadoPor}
        observaciones={s.observaciones}
        setObservaciones={s.setObservaciones}
        items={s.items}
        transportistas={s.transportistas}
        clientes={s.clientes}
        direcciones={s.direcciones}
        empresas={s.empresas}
        validationErrors={s.validationErrors}
        error={s.error}
        saving={s.saving}
        onAddTransportista={s.addTransportista}
        onAddCliente={s.addCliente}
        onAddDireccion={s.addDireccion}
        onAddEmpresa={s.addEmpresa}
        onUpdateItem={s.updateItem}
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
