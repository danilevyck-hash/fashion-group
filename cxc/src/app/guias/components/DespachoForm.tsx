"use client";

import { useRef, useEffect, useMemo, useState } from "react";
import { isCanvasClear } from "./canvasUtils";
import SignatureCanvas from "./SignatureCanvas";
import {
  faltaParaDespachar,
  textoFalta,
  type TipoDespacho,
} from "@/lib/guias/falta-para-despachar";
import { ETIQUETA_TIPO_DESPACHO } from "@/lib/guias/modo-despacho";
import { juegosQueCoinciden, type JuegoDespacho } from "@/lib/guias/juegos-despacho";
import DesplegableFlotante from "@/components/ui/DesplegableFlotante";

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
// 🔴 LOS ENVÍOS NO SE DIBUJAN ACÁ, Y ES EL CAMBIO DEL 17-ago-2026. El N° del
// transportista sigue siendo POR LÍNEA (Daniel: *"la info de guia de transp,
// debe de ser por linea, no por guia porque nos hacen varias guias el
// transportista por guia"*), pero su caja vive en `ListaEnvios`, pegada al
// renglón. Este formulario tenía una SEGUNDA copia de los 7 envíos, con su
// cliente, su dirección y sus bultos repetidos: la misma lista, dos veces en la
// misma pantalla, y más de 2.000 px de alto en un celular.
//
// ⚠️ EL N° DEL TRANSPORTISTA NO BLOQUEA (Daniel: *"a veces el transportista lo
// da, a veces no"*). Lo que bloquea sigue siendo placa (salvo entrega directa),
// quién recibe, cédula y las dos firmas.
//
// ⚠️ EL BOTÓN SE APAGA Y DICE QUÉ FALTA. Antes se podía tocar siempre y
// contestaba con un toast por vez, que además se iba solo a los 3 segundos.
// Las reglas de qué falta viven en `@/lib/guias/falta-para-despachar` — las
// mismas que aplica el servidor.
//
// 🔴 LOS JUEGOS FRECUENTES SON UN AUTOCOMPLETADO, NO UN BLOQUE FIJO
// (25-ago-2026). Daniel, textual: *«lo de poner transporte frecuente no le
// gusta, quita espacio, que sea solo al escribir primeras 2 o 3 letras que
// aparezca las opciones»*. Antes eran 3 tarjetas SIEMPRE desplegadas arriba de
// «Recibido por»: media pantalla de iPhone en la única página donde bodega
// despacha, todos los días, incluso cuando el chofer era uno nuevo. Ahora las
// opciones salen al escribir 2 letras en ese campo y se esconden solas.
// ⚠️ NO SE PERDIÓ NADA DE LO QUE HACÍA: tocar una sigue llenando LOS TRES
// campos (recibido por · cédula · placa), los tres siguen editables después, y
// el orden sigue siendo POR FRECUENCIA (la lista llega ya ordenada y el filtro
// CONSERVA ese orden). Ver `@/lib/guias/juegos-despacho`.
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
  tipoDespacho: TipoDespacho;
  setTipoDespacho: (v: TipoDespacho) => void;
  /**
   * ¿Se dibuja el bloque «Cómo sale» con su «Cambiar»? Por defecto SÍ — es el
   * arreglo del 14-ago-2026 y no se toca. Va en `false` solo cuando la edición
   * está abierta en la misma pantalla: ahí el modo se elige en el formulario y
   * dos controles para el mismo campo, con dos estados distintos, es peor que
   * ninguno.
   */
  mostrarModo?: boolean;
  bPlaca: string;
  setBPlaca: (v: string) => void;
  bReceptor: string;
  setBReceptor: (v: string) => void;
  bCedula: string;
  setBCedula: (v: string) => void;
  bChofer: string;
  setBChofer: (v: string) => void;
  /** Los juegos MÁS USADOS con ESTE transportista. Vacío = no se dibuja nada. */
  juegos?: readonly JuegoDespacho[];
  onUsarJuego?: (j: JuegoDespacho) => void;
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
  tipoDespacho, setTipoDespacho, mostrarModo = true,
  bPlaca, setBPlaca, bReceptor, setBReceptor, bCedula, setBCedula,
  bChofer, setBChofer,
  juegos = [], onUsarJuego,
  bSaving, onConfirmar,
  pendingFirma1, pendingFirma2, onFirma1Change, onFirma2Change,
}: DespachoFormProps) {
  /** El ancla del desplegable de juegos. Ver `DesplegableFlotante`. */
  const receptorRef = useRef<HTMLInputElement>(null);
  const canvas1Ref = useRef<HTMLCanvasElement>(null);
  const canvas2Ref = useRef<HTMLCanvasElement>(null);
  // El selector aparece solo si se toca "Cambiar". Ver la cabecera.
  const [cambiandoModo, setCambiandoModo] = useState(false);
  /**
   * ¿La lista de juegos está abierta? Se enciende **al ESCRIBIR** y con nada
   * más — ni al enfocar el campo, ni al montar. Es lo que Daniel pidió: las
   * opciones aparecen recién al teclear las primeras letras.
   */
  const [buscandoJuego, setBuscandoJuego] = useState(false);

  // Warn before leaving if user has filled any field
  const isDirty = useMemo(
    () => !!(bPlaca || bReceptor || bCedula || bChofer || pendingFirma1 || pendingFirma2),
    [bPlaca, bReceptor, bCedula, bChofer, pendingFirma1, pendingFirma2]
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

  /**
   * Los juegos que empiezan por lo que se escribió, **en el orden en que
   * llegaron** — o sea por FRECUENCIA. `juegosQueCoinciden` filtra y no
   * reordena; reordenar acá (por parecido, por fecha) desharía lo medido en los
   * 6 transportistas: en Boston el juego de 10 veces NO es el más reciente.
   *
   * ⚠️ En entrega directa no hay transportista ni placa: la lista ni se calcula.
   */
  const sugerenciasJuego =
    externo && onUsarJuego ? juegosQueCoinciden(juegos, bReceptor) : [];
  const mostrarJuegos = buscandoJuego && sugerenciasJuego.length > 0;

  return (
    <div className="space-y-4">
      {/* Cómo sale la mercancía — se MUESTRA lo que ya se eligió al crearla. */}
      {mostrarModo && (
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
      )}

      {/* Quién recibe y en qué se va */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        {/* 🔴 EL BLOQUE FIJO DE JUEGOS FRECUENTES SE FUE DE ACÁ: hoy es el
            autocompletado del campo «Recibido por», más abajo. Ver la cabecera. */}
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
          {/* 🔴 «RECIBIDO POR» CON AUTOCOMPLETADO. Las opciones salen al
              escribir 2 letras (`MIN_LETRAS_JUEGO`, en el módulo puro) y se esconden solas: al
              elegir una, al salir del campo o con Escape. NO se abren al
              enfocar — eso volvería a tapar la pantalla, que es lo que Daniel
              pidió sacar. */}
          <div>
            <label htmlFor="despacho-receptor" className="text-xs uppercase tracking-wide text-gray-400 mb-1 block">
              {externo ? "Recibido por" : "Cliente que recibe"}
            </label>
            <input
              id="despacho-receptor"
              ref={receptorRef}
              type="text"
              value={bReceptor}
              autoComplete="off"
              role={externo && onUsarJuego ? "combobox" : undefined}
              aria-expanded={externo && onUsarJuego ? mostrarJuegos : undefined}
              aria-controls={externo && onUsarJuego ? "despacho-receptor-opciones" : undefined}
              onChange={(e) => { setBReceptor(e.target.value); setBuscandoJuego(true); }}
              onKeyDown={(e) => { if (e.key === "Escape") setBuscandoJuego(false); }}
              className={CAMPO}
            />
            {/* 🔑 EL DESPLEGABLE DE LA CASA, no un `absolute` colgado del campo.
                Este formulario vive dentro de contenedores con `overflow`, y un
                panel absoluto lo recorta el primer ancestro que lo tenga —
                subir el z-index NO lo arregla (30-jul-2026). Portal a <body> +
                `fixed`, y se cierra con click afuera y con Escape. */}
            {onUsarJuego && (
              <DesplegableFlotante
                abierto={mostrarJuegos}
                anclaRef={receptorRef}
                onCerrar={() => setBuscandoJuego(false)}
                id="despacho-receptor-opciones"
                marca="juego-despacho"
                role="listbox"
                aria-label="Los que más usa este transportista"
                className="bg-white border border-gray-200 rounded-lg shadow-lg"
              >
                <>
                  {sugerenciasJuego.map((j, i) => (
                    <button
                      key={`${j.receptor}|${j.cedula}|${j.placa}|${i}`}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => { onUsarJuego(j); setBuscandoJuego(false); }}
                      className="w-full text-left px-3 py-2 min-h-[44px] hover:bg-gray-50 active:bg-gray-100 transition"
                    >
                      <span className="block text-sm font-medium break-words">{j.receptor}</span>
                      <span className="block text-xs text-gray-500 break-words">
                        {j.cedula} · {j.placa}
                        {j.veces > 1 && ` · ${j.veces} veces`}
                      </span>
                    </button>
                  ))}
                </>
              </DesplegableFlotante>
            )}
          </div>
          <div>
            <label htmlFor="despacho-cedula" className="text-xs uppercase tracking-wide text-gray-400 mb-1 block">Cédula</label>
            <input id="despacho-cedula" type="text" value={bCedula}
              onChange={(e) => setBCedula(e.target.value)} className={CAMPO} />
          </div>
        </div>
      </div>

      {/* 🔴 ACÁ NO VA LA LISTA DE ENVÍOS. Ver la cabecera del archivo: los N° del
          transportista viven en `ListaEnvios`, pegados a su renglón. */}

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
