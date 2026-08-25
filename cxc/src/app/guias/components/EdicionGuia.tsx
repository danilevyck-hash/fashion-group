"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EDITAR UNA GUÍA **DENTRO DE LA GUÍA** (23-ago-2026).
//
// Daniel, textual: *"veo algo raro en guias, al editar una, tengo que poner
// despachar para editar en vez de editar, quiero botón de editar y que se me
// abra la guía para editar así mismo como si estuviese haciendo la guía, no
// algo diferente"*.
//
// 🔑 NO SE CONSTRUYÓ UN FORMULARIO NUEVO. Esto monta el MISMO `GuiaForm` con el
// MISMO `useGuiaFormState` que usa `/guias/nueva`: si algún día se le agrega un
// campo al alta, aparece acá el mismo día. Un segundo formulario "parecido"
// sería exactamente el *"algo diferente"* que Daniel pidió sacar.
//
// 🩸 POR QUÉ ES UN COMPONENTE APARTE Y NO UN `useGuiaFormState` MÁS EN LA
// PÁGINA. El hook carga la guía, el catálogo de transportistas y las
// frecuencias: tenerlo montado siempre le cobraría esos tres pedidos a CADA
// apertura de una guía, incluidas las 174 despachadas que nadie va a editar. Un
// hook no se puede llamar condicionalmente; un componente sí se puede no
// renderizar.
// ─────────────────────────────────────────────────────────────────────────────

import { Toast } from "@/components/ui";
import GuiaForm from "./GuiaForm";
import { useGuiaFormState } from "./useGuiaFormState";

interface Props {
  id: string;
  /** Cerrar la edición sin guardar. Se sigue en la misma guía. */
  onSalir: () => void;
  /** Un guardado que el servidor ACEPTÓ. La guía de la pantalla se relee. */
  onGuardado: () => void;
}

export default function EdicionGuia({ id, onSalir, onGuardado }: Props) {
  // 🔴 `alGuardar` es lo que evita que guardar te saque de la guía. Sin esto el
  // hook hace `router.push("/guias")` —lo correcto cuando el formulario ES la
  // pantalla entera— y quien estaba por despachar terminaba en el listado.
  const s = useGuiaFormState({ editingId: id, alGuardar: onGuardado });

  if (!s.loaded) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="h-24 bg-gray-100 rounded-lg animate-pulse mb-4" />
        <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <>
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
        onAddRow={s.addRow}
        onRemoveRow={s.removeRow}
        onRestoreRow={s.restoreRow}
        onSave={s.saveGuia}
        onCancel={onSalir}
        // No lleva a "Guías": cierra la edición y deja a la persona en la guía.
        etiquetaVolver="← Cerrar la edición"
      />
      <Toast message={s.toast} />
    </>
  );
}
