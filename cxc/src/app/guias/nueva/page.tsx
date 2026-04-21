"use client";

import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast } from "@/components/ui";
import GuiaForm from "../components/GuiaForm";
import { useGuiaFormState } from "../components/useGuiaFormState";

export default function GuiaNuevaPage() {
  const router = useRouter();
  const { authChecked } = useAuth({
    moduleKey: "guias",
    allowedRoles: ["admin", "secretaria", "bodega", "director", "vendedor"],
  });

  const s = useGuiaFormState({ editingId: null });

  if (!authChecked) return null;

  return (
    <div>
      <AppHeader
        module="Guías de Transporte"
        breadcrumbs={[{ label: "Nueva guía" }]}
      />
      <GuiaForm
        editingId={null}
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
