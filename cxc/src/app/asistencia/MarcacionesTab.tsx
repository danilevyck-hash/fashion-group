"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * LA PESTAÑA «MARCACIONES» — AGRUPADA POR DÍA (25-sep-2026).
 *
 * Daniel, sobre el mockup: *«hazlo minimalista, user friendly; ya sabes que
 * tienes que usar scroll down en vez de chips con cada persona»*.
 *
 * 🩸 LO QUE HABÍA: dos filas de chips —uno por colaborador y otro por día— y
 * una tabla de seis columnas SIN columna de fecha. **37 renglones sueltos** de
 * cinco personas y cuatro días, mezclados; para saber de qué día era cada uno
 * había que tocar un chip. En el celular, cuatro filas de botones antes de la
 * primera hora.
 *
 * 🔴 HOY: el DÍA es el encabezado y dentro va UNA fila por colaborador con sus
 * marcas en orden —«Entrada 08:59 · Almuerzo 18:01 – 18:01 · Salida 18:01»—.
 * De 37 renglones sueltos a 17 bajo cuatro días. Arriba quedan dos cosas: el
 * período y «Colaborador: todos ▾». **No hay filtro de empresa** —eso lo manda
 * el selector del módulo, arriba a la derecha— **ni de día**: el día se baja
 * con la rueda.
 *
 * 🔴 SOLO LA VE `admin`, Y NO ES UNA DECISIÓN DE PANTALLA. Cada marca trae una
 * foto del LUGAR y una ubicación: dónde estuvo una persona. La lista de roles
 * es UNA (`MARCACIONES_ROLES`) y la leen esta pantalla y la ruta; esconder una
 * pestaña nunca cerró nada.
 *
 * 🔴 SOLO SE MIRA. Ni un botón que edite, corrija, borre o justifique. La
 * marcación no se edita ni se borra —ni la del reloj ni la del teléfono—: la
 * corrección va encima, en Asistencia, con su motivo obligatorio y su firma.
 * Hay barrido que pone el build ROJO si aquí aparece un POST, PUT, PATCH o
 * DELETE.
 *
 * ⚠️ El interruptor `MARCACIONES_POR_DIA` en `false` devuelve la pantalla de
 * chips ENTERA (`marcaciones/PantallaDeAntes.tsx`), sin tocar una línea.
 *
 * Toda la regla vive en `lib/asistencia/marcaciones-por-dia.ts`, que es puro.
 * ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from "react";
import SelectorPeriodo, { usePeriodoAsistencia } from "@/components/asistencia/SelectorPeriodo";
import { ScrollableTable } from "@/components/ui";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { aparatoDeQuienMira } from "@/lib/aparato";
import { empresaParaPedir } from "@/lib/asistencia/empresa-para-todo";
import { textoDelPie } from "@/lib/ui/pie-de-lista";
import { horaAmPm, horaCorta } from "@/lib/marcacion/marcacion";
import {
  AVISO_MISMO_TELEFONO,
  COLUMNAS_POR_DIA,
  ETIQUETA_COLABORADOR,
  MARCACIONES_POR_DIA,
  NOTA_SOLO_SE_MIRA,
  ROTULO_TODOS,
  diasDeMarcaciones,
  type FilaPorDia,
} from "@/lib/asistencia/marcaciones-por-dia";
import FotosDeLaMarcaModal, { type FotoParaVer } from "./FotosDeLaMarcaModal";
import MarcacionesDeAntes from "./marcaciones/PantallaDeAntes";
import {
  PALABRAS_MARCAS,
  SIN_COLUMNAS_NUEVAS,
  SIN_MARCAS,
  colaboradoresDeLasMarcas,
  detalleDeLaHoja,
  fechaDelDia,
  filtrarMarcas,
  lineasDeLaHoja,
  marcasDeAparatoCompartido,
  rotuloDeLaMarca,
  type MarcaDeTelefono,
} from "./marcaciones/logica";

/** El único filtro que queda. Mismo nivel → `replace`. */
const PARAM_QUIEN = "mcQuien";

/** El punto gris de «sin señal»: delante de la marca, sin empujar el renglón. */
function PuntoSinSenal() {
  return (
    <span
      title="Se marcó sin señal: la hora la puso el teléfono."
      aria-label="sin señal"
      className="mr-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400 align-middle"
    />
  );
}

/** Las marcas del día de una persona, en una línea. */
function Marcas({ fila }: { fila: FilaPorDia<MarcaDeTelefono> }) {
  return (
    <>
      {fila.tramos.map((t, i) => (
        <span key={t.clave} className="whitespace-nowrap">
          {i > 0 && <span className="text-gray-300"> · </span>}
          {t.sinSenal && <PuntoSinSenal />}
          <span className="text-gray-700">{t.rotulo} </span>
          <b className="font-medium tabular-nums text-gray-900">{t.horas}</b>
        </span>
      ))}
    </>
  );
}

/** El aviso ROJO: dos colaboradores, un solo teléfono ese día. */
function AvisoMismoTelefono() {
  return (
    <span className="ml-2 whitespace-nowrap rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">
      {AVISO_MISMO_TELEFONO}
    </span>
  );
}

export default function MarcacionesTab({ empresa }: { empresa: string }) {
  if (!MARCACIONES_POR_DIA) return <MarcacionesDeAntes empresa={empresa} />;
  return <PorDia empresa={empresa} />;
}

function PorDia({ empresa }: { empresa: string }) {
  const { desde, hasta, hoy, elegir } = usePeriodoAsistencia();

  const [marcas, setMarcas] = useState<MarcaDeTelefono[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [hayColumnasNuevas, setHayColumnasNuevas] = useState(true);

  const [quien, setQuien] = useUrlState<string>(PARAM_QUIEN, "");

  // El aparato se pregunta POR EL DEDO y en un efecto: en el servidor no hay
  // `matchMedia`, y pintar una cosa para después cambiarla sería peor.
  const [celular, setCelular] = useState(false);
  useEffect(() => { setCelular(aparatoDeQuienMira() === "celular"); }, []);

  const [abierta, setAbierta] = useState<FotoParaVer[] | null>(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError("");
    const q = new URLSearchParams({ desde, hasta });
    const emp = empresaParaPedir(empresa);
    if (emp) q.set("empresa", emp);
    void (async () => {
      try {
        const r = await fetch(`/api/asistencia/marcaciones?${q}`, { cache: "no-store" });
        const j = (await r.json()) as {
          marcas?: MarcaDeTelefono[];
          hayColumnasNuevas?: boolean;
          error?: string;
        };
        if (!vivo) return;
        if (!r.ok) {
          setError(j.error || "No se pudieron leer las marcaciones.");
          setMarcas([]);
          return;
        }
        setMarcas(j.marcas ?? []);
        setHayColumnasNuevas(j.hayColumnasNuevas !== false);
      } catch {
        if (vivo) {
          setError("No se pudieron leer las marcaciones. Intenta de nuevo en unos segundos.");
          setMarcas([]);
        }
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [desde, hasta, empresa]);

  const gente = useMemo(() => colaboradoresDeLasMarcas(marcas), [marcas]);
  const filtradas = useMemo(
    () => filtrarMarcas(marcas, { codigo: quien, dia: "" }),
    [marcas, quien],
  );
  const dias = useMemo(
    // 🔑 El aviso del teléfono compartido se mide sobre TODO lo del período, no
    // sobre lo filtrado: con el chip de una persona puesta, la otra no está.
    () => diasDeMarcaciones(filtradas, marcasDeAparatoCompartido(marcas)),
    [filtradas, marcas],
  );

  /** 🔴 Tocar la fila abre la MISMA hoja del reporte, con las marcas del día. */
  const abrir = useCallback((fila: FilaPorDia<MarcaDeTelefono>) => {
    setAbierta(
      fila.marcas.map((m, i) => ({
        id: m.id,
        hora: horaCorta(m.ocurrioEn),
        horaLarga: horaAmPm(m.ocurrioEn),
        detalle: detalleDeLaHoja(m),
        relojCorrido: null,
        quitada: false,
        sinSenal: Boolean(m.sinSenal),
        // La demora ya se dice en `lineasDeLaHoja`: no se mide otra vez.
        atrasoMin: null,
        tieneFoto: m.tieneFoto,
        lat: m.lat,
        lng: m.lng,
        persona: fila.nombre,
        fecha: fechaDelDia(fila.dia),
        rotulo: rotuloDeLaMarca(i, m.tipo),
        lineas: lineasDeLaHoja(m),
      })),
    );
  }, []);

  const vacio = !cargando && !error && filtradas.length === 0;

  return (
    <div className="space-y-4">
      {/* ── ARRIBA: el período, UN desplegable, el conteo y el ⓘ ─────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <SelectorPeriodo desde={desde} hasta={hasta} hoy={hoy} onElegir={elegir} />
        {gente.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">{ETIQUETA_COLABORADOR}</span>
            <select
              aria-label={ETIQUETA_COLABORADOR}
              value={quien}
              onChange={(e) => setQuien(e.target.value)}
              className="min-h-[44px] rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm"
            >
              <option value="">{ROTULO_TODOS}</option>
              {gente.map((g) => (
                <option key={g.codigo} value={g.codigo}>{g.nombre}</option>
              ))}
            </select>
          </label>
        )}
        <p className="text-sm text-gray-500">
          {textoDelPie(filtradas.length, marcas.length, PALABRAS_MARCAS)}
        </p>
        {/* 🔴 La nota del pie pasó a un ⓘ: la misma frase, sin gastar un renglón. */}
        <span
          title={NOTA_SOLO_SE_MIRA}
          aria-label={NOTA_SOLO_SE_MIRA}
          className="cursor-help text-sm text-gray-400"
        >
          ⓘ
        </span>
      </div>

      {!hayColumnasNuevas && (
        <p className="rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-800">{SIN_COLUMNAS_NUEVAS}</p>
      )}

      {error && <p className="rounded-md bg-gray-50 px-3 py-2.5 text-sm text-gray-700">{error}</p>}
      {cargando && !error && <p className="text-sm text-gray-500">Cargando…</p>}
      {vacio && (
        <p className="rounded-md bg-gray-50 px-3 py-2.5 text-sm text-gray-600">{SIN_MARCAS}</p>
      )}

      {/* ── EL DÍA MANDA, en la computadora y en el celular ──────────────── */}
      {dias.map((d) => (
        <section key={d.dia} className="space-y-2">
          <h3 className="text-[13px] font-medium uppercase tracking-wide text-gray-500">
            {d.rotulo}
          </h3>

          {celular ? (
            <div className="space-y-2">
              {d.filas.map((f) => (
                <button
                  key={f.llave}
                  type="button"
                  onClick={() => abrir(f)}
                  className="block w-full rounded-lg border border-gray-200 bg-white p-3 text-left transition active:bg-gray-50"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[15px] font-medium text-gray-900">
                      {f.nombre}
                      {f.mismoTelefono && <AvisoMismoTelefono />}
                    </span>
                    <span className="shrink-0 text-[13px] text-gray-500">{f.lugar}</span>
                  </span>
                  <span className="mt-1 block text-[15px] leading-relaxed">
                    <Marcas fila={f} />
                  </span>
                  {f.detalle && (
                    <span className="mt-0.5 block text-[13px] text-gray-500">{f.detalle}</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <ScrollableTable minWidth={760}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                    {COLUMNAS_POR_DIA.map((c) => (
                      <th key={c} className="py-2 pr-3 font-medium">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.filas.map((f) => (
                    <tr
                      key={f.llave}
                      onClick={() => abrir(f)}
                      className="cursor-pointer border-b border-gray-100 transition hover:bg-gray-50"
                    >
                      <td className="w-[180px] py-2 pr-3 align-top text-gray-900">
                        {f.nombre}
                        {f.mismoTelefono && <AvisoMismoTelefono />}
                      </td>
                      <td className="py-2 pr-3 align-top">
                        <Marcas fila={f} />
                        {f.detalle && (
                          <div className="mt-0.5 text-[12px] text-gray-500">{f.detalle}</div>
                        )}
                      </td>
                      <td className="w-[260px] py-2 pr-3 align-top text-gray-700">{f.lugar}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>
          )}
        </section>
      ))}

      <FotosDeLaMarcaModal marcas={abierta} onClose={() => setAbierta(null)} />
    </div>
  );
}
