"use client";

// ─────────────────────────────────────────────────────────────────────────────
// MARCACIÓN — LA PANTALLA DE ANTES, ENTERA (14-sep-2026, movida acá el
// 24-sep-2026).
//
// 🔴 ES LA COPIA EXACTA de lo que se dibujaba hasta el rediseño «un toque»:
// el saludo, la hora grande, la pastilla, la nota, el botón donde estaba, la
// pantalla intermedia de la foto con «Enviar» y «Volver a tomarla», y «Mis
// marcas». Se mudó de archivo sin cambiarle una clase ni un texto — lo único
// que se fue son las guardas `!MARCACION_UN_TOQUE`, porque este componente
// SOLO se monta con el interruptor apagado.
//
// ⚠️ NO SE TOCA. Es el «volver atrás» de Daniel: con `MARCACION_UN_TOQUE` en
// `false` la pantalla tiene que quedar idéntica a la que sus cuatro personas
// usaron el 22 y el 23 de septiembre. Los candados que la prueban son
// `marcacion-pantalla`, `marcacion-deshacer-pantalla` y `marcacion-sin-blanco`,
// los tres pinados a `false`.
// ─────────────────────────────────────────────────────────────────────────────

import { cuentaRegresiva, rotuloDeshacer, type QueSeDeshace } from "@/lib/marcacion/deshacer";
import {
  diaCorto,
  enDoceHoras,
  horaAmPm,
  QUIEN_CORRIGE,
  type DiaMarcado,
  type EstadoBoton,
  type TipoMarca,
} from "@/lib/marcacion/marcacion";

export interface PantallaDeAntesProps {
  nombre: string;
  hora: string;
  fecha: string;
  enLinea: boolean;
  hoyMarcado: DiaMarcado | null;
  sePuedeDeshacer: QueSeDeshace | null;
  deshaciendo: boolean;
  onDeshacer: () => void;
  avisoVisible: { tono: "error" | "guardada" | "listo"; texto: string } | null;
  aviso: { tono: "error" | "guardada" | "listo"; texto: string } | null;
  pendientes: number;
  nota: string | null;
  boton: EstadoBoton;
  onTocarBoton: () => void;
  dias: DiaMarcado[];
  rotuloQuincena: string;
  hoy: string;
  foto: { blob: Blob; url: string } | null;
  tipoEnCurso: TipoMarca | null;
  buscandoUbicacion: boolean;
  enviando: boolean;
  onEnviar: () => void;
  onCancelarFoto: () => void;
}

export default function PantallaDeAntes({
  nombre,
  hora,
  fecha,
  enLinea,
  hoyMarcado,
  sePuedeDeshacer,
  deshaciendo,
  onDeshacer,
  avisoVisible,
  aviso,
  pendientes,
  nota,
  boton,
  onTocarBoton,
  dias,
  rotuloQuincena,
  hoy,
  foto,
  tipoEnCurso,
  buscandoUbicacion,
  enviando,
  onEnviar,
  onCancelarFoto,
}: PantallaDeAntesProps) {
  return (
    <>
      {!foto && (
        <>
          <p className="text-sm text-gray-600">
            Hola, <b className="font-semibold text-black">{nombre}</b>
          </p>

          {/* 🔴 12 HORAS, y es la hora que se va a GUARDAR (ver el encabezado). */}
          <p className="mt-3 text-[46px] font-semibold leading-none tracking-tight tabular-nums">
            {hora}
          </p>
          <p className="mt-2 text-sm text-gray-500">
            {enLinea
              ? `${fecha} · hora de Panamá`
              : "Hora de tu teléfono · sin señal"}
          </p>

          {/* Lo que ya marcó hoy. Nunca «0 marcas»: si no marcó, no se dice. */}
          {hoyMarcado && (
            <p className="mt-4 rounded-md bg-green-50 px-3 py-2.5 text-sm font-medium text-green-800">
              ✓ {hoyMarcado.salida
                ? `Entrada ${enDoceHoras(hoyMarcado.entrada)} · Salida ${enDoceHoras(hoyMarcado.salida)}`
                : `Entrada de hoy: ${enDoceHoras(hoyMarcado.entrada)}`}
            </p>
          )}

          {/* 🔴 DESHACER LA ÚLTIMA MARCA — dos minutos, y después no está.
              Va pegado a lo que deshace. No pregunta «¿estás seguro?»: la
              ventana de dos minutos ES el freno, y si se toca por error se
              vuelve a marcar. */}
          {sePuedeDeshacer && (
            <button
              type="button"
              onClick={onDeshacer}
              disabled={deshaciendo}
              className="mt-2 min-h-[44px] w-full rounded-md px-3 py-2 text-sm text-gray-600 underline decoration-dotted underline-offset-2 transition active:scale-[0.97] disabled:text-gray-400"
            >
              {deshaciendo
                ? "Deshaciendo…"
                : `${rotuloDeshacer(sePuedeDeshacer.tipo)} · ${cuentaRegresiva(sePuedeDeshacer.restanMs)}`}
            </button>
          )}

          {avisoVisible && (
            <p
              className={`mt-3 rounded-md px-3 py-2.5 text-sm font-medium ${
                avisoVisible.tono === "error"
                  ? "bg-red-50 text-red-800"
                  : avisoVisible.tono === "listo"
                    ? "bg-green-50 text-green-800"
                    : "bg-amber-50 text-amber-900"
              }`}
            >
              {avisoVisible.texto}
            </p>
          )}

          {pendientes > 0 && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900">
              {pendientes === 1
                ? "Una marca está esperando señal. Se va a enviar sola."
                : `${pendientes} marcas están esperando señal. Se van a enviar solas.`}
            </p>
          )}

          {nota && <p className="mt-3 text-sm text-gray-600">{nota}</p>}

          <button
            type="button"
            onClick={onTocarBoton}
            disabled={boton.apagado}
            className={`mt-6 min-h-[56px] w-full rounded-md px-4 py-4 text-base font-semibold transition active:scale-[0.97] ${
              boton.apagado
                ? "cursor-default border border-gray-200 bg-gray-100 text-gray-500"
                : "bg-black text-white"
            }`}
          >
            {boton.texto}
          </button>

          <MisMarcas dias={dias} rotulo={rotuloQuincena} hoy={hoy} />
        </>
      )}

      {/* ── La selfie — la pantalla intermedia de antes ─────────────────
          🩸 Es el cuarto toque que se retiró: la cámara de iOS ya preguntó
          «¿Usar foto?» y esto volvía a pedir «Enviar». Vive solo con el
          interruptor apagado. */}
      {foto && (
        <>
          <p className="text-sm text-gray-600">
            {tipoEnCurso === "entrada" ? "Entrada" : "Salida"} ·{" "}
            <span className="tabular-nums">{hora}</span>
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={foto.url}
            alt="Tu selfie"
            className="mt-3 w-full rounded-lg border border-gray-200 object-cover"
          />
          {buscandoUbicacion && (
            <p className="mt-3 text-sm text-gray-500">Buscando tu ubicación…</p>
          )}
          {aviso && (
            <p
              className={`mt-3 rounded-md px-3 py-2.5 text-sm font-medium ${
                aviso.tono === "error" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"
              }`}
            >
              {aviso.texto}
            </p>
          )}
          <button
            type="button"
            onClick={onEnviar}
            disabled={enviando || buscandoUbicacion}
            className="mt-4 min-h-[56px] w-full rounded-md bg-black px-4 py-4 text-base font-semibold text-white transition active:scale-[0.97] disabled:bg-gray-300"
          >
            {enviando ? "Enviando…" : "Enviar"}
          </button>
          <button
            type="button"
            onClick={onCancelarFoto}
            className="mt-2 min-h-[44px] w-full rounded-md px-4 py-2 text-sm text-gray-600 underline decoration-dotted underline-offset-2"
          >
            Volver a tomarla
          </button>
        </>
      )}
    </>
  );
}

/** «Mis marcas» de la quincena. Ella ve sus horas y nada más. */
function MisMarcas({ dias, rotulo, hoy }: { dias: DiaMarcado[]; rotulo: string; hoy: string }) {
  if (dias.length === 0) {
    return (
      <p className="mt-8 text-sm text-gray-500">
        Todavía no tienes marcas en esta quincena.
      </p>
    );
  }
  return (
    <section className="mt-8">
      <h2 className="flex items-baseline justify-between text-sm font-semibold text-black">
        Mis marcas
        <span className="text-sm font-normal text-gray-500">{rotulo}</span>
      </h2>
      <ul className="mt-2 divide-y divide-gray-100">
        {dias.map((d) => (
          <li key={d.fecha} className="flex items-center justify-between py-2.5 text-sm tabular-nums">
            <span className="text-gray-600">{diaCorto(d.fecha)}</span>
            {d.salida ? (
              <span className="font-semibold">{enDoceHoras(d.entrada)} – {enDoceHoras(d.salida)}</span>
            ) : d.faltaSalida ? (
              <span className="font-semibold text-amber-700">falta la salida</span>
            ) : (
              <span className="font-semibold">
                {enDoceHoras(d.entrada)}{d.fecha === hoy ? " –" : ""}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-gray-500">Si algo está mal, avísale a {QUIEN_CORRIGE}.</p>
    </section>
  );
}
