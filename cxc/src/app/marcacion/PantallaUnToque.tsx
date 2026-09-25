"use client";

// ─────────────────────────────────────────────────────────────────────────────
// MARCACIÓN «UN TOQUE» — lo que se DIBUJA (24-sep-2026).
//
// 🔑 ACÁ NO HAY LÓGICA: ni red, ni cola, ni reloj, ni decisiones. Todo eso vive
// en `MarcacionClient` (el estado) y en `lib/marcacion/un-toque.ts` (las
// reglas). Este archivo recibe lo que ya está decidido y lo pone en la
// pantalla, para que el acomodo nuevo no pueda arrastrar una segunda copia de
// ninguna regla.
//
// El orden de arriba abajo, y el porqué de cada cosa:
//   · el nombre, chico y gris — es de quién es esta pantalla, no un saludo;
//   · la HORA, enorme — es el dato, y es la que se va a guardar;
//   · la fecha;
//   · sin señal, UNA línea que dice lo que de verdad pasa;
//   · la pastilla verde con lo ya marcado y, ADENTRO, «Deshacer» — antes caía
//     15 px encima de donde estaba el botón de marcar;
//   · lo de ayer, solo si falta algo;
//   · y abajo, pegado al borde, EL BOTÓN: siempre el mismo, siempre ahí.
//
// 🔴 EL BOTÓN NO CAMBIA DE POSICIÓN. Su cajón y sus clases salen de constantes
// (`CLASES_CAJON_BOTON`, `CLASES_BOTON_UN_TOQUE`) que los tres estados usan
// tal cual; lo único que varía es el color. Hay candado.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef } from "react";
import { cuentaRegresiva, rotuloDeshacer, type QueSeDeshace } from "@/lib/marcacion/deshacer";
import { ATRIBUTO_BARRA_FIJA } from "@/lib/navegacion/barra-celular";
import { usePublicarAltoBarraFija } from "@/lib/navegacion/useBarraFijaAbajo";
import { enDoceHoras, type DiaMarcado, type EstadoBoton } from "@/lib/marcacion/marcacion";
import {
  MARCACION_CUATRO_MARCAS,
  resumenDelDia,
  rotuloDeshacerDeLaMarca,
} from "@/lib/marcacion/cuatro-marcas";
import {
  CLASES_BOTON_UN_TOQUE,
  CLASES_CAJON_BOTON,
  PADDING_ABAJO_BOTON,
  TEXTO_AYER_SIN_SALIDA,
  TEXTO_MARCANDO,
  TEXTO_SIN_SENAL,
  TONO_BOTON_APAGADO,
  TONO_BOTON_VIVO,
  textoAvisarA,
} from "@/lib/marcacion/un-toque";

export interface PantallaUnToqueProps {
  /** Cómo se llama, ya capitalizado. Vacío = no se dibuja. */
  nombre: string;
  /** «8:58 a. m.» — la hora que se va a guardar. */
  hora: string;
  /** «Jueves 24 de septiembre». */
  fecha: string;
  enLinea: boolean;
  /** Lo que ya marcó HOY, o `null`. */
  hoyMarcado: DiaMarcado | null;
  /** Las horas de HOY, en orden, como «HH:MM». Con cuatro marcas la pastilla
   *  las nombra una por una; con dos, se sigue leyendo `hoyMarcado`. */
  horasHoy: readonly string[];
  /** Cuántas marcas lleva HOY. Lo usa el rótulo de «Deshacer», que nombra la
   *  ÚLTIMA: su número es `marcasHoy - 1`. */
  marcasHoy: number;
  sePuedeDeshacer: QueSeDeshace | null;
  deshaciendo: boolean;
  onDeshacer: () => void;
  aviso: { tono: "error" | "guardada" | "listo"; texto: string } | null;
  /** Cuántas marcas esperan señal. */
  pendientes: number;
  /** Ayer quedó sin salida. */
  faltoAyer: boolean;
  boton: EstadoBoton;
  /** La marca está viajando: el botón se apaga en el MISMO lugar. */
  marcando: boolean;
  onTocarBoton: () => void;
}

export default function PantallaUnToque({
  nombre,
  hora,
  fecha,
  enLinea,
  hoyMarcado,
  horasHoy,
  marcasHoy,
  sePuedeDeshacer,
  deshaciendo,
  onDeshacer,
  aviso,
  pendientes,
  faltoAyer,
  boton,
  marcando,
  onTocarBoton,
}: PantallaUnToqueProps) {
  const apagado = marcando || boton.apagado;
  // 🔴 El cajón del botón dice cuánto mide. A quien SOLO marca no se le dibuja
  // el botón redondo del menú —no tiene a dónde ir—, pero un admin probando
  // esta pantalla sí lo ve, y ahí el flotante se sube encima en vez de taparlo.
  const cajon = useRef<HTMLDivElement | null>(null);
  usePublicarAltoBarraFija(cajon);
  return (
    <>
      {nombre && <p className="text-[15px] text-gray-500">{nombre}</p>}

      {/* 🔴 12 HORAS, y es la hora que se va a GUARDAR. */}
      <p className="mt-2 text-[56px] font-light leading-none tracking-tight tabular-nums">
        {hora}
      </p>
      <p className="mt-2 text-[15px] text-gray-500">{fecha}</p>

      {/* 🔴 SIN SEÑAL SE DICE ACÁ, EN UNA LÍNEA, y no en una franja naranja que
          tapa el encabezado y promete lo contrario de lo que pasa. */}
      {!enLinea && (
        <p
          data-sin-senal
          className="mt-5 rounded-xl border border-gray-200 px-3 py-2.5 text-[14px] text-gray-600"
        >
          {TEXTO_SIN_SENAL}
        </p>
      )}

      {/* 🔴 LA ÚNICA CONFIRMACIÓN, y «Deshacer» vive ADENTRO de ella. */}
      {hoyMarcado && (
        <div
          data-pastilla
          className="mt-6 flex items-center justify-between gap-3 rounded-xl bg-green-50 px-4 py-3.5 text-[17px] font-semibold text-green-800"
        >
          {/* 🔴 CADA MARCA CON SU NOMBRE (24-sep-2026). Con cuatro marcas, la
              primera y la última ya no alcanzan: a mediodía, «Entrada 8:00 ·
              Salida 12:00» se lee como que ya salió del trabajo. */}
          <span>
            ✓{" "}
            {MARCACION_CUATRO_MARCAS
              ? resumenDelDia(horasHoy)
              : hoyMarcado.salida
                ? `Entrada ${enDoceHoras(hoyMarcado.entrada)} · Salida ${enDoceHoras(hoyMarcado.salida)}`
                : `Entrada ${enDoceHoras(hoyMarcado.entrada)}`}
          </span>
          {sePuedeDeshacer && (
            <button
              type="button"
              onClick={onDeshacer}
              disabled={deshaciendo}
              className="-my-3 -mr-2 min-h-[44px] flex-none px-2 text-[13px] font-medium text-gray-600 underline decoration-dotted underline-offset-2 disabled:text-gray-400"
            >
              {deshaciendo
                ? "Deshaciendo…"
                : `${MARCACION_CUATRO_MARCAS
                    ? rotuloDeshacerDeLaMarca(marcasHoy - 1, sePuedeDeshacer.tipo)
                    : rotuloDeshacer(sePuedeDeshacer.tipo)} · ${cuentaRegresiva(sePuedeDeshacer.restanMs)}`}
            </button>
          )}
        </div>
      )}

      {aviso && (
        <p
          className={`mt-4 rounded-xl px-4 py-3 text-[14px] font-medium ${
            aviso.tono === "error"
              ? "bg-red-50 text-red-800"
              : aviso.tono === "listo"
                ? "bg-green-50 text-green-800"
                : "bg-amber-50 text-amber-900"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      {pendientes > 0 && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-[14px] font-medium text-amber-900">
          {pendientes === 1
            ? "Una marca está esperando señal. Se va a enviar sola."
            : `${pendientes} marcas están esperando señal. Se van a enviar solas.`}
        </p>
      )}

      {/* 🔴 LO DE AYER SE DICE UNA VEZ Y SOLO CUANDO FALTA ALGO. */}
      {faltoAyer && (
        <p data-falto-ayer className="mt-4 text-[14px] text-gray-500">
          {TEXTO_AYER_SIN_SALIDA} <span className="text-blue-600">{textoAvisarA()}</span>
        </p>
      )}

      {/* 🔴 EL BOTÓN, SIEMPRE EN EL MISMO PÍXEL. */}
      <div ref={cajon} data-boton-fijo {...{ [ATRIBUTO_BARRA_FIJA]: "" }} className={CLASES_CAJON_BOTON} style={{ paddingBottom: PADDING_ABAJO_BOTON }}>
        <div className="mx-auto w-full max-w-md">
          <button
            type="button"
            onClick={onTocarBoton}
            disabled={apagado}
            className={`${CLASES_BOTON_UN_TOQUE} ${apagado ? TONO_BOTON_APAGADO : TONO_BOTON_VIVO}`}
          >
            {marcando ? TEXTO_MARCANDO : boton.texto}
          </button>
        </div>
      </div>
    </>
  );
}
