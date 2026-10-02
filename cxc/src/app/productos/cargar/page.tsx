"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { useUrlState } from "@/lib/hooks/useUrlState";
import AppHeader from "@/components/AppHeader";
import DesplegableFlotante from "@/components/ui/DesplegableFlotante";
import DepuradorDispatcher from "./DepuradorDispatcher";
import HistorialView from "./HistorialView";
import FormulasConfig from "./FormulasConfig";
import ReglasView from "./ReglasView";
import CurvasView from "./CurvasView";
import CatalogoDescripcionesAdmin from "./CatalogoDescripcionesAdmin";
import { PESTANAS, VISTAS_POR_TAB, resolverTab, type Tab, type Vista } from "./pestanas";
import { CARGAS_RECIENTES, PLANTILLA_APPLE_2026_10, navegacion } from "@/lib/depurador/plantilla-apple-2026-10";

type FormulasScope = "depurador" | "tienda";

/**
 * Las pestañas en celular e iPad vertical: un botón que dice en cuál estás y
 * despliega las 3.
 *
 * El panel es `<DesplegableFlotante>` (portal a <body> + `position: fixed`),
 * que es EL desplegable de la casa: un panel `absolute` acá lo recortaría el
 * primer ancestro con overflow, y hay un candado (`__tests__/desplegables-flotan`)
 * que pone el build rojo si alguien escribe uno nuevo a mano.
 *
 * Cuando está cerrado NO existe en el DOM, así que duplicar el control
 * (desplegable en angosto + píldoras en ancho) no duplica opciones para nadie
 * — ni para un lector de pantalla ni para la medición.
 */
function SelectorPestanas({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const [abierto, setAbierto] = useState(false);
  const anclaRef = useRef<HTMLButtonElement>(null);
  const actual = PESTANAS.find(p => p.id === tab) ?? PESTANAS[0];

  return (
    <div className="lg:hidden">
      <button
        ref={anclaRef}
        type="button"
        onClick={() => setAbierto(a => !a)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label="Sección de Plantilla Switch"
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-4 min-h-[44px] text-sm font-medium text-stone-700 transition hover:bg-stone-50"
      >
        <span className="truncate">{actual.label}</span>
        <svg className="h-4 w-4 shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <DesplegableFlotante
        abierto={abierto}
        anclaRef={anclaRef}
        onCerrar={() => setAbierto(false)}
        marca="depurador-pestanas"
        role="listbox"
        aria-label="Sección de Plantilla Switch"
        anchoMinimo={220}
        className="bg-white rounded-xl border border-black/10 shadow-lg py-1"
      >
        {PESTANAS.map(p => (
          <button
            key={p.id}
            type="button"
            role="option"
            aria-selected={p.id === tab}
            onClick={() => { onChange(p.id); setAbierto(false); }}
            className={`w-full min-h-[44px] px-4 flex items-center justify-between gap-2 text-left text-sm transition hover:bg-black/5 ${
              p.id === tab ? "font-semibold text-teal-700" : "text-stone-700"
            }`}
          >
            <span>{p.label}</span>
            {p.id === tab && (
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ))}
      </DesplegableFlotante>
    </div>
  );
}

export default function CargarProductosPage() {
  return (
    <Suspense>
      <CargarInner />
    </Suspense>
  );
}

function CargarInner() {
  const { authChecked, role } = useAuth({ moduleKey: "cargar", allowedRoles: ["admin", "secretaria"] });
  // La pestaña y la vista viven en la URL (?tab= y ?vista=) → refresh y
  // compartir-link conservan lo que se ve. Tab/vista del MISMO nivel → replace
  // (default): el Atrás del navegador no cicla por pestañas (convención del
  // sistema). Un valor desconocido cae en la pestaña por defecto, nunca en
  // blanco — y un ?tab= VIEJO (depurador, misfotos, historial…) redirige a su
  // pestaña nueva para no romper enlaces guardados (resolverTab, pestanas.ts).
  const [tabRaw, setTab] = useUrlState<Tab>("tab", "plantilla");
  const [vistaRaw, setVista] = useUrlState("vista", "");
  const esAdmin = role === "admin";
  const { tab, vista, redirigido } = resolverTab(tabRaw, vistaRaw, esAdmin);
  const [refreshKey, setRefreshKey] = useState(0);

  // El ?tab= viejo se reescribe en la URL (UN solo replace, con tab y vista
  // juntos: dos setValue seguidos se pisarían — cada uno parte de los params
  // del render) para que el enlace que se copie ya sea el nuevo.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!redirigido) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    if (vista !== VISTAS_POR_TAB[tab][0].id) params.set("vista", vista);
    else params.delete("vista");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirigido]);

  if (!authChecked) return null;

  const cambiarVista = (v: Vista) => setVista(v);

  // Pestaña y vista en UN solo replace (dos setValue seguidos se pisarían).
  const irA = (t: Tab, v: Vista) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", t);
    if (v !== VISTAS_POR_TAB[t][0].id) params.set("vista", v);
    else params.delete("vista");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Registra la carga en el server al descargar (lo único que toca backend).
  // Desde el 4-sep-2026 viaja también EL ARCHIVO descargado (los mismos bytes),
  // que queda en Storage (RETENCION_ARCHIVO_DIAS) para volver a bajarlo del Historial.
  // 🔴 SOLO los Excel de Switch llegan acá: el pedido para cliente de Reebok y
  // Tallas por bulto no llaman este callback.
  const handleDownloaded = async (payload: {
    empresa: string;
    marca: string;
    cantidad_estilos: number;
    total_unidades: number;
    total_costo: number;
    archivo?: { blob: Blob; nombre: string };
  }) => {
    try {
      const fd = new FormData();
      fd.set("empresa", payload.empresa);
      fd.set("marca", payload.marca);
      fd.set("cantidad_estilos", String(payload.cantidad_estilos));
      fd.set("total_unidades", String(payload.total_unidades));
      fd.set("total_costo", String(payload.total_costo));
      if (payload.archivo) fd.set("archivo", payload.archivo.blob, payload.archivo.nombre);
      await fetch("/api/productos/cargar/historial", { method: "POST", body: fd });
      setRefreshKey((k) => k + 1);
    } catch {
      // El historial es secundario: si falla el registro, la descarga ya ocurrió.
    }
  };

  const vistas = VISTAS_POR_TAB[tab].filter((v) => !v.soloAdmin || esAdmin);
  const nav = navegacion(PLANTILLA_APPLE_2026_10, tab, vista, vistas.length);
  const enlace = "inline-flex min-h-[44px] items-center text-sm font-medium text-blue-600 hover:text-blue-800";

  return (
    <div className="min-h-screen bg-stone-50">
      <AppHeader module="Plantilla Switch" />

      <div className="mx-auto max-w-5xl px-4 pt-4">
        {/* ── 🩸 Las pestañas, MEDIDAS (30-jul-2026, build de producción) ──
            Hasta `lg`, un DESPLEGABLE; de `lg` para arriba, la fila de
            píldoras. El corte es `lg` (1024) y está MEDIDO, no elegido. Con 3
            pestañas la fila entra sobrada, pero el patrón se conserva: es el
            de toda la casa y el candado `depurador-reclamos-datahealth-anchos`
            lo exige. */}
        {nav.pestanas && <SelectorPestanas tab={tab} onChange={setTab} />}

        {/* ≥lg: la fila de píldoras de siempre, ahora con 3. */}
        {nav.pestanas && <div className="hidden lg:flex w-full flex-nowrap overflow-x-auto rounded-lg border border-gray-200 bg-white p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PESTANAS.map(p => (
            <TabBtn key={p.id} active={tab === p.id} onClick={() => setTab(p.id)}>{p.label}</TabBtn>
          ))}
        </div>}

        {/* PLANTILLA_APPLE_2026_10: sin filas de pestañas. La caja abre sola,
            «Configuración» es un enlace y las demás vistas vuelven con «← Plantilla». */}
        {nav.enlaces && (
          <div className="flex justify-end gap-5">
            <button type="button" onClick={() => irA("tallas", "curvas")} className={enlace}>Tallas por bulto</button>
            <button type="button" onClick={() => irA("config", "formulas")} className={enlace}>Configuración</button>
          </div>
        )}
        {/* En Configuración, «← Plantilla» va en la MISMA línea que sus vistas. */}
        {nav.volver && !nav.vistas && (
          <button type="button" onClick={() => irA("plantilla", "nuevo")} className={enlace}>← Plantilla</button>
        )}

        {/* Vistas de la pestaña activa (Nuevo/Historial, Tallas/Fotos,
            Fórmulas/Descripciones/Reglas), en TODOS los anchos. «Tallas por
            bulto» quedó con UNA sola vista, así que su fila no se dibuja. */}
        {nav.vistas && (
          <div className={nav.volver ? "flex items-center gap-4" : ""}>
          {nav.volver && (
            <button type="button" onClick={() => irA("plantilla", "nuevo")} className={`${enlace} shrink-0`}>← Plantilla</button>
          )}
          <div className={`${nav.volver ? "" : "mt-3 "}flex w-full flex-nowrap overflow-x-auto rounded-lg border border-gray-200 bg-white p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
            {vistas.map((v) => (
              <TabBtn key={v.id} active={vista === v.id} onClick={() => cambiarVista(v.id)}>{v.label}</TabBtn>
            ))}
          </div>
          </div>
        )}
      </div>

      {/* Los caminos con archivo cargado quedan SIEMPRE montados (solo ocultos)
          para que el Excel y sus ediciones sobrevivan al cambiar de pestaña o
          de vista (FIX 1). El dispatcher reconoce el formato (CK/TH, Reebok o
          Facturas Tienda) en la misma dropzone — los caminos ya no se nombran. */}
      <div className={tab === "plantilla" && vista === "nuevo" ? "" : "hidden"}>
        <DepuradorDispatcher
          onDownloaded={handleDownloaded}
          pie={nav.enlaces ? (
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-semibold text-gray-900">Cargas recientes</h2>
              <HistorialView refreshKey={refreshKey} limite={CARGAS_RECIENTES} />
              <button type="button" onClick={() => irA("plantilla", "historial")} className={`${enlace} mt-2`}>Ver historial completo</button>
            </div>
          ) : undefined}
        />
      </div>
      {tab === "plantilla" && vista === "historial" && <HistorialView refreshKey={refreshKey} />}

      {/* 🩸 «Fotos a mi Excel» se retiró de la pantalla el 22-sep-2026 (Daniel:
          *«si si borra ese»*; CERO usos en `activity_logs` en toda su
          historia). El componente NO se borró —queda rotulado y sin lectores,
          patrón `mayor_lineas`— y el candado
          `fotos-a-mi-excel-retirado.test.ts` pone el build ROJO si vuelve a
          montarse. «Tallas por bulto» se queda y es la única vista. */}
      <div className={tab === "tallas" && vista === "curvas" ? "" : "hidden"}>
        <CurvasView />
      </div>

      {tab === "config" && vista === "formulas" && <FormulasScopeRow />}
      {/* Catálogo de descripciones (tabla depurador_descripciones) — SOLO admin. */}
      {tab === "config" && vista === "descripciones" && esAdmin && <CatalogoDescripcionesAdmin />}
      {tab === "config" && vista === "reglas" && <ReglasView />}
    </div>
  );
}

/** El selector de ámbito de fórmulas (Importación / Tienda, los dos que ya
 *  existían) + el FormulasConfig que le corresponde. El scope es estado LOCAL
 *  de la vista (no va a la URL). key={scope} remonta el componente para
 *  re-sembrar el catálogo. */
function FormulasScopeRow() {
  const [formulasScope, setFormulasScope] = useState<FormulasScope>("depurador");
  // PLANTILLA_APPLE_2026_10: sin selector. UNA lista de empresas, con Active
  // Shoes (Reebok) y Multifashion (facturas de tienda) como una más.
  if (PLANTILLA_APPLE_2026_10) return <FormulasConfig scope="depurador" apple />;
  return (
    <>
      <div className="mx-auto max-w-4xl px-4 pt-4">
        <div className="flex w-full flex-nowrap overflow-x-auto rounded-lg border border-stone-200 bg-white p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabBtn active={formulasScope === "depurador"} onClick={() => setFormulasScope("depurador")}>Plantilla (importación)</TabBtn>
          <TabBtn active={formulasScope === "tienda"} onClick={() => setFormulasScope("tienda")}>Tienda (facturas)</TabBtn>
        </div>
      </div>
      <FormulasConfig key={formulasScope} scope={formulasScope} />
    </>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      // 🩸 El relleno baja a `px-2.5` hasta `xl` (medido cuando la fila tenía 7
      // pestañas y desbordaba 24 px a 1024). Con 3 pestañas sobra el ancho,
      // pero la regla de verdad —44 px de alto, sin comprimirse, sin partir el
      // texto— se queda tal cual (candado iphone-targets-operacion).
      className={`shrink-0 whitespace-nowrap rounded-md px-2.5 xl:px-4 min-h-[44px] text-sm font-medium transition ${
        active ? "bg-teal-600 text-white" : "text-stone-600 hover:bg-stone-100"
      }`}
    >
      {children}
    </button>
  );
}
