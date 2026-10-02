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
 * período y «Colaborador: todos ▾» (28a, 29-sep-2026: se fueron «84 marcas» y
 * su ⓘ; la nota de «solo se mira» va al pie de la hoja). **No hay filtro de empresa** —eso lo manda
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

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import SelectorPeriodo, { usePeriodoAsistencia } from "@/components/asistencia/SelectorPeriodo";
// 🔴 El encabezado de la tabla se pega DEBAJO del de la app (29-sep-2026): la
// única forma de hacerlo es esta clase (`lib/ui/barra-pegajosa.ts`).
import { CLASE_BARRA_PEGAJOSA } from "@/lib/ui/barra-pegajosa";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { aparatoDeQuienMira } from "@/lib/aparato";
import { empresaParaPedir } from "@/lib/asistencia/empresa-para-todo";
import { horaAmPm, horaCorta } from "@/lib/marcacion/marcacion";
import {
  AVISO_MISMO_TELEFONO,
  COLUMNAS_POR_DIA,
  ETIQUETA_COLABORADOR,
  detalleEnLaHoja,
  hayColumnaLugar,
  type LugarDibujado,
  type TramoDibujado,
  MARCACIONES_POR_DIA,
  NOTA_SOLO_SE_MIRA,
  ROTULO_TODOS,
  diasDeMarcaciones,
  type FilaPorDia,
} from "@/lib/asistencia/marcaciones-por-dia";
import FotosDeLaMarcaModal, { type FotoParaVer } from "./FotosDeLaMarcaModal";
import { ChipSelector, EnLaBarra, useHayBarraCelular } from "@/components/celular/BarraDeControles";
import MarcacionesDeAntes from "./marcaciones/PantallaDeAntes";
import {
  SIN_COLUMNAS_NUEVAS,
  SIN_MARCAS,
  colaboradoresDeLasMarcas,
  fechaDelDia,
  filtrarMarcas,
  lineasDeLaHoja,
  marcasDeAparatoCompartido,
  rotuloDeLaMarca,
  type MarcaDeTelefono,
} from "./marcaciones/logica";

/** El único filtro que queda. Mismo nivel → `replace`. */
const PARAM_QUIEN = "mcQuien";

/**
 * El punto gris: delante de la marca, sin empujar el renglón. 🔴 27a
 * (29-sep-2026): lo que decía la línea gris bajo la fila —«sin señal: la
 * entrada se envió 9 h después»— va en su `title`; entero, en la hoja.
 */
function PuntoSinSenal({ aviso }: { aviso: string }) {
  return (
    <span
      title={aviso}
      aria-label={aviso}
      className="mr-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400 align-middle"
    />
  );
}

/** «18:00 ×3»: la hora y, en gris, cuántas marcas junta (25a). */
function Horas({ t }: { t: TramoDibujado }) {
  return (
    <>
      {t.partes.map((p, i) => (
        <span key={i}>
          {i > 0 && <b className="font-medium text-gray-900"> – </b>}
          <b className="font-medium tabular-nums text-gray-900">{p.hora}</b>
          {p.veces > 1 && <span className="tabular-nums text-gray-400"> ×{p.veces}</span>}
        </span>
      ))}
    </>
  );
}

/** Las marcas del día de una persona, en una línea. */
function Marcas({ fila }: { fila: FilaPorDia<MarcaDeTelefono> }) {
  return (
    <>
      {/* 🩸 El « · » va AFUERA del tramo que no se parte (2-oct-2026): adentro,
          la línea entera era un solo bloque sin dónde cortar y a 390 px se
          salía 30 px de la pantalla —y empujaba el ☰ fuera del dedo—. */}
      {fila.tramos.map((t, i) => (
        <Fragment key={t.clave}>
          {i > 0 && <span className="text-gray-300"> · </span>}
          <span className="whitespace-nowrap">
            {t.aviso && <PuntoSinSenal aviso={t.aviso} />}
            <span className="text-gray-700">{t.rotulo} </span>
            <Horas t={t} />
          </span>
        </Fragment>
      ))}
    </>
  );
}

/**
 * Los avisos ÁMBAR del día (29-sep-2026, aprobados por Daniel en el audit):
 * «sin almuerzo marcado». Solo se dicen. («N marcas en el mismo minuto» se fue
 * el mismo día: lo dice el ×N de la marca, 25a.)
 */
function AvisosAmbar({ avisos }: { avisos: readonly string[] }) {
  return (
    <>
      {avisos.map((a) => (
        <span key={a} className="ml-2 whitespace-nowrap rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
          {a}
        </span>
      ))}
    </>
  );
}

/**
 * EL LUGAR (29-sep-2026). Daniel aprobó el audit donde se leía «Calle del
 * Cerro 453-43, David · 780 / m de la tienda» partido en dos renglones: la
 * dirección se corta con «…» (el texto entero queda en el `title`) y la
 * distancia va en gris al lado, sin partirse nunca.
 */
function Lugar({ lugar }: { lugar: LugarDibujado }) {
  if (!lugar.nombre) return <span className="whitespace-nowrap">{lugar.texto}</span>;
  return (
    <span className="flex min-w-0 items-baseline gap-1.5" title={lugar.texto}>
      <span className="min-w-0 truncate">{lugar.nombre}</span>
      {lugar.distancia && (
        <span className="shrink-0 whitespace-nowrap text-gray-400">{lugar.distancia}</span>
      )}
    </span>
  );
}

const lugarDeLaFilaDibujado = (f: FilaPorDia<MarcaDeTelefono>): LugarDibujado => ({
  nombre: f.lugarNombre,
  distancia: f.lugarDistancia,
  texto: f.lugar,
});

/**
 * La fecha del día y, si todo el día marcó desde el mismo lugar, ese lugar UNA
 * vez al lado: «jue 24 sep · Paso Canoas · 46 km de la tienda» (26a).
 */
function FechaDelDia({ rotulo, lugar, celular = false }: { rotulo: string; lugar: LugarDibujado | null; celular?: boolean }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5 text-[13px] text-gray-500">
      <h3 className={`shrink-0 font-medium ${celular ? "uppercase tracking-wide" : ""}`}>{rotulo}</h3>
      {lugar && (
        <>
          <span className="text-gray-300">·</span>
          <Lugar lugar={lugar} />
        </>
      )}
    </div>
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
  const barra = useHayBarraCelular();

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
  // 26a: sin ninguna fila que escriba su lugar (el reloj, o todo el día en el
  // mismo sitio), la columna «Lugar» no se dibuja.
  const columnas = hayColumnaLugar(dias) ? COLUMNAS_POR_DIA : COLUMNAS_POR_DIA.slice(0, 2);

  /** 🔴 Tocar la fila abre la MISMA hoja del reporte, con las marcas del día. */
  const abrir = useCallback((fila: FilaPorDia<MarcaDeTelefono>) => {
    const ultima = fila.marcas.length - 1;
    setAbierta(
      fila.marcas.map((m, i) => ({
        id: m.id,
        hora: horaCorta(m.ocurrioEn),
        horaLarga: horaAmPm(m.ocurrioEn),
        detalle: detalleEnLaHoja(m),
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
        // La hoja nombra cada marca como la fila: la repetida lleva el nombre
        // de la que cuenta, y con DOS marcas y la 2.ª a su hora de salida,
        // «Salida» (el 3 es su lugar en las cuatro marcas).
        rotulo: rotuloDeLaMarca(fila.hoja[i].indice, m.tipo),
        // 25a: la repetida se ve y dice su porqué con la frase del reporte.
        // 28a: la nota de «solo se mira» cierra la hoja.
        lineas: [
          ...(fila.hoja[i].repetida ? [fila.hoja[i].repetida!] : []),
          ...lineasDeLaHoja(m, false),
          ...(i === ultima ? [NOTA_SOLO_SE_MIRA] : []),
        ],
      })),
    );
  }, []);

  const vacio = !cargando && !error && filtradas.length === 0;

  return (
    <div className="space-y-4">
      {/* ── ARRIBA: el período (con su 📅) y UN desplegable. Nada más (28a) ── */}
      {/* 🔴 En el celular con la barra nueva (2-oct-2026): el período vive
          arriba, el desplegable va al «···» y, si hay alguien elegido, su
          nombre sale como chip en la fila del período (× lo quita). */}
      {barra && (
        <EnLaBarra
          pestana="marcaciones"
          filaIzq={gente.length > 0 ? (
            <ChipSelector
              rotulo="Colaborador"
              valor={quien}
              opciones={[{ valor: "", etiqueta: "Todos" }, ...gente.map((g) => ({ valor: g.codigo, etiqueta: g.nombre }))]}
              onCambiar={setQuien}
            />
          ) : null}
        />
      )}
      <div className={barra ? "hidden" : "flex flex-wrap items-center gap-2"}>
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
      {celular ? (
        dias.map((d) => (
          <section key={d.dia} className="space-y-2">
            <FechaDelDia rotulo={d.rotulo} lugar={d.lugar} celular />
            <div className="space-y-2">
              {d.filas.map((f) => (
                <button
                  key={f.llave}
                  type="button"
                  onClick={() => abrir(f)}
                  className="block w-full rounded-lg border border-gray-200 bg-white p-3 text-left transition active:bg-gray-50"
                >
                  <span className="flex items-baseline justify-between gap-2">
                      <span className="shrink-0 truncate text-[15px] font-medium text-gray-900">
                        {f.nombre}
                        {f.mismoTelefono && <AvisoMismoTelefono />}
                      </span>
                      {f.lugarEnLaFila && (
                        // 🩸 Sin `flex-1 overflow-hidden` el lugar largo empujaba la
                        // página a 448 px y se deslizaba de lado (2-oct-2026).
                        <span className="flex min-w-0 flex-1 justify-end overflow-hidden text-[13px] text-gray-500">
                          <Lugar lugar={lugarDeLaFilaDibujado(f)} />
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-[15px] leading-relaxed">
                      <Marcas fila={f} />
                      <AvisosAmbar avisos={f.avisos} />
                    </span>
                </button>
              ))}
            </div>
          </section>
        ))
      ) : (
        dias.length > 0 && (
          /* 🔴 UNA tabla y el encabezado UNA vez (29-sep-2026). 🩸 «Colaborador ·
             Sus marcas del día · Lugar» se repetía debajo de CADA día —cinco
             veces por pantalla—. Ahora va una sola vez, pegado bajo el encabezado
             de la app al bajar (`--fg-altura-encabezado`, medido), y cada día
             queda solo con su fecha. Sin `ScrollableTable`: su scroll de lado
             haría que el encabezado se pegue a la caja y no a la página. */
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[200px]" />
              <col />
              {columnas.length > 2 && <col className="w-[300px]" />}
            </colgroup>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                {columnas.map((c) => (
                  <th key={c} className={`border-b border-gray-200 bg-white py-2 pr-3 font-medium ${CLASE_BARRA_PEGAJOSA}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            {dias.map((d) => (
              <tbody key={d.dia}>
                <tr>
                  <td colSpan={columnas.length} className="pb-1 pt-5">
                    <FechaDelDia rotulo={d.rotulo} lugar={d.lugar} />
                  </td>
                </tr>
                {d.filas.map((f) => (
                  <tr
                    key={f.llave}
                    onClick={() => abrir(f)}
                    className="cursor-pointer border-b border-gray-100 transition hover:bg-gray-50"
                  >
                    <td className="py-2 pr-3 align-top text-gray-900">
                      {f.nombre}
                      {f.mismoTelefono && <AvisoMismoTelefono />}
                    </td>
                    <td className="py-2 pr-3 align-top">
                      <Marcas fila={f} />
                      <AvisosAmbar avisos={f.avisos} />
                    </td>
                    {columnas.length > 2 && (
                      <td className="py-2 pr-3 align-top text-gray-700">
                        {f.lugarEnLaFila && <Lugar lugar={lugarDeLaFilaDibujado(f)} />}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        )
      )}

      <FotosDeLaMarcaModal marcas={abierta} onClose={() => setAbierta(null)} />
    </div>
  );
}
