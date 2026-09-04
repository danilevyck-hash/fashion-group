"use client";

import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast } from "@/components/ui";
import { useEffect } from "react";
import GuiaForm from "../components/GuiaForm";
import { useGuiaFormState } from "../components/useGuiaFormState";
import { refrescarFacturasDelDia } from "../components/refrescarFacturasHoy";

export default function GuiaNuevaPage() {
  const router = useRouter();
  const { authChecked, role } = useAuth({
    moduleKey: "guias",
    allowedRoles: ["admin", "secretaria", "bodega", "vendedor"],
  });

  const s = useGuiaFormState({ editingId: null });

  // Al ABRIR una guía nueva se dispara, en segundo plano, la lectura corta de
  // las facturas de HOY (para el panel «Facturas del cliente»). Fail-open,
  // acelerada a 10 min. ⚠️ NO se dispara desde la LISTA de /guias a propósito:
  // el candado «la lista no manda un solo pedido que no sea GET»
  // (guias-eliminar-en-la-fila.test.tsx) protege que la lista no escriba, y
  // aflojarlo para colar un POST sería debilitar justo lo que vigila. Acá es
  // donde las facturas se usan; el «Buscar otra vez» del panel cubre el resto.
  useEffect(() => {
    if (authChecked && role !== "vendedor") refrescarFacturasDelDia();
  }, [authChecked, role]);

  if (!authChecked) return null;

  return (
    <div>
      <AppHeader
        module="Guías de Despacho"
        breadcrumbs={[{ label: "Nueva guía" }]}
      />
      {s.hasGuiaDraft && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-amber-800">Tienes un borrador guardado de {s.guiaDraftTimeAgo}. ¿Restaurar?</p>
            <div className="flex items-center gap-3 flex-shrink-0">
              <button onClick={s.restoreGuiaDraft} className="bg-black text-white text-sm px-4 py-1.5 rounded-md hover:bg-gray-800 transition">Restaurar</button>
              <button onClick={s.clearGuiaDraft} className="text-sm text-amber-700 hover:text-amber-900 transition">Descartar</button>
            </div>
          </div>
        </div>
      )}
      <GuiaForm
        editingId={null}
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
        items={s.items}
        transportistas={s.transportistas}
        direcciones={s.direcciones}
        validationErrors={s.validationErrors}
        error={s.error}
        saving={s.saving}
        hayCambios={s.hayCambios}
        instantanea={s.instantanea}
        guardadoEn={s.guardadoEn}
        onAddDireccion={s.addDireccion}
        onUpdateItem={s.updateItem}
        onUpdateItemFields={s.updateItemFields}
        onReemplazarItems={s.reemplazarItems}
        onAddRow={s.addRow}
        onRemoveRow={s.removeRow}
        onRestoreRow={s.restoreRow}
        onSave={s.saveGuia}
        onCancel={() => router.push("/guias")}
      />
      <Toast message={s.toast} />
    </div>
  );
}
