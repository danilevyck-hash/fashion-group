"use client";

// ============================================================================
// VENTAS › CLIENTES › LA HOJA DEL CLIENTE EN EL CELULAR — la «3g» (25-sep-2026).
//
// 🩸 QUÉ REEMPLAZA:
//   · la hoja de antes **se quedaba a medias siempre** (3 toques, 0 peticiones,
//     3 barras grises a los 30 segundos) — eso se arregló aparte, sin
//     interruptor, y por eso no vive acá;
//   · **«6 empresas» era texto pelado**: no se podía tocar, y la hoja que abría
//     encabezaba UNA sola empresa («Fashion Wear · D-25») y nunca mostraba el
//     reparto. En la computadora ese «6 empresas» es un globo con el desglose;
//     en el teléfono el desglose **se había perdido**.
//
// 🔴 ARRIBA EL PORCENTAJE, DEBAJO LOS DOS MONTOS. Y las empresas con SU propio
// %: medido el 25-sep-2026 en City Mall Paso Canoa (D-25), las seis suman
// **$1.431.353,98** contra los $1.431.353,99 de la lista — un centavo de
// redondeo, no falta ninguna factura.
//
// 🔴 SE COMPARAN LOS MISMOS DÍAS (1-ene al día del corte, en los dos años). El
// mismo cliente diría **+20,9 %** en vez de **+28,0 %** si se lo comparara
// contra el 2025 completo hasta el 30-sep: le regalaría seis días al año
// pasado. La regla la trae el servidor (`por-empresa-anual`), no esta pantalla.
//
// 🔴 UN MES NEGATIVO SE DIBUJA HACIA ABAJO, EN ROJO, y no se esconde. Medido:
// enero 2026 de Fashion Wear en ese cliente fue **−$1.026,14** —$794,00
// facturados y 10 notas de débito por $664,03 contra **8 notas de crédito por
// $2.484,17**—. Es un hecho del negocio: se le devolvió más de lo que se le
// vendió.
// ============================================================================

import { useEffect, useState } from "react";
import { MONTHS, fmtMoney } from "@/lib/ventas/format";
import { variacionPct } from "@/lib/variacion";
import { barrasDelMesAMes, montoDeLaTabla, porcentajeDelCliente } from "@/lib/ventas/celular";
import {
  GrupoVentas,
  PantallaQueSube,
  RotuloVentas,
  TituloVentas,
  colorDelTono,
} from "./PiezasVentas";

/** Lo que devuelve `GET /api/clientes/[codigo]/por-empresa-anual`. */
export interface EmpresaDelClienteVista {
  empresaKey: string;
  empresaNombre: string;
  actual: number;
  previo: number;
  meses: { mes: number; actual: number; previo: number }[];
}

export interface PorEmpresaAnualVista {
  year: number;
  corte: string;
  cortePrevio: string;
  total: number;
  totalPrevio: number;
  empresas: EmpresaDelClienteVista[];
}

type Estado =
  | { status: "cargando" }
  | { status: "listo"; datos: PorEmpresaAnualVista }
  | { status: "error"; mensaje: string };

interface Props {
  abierta: boolean;
  onCerrar: () => void;
  codigo: string;
  nombre: string;
  /** La línea gris de la lista: «compró ayer», «3 meses sin comprar». */
  cuandoCompro: string | null;
  year: number;
}

export function HojaClienteCelular({ abierta, onCerrar, codigo, nombre, cuandoCompro, year }: Props) {
  const [estado, setEstado] = useState<Estado>({ status: "cargando" });
  const [empresaAbierta, setEmpresaAbierta] = useState<string | null>(null);

  useEffect(() => {
    if (!abierta || !codigo) return;
    let vivo = true;
    setEstado({ status: "cargando" });
    setEmpresaAbierta(null);
    fetch(`/api/clientes/${encodeURIComponent(codigo)}/por-empresa-anual?year=${year}`)
      .then(async (r) => {
        if (!r.ok) {
          const cuerpo = await r.json().catch(() => ({}));
          throw new Error((cuerpo as { error?: string }).error || `HTTP ${r.status}`);
        }
        return (await r.json()) as PorEmpresaAnualVista;
      })
      .then((datos) => {
        if (vivo) setEstado({ status: "listo", datos });
      })
      .catch((err: unknown) => {
        if (vivo) {
          setEstado({
            status: "error",
            mensaje: err instanceof Error ? err.message : "No se pudo cargar",
          });
        }
      });
    return () => {
      vivo = false;
    };
  }, [abierta, codigo, year]);

  const datos = estado.status === "listo" ? estado.datos : null;
  const abierta2 = datos?.empresas.find((e) => e.empresaKey === empresaAbierta) ?? null;

  // Al tocar una empresa, la pantalla del mes a mes se pone encima.
  if (abierta && abierta2) {
    return (
      <MesAMesDeLaEmpresa
        empresa={abierta2}
        cliente={nombre}
        codigo={codigo}
        year={datos!.year}
        corte={datos!.corte}
        onVolver={() => setEmpresaAbierta(null)}
      />
    );
  }

  const pct = datos ? porcentajeDelCliente(variacionPct(datos.total, datos.totalPrevio)) : null;

  return (
    <PantallaQueSube abierta={abierta} onCerrar={onCerrar} volverA="Clientes">
      <TituloVentas titulo={nombre} detalle={[codigo, cuandoCompro].filter(Boolean).join(" · ")} />

      {estado.status === "cargando" && (
        <div className="mx-4 mt-4 space-y-2" aria-hidden>
          <div className="h-10 w-2/3 animate-pulse rounded bg-gray-200" />
          <div className="h-24 w-full animate-pulse rounded-2xl bg-gray-200" />
        </div>
      )}

      {estado.status === "error" && (
        <p className="px-6 pt-6 text-[14px] text-gray-600">
          No se pudo cargar el detalle de este cliente. Vuelve a probar en unos segundos.
        </p>
      )}

      {datos && pct && (
        <>
          {/* 🔴 EL PORCENTAJE PRIMERO, LOS DOS MONTOS DEBAJO. */}
          <div className="px-4 pt-4 text-center">
            <div className={`text-[36px] font-bold leading-none tabular-nums ${colorDelTono(pct.tono)}`}>
              {pct.texto}
            </div>
            <div className="mt-2 text-[14px] tabular-nums text-gray-600">
              {fmtMoney(datos.total)} en {datos.year} · {fmtMoney(datos.totalPrevio)} en {datos.year - 1}
            </div>
            <div className="mt-1 text-[12px] text-gray-500">
              Los mismos días en los dos años, hasta el {diaLargo(datos.corte)}.
            </div>
          </div>

          <RotuloVentas>Empresa por empresa</RotuloVentas>
          <GrupoVentas className="mt-0">
            {datos.empresas.length === 0 && (
              <p className="px-4 py-6 text-center text-[14px] text-gray-500">
                Este cliente no compró en {datos.year}.
              </p>
            )}
            {datos.empresas.map((e) => {
              const p = porcentajeDelCliente(variacionPct(e.actual, e.previo));
              return (
                <button
                  key={e.empresaKey}
                  type="button"
                  data-empresa-del-cliente={e.empresaKey}
                  onClick={() => setEmpresaAbierta(e.empresaKey)}
                  className="flex w-full min-h-[52px] items-center gap-3 border-t border-gray-100 px-4 py-3 text-left first:border-t-0 active:bg-gray-50"
                >
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-gray-900">
                    {e.empresaNombre}
                  </span>
                  <span className="shrink-0 text-right tabular-nums text-[14px] text-gray-900">
                    {fmtMoney(e.actual)}
                  </span>
                  <span className={`w-[76px] shrink-0 text-right text-[13px] font-semibold ${colorDelTono(p.tono)}`}>
                    {p.texto}
                  </span>
                  <span className="shrink-0 text-gray-400">›</span>
                </button>
              );
            })}
          </GrupoVentas>
          <p className="px-6 pt-3 text-[12.5px] text-gray-500">
            Toca una empresa para ver su mes a mes.
          </p>
        </>
      )}
    </PantallaQueSube>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// El mes a mes de UNA empresa
// ─────────────────────────────────────────────────────────────────────────────

function MesAMesDeLaEmpresa({
  empresa,
  cliente,
  codigo,
  year,
  corte,
  onVolver,
}: {
  empresa: EmpresaDelClienteVista;
  cliente: string;
  codigo: string;
  year: number;
  corte: string;
  onVolver: () => void;
}) {
  // 🔴 Solo los meses que YA pasaron: un mes que no llegó no es un cero, es un
  // hueco, y dibujarlo como barra en cero hace creer que no se vendió.
  const hasta = Number(corte.slice(5, 7));
  const meses = empresa.meses.filter((m) => m.mes <= hasta);
  const barras = barrasDelMesAMes(
    meses.map((m) => MONTHS[m.mes - 1].toLowerCase()),
    meses.map((m) => m.actual),
    meses.map((m) => m.previo),
  );
  const pct = porcentajeDelCliente(variacionPct(empresa.actual, empresa.previo));

  return (
    <PantallaQueSube abierta onCerrar={onVolver} volverA={cliente}>
      <TituloVentas titulo={empresa.empresaNombre} detalle={`${cliente} · ${codigo}`} />

      <div className="px-4 pt-3 text-center">
        <div className={`text-[36px] font-bold leading-none tabular-nums ${colorDelTono(pct.tono)}`}>
          {pct.texto}
        </div>
        <div className="mt-2 text-[14px] tabular-nums text-gray-600">
          {montoDeLaTabla(empresa.actual)} en {year} · {montoDeLaTabla(empresa.previo)} en {year - 1}
        </div>
      </div>

      <GrupoVentas className="px-3 py-4">
        <div data-mes-a-mes className="overflow-x-auto">
          <div className="min-w-[320px]">
            {/* Las barras: la mitad de arriba para lo positivo, la de abajo
                para un mes negativo. Sin ejes: son nueve números, no un
                gráfico. */}
            <div className="flex h-[120px] items-center gap-1.5">
              {barras.map((b) => (
                <div key={b.mes} className="flex h-full flex-1 flex-col justify-center">
                  <div className="flex h-1/2 items-end">
                    {!b.haciaAbajo && (
                      <div
                        className="w-full rounded-t bg-teal-700"
                        style={{ height: `${b.alto}%` }}
                        aria-hidden
                      />
                    )}
                  </div>
                  <div className="h-px bg-gray-200" />
                  <div className="flex h-1/2 items-start">
                    {b.haciaAbajo && (
                      <div
                        data-barra-negativa={b.mes}
                        className="w-full rounded-b bg-red-600"
                        style={{ height: `${b.alto}%` }}
                        aria-hidden
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              {barras.map((b) => (
                <div key={b.mes} className="flex-1 text-center text-[10px] text-gray-500">
                  {b.mes}
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1.5">
              {barras.map((b) => (
                <div
                  key={b.mes}
                  className={`flex-1 text-center text-[9.5px] tabular-nums ${
                    b.monto < 0 ? "text-red-700" : "text-gray-700"
                  }`}
                >
                  {montoDeLaTabla(b.monto)}
                </div>
              ))}
            </div>
            <div className="mt-0.5 flex gap-1.5">
              {barras.map((b) => (
                <div
                  key={b.mes}
                  className={`flex-1 text-center text-[9.5px] tabular-nums ${
                    b.signo == null ? "text-gray-400" : b.signo >= 0 ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {b.cambio ?? ""}
                </div>
              ))}
            </div>
          </div>
        </div>
      </GrupoVentas>

      <p className="px-6 pt-3 text-[12.5px] leading-relaxed text-gray-500">
        Cada mes contra <b className="font-semibold text-gray-700">el mismo mes de {year - 1}</b>.
        {` ${MONTHS[hasta - 1]} va hasta el día ${Number(corte.slice(8, 10))} en los dos años.`}
      </p>
    </PantallaQueSube>
  );
}

/** «24 de septiembre». */
const MES_LARGO = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
function diaLargo(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} de ${MES_LARGO[Number(m[2]) - 1] ?? ""}`;
}
