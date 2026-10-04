"use client";

// ============================================================================
// COMISIONES EN EL CELULAR — la portada (la «1b») y «Descargar» (la «8»).
// 25-sep-2026.
//
// 🩸 QUÉ REEMPLAZA, medido a 390 px:
//   · **265 px (el 31 % del teléfono) en 7 controles repartidos en 4 renglones**
//     antes del primer vendedor;
//   · los dos botones de papel se llevaban **100 px en dos renglones sueltos y
//     en zig-zag** —PDF pegado a la derecha, Excel a la izquierda— y ninguno
//     decía de quién era el papel;
//   · el mes era un botón que abría un panel de 12 meses: un toque de más para
//     el gesto más frecuente, que es «el mes anterior»;
//   · el total vivía en una barra negra abajo que **el botón flotante tapaba**:
//     con una fila abierta se leía «TOTAL A PAGAR $5,97…».
//
// 🔴 EL TOTAL VA ARRIBA Y CHICO, y por eso no hay barra negra que tapar. Lo
// REPORTA la vista del grupo: acá no se suma nada.
//
// 🔴 EL MES ES «‹ Ago 2026 ›» Y NUNCA VA AL FUTURO: la flecha de la derecha no
// se dibuja cuando el mes elegido ya es el de Panamá.
//
// 🔴 «DESCARGAR» ES UN SOLO BOTÓN y al tocarlo la hoja pregunta: PDF del mes ·
// Excel del mes · PDF de un vendedor. Los dos papeles son los MISMOS de antes.
// ============================================================================

import { useState, type ReactNode } from "react";
import { Settings } from "lucide-react";
import AvisoRechazosSwitch from "@/components/AvisoRechazosSwitch";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { SYNC_NOW_RECIBOS_OPCIONES } from "@/components/shared/syncNowOpciones";
import LineaDeFrescura from "@/components/shared/LineaDeFrescura";
import { FRESCURA_VISIBLE_2026_10 } from "@/lib/ui/frescura";
import { esVistaMultifashion, VISTA_MULTIFASHION } from "@/lib/comisiones/vistas";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { fmtMoney } from "@/lib/ventas/format";
import { hoyPanama } from "@/lib/fecha-panama";
import {
  BotonPuntos,
  HojaCel,
  HojaMenuCel,
  PantallaCel,
  TituloCel,
} from "@/components/celular/Piezas";
import {
  OPCIONES_DESCARGA,
  ROTULO_DESCARGAR_COMISIONES,
  ROTULO_TOTAL_A_PAGAR,
  mesEnPalabras,
  mesesAlrededor,
} from "@/lib/comisiones/celular";
import { ComisionesPeriodo } from "../ComisionesPeriodo";
import type { RangoConsulta } from "@/lib/comisiones/vendedores-rango";

interface OpcionVista {
  valor: string;
  etiqueta: string;
  separadorAntes?: boolean;
}

interface Props {
  vista: string;
  opciones: readonly OpcionVista[];
  onVista: (v: string) => void;
  year: number;
  mes: number;
  onPeriodo: (year: number, mes: number) => void;
  conPeriodo: boolean;
  conDescarga: boolean;
  hayConfig: boolean;
  enConfig: boolean;
  onConfig: () => void;
  /** El total del mes, ya calculado por la vista del grupo. */
  total: number | null;
  onPdf: () => void;
  onExcel: () => void;
  pdfDisabled: boolean;
  excelDisabled: boolean;
  onActualizado: () => void;
  avisoMontos?: string | null;
  children: ReactNode;
  /** 🔴 VENDEDORES_RANGO_2026_10: con `onRango` el mes se toca y abre el MISMO control de la computadora. */
  rango?: RangoConsulta | null;
  onRango?: (r: RangoConsulta) => void;
  availableYears?: number[];
}

export function PortadaComisionesCelular({
  vista,
  opciones,
  onVista,
  year,
  mes,
  onPeriodo,
  conPeriodo,
  conDescarga,
  hayConfig,
  enConfig,
  onConfig,
  total,
  onPdf,
  onExcel,
  pdfDisabled,
  excelDisabled,
  onActualizado,
  avisoMontos,
  children,
  rango = null,
  onRango,
  availableYears = [],
}: Props) {
  const [menu, setMenu] = useState(false);
  const [descarga, setDescarga] = useState(false);
  const [eligiendoEmpresa, setEligiendoEmpresa] = useState(false);

  const mesTexto = `${year}-${String(mes).padStart(2, "0")}`;
  const { anterior, siguiente } = mesesAlrededor(mesTexto, hoyPanama().slice(0, 7));
  const irA = (m: string | null) => {
    if (!m) return;
    onPeriodo(Number(m.slice(0, 4)), Number(m.slice(5, 7)));
  };
  const etiquetaVista = opciones.find((o) => o.valor === vista)?.etiqueta ?? vista;

  // 🔴 «Actualizado 9:41 ↻» (4-oct-2026, `FRESCURA_VISIBLE_2026_10`): el
  // «Actualizar ahora» sale del «···» y se vuelve la línea chica. En
  // Multifashion, que no tenía ninguno, actualiza SUS facturas.
  const enMultifashion = esVistaMultifashion(vista);
  const frescura = !FRESCURA_VISIBLE_2026_10 || enConfig ? null : enMultifashion ? (
    <LineaDeFrescura
      forma="celular"
      tabla="facturas"
      empresas={[VISTA_MULTIFASHION]}
      opciones={[{ modulo: "facturas", empresa: VISTA_MULTIFASHION }]}
      onSuccess={onActualizado}
    />
  ) : conDescarga ? (
    <LineaDeFrescura
      forma="celular"
      tabla="facturas"
      empresas={B2B_EMPRESA_KEYS}
      opciones={SYNC_NOW_RECIBOS_OPCIONES}
      onSuccess={onActualizado}
    />
  ) : null;
  const totalTexto = total != null && !enConfig ? (
    <b className="font-semibold text-gray-900">{fmtMoney(total)} {ROTULO_TOTAL_A_PAGAR}</b>
  ) : null;

  return (
    <PantallaCel>
      <TituloCel
        titulo="Comisiones"
        detalle={
          /* 🔴 EL TOTAL SE LEE SIN BAJAR. Sale de la vista del grupo; con el ⚙
             abierto o en una empresa no hay total que decir acá. */
          totalTexto || frescura ? (
            <>{totalTexto}{frescura && <span className={totalTexto ? "block" : undefined}>{frescura}</span>}</>
          ) : undefined
        }
        accion={
          <div className="flex items-center gap-1">
            {hayConfig && (
              <button
                type="button"
                onClick={onConfig}
                aria-pressed={enConfig}
                aria-label="Configuración"
                className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full ${
                  enConfig ? "bg-gray-900 text-white" : "text-gray-600"
                }`}
              >
                <Settings className="h-[18px] w-[18px]" />
              </button>
            )}
            {/* 🔴 Sin nada que ofrecer (Multifashion), no hay «···». */}
            {conDescarga && <BotonPuntos onClick={() => setMenu(true)} ariaLabel="Más opciones" />}
          </div>
        }
      />

      {/* 🔴 UNA FILA: la empresa y el mes con sus flechas. */}
      <div className="mt-3 flex items-center justify-between gap-2 px-4">
        <button
          type="button"
          onClick={() => setEligiendoEmpresa(true)}
          data-chip-vista
          className="min-h-[36px] min-w-0 flex-1 truncate rounded-full border border-gray-300 bg-white px-3 text-left text-[14px] font-medium text-gray-900 active:opacity-60"
        >
          {etiquetaVista} ▾
        </button>
        {conPeriodo && (
          <div className="flex shrink-0 items-center gap-1" data-mes-celular>
            {!rango && (
            <button
              type="button"
              aria-label={anterior ? `Ir a ${mesEnPalabras(anterior)}` : "Mes anterior"}
              onClick={() => irA(anterior)}
              className="flex min-h-[36px] min-w-[32px] items-center justify-center text-[18px] text-blue-600 active:opacity-60"
            >
              ‹
            </button>
            )}
            {onRango ? (
              <ComisionesPeriodo
                mes={mes}
                year={year}
                availableYears={availableYears}
                onChange={onPeriodo}
                rango={rango}
                onRango={onRango}
                alDerecha
              />
            ) : (
            <span className="whitespace-nowrap text-[14px] font-medium text-gray-900">
              {mesEnPalabras(mesTexto)}
            </span>
            )}
            {/* 🔴 NUNCA AL FUTURO: sin mes siguiente, la flecha no se dibuja. */}
            {rango ? null : siguiente ? (
              <button
                type="button"
                aria-label={`Ir a ${mesEnPalabras(siguiente)}`}
                onClick={() => irA(siguiente)}
                className="flex min-h-[36px] min-w-[32px] items-center justify-center text-[18px] text-blue-600 active:opacity-60"
              >
                ›
              </button>
            ) : (
              <span className="min-w-[32px]" aria-hidden />
            )}
          </div>
        )}
      </div>

      <div className="px-4 pt-2">
        <AvisoRechazosSwitch texto={avisoMontos} />
      </div>

      <div className="px-2 pt-1">{children}</div>

      {/* El «···»: Descargar y Actualizar ahora, nada más. */}
      <HojaMenuCel abierta={menu} onCerrar={() => setMenu(false)} data-menu-comisiones>
        {conDescarga && (
          <button
            type="button"
            data-abrir-descargar
            disabled={pdfDisabled && excelDisabled}
            onClick={() => { setMenu(false); setDescarga(true); }}
            className="mb-2 block w-full rounded-xl bg-gray-900 px-4 py-3 text-center text-[17px] font-semibold text-white active:scale-[0.97] disabled:bg-gray-300"
          >
            {ROTULO_DESCARGAR_COMISIONES}
          </button>
        )}
        {conDescarga && !FRESCURA_VISIBLE_2026_10 && (
          <div className="[&>*]:w-full">
            <SyncNowButton
              opciones={SYNC_NOW_RECIBOS_OPCIONES}
              className="w-full justify-center"
              onSuccess={() => { setMenu(false); onActualizado(); }}
            />
          </div>
        )}
      </HojaMenuCel>

      {/* La hoja de «Descargar». «PDF de un vendedor…» abre el detalle, que es
          desde donde ya se baja el papel de una persona. */}
      <HojaCel
        abierta={descarga}
        titulo={`${ROTULO_DESCARGAR_COMISIONES} · ${etiquetaVista} · ${mesEnPalabras(mesTexto)}`}
        onCerrar={() => setDescarga(false)}
        opciones={OPCIONES_DESCARGA.map((o) => ({
          clave: o.clave,
          rotulo: o.rotulo,
          apagada:
            (o.clave === "pdf-mes" && pdfDisabled) ||
            (o.clave === "excel-mes" && excelDisabled),
          detalle:
            o.clave === "pdf-vendedor"
              ? "Toca su fila y usa «PDF» o «Enviar»"
              : undefined,
          onClick: () => {
            if (o.clave === "pdf-mes") onPdf();
            else if (o.clave === "excel-mes") onExcel();
          },
        }))}
      />

      {/* El chip de empresa abre la MISMA lista del desplegable de siempre. */}
      <HojaCel
        abierta={eligiendoEmpresa}
        titulo="Empresa"
        onCerrar={() => setEligiendoEmpresa(false)}
        opciones={opciones.map((o) => ({
          clave: o.valor,
          rotulo: o.etiqueta,
          onClick: () => onVista(o.valor),
        }))}
      />
    </PantallaCel>
  );
}
