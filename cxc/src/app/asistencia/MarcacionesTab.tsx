"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * LA PESTAÑA «MARCACIONES» — LO QUE MANDÓ EL TELÉFONO, TAL CUAL (25-sep-2026).
 *
 * 🔴 SOLO LA VE `admin`, Y NO ES UNA DECISIÓN DE PANTALLA. Cada marca trae una
 * selfie y una ubicación: dónde estuvo una persona y qué cara tenía. La lista
 * de roles es UNA (`MARCACIONES_ROLES`) y la leen esta pantalla y la ruta;
 * esconder una pestaña nunca cerró nada.
 *
 * 🔴 SOLO SE MIRA. Ni un botón que edite, corrija, borre o justifique. La
 * marcación no se edita ni se borra —ni la del reloj ni la del teléfono—: la
 * corrección va encima, en Asistencia, con su motivo obligatorio y su firma.
 * Hay barrido que pone el build ROJO si aquí aparece un POST, PUT, PATCH o
 * DELETE.
 *
 * ── LAS DOS PANTALLAS ───────────────────────────────────────────────────────
 *
 * 🔴 CELULAR (opción 2b, la que eligió Daniel): una TARJETA por colaborador y
 * por día, con sus marcas en orden. El lugar se escribe UNA sola vez cuando
 * todas cayeron en el mismo sitio; con una distinta, cada marca lleva el suyo —
 * que es justamente el día que hay que mirar.
 *
 * 🔴 COMPUTADORA: una tabla de seis columnas —Hora · Colaborador · Marca ·
 * Lugar · Llegó · Aparato—, filtrable por colaborador y por día, con el pie
 * común de la casa («13 marcas de 20»): o el total sigue al filtro, o no hay
 * filtro.
 *
 * El aparato se reconoce POR EL DEDO (`aparatoDeQuienMira`), nunca por el
 * nombre; y toda la regla vive en `marcaciones/logica.ts`, que es puro.
 * ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from "react";
import SelectorPeriodo, { usePeriodoAsistencia } from "@/components/asistencia/SelectorPeriodo";
import { ScrollableTable } from "@/components/ui";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { aparatoDeQuienMira } from "@/lib/aparato";
import { empresaParaPedir } from "@/lib/asistencia/empresa-para-todo";
import { textoDelPie } from "@/lib/ui/pie-de-lista";
import { diaPanamaDe, horaAmPm } from "@/lib/marcacion/marcacion";
import SelfieMarcacionModal, { type SelfieParaVer } from "./SelfieMarcacionModal";
import {
  CHIP_MISMO_APARATO,
  CHIP_TODOS,
  CHIP_TODOS_LOS_DIAS,
  COLUMNAS_MARCACIONES,
  PALABRAS_MARCAS,
  SIN_APARATO,
  SIN_COLUMNAS_NUEVAS,
  SIN_MARCAS,
  TEXTO_SIN_SENAL,
  TITULO_MISMO_APARATO,
  colaboradoresDeLasMarcas,
  detalleDeLaHoja,
  diasDeLasMarcas,
  fechaDelDia,
  filasDeMarcaciones,
  filtrarMarcas,
  lineasDeLaHoja,
  selloCorto,
  subtituloDeLaMarca,
  tarjetasDeMarcaciones,
  type MarcaDeTelefono,
  type MarcaDibujada,
} from "./marcaciones/logica";

/** Los dos filtros viven en la dirección, con `replace`: son del MISMO nivel. */
const PARAM_QUIEN = "mcQuien";
const PARAM_DIA = "mcDia";

/** El chip de un filtro. 44 px de alto, como todo lo que se toca aquí. */
function Chip({
  activo, onClick, children, titulo,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
  titulo?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      title={titulo}
      className={`min-h-[44px] whitespace-nowrap rounded-md border px-3 text-sm transition active:scale-[0.97] ${
        activo
          ? "border-black bg-black font-medium text-white"
          : "border-gray-300 text-gray-700 hover:border-black"
      }`}
    >
      {children}
    </button>
  );
}

/** El chip gris de la demora. Solo sale cuando la marca llegó tarde. */
function ChipDemora({ texto }: { texto: string }) {
  return (
    <span className="ml-1.5 whitespace-nowrap rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
      {texto}
    </span>
  );
}

/** El chip del teléfono compartido: es justo lo que Daniel quiere ver. */
function ChipMismoAparato() {
  return (
    <span
      title={TITULO_MISMO_APARATO}
      className="ml-1.5 whitespace-nowrap rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700"
    >
      {CHIP_MISMO_APARATO}
    </span>
  );
}

export default function MarcacionesTab({ empresa }: { empresa: string }) {
  const { desde, hasta, hoy, elegir } = usePeriodoAsistencia();

  const [marcas, setMarcas] = useState<MarcaDeTelefono[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [hayColumnasNuevas, setHayColumnasNuevas] = useState(true);

  const [quien, setQuien] = useUrlState<string>(PARAM_QUIEN, "");
  const [dia, setDia] = useUrlState<string>(PARAM_DIA, "");

  // El aparato se pregunta POR EL DEDO y en un efecto: en el servidor no hay
  // `matchMedia`, y pintar la tabla para después cambiarla sería peor.
  const [celular, setCelular] = useState(false);
  useEffect(() => { setCelular(aparatoDeQuienMira() === "celular"); }, []);

  const [abierta, setAbierta] = useState<SelfieParaVer | null>(null);

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
  const dias = useMemo(() => diasDeLasMarcas(marcas), [marcas]);
  const filtradas = useMemo(
    () => filtrarMarcas(marcas, { codigo: quien, dia }),
    [marcas, quien, dia],
  );
  const filas = useMemo(() => filasDeMarcaciones(filtradas), [filtradas]);
  const tarjetas = useMemo(() => tarjetasDeMarcaciones(filtradas), [filtradas]);

  /** 🔴 La MISMA hoja que abre el reporte, con tres renglones más. */
  const abrir = useCallback((d: MarcaDibujada) => {
    const m = d.marca;
    setAbierta({
      id: m.id,
      hora: d.hora,
      horaLarga: horaAmPm(m.ocurrioEn),
      detalle: detalleDeLaHoja(m),
      relojCorrido: null,
      quitada: false,
      tieneFoto: m.tieneFoto,
      lat: m.lat,
      lng: m.lng,
      persona: m.nombre,
      fecha: fechaDelDia(diaPanamaDe(m.ocurrioEn)),
      rotulo: d.rotulo,
      lineas: lineasDeLaHoja(m),
    });
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SelectorPeriodo desde={desde} hasta={hasta} hoy={hoy} onElegir={elegir} />
        <p className="text-sm text-gray-500">
          {textoDelPie(filtradas.length, marcas.length, PALABRAS_MARCAS)}
        </p>
      </div>

      {!hayColumnasNuevas && (
        <p className="rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-800">{SIN_COLUMNAS_NUEVAS}</p>
      )}

      {gente.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Chip activo={quien === ""} onClick={() => setQuien("")}>{CHIP_TODOS}</Chip>
          {gente.map((g) => (
            <Chip key={g.codigo} activo={quien === g.codigo} onClick={() => setQuien(g.codigo)}>
              {g.nombre}
            </Chip>
          ))}
        </div>
      )}

      {dias.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Chip activo={dia === ""} onClick={() => setDia("")}>{CHIP_TODOS_LOS_DIAS}</Chip>
          {dias.map((d) => (
            <Chip key={d} activo={dia === d} onClick={() => setDia(d)}>{fechaDelDia(d)}</Chip>
          ))}
        </div>
      )}

      {error && <p className="rounded-md bg-gray-50 px-3 py-2.5 text-sm text-gray-700">{error}</p>}
      {cargando && !error && <p className="text-sm text-gray-500">Cargando…</p>}
      {!cargando && !error && filtradas.length === 0 && (
        <p className="rounded-md bg-gray-50 px-3 py-2.5 text-sm text-gray-600">{SIN_MARCAS}</p>
      )}

      {/* ── EL CELULAR: una tarjeta por colaborador y por día ─────────────── */}
      {celular
        ? filtradas.length > 0 && (
            <div className="space-y-3">
              {tarjetas.map((t) => (
                <article key={t.llave} className="rounded-lg border border-gray-200 bg-white p-3">
                  <header className="flex items-baseline justify-between gap-2">
                    <h3 className="truncate text-[15px] font-medium text-gray-900">{t.nombre}</h3>
                    <span className="shrink-0 text-[13px] text-gray-500">{fechaDelDia(t.dia)}</span>
                  </header>
                  {t.lugarComun && (
                    <p className="mt-0.5 text-[13px] text-gray-500">{t.lugarComun}</p>
                  )}
                  <ul className="mt-2 divide-y divide-gray-100">
                    {t.marcas.map((d) => (
                      <li key={d.marca.id}>
                        <button
                          type="button"
                          onClick={() => abrir(d)}
                          className="flex min-h-[44px] w-full items-center gap-3 py-2 text-left transition active:bg-gray-50"
                        >
                          <span className="w-12 shrink-0 text-[15px] tabular-nums text-gray-900">{d.hora}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] text-gray-900">
                              {d.rotulo}
                              {d.tarde && <ChipDemora texto={d.llego} />}
                              {d.mismoAparato && <ChipMismoAparato />}
                            </span>
                            {subtituloDeLaMarca(d, t.lugarComun) && (
                              <span className="block text-[13px] text-gray-500">
                                {subtituloDeLaMarca(d, t.lugarComun)}
                              </span>
                            )}
                          </span>
                          <span aria-hidden className="shrink-0 text-gray-300">›</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )
        : filtradas.length > 0 && (
            /* ── LA COMPUTADORA: seis columnas ───────────────────────────── */
            <ScrollableTable minWidth={880}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                    {COLUMNAS_MARCACIONES.map((c) => (
                      <th key={c} className="py-2 pr-3 font-medium">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((d) => (
                    <tr
                      key={d.marca.id}
                      onClick={() => abrir(d)}
                      className="cursor-pointer border-b border-gray-100 transition hover:bg-gray-50"
                    >
                      <td className="py-2 pr-3 tabular-nums text-gray-900">{d.hora}</td>
                      <td className="py-2 pr-3 text-gray-900">{d.marca.nombre}</td>
                      <td className="py-2 pr-3 text-gray-700">
                        {d.rotulo}
                        {d.marca.sinSenal && <ChipDemora texto={TEXTO_SIN_SENAL} />}
                      </td>
                      <td className="py-2 pr-3 text-gray-700">{d.marca.lugar.texto}</td>
                      <td className="py-2 pr-3 text-gray-600">{d.llego}</td>
                      <td className="py-2 pr-3 tabular-nums text-gray-600">
                        {selloCorto(d.marca.aparatoId)}
                        {d.mismoAparato && <ChipMismoAparato />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>
          )}

      <SelfieMarcacionModal marca={abierta} onClose={() => setAbierta(null)} />

      {/* Lo que esta pantalla NO hace, dicho donde se lee. */}
      <p className="text-xs text-gray-400">
        Aquí solo se mira. Para corregir una hora, entra a Asistencia: la marca del teléfono no se
        edita ni se borra, la corrección va encima y pide el porqué. Sin aparato, la celda dice «
        {SIN_APARATO}».
      </p>
    </div>
  );
}
