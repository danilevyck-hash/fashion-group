"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 COMISIONES_APPLE_V2_2026_10 · LA MISMA PANTALLA EN LA COMPUTADORA (6-oct-2026).
//
// Hoy son dos filas de controles —empresa · ⚙ · frescura · ⓘ arriba; período ·
// PDF del mes · Excel del mes abajo— y el total solo vive en el pie de la tabla.
// Con las piezas ya aprobadas en Ventas y CxC:
//   · UNA fila: empresa · período (con Rango) … «Descargar ▾» · ⚙. Un solo
//     botón de papel, igual que en el celular (los dos papeles de siempre).
//   · Debajo, el número grande de Ventas con su línea gris («Total a pagar ·
//     Ventas · Cobros · Descuentos») y «Actualizado hace 5 min · Actualizar».
//   · La tabla, intacta.
//   · Al pie de la tabla (`PieComisionesV2`, que la vista dibuja donde iba su
//     línea), UNA línea gris: «Toca un monto para ver el detalle» y el ⓘ de
//     criterios con la frescura por empresa adentro, que antes iba arriba.
//
// 🔴 No calcula nada: el total y sus bases los REPORTA la vista (`onResumen`).
// El ⚙ queda siempre en el mismo lugar, a la derecha.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import { Settings } from "lucide-react";
import AvisoRechazosSwitch from "@/components/AvisoRechazosSwitch";
import LineaDeFrescura from "@/components/shared/LineaDeFrescura";
import SyncStatus from "@/components/shared/SyncStatus";
import { SYNC_NOW_RECIBOS_OPCIONES } from "@/components/shared/syncNowOpciones";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EMPRESA_KEY_TO_NOMBRE_CORTO } from "@/lib/empresa-mapping";
import { fmtMoney } from "@/lib/ventas/format";
import { esTodoElAnio, etiquetaPeriodo } from "@/lib/comisiones/periodo";
import type { RangoConsulta } from "@/lib/comisiones/vendedores-rango";
import { ROTULO_DESCARGAR_V2, lineaBajoElTotal, type ResumenDelTotal } from "@/lib/comisiones/apple-v2";
import type { OpcionVista } from "@/lib/comisiones/vistas";
import { ComisionesCriterios } from "./ComisionesCriterios";
import { ComisionesPeriodo } from "./ComisionesPeriodo";
import { MenuDescargaComision } from "./comisiones-detalle/MenuDescargaComision";

interface Props {
  vista: string;
  opciones: readonly OpcionVista[];
  onVista: (v: string) => void;
  hayConfig: boolean;
  enConfig: boolean;
  onConfig: () => void;
  conPeriodo: boolean;
  /** Se mira lo que se paga (no Configuración ni un rango): hay papel y número. */
  conPapel: boolean;
  year: number;
  mes: number;
  availableYears: number[];
  onPeriodo: (year: number, mes: number) => void;
  rango: RangoConsulta | null;
  onRango?: (r: RangoConsulta) => void;
  onPdf: () => void;
  onExcel: () => void;
  papelApagado: boolean;
  resumen: ResumenDelTotal | null;
  empresasFrescura: readonly string[];
  onActualizado: () => void;
  avisoMontos?: string | null;
  children: ReactNode;
}

export function ComisionesComputadoraV2({
  vista,
  opciones,
  onVista,
  hayConfig,
  enConfig,
  onConfig,
  conPeriodo,
  conPapel,
  year,
  mes,
  availableYears,
  onPeriodo,
  rango,
  onRango,
  onPdf,
  onExcel,
  papelApagado,
  resumen,
  empresasFrescura,
  onActualizado,
  avisoMontos,
  children,
}: Props) {
  const etiquetaVista = opciones.find((o) => o.valor === vista)?.etiqueta ?? vista;

  return (
    <div data-comisiones-v2 className="flex flex-col gap-3">
      {/* UNA fila: de quién y de cuándo a la izquierda; el papel y el ⚙ a la derecha. */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={vista} onValueChange={onVista}>
          <SelectTrigger className="min-h-[44px] w-[190px] shrink-0" aria-label="Empresa">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {opciones.map((o) => (
              <SelectItem key={o.valor} value={o.valor}>{o.etiqueta}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {conPeriodo && (
          <ComisionesPeriodo
            mes={mes}
            year={year}
            availableYears={availableYears}
            onChange={onPeriodo}
            rango={rango}
            onRango={onRango}
          />
        )}

        <div className="ml-auto flex items-center gap-2">
          {conPapel && (
            <MenuDescargaComision
              rotulo={ROTULO_DESCARGAR_V2}
              apagado={papelApagado}
              titulo={`${etiquetaVista} · ${etiquetaPeriodo(year, mes)}`}
              mensajeError="No se pudo preparar el reporte. Revisa tu conexión e intenta de nuevo."
              onPdf={async () => onPdf()}
              onExcel={async () => onExcel()}
            />
          )}
          {hayConfig && (
            <button
              type="button"
              onClick={onConfig}
              aria-pressed={enConfig}
              aria-label="Configuración"
              title="Configuración"
              className={`inline-flex min-h-[44px] w-11 shrink-0 items-center justify-center rounded-md border transition active:scale-[0.97] ${
                enConfig
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-300 text-gray-500 hover:border-gray-900 hover:text-gray-900"
              }`}
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <AvisoRechazosSwitch texto={avisoMontos} />

      {/* El número grande de Ventas: el total a pagar y UNA línea gris. */}
      {conPapel && (
        <div data-numero-comisiones className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-gray-200 bg-white p-5">
          <div className="min-w-0">
            <span
              className={`block text-[40px] font-normal leading-none tracking-tight tabular-nums ${
                resumen && resumen.total < 0 ? "text-red-600" : "text-gray-800"
              }`}
            >
              {resumen ? fmtMoney(resumen.total) : "—"}
            </span>
            <span className="mt-1.5 block text-sm text-gray-500">
              {resumen ? lineaBajoElTotal(resumen) : "Total a pagar"}
            </span>
          </div>
          <LineaDeFrescura
            forma="computadora"
            tabla="facturas"
            empresas={empresasFrescura}
            opciones={SYNC_NOW_RECIBOS_OPCIONES}
            onSuccess={onActualizado}
          />
        </div>
      )}

      {children}

    </div>
  );
}

/**
 * La línea del pie, en el lugar de la de la vista (antes del detalle abierto):
 * cómo se usa y, detrás del ⓘ, cómo se calcula y la frescura por empresa.
 * SyncStatus queda montado aunque el ⓘ esté cerrado: así prende el punto ámbar.
 */
export function PieComisionesV2({
  mes,
  empresas,
  syncStale,
  onStale,
}: {
  mes: number;
  empresas: readonly string[];
  syncStale: boolean;
  onStale: (v: boolean) => void;
}) {
  return (
    <div data-pie-comisiones className="flex items-center justify-between gap-3 text-xs text-gray-500">
      <span>{esTodoElAnio(mes) ? "Selecciona un mes para ver el detalle" : "Toca un monto para ver el detalle"}</span>
      <ComisionesCriterios aviso={syncStale}>
        <p className="mb-2.5">Ya están descontados lo devuelto y los descuentos.</p>
        <SyncStatus
          tabla="facturas"
          empresasEsperadas={[...empresas]}
          empresaLabels={EMPRESA_KEY_TO_NOMBRE_CORTO}
          onStale={onStale}
        />
      </ComisionesCriterios>
    </div>
  );
}
