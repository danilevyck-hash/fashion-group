"use client";

import { useRef, useEffect, useMemo, useState } from "react";
import { isCanvasClear } from "./canvasUtils";
import SignatureCanvas from "./SignatureCanvas";
import type { GuiaItem } from "./types";
import {
  faltaParaDespachar,
  textoFalta,
  type TipoDespacho,
} from "@/lib/guias/falta-para-despachar";
import { ETIQUETA_TIPO_DESPACHO } from "@/lib/guias/modo-despacho";

// ─────────────────────────────────────────────────────────────────────────────
// EL DESPACHO — ahora vive en la PÁGINA de la guía, no dentro de la lista.
//
// 🩸 POR QUÉ SE MUDÓ. En la lista, abrir una guía pendiente desplegaba este
// formulario entero (placa, N° de guía, receptor, cédula, dos canvas de firma y
// el botón de confirmar) ADEMÁS del botón "Editar" de arriba. Dos caminos para
// lo mismo, uno arriba y otro abajo, en la misma tarjeta. Daniel, textual:
// *"mira como me sale editar al hacer clic en por despachar y esta ya aparece
// el campo para editar, confunde, solo quiero una y en boton de editar para
// entrar a la guia y terminarla"*. Y no era un problema de pantalla chica: lo
// vio en ESCRITORIO.
//
// ⚠️ EL N° DE GUÍA DEL TRANSPORTISTA ES POR LÍNEA. Antes se pedía UNA vez y se
// guardaba solo en la cabecera de la guía. Daniel: *"la info de guia de transp,
// debe de ser por linea, no por guia porque nos hacen varias guias el
// transportista por guia"*. La columna `guia_items.numero_guia_transp` ya
// existía; lo que faltaba era pedirla renglón por renglón.
//
// ⚠️ EL BOTÓN SE APAGA Y DICE QUÉ FALTA. Antes se podía tocar siempre y
// contestaba con un toast por vez, que además se iba solo a los 3 segundos.
// Las reglas de qué falta viven en `@/lib/guias/falta-para-despachar` — las
// mismas que aplica el servidor.
//
// 🔴 EL MODO NO SE VUELVE A PREGUNTAR: SE MUESTRA, CON UN "CAMBIAR" AL LADO.
// Ya se eligió al crear la guía. Preguntarlo de nuevo, con "Transportista
// externo" preseleccionado, es lo que produjo que **50 de 51 guías creadas como
// entrega directa quedaran grabadas como transportista externo** (medido en
// producción el 14-ago-2026). Cambiarlo sigue siendo posible —a veces llega el
// camión de un tercero— pero es un acto deliberado, no el camino por defecto.
//
// 🔴 EN ENTREGA DIRECTA NO SE PIDEN PLACA NI N° DE GUÍA DEL TRANSPORTISTA.
// Daniel, textual: *«Entrega directa no debería de llevar placa, ya que es
// directo con nuestro propio camión.»* No son "opcionales": no existe un
// transportista al que pedirle esos datos. Se ESCONDEN. Cuando eran opcionales
// pero visibles, alguien tecleó "0" en los dos para poder apretar el botón —
// GT-194, GT-195 y GT-196, las únicas tres placas "0" de toda la base— y ese
// "0" salía impreso en el papel que se firma.
// ─────────────────────────────────────────────────────────────────────────────

interface DespachoFormProps {
  /** Las líneas de la guía: cada una lleva su propio N° del transportista. */
  items: GuiaItem[];
  numerosTransp: string[];
  setNumeroTransp: (idx: number, v: string) => void;
  tipoDespacho: TipoDespacho;
  setTipoDespacho: (v: TipoDespacho) => void;
  bPlaca: string;
  setBPlaca: (v: string) => void;
  bReceptor: string;
  setBReceptor: (v: string) => void;
  bCedula: string;
  setBCedula: (v: string) => void;
  bChofer: string;
  setBChofer: (v: string) => void;
  bSaving: boolean;
  onConfirmar: (firma1: string, firma2: string) => void;
  pendingFirma1?: string | null;
  pendingFirma2?: string | null;
  onFirma1Change?: (v: string | null) => void;
  onFirma2Change?: (v: string | null) => void;
}

/** Campo de texto: 44 px de alto con el dedo, denso solo cuando hay mouse, y
 *  text-base en móvil porque con 14 px Safari hace zoom al enfocar. */
const CAMPO =
  "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base md:text-sm outline-none focus:border-black transition min-h-[44px]";

export default function DespachoForm({
  items,
  numerosTransp,
  setNumeroTransp,
  tipoDespacho, setTipoDespacho,
  bPlaca, setBPlaca, bReceptor, setBReceptor, bCedula, setBCedula,
  bChofer, setBChofer,
  bSaving, onConfirmar,
  pendingFirma1, pendingFirma2, onFirma1Change, onFirma2Change,
}: DespachoFormProps) {
  const canvas1Ref = useRef<HTMLCanvasElement>(null);
  const canvas2Ref = useRef<HTMLCanvasElement>(null);
  // El selector aparece solo si se toca "Cambiar". Ver la cabecera.
  const [cambiandoModo, setCambiandoModo] = useState(false);

  // Warn before leaving if user has filled any field
  const isDirty = useMemo(
    () =>
      !!(
        bPlaca || bReceptor || bCedula || bChofer ||
        numerosTransp.some((n) => n.trim()) ||
        pendingFirma1 || pendingFirma2
      ),
    [bPlaca, bReceptor, bCedula, bChofer, numerosTransp, pendingFirma1, pendingFirma2]
  );
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (isDirty && !bSaving) { e.preventDefault(); e.returnValue = ""; }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, bSaving]);

  // 🩸 Las firmas se miran por su ESTADO, no preguntándole al canvas: el botón
  // tiene que apagarse y prenderse solo mientras se firma, y un `ref` no
  // dispara un re-render. `SignatureCanvas` avisa por `onChange` al levantar el
  // dedo, así que `pendingFirma*` siempre refleja lo dibujado (y también lo que
  // se recuperó de un borrador guardado, que en el canvas no deja trazos).
  const faltantes = faltaParaDespachar({
    tipoDespacho,
    placa: bPlaca,
    receptor: bReceptor,
    cedula: bCedula,
    chofer: bChofer,
    numerosTransp,
    tieneFirma1: !!pendingFirma1,
    tieneFirma2: !!pendingFirma2,
  });
  const puedeDespachar = faltantes.length === 0;

  function handleConfirmar() {
    if (!puedeDespachar || bSaving) return;
    // Se prefiere lo recién dibujado; si el canvas está limpio pero hay una
    // firma guardada (borrador recuperado), se usa esa.
    const firma1 = !isCanvasClear(canvas1Ref.current)
      ? (canvas1Ref.current?.toDataURL() || "")
      : (pendingFirma1 || "");
    const firma2 = !isCanvasClear(canvas2Ref.current)
      ? (canvas2Ref.current?.toDataURL() || "")
      : (pendingFirma2 || "");
    onConfirmar(firma1, firma2);
  }

  const externo = tipoDespacho === "externo";

  return (
    <div className="space-y-4">
      {/* Cómo sale la mercancía — se MUESTRA lo que ya se eligió al crearla. */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <span className="text-xs uppercase tracking-wide text-gray-400 mb-2 block">
          Cómo sale
        </span>
        {cambiandoModo ? (
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            <button
              type="button"
              onClick={() => { setTipoDespacho("externo"); setCambiandoModo(false); }}
              className={`flex-1 text-sm px-3 rounded-md transition font-medium inline-flex items-center justify-center min-h-[44px] ${externo ? "bg-white text-black border border-gray-200" : "text-gray-500 hover:text-gray-700"}`}
            >
              {ETIQUETA_TIPO_DESPACHO.externo}
            </button>
            <button
              type="button"
              onClick={() => { setTipoDespacho("directo"); setCambiandoModo(false); }}
              className={`flex-1 text-sm px-3 rounded-md transition font-medium inline-flex items-center justify-center min-h-[44px] ${!externo ? "bg-white text-black border border-gray-200" : "text-gray-500 hover:text-gray-700"}`}
            >
              {ETIQUETA_TIPO_DESPACHO.directo}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm font-medium break-words">
              {ETIQUETA_TIPO_DESPACHO[tipoDespacho]}
            </span>
            <button
              type="button"
              onClick={() => setCambiandoModo(true)}
              className="text-sm text-blue-700 hover:text-blue-900 transition inline-flex items-center min-h-[44px] px-2 shrink-0"
            >
              Cambiar
            </button>
          </div>
        )}
        {!externo && !cambiandoModo && (
          <p className="text-xs text-gray-500 mt-1">
            Sale en nuestro propio camión: no lleva placa ni N° de guía de transportista.
          </p>
        )}
      </div>

      {/* Quién recibe y en qué se va */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* ⚠️ La placa SOLO existe con transportista externo. Ver la cabecera. */}
          {externo && (
            <div>
              <label htmlFor="despacho-placa" className="text-xs uppercase tracking-wide text-gray-400 mb-1 block">
                Placa del vehículo
              </label>
              <input id="despacho-placa" type="text" value={bPlaca}
                onChange={(e) => setBPlaca(e.target.value)} className={CAMPO} />
            </div>
          )}
          {!externo && (
            <div>
              <label htmlFor="despacho-chofer" className="text-xs uppercase tracking-wide text-gray-400 mb-1 block">Chofer</label>
              <input id="despacho-chofer" type="text" value={bChofer} placeholder="Nombre del chofer"
                onChange={(e) => setBChofer(e.target.value)} className={CAMPO} />
            </div>
          )}
          <div>
            <label htmlFor="despacho-receptor" className="text-xs uppercase tracking-wide text-gray-400 mb-1 block">
              {externo ? "Recibido por" : "Cliente que recibe"}
            </label>
            <input id="despacho-receptor" type="text" value={bReceptor}
              onChange={(e) => setBReceptor(e.target.value)} className={CAMPO} />
          </div>
          <div>
            <label htmlFor="despacho-cedula" className="text-xs uppercase tracking-wide text-gray-400 mb-1 block">Cédula</label>
            <input id="despacho-cedula" type="text" value={bCedula}
              onChange={(e) => setBCedula(e.target.value)} className={CAMPO} />
          </div>
        </div>
      </div>

      {/* ⚠️ UNO POR LÍNEA. Ver la cabecera del archivo. */}
      {externo && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <span className="text-xs uppercase tracking-wide text-gray-400 block">
            N° de guía del transportista · uno por línea
          </span>
          <p className="text-xs text-gray-500 mt-1 mb-3">
            El transportista arma varias guías suyas por cada guía nuestra. Anota
            en cada envío el número que te dio para ese envío.
          </p>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={item.id || idx} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="text-sm font-medium break-words">{item.cliente || "Sin cliente"}</div>
                <div className="text-xs text-gray-500 mt-0.5 break-words">
                  {[item.direccion, item.empresa, `${item.bultos || 0} bultos`]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <label htmlFor={`transp-${idx}`} className="text-xs uppercase tracking-wide text-gray-400 mt-3 mb-1 block">
                  N° guía transportista
                </label>
                <input
                  id={`transp-${idx}`}
                  type="text"
                  value={numerosTransp[idx] ?? ""}
                  onChange={(e) => setNumeroTransp(idx, e.target.value)}
                  placeholder="—"
                  className={`${CAMPO} bg-white`}
                />
              </div>
            ))}
            {items.length === 0 && (
              <p className="text-sm text-gray-400">Esta guía no tiene envíos cargados.</p>
            )}
          </div>
        </div>
      )}

      {/* Firmas */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SignatureCanvas
            label={externo ? "Firma del transportista" : "Firma del chofer"}
            canvasRef={canvas1Ref}
            initialImage={pendingFirma1}
            onChange={onFirma1Change}
          />
          <SignatureCanvas
            label={externo ? "Firma del entregador" : "Firma del cliente"}
            canvasRef={canvas2Ref}
            initialImage={pendingFirma2}
            onChange={onFirma2Change}
          />
        </div>
      </div>

      {/* Confirmar — apagado mientras falte algo, y debajo dice qué falta. */}
      <div>
        <button
          type="button"
          onClick={handleConfirmar}
          disabled={!puedeDespachar || bSaving}
          className={`w-full rounded-lg text-base font-semibold min-h-[52px] transition-all ${
            puedeDespachar && !bSaving
              ? "bg-emerald-700 text-white hover:bg-emerald-800 active:scale-[0.99]"
              : "bg-gray-300 text-white cursor-not-allowed"
          }`}
        >
          {bSaving ? "Guardando…" : "Despachar"}
        </button>
        {!puedeDespachar && (
          <p className="mt-2 text-sm font-medium text-amber-700 text-center">
            {textoFalta(faltantes)}
          </p>
        )}
      </div>
    </div>
  );
}

export { isCanvasClear };
