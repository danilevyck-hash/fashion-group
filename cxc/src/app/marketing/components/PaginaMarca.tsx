"use client";

// ============================================================================
// LA PÁGINA DE UNA MARCA (23-sep-2026, Tiendas y Marcas — mockup aprobado).
//
//   ‹ Marcas   Tommy Hilfiger                                     [＋ Gasto]
//   ABIERTO  Período 2026 · 16 gastos · 42 días abierto   $21,530.98 [ZIP][Cerrar]
//       City Mall David ...................................... $…  ›
//       Nova Lux, S.A. ........................................ $…  ›
//       General ............................................... $…  ›
//   CERRADO  mid 2026 · PVH · parte Tommy · cerrado el 11 ago  $94,104.43 [ZIP]
//
// La marca solo dice QUÉ se le va a pasar y DE QUÉ TIENDAS viene: el período
// abierto con su total y UNA línea por tienda —cada una lleva a la ficha de
// Tiendas—, y los cerrados con el nombre que se les puso al cerrar y su nota
// de crédito. 🩸 Sin lista de proyectos: el overlay del proyecto se retiró
// (un `?proyecto=` viejo redirige a la ficha de la tienda).
//
// 🩸 NINGÚN NÚMERO SE CALCULA ACÁ. Las secciones y sus líneas por tienda
// vienen de `GET /api/marketing/proyectos-lista?bloque=`, que corre el
// agregador único; las líneas se acumulan en las MISMAS líneas que el total
// (`resumen-bloques.ts › detalleTiendas`), así que suman el total del período
// por construcción. Multifashion no aparece en ninguna marca (regla única).
//
// ZIP y Cerrar, como hoy (`useDescargasPeriodo`, `CerrarPeriodoModal`); solo
// quien ESCRIBE los ve. Con el interruptor apagado esta pantalla no se monta.
// ============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";
import { textoParteDeLaMarca } from "@/lib/marketing/cerrados-por-periodo";
import type { SeccionPeriodo } from "@/lib/marketing/lista-por-periodo";
import type { MkMarca } from "@/lib/marketing/types";
import { puedeEscribirMarketing, TEXTO_SOLO_LECTURA } from "@/lib/marketing/roles";
import { hrefDePestana, type TiendaDeSeccion } from "@/lib/marketing/tiendas-y-marcas";
import { ZIP_E_IMPULSADORAS_NUEVO } from "@/lib/marketing/zip-e-impulsadoras";
import type { BloqueResumen } from "./InicioMarketing";
import CerrarPeriodoModal from "./CerrarPeriodoModal";
import LoQueFalta from "./LoQueFalta";
import ZipsBajados from "./ZipsBajados";
import { ChipEstado, FilaNivel, ListaCard } from "./FilaNivel";
import { useDescargasPeriodo } from "./useDescargasPeriodo";

interface Props {
  role: string;
  marca: { key: string; nombre: string; slug: string };
  marcaCatalogo: MkMarca | null;
  secciones: SeccionPeriodo[];
  bloqueResumen: BloqueResumen | null;
  onRegistrarGasto: () => void;
  recargar: () => void;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function PaginaMarca({
  role,
  marca,
  secciones,
  bloqueResumen,
  onRegistrarGasto,
  recargar,
}: Props) {
  const router = useRouter();
  const { bajando, bajarZipMarca, descargarReporte } = useDescargasPeriodo();
  const [cerrando, setCerrando] = useState(false);
  const escribe = puedeEscribirMarketing(role);
  const abierta = secciones.find((s) => s.estado === "abierto") ?? null;

  const subtituloDe = (s: SeccionPeriodo): string => {
    const partes: string[] = [];
    if (s.compartido) partes.push(textoParteDeLaMarca(marca.nombre, s.compartido.otrasMarcas));
    const gastos = s.docs.facturas + s.docs.muebles;
    if (s.estado === "abierto") {
      partes.push(gastos > 0 ? plural(gastos, "gasto", "gastos") : "Sin gasto este período");
    } else if (s.cerradoEn) {
      partes.push(`Cerrado el ${formatearFecha(s.cerradoEn)}`);
    }
    return partes.join(" · ");
  };

  const acciones = (s: SeccionPeriodo) => {
    if (!escribe) return undefined;
    const abierto = s.estado === "abierto";
    const hayGasto = s.docs.facturas > 0 || s.docs.muebles > 0;
    const etiqueta = `${marca.nombre} · ${s.nombre} · ${formatearMonto(s.total)}`;
    const zipClave = `${marca.key}:${abierto || !s.id ? "abierto" : s.id}`;
    return (
      <>
        {hayGasto && (abierto || !!s.id) && (
          <button
            type="button"
            onClick={() => bajarZipMarca(marca.key, etiqueta, abierto ? undefined : s.id)}
            disabled={bajando === zipClave}
            title={`Bajar el ZIP de ${etiqueta}`}
            className="rounded-md border border-gray-200 bg-white px-2.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-xs text-gray-600 hover:text-gray-900 hover:border-gray-400 active:scale-[0.97] transition disabled:opacity-40"
          >
            {bajando === zipClave ? "Armando…" : "ZIP"}
          </button>
        )}
        {!abierto && s.id && (
          <button
            type="button"
            onClick={() => descargarReporte(s.id as string, etiqueta, marca.key)}
            title="Bajar el Excel de este período"
            className="rounded-md border border-gray-200 bg-white px-2.5 min-h-[44px] inline-flex items-center justify-center text-xs text-gray-600 hover:text-gray-900 hover:border-gray-400 active:scale-[0.97] transition"
          >
            Excel
          </button>
        )}
        {abierto && s.puedeCerrar && bloqueResumen && (
          <button
            type="button"
            onClick={() => setCerrando(true)}
            className="rounded-md border border-teal-600 bg-teal-50 px-2.5 min-h-[44px] inline-flex items-center justify-center text-xs font-semibold text-teal-800 hover:bg-teal-100 active:scale-[0.97] transition"
          >
            Cerrar
          </button>
        )}
      </>
    );
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => router.push(hrefDePestana("marcas"))}
        className="text-sm text-gray-600 hover:text-black transition inline-flex items-center gap-1 min-h-[44px] -my-1"
      >
        ‹ Marcas
      </button>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-gray-900">{marca.nombre}</h1>
        {escribe ? (
          <button
            type="button"
            onClick={onRegistrarGasto}
            className="rounded-md bg-black text-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm active:scale-[0.97] transition shrink-0"
          >
            ＋ Gasto
          </button>
        ) : (
          <span className="text-xs text-gray-500 rounded-md border border-gray-200 px-2 py-1">
            {TEXTO_SOLO_LECTURA}
          </span>
        )}
      </div>

      {abierta && bloqueResumen && (
        <LoQueFalta sinComprobante={bloqueResumen.sinComprobante ?? 0} sinFoto={bloqueResumen.sinFoto ?? 0} />
      )}

      <ListaCard>
        {secciones.map((s) => {
          const abierto = s.estado === "abierto";
          const hayGasto = s.docs.facturas > 0 || s.docs.muebles > 0;
          const titulo = s.compartido?.proveedorNombre ? `${s.nombre} · ${s.compartido.proveedorNombre}` : s.nombre;
          return (
            <div key={s.key}>
              <FilaNivel
                chip={<ChipEstado estado={s.estado} />}
                titulo={titulo}
                subtitulo={subtituloDe(s)}
                monto={hayGasto ? formatearMonto(s.total) : <span className="text-gray-300 text-sm">—</span>}
                acciones={acciones(s)}
                onClick={abierto ? undefined : () => router.push(`/marketing/${marca.slug}/${s.slug}`)}
                ariaLabel={abierto ? undefined : `Abrir ${s.nombre}`}
              />
              {abierto && <TiendasDelPeriodo tiendas={s.tiendas ?? []} />}
            </div>
          );
        })}
      </ListaCard>

      {/* Lo que ya se le mandó a la marca (los ZIPs bajados del abierto). */}
      {ZIP_E_IMPULSADORAS_NUEVO && abierta && <ZipsBajados periodoId={abierta.id ?? null} />}

      <p className="text-[12px] text-gray-500">
        Multifashion no aparece en ninguna marca: sus gastos no se le pasan a nadie.
      </p>

      {cerrando && bloqueResumen && abierta?.id && (
        <CerrarPeriodoModal
          bloque={bloqueResumen}
          periodoId={abierta.id}
          onClose={() => setCerrando(false)}
          onCerrado={() => {
            setCerrando(false);
            recargar();
          }}
        />
      )}
    </div>
  );
}

/** UNA línea por tienda, indentada bajo el período abierto; cada una lleva a su ficha. */
export function TiendasDelPeriodo({ tiendas }: { tiendas: ReadonlyArray<TiendaDeSeccion> }) {
  if (tiendas.length === 0) {
    return <div className="px-4 sm:px-5 py-3 pl-10 text-[12px] text-gray-500">Todavía no hay gasto en este período.</div>;
  }
  return (
    <div className="divide-y divide-gray-100 border-t border-gray-100 bg-gray-50/40">
      {tiendas.map((t) => (
        <div key={t.codigo ?? "general"} className="pl-6 sm:pl-8">
          <FilaNivel
            titulo={<span className="font-medium text-gray-800">{t.nombre}</span>}
            subtitulo={plural(t.gastos, "gasto", "gastos")}
            monto={<span className="font-medium">{formatearMonto(t.monto)}</span>}
            href={t.href}
            ariaLabel={`Abrir ${t.nombre}`}
          />
        </div>
      ))}
    </div>
  );
}
