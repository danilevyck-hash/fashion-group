"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LAS METAS DENTRO DE LA PESTAÑA "VENDEDORAS".
//
// Daniel pidió que, con una meta GRUPAL andando, acá se vea **cuánto aportó
// cada una al avance de la meta**:
//
//     Jailine · $28,140 · 29% del avance
//
// ── 🔴 SIN PODIO, SIN MEDALLAS, SIN "1º / 2º / 3º" ──────────────────────────
// Va ordenado por aporte porque así se lee cómodo, pero NO es un ranking y no
// se dibuja como uno. El premio de una meta grupal es colectivo —*"el viaje es
// de todas o de ninguna"*— y un podio acá le daría **dos mensajes
// contradictorios a la misma gente**: "compitan" y "ayúdense".
//
// La competencia individual ya existe, está bien puesta, y vive **FUERA de este
// módulo**: es el bono de $50 mensual a la mejor vendedora. No se repite acá.
//
// ── LAS DOS VISTAS, según el tipo de meta ───────────────────────────────────
// · GRUPAL      → el APORTE de cada una al avance. No hay meta personal y no se
//                 inventa ninguna.
// · POR VENDEDORA → la meta de cada una (la que Daniel escribió a mano) y su
//                 avance contra ella.
//
// ⚠️ Y SI CONVIVEN LAS DOS (Daniel confirmó que se puede), cada bloque dice de
// QUÉ meta habla, con su nombre en el encabezado. Sin eso, alguien leería el
// avance de la grupal como si fuera el de su meta personal — que es el error
// más fácil y el más caro de esta pantalla.
//
// ⚠️ NO TOCA NADA de lo que la pestaña ya mostraba: esto se suma abajo.
// ─────────────────────────────────────────────────────────────────────────────

import useSWR from "swr";
import { Target } from "lucide-react";
import { fmtMoney } from "@/lib/ventas/format";
import type { MetaConAvance } from "@/lib/multifashion/metas-lectura";

interface Respuesta {
  instalado: boolean;
  metas?: MetaConAvance[];
}

const FMT_FECHA = new Intl.DateTimeFormat("es-PA", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

const fecha = (iso: string) => FMT_FECHA.format(new Date(`${iso}T12:00:00Z`));
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Misma clave que `MetasSubtab` → SWR comparte la respuesta, sin pedirla dos veces. */
const fetcher = async (): Promise<Respuesta> => {
  const res = await fetch("/api/multifashion/metas", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Respuesta;
};

export function MetasEnVendedoras() {
  const { data } = useSWR<Respuesta>("multifashion-metas", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
    keepPreviousData: true,
  });

  // Sin metas instaladas, o sin ninguna andando, esta pestaña no cambia en nada.
  // El aviso de "falta correr la DDL" vive en la pestaña Metas: repetirlo acá
  // sería ruido en una pantalla que no es la suya.
  if (!data?.instalado) return null;

  const vivas = (data.metas ?? []).filter(
    (m) => m.avance.estado === "en-curso" && m.participantes.length > 0,
  );
  if (vivas.length === 0) return null;

  return (
    <section className="mt-6 space-y-4">
      {vivas.map((meta) => (
        <div key={meta.id} className="rounded-lg border border-gray-200 bg-white p-4">
          {/* 🔑 El encabezado NOMBRA la meta. Con una grupal y varias
              individuales a la vez, es lo único que evita leer un número como
              si fuera de la otra. */}
          <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Target className="h-3.5 w-3.5 shrink-0 self-center text-teal-700" />
            <h4 className="text-sm font-semibold text-gray-950">{meta.nombre}</h4>
            <span className="text-xs text-gray-500">
              {meta.tipo === "vendedora"
                ? "· la meta de cada una"
                : "· cuánto aportó cada una"}
              {" · "}
              {fecha(meta.desde)} a {fecha(meta.hasta)}
            </span>
          </div>

          {meta.tipo === "grupal" && (
            <p className="mb-2 text-xs text-gray-600">
              Entre todas llevan{" "}
              <span className="font-mono tabular-nums text-gray-800">
                {fmtMoney(meta.avance.vendido)}
              </span>{" "}
              de {fmtMoney(meta.avance.objetivo)}. Esta meta es de todas juntas: acá se ve
              lo que puso cada una, no una meta personal.
            </p>
          )}

          <ul className="space-y-2">
            {meta.porVendedora.map((v) => (
              <li key={v.clave}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="min-w-0 text-sm text-gray-800">{v.nombre}</span>
                  <span className="font-mono text-sm tabular-nums text-gray-700">
                    {fmtMoney(v.vendido)}
                    {meta.tipo === "grupal" ? (
                      <span className="ml-2 text-gray-500">{pct(v.aporte)} del avance</span>
                    ) : v.avance ? (
                      <span
                        className={`ml-2 font-medium ${
                          v.avance.cumplida ? "text-emerald-700" : "text-gray-500"
                        }`}
                      >
                        {pct(v.avance.pctVendido)} de {fmtMoney(v.avance.objetivo)}
                      </span>
                    ) : (
                      <span className="ml-2 text-gray-500">sin monto puesto</span>
                    )}
                  </span>
                </div>
                {/* La barra es su PORCIÓN del avance (grupal) o su avance contra
                    su propia meta (individual). En la grupal NO representa
                    "cuánto le falta": no le falta nada a nadie por separado. */}
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full ${
                      meta.tipo === "grupal" ? "bg-teal-600/70" : "bg-teal-700"
                    }`}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          (meta.tipo === "grupal" ? v.aporte : (v.avance?.pctVendido ?? 0)) * 100,
                        ),
                      )}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
