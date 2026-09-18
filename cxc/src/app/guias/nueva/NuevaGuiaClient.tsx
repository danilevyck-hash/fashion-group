"use client";

import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast } from "@/components/ui";
import { useCallback, useEffect, useRef } from "react";
import GuiaForm from "../components/GuiaForm";
import { useGuiaFormState } from "../components/useGuiaFormState";
import { refrescarFacturasDelDia } from "../components/refrescarFacturasHoy";
import { GUIAS_WRITE_ROLES } from "@/lib/guias/roles-escritura";

export default function NuevaGuiaClient() {
  const router = useRouter();
  // 🔴 LOS MISMOS ROLES QUE EL POST (11-sep-2026). Acá decía
  // `["admin", "secretaria", "bodega", "vendedor"]`, y el vendedor entraba a
  // armar la guía entera para chocar con «Sin permiso» al guardar. La lista
  // vive en UN solo lugar; la página de arriba ya lo rebotó en el servidor.
  const { authChecked, role } = useAuth({
    moduleKey: "guias",
    allowedRoles: GUIAS_WRITE_ROLES,
  });

  // 🔴 LAS ETIQUETAS MARCADAS (18-sep-2026). Viven en un `ref` y no en estado
  // porque nada de la pantalla depende de ellas: solo hacen falta EN EL
  // INSTANTE de guardar, para atarlas a los renglones recién creados. Guardarlo
  // como estado redibujaría el formulario entero en cada casilla.
  const etiquetasRef = useRef<number[]>([]);

  const atarEtiquetas = useCallback(async (guiaId: string) => {
    const ids = etiquetasRef.current;
    if (ids.length === 0) return;
    // 🔴 FALLA ABIERTA: la guía YA se guardó. Si esto no sale, las etiquetas
    // simplemente siguen diciendo «Pendiente de guía» — nunca al revés.
    await fetch("/api/guias/etiquetas/importar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guia_id: guiaId, ids }),
    }).catch(() => {});
  }, []);

  const s = useGuiaFormState({ editingId: null, despuesDeCrear: atarEtiquetas });

  // La lectura corta de las facturas de HOY (para el panel «Facturas del
  // cliente»). Desde el 4-sep-2026 el disparo principal vive en la LISTA de
  // /guias — Daniel: «¿por qué no se puede hacer al apretar guías? Prefiero
  // eso.» — y ACÁ SE QUEDA TAMBIÉN para quien entra directo por URL sin pasar
  // por la lista. El acelerador de 10 min (sessionStorage) hace que venir de
  // la lista no dispare dos veces. Fail-open; el «Buscar otra vez» del panel
  // cubre el resto.
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
        onAddTransportista={s.addTransportista}
        onUpdateItem={s.updateItem}
        onUpdateItemFields={s.updateItemFields}
        onReemplazarItems={s.reemplazarItems}
        onEtiquetasSeleccionadas={(ids) => { etiquetasRef.current = ids; }}
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
