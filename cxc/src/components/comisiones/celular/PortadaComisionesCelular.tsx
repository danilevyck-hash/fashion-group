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

import { BORDES_ALINEADOS } from "@/lib/ui/revision-110-ajustes";
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
import { ComisionesPeriodo, BotonRangoComisiones } from "../ComisionesPeriodo";
import type { RangoConsulta } from "@/lib/comisiones/vendedores-rango";
import { CALENDARIO_SIMPLE_2026_10 } from "@/lib/ui/calendario-simple";
import { CLASE_LINEA_TOTAL, CLASE_TOTAL_CELULAR } from "@/components/celular/CabeceraCompacta";
import { CLASE_BOTON_TEXTO } from "@/components/celular/BarraDeControles";
import { ROTULO_DESCARGAR_V2, ROTULO_TOTAL_V2, lineaBajoElTotal, type ResumenDelTotal } from "@/lib/comisiones/apple-v2";
import { ChevronDown } from "lucide-react";
import { SelectorEnTexto } from "@/components/celular/BarraDeControles";
import { tituloCelular } from "@/lib/navegacion/barra-controles-celular";
import { etiquetaPeriodo } from "@/lib/comisiones/periodo";
import {
  COMISIONES_BARRA_COMUN,
  COMISIONES_DESGLOSE_EN_CELULAR,
  COMISIONES_MES_COMPLETO,
} from "@/lib/ui/revision-110-ventas";
import { Capsula } from "@/components/filtros/FiltroA";
import { RanurasBuscarCliente } from "../BuscarClienteComisiones";
import { COMISIONES_BUSCAR_CLIENTE } from "@/lib/comisiones/buscar-cliente";
import { FILTRO_3_COMISIONES } from "@/lib/ui/revision-110-filtros";
import { COMISIONES_FLECHAS_44_2026_11 } from "@/lib/ui/iphone-2026-11";

/** ios2-03: la flecha del mes, botón de 44 × 44 del mismo estilo que el calendario de al lado. */
const FLECHA_MES_44 = "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-[20px] text-blue-600 active:opacity-60";

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
  /**
   * 🔴 COMISIONES_APPLE_V2_2026_10: el total es el número grande DEBAJO de la
   * fila de empresa y mes (primero se elige, abajo el resultado), con su línea
   * gris y la frescura; «Descargar» es el botón del título, sin «···».
   */
  v2?: boolean;
  /** v2: el total y sus bases, ya sumados por la vista. */
  resumen?: ResumenDelTotal | null;
  /** «Cómo se usa» (videos), en el «···». */
  onComoSeUsa?: () => void;
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
  v2 = false,
  resumen = null,
  onComoSeUsa,
}: Props) {
  const [menu, setMenu] = useState(false);
  /** CALENDARIO_SIMPLE_2026_10 con rango: empresa, mes y «Rango» en una línea. */
  const simple = CALENDARIO_SIMPLE_2026_10 && !!onRango;
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

  // n.º 30 (revisión 110): la barra de todos los módulos — «Comisiones ▾»
  // (Comisiones · Configuración) y «···» con Descargar.
  const barraComun = COMISIONES_BARRA_COMUN && v2;
  const titulo = barraComun ? (
    <div data-fila-del-avatar data-barra-comisiones className="flex items-center justify-between gap-3 px-4 pt-2">
      <h1 className={tituloCelular("min-w-0 text-[30px] font-bold leading-tight tracking-tight text-gray-900")}>
        {hayConfig ? (
          <SelectorEnTexto
            etiqueta="Sección"
            valor={enConfig ? "config" : "comisiones"}
            texto={enConfig ? "Configuración" : "Comisiones"}
            opciones={[
              { valor: "comisiones", etiqueta: "Comisiones" },
              { valor: "config", etiqueta: "Configuración" },
            ]}
            onCambiar={(v) => { if ((v === "config") !== enConfig) onConfig(); }}
          />
        ) : (
          "Comisiones"
        )}
      </h1>
      {(conDescarga || onComoSeUsa) && !enConfig && <BotonPuntos onClick={() => setMenu(true)} ariaLabel="Más opciones" />}
    </div>
  ) : null;
  // 🔴 filtro-3 (revisión 110, aprobado 14-nov-2026): el período solo en su
  // línea; el buscador y «Todas las empresas ▾» en otra; y «Total a pagar $X ·
  // Actualizado h:mm ↻» en UNA, pegada a la lista que suma. Solo cuando el
  // buscador está (la MISMA condición de `ComisionesView`); si no, lo de hoy.
  const f3 = FILTRO_3_COMISIONES && v2 && COMISIONES_BUSCAR_CLIENTE && conDescarga && !rango && !enConfig;
  const ranurasF3 = f3 ? {
    alLado: (
      <Capsula etiqueta="Empresa" compacta alinear="derecha" valor={vista} onCambiar={onVista}
        opciones={opciones.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }))} />
    ),
    antesDeLaLista: resumen || frescura ? (
      <div data-filtro-3-total className={`flex items-center justify-between gap-2 pb-1 text-[13px] text-gray-500 ${BORDES_ALINEADOS ? "" : "px-4"}`}>
        {resumen ? (
          <span className="whitespace-nowrap">
            {ROTULO_TOTAL_V2}{" "}
            <b className={`text-[17px] font-semibold tabular-nums ${resumen.total < 0 ? "text-red-600" : "text-gray-900"}`}>{fmtMoney(resumen.total)}</b>
          </span>
        ) : <span />}
        {frescura && <span className="shrink-0">{frescura}</span>}
      </div>
    ) : null,
  } : null;

  return (
    <RanurasBuscarCliente.Provider value={ranurasF3}>
    <PantallaCel>
      {titulo ?? <TituloCel
        titulo={v2 && enConfig ? "Configuración" : "Comisiones"}
        detalle={v2 ? undefined : 
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
            {/* v2: el «···» solo traía «Descargar»: el botón ES «Descargar» y abre la MISMA hoja. */}
            {conDescarga && v2 && (
              <button
                type="button"
                data-abrir-descargar
                disabled={pdfDisabled && excelDisabled}
                onClick={() => setDescarga(true)}
                className={CLASE_BOTON_TEXTO}
              >
                {ROTULO_DESCARGAR_V2}
              </button>
            )}
            {!v2 && <>{conDescarga && <BotonPuntos onClick={() => setMenu(true)} ariaLabel="Más opciones" />}</>}
          </div>
        }
      />}

      {/* 🔴 UNA FILA: la empresa y el mes con sus flechas. */}
      {/* CALENDARIO_SIMPLE_2026_10: la empresa arriba y, debajo, el mes con
          «Rango» en la misma línea (con los dos al lado no entraba la empresa). */}
      {/* CALENDARIO_SIMPLE_2026_10: empresa, ‹ Oct 2026 › y «Rango» en UNA línea
          (la empresa en 13 px; si un nombre largo no entra, se corta con «…»). */}
      <div className={`mt-3 flex items-center px-4 ${f3 ? "justify-start" : "justify-between"} ${simple ? "gap-1.5" : "gap-2"}`}>
        {!f3 && <button
          type="button"
          onClick={() => setEligiendoEmpresa(true)}
          data-chip-vista
          className={`min-h-[36px] min-w-0 flex-1 truncate rounded-full border border-gray-300 bg-white text-left font-medium text-gray-900 active:opacity-60 ${simple ? "px-2.5 text-[13px]" : "px-3 text-[14px]"}`}
        >
          {COMISIONES_MES_COMPLETO ? (
            <span className="inline-flex max-w-full items-center gap-0.5">
              <span className="truncate">{etiquetaVista}</span>
              <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
            </span>
          ) : <>{etiquetaVista} ▾</>}
        </button>}
        {conPeriodo && (
          <div className={`flex shrink-0 items-center ${simple ? "gap-0.5" : "gap-1"}`} data-mes-celular>
            {!rango && (
            <button
              type="button"
              aria-label={anterior ? `Ir a ${mesEnPalabras(anterior)}` : "Mes anterior"}
              onClick={() => irA(anterior)}
              className={COMISIONES_FLECHAS_44_2026_11 ? FLECHA_MES_44 : `flex min-h-[36px] items-center justify-center text-[18px] text-blue-600 active:opacity-60 ${simple ? "min-w-[24px]" : "min-w-[32px]"}`}
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
                rangoAparte={simple}
                conFlechas={false}
                rotulo={COMISIONES_MES_COMPLETO ? etiquetaPeriodo(year, mes) : undefined}
              />
            ) : (
            <span className="whitespace-nowrap text-[14px] font-medium text-gray-900">
              {mesEnPalabras(mesTexto)}
            </span>
            )}
            {/* 🔴 NUNCA AL FUTURO: sin mes siguiente, la flecha no se dibuja. */}
            {/* Sin mes siguiente la › no se dibuja; con CALENDARIO_SIMPLE_2026_10
                tampoco deja hueco: «Rango» va pegado. */}
            {rango ? null : siguiente ? (
              <button
                type="button"
                aria-label={`Ir a ${mesEnPalabras(siguiente)}`}
                onClick={() => irA(siguiente)}
                className={COMISIONES_FLECHAS_44_2026_11 ? FLECHA_MES_44 : `flex min-h-[36px] items-center justify-center text-[18px] text-blue-600 active:opacity-60 ${simple ? "min-w-[24px]" : "min-w-[32px]"}`}
              >
                ›
              </button>
            ) : simple ? null : (
              <span className="min-w-[32px]" aria-hidden />
            )}
            {simple && onRango && (
              <BotonRangoComisiones rango={rango ?? null} onRango={onRango} onVolver={() => onPeriodo(year, mes)} />
            )}
          </div>
        )}
      </div>

      {/* v2: el número grande (el de Ventas y CxC) y UNA línea gris con la
          frescura, como CxC («+90 días $X · Actualizado 4:00 pm ↻»). Las bases
          van solo en la computadora: en 390 px la línea se cortaba y el ↻ —lo
          que se toca— quedaba fuera. */}
      {v2 && !enConfig && !f3 && (resumen || frescura) && (
        <div data-numero-comisiones className="px-4 pt-3">
          {resumen && (
            <span className={`${CLASE_TOTAL_CELULAR} ${resumen.total < 0 ? "!text-red-600" : ""}`}>{fmtMoney(resumen.total)}</span>
          )}
          {COMISIONES_DESGLOSE_EN_CELULAR && resumen ? (
            // n.º 33: el mismo desglose de la computadora; la hora va al final
            // de la misma línea y baja sola si no cabe.
            <span data-desglose-comisiones className="block pt-1 text-[13px] text-gray-500">
              {lineaBajoElTotal(resumen)}
              {frescura ? <> · <span className="inline-flex">{frescura}</span></> : null}
            </span>
          ) : (
          <span className={CLASE_LINEA_TOTAL}>
            {resumen ? ROTULO_TOTAL_V2 : null}
            {resumen && frescura ? " · " : null}
            {frescura}
          </span>
          )}
        </div>
      )}

      <div className="px-4 pt-2">
        <AvisoRechazosSwitch texto={avisoMontos} />
      </div>

      {/* Revisión 110 · ajustes (5): con el buscador, la lista, el buscador y
          el total empiezan en el MISMO borde que el título (16 px). */}
      <div className={`${f3 && BORDES_ALINEADOS ? "px-4" : "px-2"} pt-1`}>{children}</div>

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
        {onComoSeUsa && (
          <button
            type="button"
            onClick={() => { setMenu(false); onComoSeUsa(); }}
            className="mt-2 block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-center text-[17px] font-semibold text-gray-900 active:scale-[0.97]"
          >
            Cómo se usa
          </button>
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
    </RanurasBuscarCliente.Provider>
  );
}
