"use client";

// Shell del módulo Comisiones. UN selector de empresa, UN período, UN engranaje.
//
// ─── 🩸 SE FUERON LAS CUATRO PESTAÑAS (6-sep-2026) ───────────────────────────
// Eran «Todas las empresas · Por empresa · Multifashion · Configuración», y
// DENTRO de «Por empresa» vivía un segundo selector de empresa: dos controles
// para una sola pregunta —¿de quién estoy mirando la comisión?— y en el iPhone
// la cuarta pestaña nacía CORTADA contra el borde.
//
// Daniel, textual: *«opino eliminar los tabs y dejar configuración como el
// depurador, estilo engranaje y ya. Todas las empresas solo se agrega en una
// opción con las empresas. Y multifashion es una empresa más. Así convive con el
// módulo, cambio mi opinión de que sea un espejo.»*, *«entonces a, pero en todas
// pon fashion group para no confundir»* y *«el merge de los tabs no es solo en
// el cel, sino también en desktop»*.
//
// Hoy la primera fila es el selector (Fashion Group · las 6 · Multifashion) más
// el ⚙ de Configuración; la segunda, el período, «Actualizar ahora» y el botón
// de descarga. Las opciones y la resolución de lo que venga guardado viven en
// el módulo puro `lib/comisiones/vistas.ts`; un `?tab=` viejo y el
// `fg_comisiones_mode` de antes siguen llegando a su vista equivalente.
//
// 🔴 «FASHION GROUP» NO INCLUYE A MULTIFASHION Y NUNCA SE SUMAN: son dos
// comisiones calculadas distinto (0,5 % con filtro de utilidad > 20 % contra
// 0,5 % sobre toda la venta). Medido en agosto 2026: $5.978,55 contra $255,27.
// El porqué completo está en `vistas.ts`.
//
// ─── 🩸 ABRE EN EL ÚLTIMO MES CERRADO (6-sep-2026, Daniel eligió «a») ─────────
// Abría en el mes EN CURSO: medido el 5-sep, con 5 días de septiembre, la
// comisión bruta de las 6 empresas era $101,77 y el descuento fijo de $1.573,08
// se restaba entero, así que lo PRIMERO que se veía al entrar era «Total a pagar
// −$1.471,31». Es una pantalla de cierre: nadie paga el día 5. El mes en curso
// queda a un toque y ningún cálculo cambia.
//
// 🩸 Y EL MES LO DECIDÍA EL RELOJ DEL NAVEGADOR (`new Date().getMonth() + 1`).
// Panamá es UTC−5 fijo y es invariante de la casa (`hoyPanama`). La cuenta vive
// en `lib/comisiones/mes-inicial.ts`, módulo puro.
//
// ─── Encabezado: 481px → 2 filas (jul-2026) ──────────────────────────────────
// Medido con datos de producción en 390×844: del borde de arriba al primer
// número de comisión había 481px, el 57% del iPhone, y en Safari real (área
// útil ~664px) entraban 4 vendedores de 6. Eran cuatro bloques apilados —
// título grande, fila de 5 controles, acordeón "Criterios" y una fila entera
// solo para el botón Excel. Hoy son DOS filas de 44px y el presupuesto de
// 200px lo congela `__tests__/iphone-comisiones-encabezado.test.ts`.
//
// El botón de descarga vive acá; la vista hija sigue siendo la dueña del
// cálculo del Excel y solo registra su función con `onExcel`.

import { useCallback, useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Settings } from "lucide-react";
import { EMPRESA_KEY_TO_NOMBRE_CORTO, nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { EMPRESAS_COMISIONAN } from "@/lib/comisiones/empresas";
import SyncStatus from "@/components/shared/SyncStatus";
import SyncNowButton from "@/components/shared/SyncNowButton";
import AvisoRechazosSwitch from "@/components/AvisoRechazosSwitch";
import { SYNC_NOW_RECIBOS_OPCIONES } from "@/components/shared/syncNowOpciones";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ComisionesCriterios } from "./ComisionesCriterios";
import { ComisionesPeriodo } from "./ComisionesPeriodo";
import { hoyPanama } from "@/lib/fecha-panama";
import { periodoInicial } from "@/lib/comisiones/mes-inicial";
import { rotuloDescargarPeriodo } from "@/lib/comisiones/periodo";
import {
  OPCIONES_VISTA,
  VISTA_GRUPO,
  esVistaDeEmpresa,
  esVistaGrupo,
  esVistaMultifashion,
  resolverVista,
} from "@/lib/comisiones/vistas";
import dynamic from "next/dynamic";

// Vistas LAZY: solo la que se está mirando descarga su JS, en su propio chunk →
// fuera del bundle inicial de /comisiones. Skeleton mientras carga.
function ViewSkeleton() {
  return <div className="mt-4 h-72 w-full animate-pulse rounded-lg bg-gray-100" aria-hidden />;
}
const ComisionesConsolidadoView = dynamic(
  () => import("./ComisionesConsolidadoView").then((m) => m.ComisionesConsolidadoView),
  { ssr: false, loading: () => <ViewSkeleton /> },
);
const ComisionesPorEmpresaView = dynamic(
  () => import("./ComisionesPorEmpresaView").then((m) => m.ComisionesPorEmpresaView),
  { ssr: false, loading: () => <ViewSkeleton /> },
);
const ComisionesConfiguracionView = dynamic(
  () => import("./ComisionesConfiguracionView").then((m) => m.ComisionesConfiguracionView),
  { ssr: false, loading: () => <ViewSkeleton /> },
);
// 🔴 La MISMA vista del módulo Multifashion, importada tal cual. Reescribirla
// sería la forma conocida de que un día los dos rankings digan cosas distintas.
const VendedorasSubtab = dynamic(
  () => import("@/components/multifashion/VendedorasSubtab").then((m) => m.VendedorasSubtab),
  { ssr: false, loading: () => <ViewSkeleton /> },
);

// La CUARTA copia de la lista de empresas era esta línea, escrita a mano
// (`B2B_EMPRESA_KEYS.filter(k => k !== "joystep")`) mientras las otras tres ya
// leían `EMPRESAS_COMISIONAN`. Justo lo que el módulo `lib/comisiones/empresas`
// existe para impedir.
const EMPRESAS = EMPRESAS_COMISIONAN;
/** Lo que se está mirando (antes `fg_comisiones_mode`, con otros valores). */
const VISTA_KEY = "fg_comisiones_vista";
/** El modo viejo de 4 pestañas: se lee UNA vez para migrar y no se escribe más. */
const MODO_VIEJO_KEY = "fg_comisiones_mode";
/** La misma memoria de empresa que usaba «Por empresa» (useLastUsed). */
const EMPRESA_VIEJA_KEY = "fg_last_comision_empresa";

/** Lo que una vista hija expone para que la descarga viva en la barra de arriba. */
export interface ExcelApi {
  run: () => void;
  disabled: boolean;
}

interface ComisionesViewProps {
  availableYears: number[];
  /** Lo que el guard dejó afuera de los cobros, ya redactado por el servidor. */
  avisoMontos?: string | null;
  /**
   * Dibuja el ⚙ de «Configuración» (solo admin). Lo monta el MÓDULO Comisiones
   * (/comisiones); la pestaña Comisiones de Ventas no lo lleva — Daniel,
   * 3-sep-2026: «es el módulo Comisiones aparte, no la pestaña de Ventas».
   */
  conConfiguracion?: boolean;
  /**
   * Ofrece «Multifashion» en el selector. Solo el módulo /comisiones: la
   * pestaña Comisiones de Ventas no lo lleva porque Ventas ya tiene su propia
   * pestaña Multifashion, y dos puertas a lo mismo en la misma pantalla es lo
   * que Daniel mandó a quitar («configuración en dos lados»).
   */
  conMultifashion?: boolean;
  /**
   * Vista pedida por la URL (`?tab=`), incluidos los valores viejos de las 4
   * pestañas. Se resuelve con `resolverVista`: un enlace guardado no se rompe.
   */
  vistaPedida?: string | null;
}

export function ComisionesView({
  availableYears,
  avisoMontos,
  conConfiguracion = false,
  conMultifashion = false,
  vistaPedida = null,
}: ComisionesViewProps) {
  // Panamá, no el reloj del navegador. Y el período de arranque es el ÚLTIMO
  // MES CERRADO (ver el encabezado): la cuenta vive en el módulo puro.
  const inicial = periodoInicial(hoyPanama(), availableYears);

  const [vista, setVista] = useState<string>(VISTA_GRUPO);
  // 🔴 EL ⚙ ESTÁ SIEMPRE, EN EL MISMO LUGAR (Daniel: «a y con, para que no se
  // sienta que desapareció un botón»). Y de fondo: **Configuración no es de una
  // empresa, es del MÓDULO** —las tasas, los clientes que no comisionan y los
  // descuentos viven ahí mires lo que mires—, así que es un estado APARTE de la
  // empresa elegida, no una opción más del selector.
  const [enConfig, setEnConfig] = useState(false);
  // «Configuración» es SOLO de admin y SOLO en el módulo /comisiones: el ⚙ no
  // se dibuja para nadie más, y una vista guardada que aquí no existe cae a
  // Fashion Group.
  const [esAdmin, setEsAdmin] = useState(false);
  const hayConfig = esAdmin && conConfiguracion;
  // 🩸 Contador de recarga. "Actualizar ahora" sincroniza los RECIBOS, pero la
  // tabla los pidió al abrir la pantalla: sin esto, Daniel arreglaba el
  // vendedor en Switch, tocaba el botón y la tabla seguía diciendo DEFAULT con
  // un toast que le aseguraba que los datos estaban frescos.
  const [refreshKey, setRefreshKey] = useState(0);
  const [year, setYear] = useState<number>(inicial.year);
  const [mes, setMes] = useState<number>(inicial.mes);
  const [syncStale, setSyncStale] = useState(false);

  // La descarga: la vista hija registra su función; acá solo se dispara. La
  // función se guarda en un ref (cambia en cada render de la hija) y en el
  // estado solo queda si está habilitada, que es lo único que pinta el botón.
  const excelRef = useRef<(() => void) | null>(null);
  const [excelDisabled, setExcelDisabled] = useState(true);
  const registrarExcel = useCallback((api: ExcelApi | null) => {
    excelRef.current = api ? api.run : null;
    setExcelDisabled(api ? api.disabled : true);
  }, []);

  // Qué se está mirando: lo que pide la URL manda; si no, lo último guardado.
  // Se resuelve UNA vez, en el módulo puro, y de ahí salen también los valores
  // viejos de las 4 pestañas.
  useEffect(() => {
    const admin = (sessionStorage.getItem("cxc_role") || "") === "admin";
    setEsAdmin(admin);
    const guardada = localStorage.getItem(VISTA_KEY) ?? localStorage.getItem(MODO_VIEJO_KEY);
    const ultimaEmpresa = localStorage.getItem(EMPRESA_VIEJA_KEY);
    const resuelta = resolverVista(
      vistaPedida ?? guardada,
      ultimaEmpresa,
      admin && conConfiguracion,
    );
    // Multifashion no se ofrece fuera del módulo: si no está, se cae al grupo.
    setVista(esVistaMultifashion(resuelta.vista) && !conMultifashion ? VISTA_GRUPO : resuelta.vista);
    setEnConfig(resuelta.config);
  }, [conConfiguracion, conMultifashion, vistaPedida]);

  const elegirVista = (v: string) => {
    setVista(v);
    // Elegir una empresa cierra el ⚙: se volvió a mirar plata.
    setEnConfig(false);
    localStorage.setItem(VISTA_KEY, v);
    // La misma memoria de siempre, para que el selector vuelva donde estabas.
    if (esVistaDeEmpresa(v)) localStorage.setItem(EMPRESA_VIEJA_KEY, v);
  };

  const handlePeriodo = (y: number, m: number) => {
    setYear(y);
    setMes(m);
  };

  const opciones = OPCIONES_VISTA.filter(
    (o) => conMultifashion || !esVistaMultifashion(o.valor),
  );
  // Ni el período ni la descarga aplican a Configuración, y Multifashion trae
  // sus propios chips de período (los mismos de su módulo: los dos lados dicen
  // lo mismo porque es la MISMA vista).
  const conPeriodo = !(enConfig && hayConfig) && !esVistaMultifashion(vista);

  return (
    <div className="space-y-2">
      {/* Fila 1 — de quién estoy mirando la comisión, el ⚙ y el ⓘ.
          El selector se queda VISIBLE también con el ⚙ abierto: elegir una
          empresa es la forma de salir, y el control no cambia de sitio. */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <Select value={vista} onValueChange={elegirVista}>
          {/* min-h-[44px] pisa el h-9 (36 px) del SelectTrigger compartido. */}
          <SelectTrigger className="min-h-[44px] w-[190px] shrink-0" aria-label="Empresa">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {opciones.map((o) => (
              <div key={o.valor}>
                {/* Multifashion va DEBAJO DE UNA LÍNEA, sin rótulo (Daniel:
                    «a»): no es del grupo, y que se vea evita leerla como una
                    empresa más de Fashion Group. */}
                {o.separadorAntes && <div role="separator" className="my-1 h-px bg-gray-200" aria-hidden />}
                <SelectItem value={o.valor}>{o.etiqueta}</SelectItem>
              </div>
            ))}
          </SelectContent>
        </Select>

        {hayConfig && (
          <button
            type="button"
            onClick={() => setEnConfig((v) => !v)}
            aria-pressed={enConfig}
            aria-label="Configuración"
            title="Configuración"
            className={`inline-flex min-h-[44px] w-11 shrink-0 items-center justify-center rounded-lg border transition active:scale-[0.97] ${
              enConfig
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 text-gray-500 hover:border-black hover:text-black"
            }`}
          >
            <Settings className="h-4 w-4" />
          </button>
        )}

        <ComisionesCriterios className="ml-auto" aviso={syncStale}>
          <SyncStatus
            tabla="facturas"
            empresasEsperadas={EMPRESAS}
            empresaLabels={EMPRESA_KEY_TO_NOMBRE_CORTO}
            prefix="Sincronizado"
            onStale={setSyncStale}
          />
        </ComisionesCriterios>
      </div>

      {/* Fila 2 — lo que Daniel usa: período, actualizar, descargar.
          En 390px los tres miden 346px de los 358 disponibles: van con
          shrink-0 (para que ninguno se comprima y parta su texto en dos
          líneas) y la fila con flex-wrap, que es el modo de fallar bueno —
          si algún día no entran, se bajan a otra línea en vez de sacar la
          página para el costado. */}
      {conPeriodo && (
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <ComisionesPeriodo
          mes={mes}
          year={year}
          availableYears={availableYears}
          onChange={handlePeriodo}
        />

        {/* "Actualizar ahora" de RECIBOS (cobros) — vive acá porque la comisión
            sobre cobro lee switch_recibos. Menú para elegir la empresa (una por
            disparo — sesión única Switch). */}
        <SyncNowButton
          opciones={SYNC_NOW_RECIBOS_OPCIONES}
          className="shrink-0"
          onSuccess={() => setRefreshKey((k) => k + 1)}
        />

        {/* 🔴 EL BOTÓN DICE QUÉ TRAE (Daniel: «a, pero descargar, no bajar, como
            esté en todos los módulos»). Medido: el sistema dice «Descargar» 23
            veces contra 5 formas raras. Con «Todo el año» elegido, dice «el
            año». */}
        <button
          type="button"
          onClick={() => excelRef.current?.()}
          disabled={excelDisabled}
          className="ml-auto inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-md border border-gray-200 px-2.5 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 sm:gap-1.5 sm:px-3"
        >
          <FileSpreadsheet className="h-4 w-4 shrink-0" /> {rotuloDescargarPeriodo(mes)}
        </button>
      </div>
      )}

      {/* Qué se quedó AFUERA de los cobros que alimentan estas comisiones.
          Va arriba de la tabla, en todas las vistas del grupo: el mismo cobro
          corrupto afecta a todas. Sin rechazos no se dibuja nada. */}
      <AvisoRechazosSwitch texto={avisoMontos} />

      {enConfig && hayConfig ? (
        <ComisionesConfiguracionView />
      ) : esVistaMultifashion(vista) ? (
        /* Multifashion, con SU año y SUS chips de período: la MISMA vista del
           módulo Multifashion, no una copia. No se le pasa el período del shell
           porque la de allá tampoco lo usa — sus chips mandan, y así los dos
           lados dicen lo mismo. */
        <VendedorasSubtab selectedYear={inicial.year} />
      ) : esVistaGrupo(vista) ? (
        <ComisionesConsolidadoView year={year} mes={mes} onExcel={registrarExcel} refreshKey={refreshKey} />
      ) : (
        <ComisionesPorEmpresaView
          empresa={vista}
          empresaNombre={nombreCortoEmpresa(vista)}
          year={year}
          mes={mes}
          onExcel={registrarExcel}
          refreshKey={refreshKey}
        />
      )}
    </div>
  );
}
