"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LA PORTADA DE RECLAMOS EN EL CELULAR (1b + 9, 24-sep-2026).
//
// 🩸 La de antes medía 1.055 px —1,25 pantallas—: dos cajas de totales,
// «Nuevo Reclamo» solo en una fila entera con todo el lado izquierdo en blanco,
// el buscador cortado a media palabra («…estilo o empre») y las tarjetas.
//
// Ahora: un número, un buscador, UNA FILA POR EMPRESA con el chip rojo del más
// viejo, lo cobrado en un renglón que se toca, y «Nuevo reclamo» fijo abajo,
// donde llega el pulgar.
//
// 🔴 NINGÚN NÚMERO NACE ACÁ: `resumenPortada`, `tarjetasPorEmpresa` y
// `resumenViejos` son los MISMOS módulos puros que dibuja la computadora.
//
// 🔴 BUSCAR (9): la tabla de 5 columnas medía 560 px dentro de 358 — «Estado» y
// «Total», o sea la plata, quedaban fuera de la pantalla. Acá son las mismas
// filas del resto del módulo: nombre a la izquierda, plata a la derecha, y el
// visto verde en vez de una columna «Estado».
// ─────────────────────────────────────────────────────────────────────────────

import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { hoyPanama } from "@/lib/fecha-panama";
import { resumenPortada, tarjetasPorEmpresa } from "@/lib/reclamos/portada";
import { resumenViejos } from "@/lib/reclamos/viejos";
import { TODAVIA_SIN_RECLAMOS } from "@/lib/reclamos/empresas-con-reclamos";
import { lineaEmpresa, montoCel, subtituloPortada } from "@/lib/reclamos/celular";
import { calcSub, empresaKeyDeReclamo, esPendiente, reclamoTaxes } from "../constants";
import { matchReclamo } from "../search";
import type { Contacto, Reclamo } from "../types";
import { Visto, CtaFija, FilaCel } from "./piezas";
import { tituloCelular, usaBarraCelular } from "@/lib/navegacion/barra-controles-celular";
import { useState } from "react";
import { Search } from "lucide-react";
import { CLASE_TITULO_BARRA, IconoBarra } from "@/components/celular/BarraDeControles";
import { CLASE_LINEA_TOTAL, CLASE_TOTAL_CELULAR } from "@/components/celular/CabeceraCompacta";

interface Props {
  role: string;
  reclamos: Reclamo[];
  loading: boolean;
  contactos: Contacto[];
  globalSearch: string;
  setGlobalSearch: (v: string) => void;
  onNewReclamo: () => void;
  onSelectEmpresa: (empresa: string) => void;
  onLoadDetail: (id: string, empresa: string) => void;
}

export default function PortadaCelular({
  reclamos, loading, contactos, globalSearch, setGlobalSearch,
  onNewReclamo, onSelectEmpresa, onLoadDetail,
}: Props) {
  const hoy = hoyPanama();
  const resumen = resumenPortada(reclamos, hoy);
  const viejos = resumenViejos(reclamos, hoy);
  const tarjetas = tarjetasPorEmpresa(reclamos, contactos, hoy);
  const sub = subtituloPortada(resumen.porCobrar.n, viejos.n);
  const buscando = globalSearch.trim();
  // v3.2: la cabecera compacta vive detrás de la barra nueva.
  const compacta = usaBarraCelular(true);
  const [abrirBuscar, setAbrirBuscar] = useState(false);

  const resultados = buscando
    ? reclamos.filter((r) => {
        const q = buscando.toLowerCase();
        return (
          matchReclamo(r, globalSearch) !== null ||
          (r.empresa || "").toLowerCase().includes(q) ||
          (r.notas || "").toLowerCase().includes(q)
        );
      })
    : [];

  const nombreCorto = (empresa: string) => {
    const k = empresaKeyDeReclamo(empresa);
    return k ? nombreCortoEmpresa(k) : empresa;
  };
  const totalDe = (r: Reclamo) => reclamoTaxes(r.empresa, calcSub(r.reclamo_items ?? [])).total;

  return (
    <div data-celular="reclamos-portada" className="min-h-screen bg-[#F2F2F7] pb-28">
      {compacta ? (
        <div data-cabecera-reclamos-v32 className="px-4">
          {/* 1 · «Reclamos» · 🔍 */}
          <div data-fila-del-avatar className="flex h-11 min-w-0 items-center gap-1">
            <h1 className={`min-w-0 flex-1 truncate ${CLASE_TITULO_BARRA}`}>Reclamos</h1>
            <IconoBarra etiqueta="Buscar factura, reclamo o estilo" onClick={() => setAbrirBuscar(true)}>
              <Search className="h-5 w-5" strokeWidth={2} aria-hidden />
            </IconoBarra>
          </div>
          {/* 2 · el total a 36 px y UNA línea gris */}
          <span className={`${CLASE_TOTAL_CELULAR} pt-1`}>{montoCel(resumen.porCobrar.monto)}</span>
          <span className={CLASE_LINEA_TOTAL}>
            {resumen.porCobrar.n} {resumen.porCobrar.n === 1 ? "reclamo" : "reclamos"} por cobrar
            {sub.viejos && <> · <span className="font-medium text-[#A32D2D]">{sub.viejos}</span></>}
          </span>
        </div>
      ) : (<>
      <div data-fila-del-avatar className="px-4 pt-3">
        <h1 className={tituloCelular("text-[28px] font-bold leading-tight tracking-tight text-gray-900")}>Reclamos</h1>
        <p className="mt-0.5 text-[15px] text-gray-500">
          {sub.texto}
          {sub.viejos && <> · <span className="font-medium text-[#A32D2D]">{sub.viejos}</span></>}
        </p>
      </div>

      {/* 🔴 El número grande, pero CHICO: Daniel, 24-sep-2026: «kpi más chico,
          que no consuma tanto». Sigue siendo lo más grande de la pantalla sin
          comerse el primer renglón de la lista. */}
      <div className="px-4 pt-3 text-center">
        <span className="block text-[34px] font-light leading-none tracking-tight tabular-nums text-gray-900">
          {montoCel(resumen.porCobrar.monto)}
        </span>
        <span className="mt-1 block text-[14px] text-gray-500">pendiente de cobro</span>
      </div>
      </>)}

      {(!compacta || abrirBuscar || globalSearch !== "") && (
      <div className="px-4 pt-4">
        <input
          type="search"
          inputMode="search"
          value={globalSearch}
          onChange={(e) => setGlobalSearch(e.target.value)}
          placeholder="Buscar factura, reclamo o estilo"
          aria-label="Buscar factura, reclamo o estilo"
          className="w-full rounded-xl border border-transparent bg-[#E9E9EB] px-4 py-3 text-[16px] text-gray-900 placeholder:text-gray-500 focus:border-gray-400 focus:outline-none"
          autoFocus={compacta && abrirBuscar && globalSearch === ""}
          onBlur={() => { if (globalSearch === "") setAbrirBuscar(false); }}
        />
      </div>
      )}

      {buscando ? (
        <>
          <p className="px-4 pt-4 text-[13px] uppercase tracking-wide text-gray-500">
            {resultados.length} resultado{resultados.length === 1 ? "" : "s"}
          </p>
          {resultados.length === 0 ? (
            <p className="mx-4 mt-2 rounded-2xl bg-white px-4 py-8 text-center text-[15px] text-gray-500">
              Sin resultados para «{buscando}»
            </p>
          ) : (
            <ul data-lista="reclamos-buscar" className="mx-4 mt-2 overflow-hidden rounded-2xl bg-white">
              {resultados.map((r) => (
                <FilaCel
                  key={r.id}
                  titulo={r.nro_reclamo}
                  sub={`${nombreCorto(r.empresa)} · ${esPendiente(r) ? "pendiente" : "cobrado"}`}
                  monto={montoCel(totalDe(r))}
                  izquierda={esPendiente(r) ? null : <Visto />}
                  onClick={() => onLoadDetail(r.id, r.empresa)}
                />
              ))}
            </ul>
          )}
        </>
      ) : loading ? (
        <div className="mx-4 mt-4 h-40 animate-pulse rounded-2xl bg-white" />
      ) : (
        <>
          <ul data-lista="reclamos-empresas" className="mx-4 mt-4 overflow-hidden rounded-2xl bg-white">
            {tarjetas.map((t) => {
              const linea = lineaEmpresa(t.n, t.masViejoDias);
              return (
                <FilaCel
                  key={t.empresa}
                  titulo={t.nombreCorto}
                  sub={
                    t.n === 0 ? (
                      <span className="text-gray-400">{t.tieneHistoria ? "Sin pendientes" : TODAVIA_SIN_RECLAMOS}</span>
                    ) : (
                      <>
                        {linea.texto}
                        {linea.dias && <> · <span className="text-[#A32D2D]">{linea.dias}</span></>}
                      </>
                    )
                  }
                  monto={t.n === 0 ? "" : montoCel(t.monto)}
                  onClick={() => onSelectEmpresa(t.empresa)}
                />
              );
            })}
          </ul>

          {/* Lo cobrado baja a UN renglón: es lo que ya no hay que perseguir. */}
          <ul className="mx-4 mt-4 overflow-hidden rounded-2xl bg-white">
            <FilaCel
              titulo={`Cobrado en ${resumen.cobrado.anio}`}
              sub={
                resumen.cobrado.n > 0
                  ? `${resumen.cobrado.n} reclamo${resumen.cobrado.n === 1 ? "" : "s"}`
                  : "Nada cobrado todavía"
              }
              monto={resumen.cobrado.n > 0 ? montoCel(resumen.cobrado.monto) : ""}
              izquierda={resumen.cobrado.n > 0 ? <Visto /> : null}
            />
          </ul>
        </>
      )}

      <CtaFija onClick={onNewReclamo}>Nuevo reclamo</CtaFija>
    </div>
  );
}
