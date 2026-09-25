"use client";

// Módulo de Asistencia. Toda la regla de negocio vive en
// `lib/asistencia/reporte.ts`, que es el MISMO motor que arma el Excel y el
// PDF — así la pantalla y los archivos no pueden contradecirse.
//
// ── 🩸 POR QUÉ YA NO HAY PESTAÑA "CARGAR EXCEL" (6-ago-2026) ─────────────────
//
// El reloj es la ÚNICA vía de entrada. La pantalla de Excel no era un extra
// inofensivo: mandaba `dispositivo = "RELOJ_FG"` y armaba el `evento_id` con un
// hash del contenido de la fila, mientras el agente manda
// `dispositivo = "reloj cboston"` con `evento_id = serialNo` del aparato. Son
// dos llaves distintas para el MISMO punch, así que el índice único
// `(dispositivo, evento_id)` —el anti-duplicado— no los reconocía como iguales.
//
// Ya pasó: las 134 marcaciones subidas por Excel quedaron TODAS duplicadas
// contra las del reloj y hubo que borrarlas a mano. Con las horas contadas dos
// veces, el almuerzo de alguien salía medido en 4 horas.
//
// El candado que lo impide de verdad no es este borrado, es
// `asistencia-una-sola-entrada.test.ts`. Si alguien reintroduce una segunda vía
// con otro `dispositivo`, el build se pone en rojo.

// ── 🩸 POR QUÉ SON 6 Y NO 7 (6-ago · +Vacaciones 25-ago · +Aprobaciones 26-ago)
//
// Eran Reporte · Planilla · Configuración · Horarios · Justificaciones ·
// Feriados · Cómo funciona. Siete pestañas ya no son una herramienta: son un
// menú, y todas pesan lo mismo aunque no valgan lo mismo.
//
// UNA PESTAÑA SE GANA EL LUGAR POR LO QUE HACÉS AHÍ, NO POR LA TABLA QUE GUARDA.
//   · Feriados se toca UNA VEZ AL AÑO (los 22 de Panamá ya están cargados).
//   · Horarios se toca cuando entra alguien.
// Las dos pasaron a ser SECCIONES de Configuración, que es exactamente lo que
// son: números que se dejan puestos para que el cálculo signifique algo. No se
// borró nada — cambió dónde vive.
//
// "Cómo funciona" es AYUDA, no un lugar de trabajo, y ocupaba el mismo peso
// visual que la Planilla. Ahora es el botón «?» del final de la barra.
//
// EL ORDEN también cambió: Planilla PRIMERA. La contable entra dos veces al mes
// y entra a eso; el Reporte es el detalle que la sostiene, y va detrás.
//
// ⚠️ La quinta, VACACIONES, no contradice esto: se ganó el lugar por lo que se
// hace ahí y no por la tabla que guarda. No es «una sección más de
// Justificaciones» — es lo contrario, existe justamente porque una vacación NO
// es una justificación (no se paga por asistencia y lleva su propia cuenta de
// días), y meterlas en la misma lista es lo que hacía imposible distinguir
// quién estuvo enfermo de quién estuvo de vacaciones.
//
// ⚠️ La sexta, APROBACIONES, tampoco lo contradice, y por otro motivo: es la
// única pantalla del módulo donde alguien AUTORIZA algo en vez de cargar un
// dato, y además **no la ve todo el mundo**. Meter «aprobar las horas extra»
// adentro de la Planilla habría puesto un botón que mueve el pago de treinta
// personas en la misma pantalla donde la contadora teclea montos.
//
// 🩸 VACACIONES SE APAGÓ Y SE VOLVIÓ A ENCENDER EL MISMO DÍA (1-sep-2026), y
// vuelven a ser 6. Daniel la mandó a apagar —*«olvida lo de las vacaciones por
// ahora, quitalo del ERP para no enrredar»*— y unas horas después se retractó:
// *«vacaciones quedamos que sí, dejalo, solo que haslo bien»*. Lo que enredaba
// no era la pestaña: era el TEXTO del interruptor, que decía «Ya se le pagó»
// con «Se le pagan estos días» debajo. Se arregló el texto —ahora la casilla
// PREGUNTA y la consecuencia solo aparece al marcarla, `vacaciones.ts`— en vez
// de esconder la pantalla. La lista de pestañas apagadas se borró entera.
//
// El candado de todo esto es `src/__tests__/lib/asistencia-pestanas.test.ts`.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useUrlState } from "@/lib/hooks/useUrlState";
import ReporteTab from "./ReporteTab";
import PlanillaTab from "./PlanillaTab";
import ConfiguracionTab from "./ConfiguracionTab";
import JustificacionesTab from "./JustificacionesTab";
import VacacionesTab from "./VacacionesTab";
import AprobacionesTab from "./AprobacionesTab";
import { APROBACIONES_ROLES, vePestana } from "@/lib/asistencia/roles";
import ComoFuncionaTab from "./ComoFuncionaTab";
import PrestamosTab from "./PrestamosTab";
import { PLANILLA_UNIDA } from "@/lib/asistencia/planilla-unida";
import {
  PERSONA_EN_EL_CENTRO,
  pestanaPorDefecto,
  claveQueSeReescribe,
  pestanaQueSeAbre,
  pestanasDeAsistencia,
  type ClavePestana,
} from "@/lib/asistencia/persona-en-el-centro";
import {
  PARAM_EMPRESA, RECORDAR_EMPRESA, empresaElegida, opcionesDeEmpresa, type AlcanceDeEmpresas,
} from "@/lib/asistencia/empresa-para-todo";
// 🔴 LAS PESTAÑAS YA VISITADAS NO SE DESARMAN (24-sep-2026). La regla vive en
// el módulo PURO; acá solo se aplica.
import { pestanasMontadas, recordarVisitada, seEsconde } from "@/lib/asistencia/pestanas-vivas";
import { useLastUsed } from "@/lib/hooks/useLastUsed";
// 🔴 1b — EN EL CELULAR, EL MÓDULO ABRE EN UNA PORTADA (24-sep-2026): las cinco
// pestañas como filas de una lista iOS, con su número al lado. La regla vive en
// el módulo puro; acá solo se elige qué se dibuja.
import { ASISTENCIA_PANTALLA_2026_09 } from "@/lib/asistencia/pantalla-2026-09";
import { usePeriodoAsistencia } from "@/components/asistencia/SelectorPeriodo";
import { aparatoDeQuienMira } from "@/lib/aparato";
import PortadaCelular from "./PortadaCelular";

// 🩸 ESTA LISTA SE MUDÓ A UN MÓDULO PURO (10-sep-2026). Vivía acá abajo, con
// todas sus notas, y `asistencia-pestanas.test.ts` la leía como TEXTO de este
// archivo. Con el acomodo nuevo hay DOS listas —la de hoy y la de «la persona
// en el centro»— y elegir entre ellas es una decisión, no un renglón de JSX:
// vive en `lib/asistencia/persona-en-el-centro.ts`, con las notas completas de
// por qué cada pestaña se ganó su lugar, y acá solo se aplica.
//
// El orden sigue sin ser cosmético: `pestanaQueSeAbre` toma la PRIMERA visible,
// así que esas listas deciden dónde aterriza cada rol.


type Tab = ClavePestana;

// Qué pestañas ve cada rol vive en `lib/asistencia/roles.ts` (`vePestana`).

export default function AsistenciaClient() {
  // useUrlState usa useSearchParams → necesita un límite de Suspense propio
  // (mismo patrón que marketing/page.tsx y productos/cargar/page.tsx).
  return (
    <Suspense>
      <AsistenciaInner />
    </Suspense>
  );
}

function AsistenciaInner() {
  // La pestaña vive en la URL (?tab=reporte) → refresh y compartir-link
  // conservan la vista. Tab del MISMO nivel → replace (default): el Atrás del
  // navegador no cicla por pestañas (convención del sistema). Un valor
  // desconocido en la URL cae en la pestaña por defecto, nunca en blanco.
  // 🔴 CON EL INTERRUPTOR APAGADO SIGUE SIENDO «reporte», al pie de la letra.
  // Prendido abre en Personas, que es el punto del acomodo nuevo. La decisión
  // vive en el módulo puro, no en este renglón.
  const [tabRaw, setTab] = useUrlState<Tab>("tab", pestanaPorDefecto(PERSONA_EN_EL_CENTRO));
  const [ayuda, setAyuda] = useState(false);

  // 🔑 El rol sale de `sessionStorage`, igual que en `AppHeader` y `useAuth`.
  // Arranca vacío y se llena en el efecto: en el primer render del servidor no
  // hay sessionStorage, y pintar la pestaña para después sacarla sería peor que
  // pintarla un tick tarde.
  const [rol, setRol] = useState("");
  useEffect(() => { setRol(sessionStorage.getItem("cxc_role") || ""); }, []);
  const puedeAprobar = (APROBACIONES_ROLES as readonly string[]).includes(rol);

  // 🔴 La regla vive en `roles.ts` y acá solo se aplica (26-ago-2026). Antes
  // bastaba con «¿puede aprobar?» porque el único que podía era `admin`, y
  // admin ve todo. Desde que `bodega` aprueba —el usuario con el que trabaja
  // Julio Garay— hay que preguntar las DOS cosas: él entra a Asistencia solo
  // para autorizar horas extra, y la Planilla trae el sueldo de las 38.
  // 🔴 CON EL INTERRUPTOR APAGADO, PRÉSTAMOS NO EXISTE. Ni en la barra, ni por
  // la URL: el `?tab=prestamos` de alguien cae en la pestaña por defecto, igual
  // que cualquier valor desconocido. Ver `planilla-unida.ts`.
  // 🔴 UN SELECTOR DE EMPRESA PARA TODO EL MÓDULO (10-sep-2026). Daniel: *«todo
  // por empresa no?»*. Vive en la URL (mismo nivel → `replace`) y se recuerda
  // por usuario; las opciones salen del rol (David solo ve Boston, sin «Todas»).
  const [empresaUrl, setEmpresaUrl] = useUrlState<string>(PARAM_EMPRESA, "");
  const [empresaRecordada, recordarEmpresa] = useLastUsed(RECORDAR_EMPRESA, "");
  // 🔴 LAS OPCIONES SALEN DE LO QUE SU ROL PUEDE VER EN EL SERVIDOR (11-sep-2026):
  // `/api/asistencia/alcance` es la misma lectura que recorta la planilla y las
  // aprobaciones. Hasta que conteste, lo del rol (como siempre).
  const [alcance, setAlcance] = useState<AlcanceDeEmpresas>(undefined);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await fetch("/api/asistencia/alcance", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { empresas?: string[] | null };
        if (vivo) setAlcance(j.empresas === undefined ? null : j.empresas);
      } catch { /* sin respuesta, lo del rol */ }
    })();
    return () => { vivo = false; };
  }, []);
  const opciones = opcionesDeEmpresa(rol, alcance);
  const empresa = empresaElegida(empresaUrl || empresaRecordada, rol, alcance);
  const elegirEmpresa = (e: string) => { setEmpresaUrl(e); recordarEmpresa(e); };

  // ── 🔴 LA PORTADA DEL CELULAR ────────────────────────────────────────────
  //
  // Sin `?tab=` en la dirección y con el dedo en la pantalla, el módulo abre en
  // la portada. 🔑 Se mira el parámetro CRUDO, no `useUrlState`, que devuelve la
  // pestaña por defecto cuando falta: la diferencia entre «no eligió nada» y
  // «eligió la primera» es justamente lo que decide esta pantalla.
  const sp = useSearchParams();
  const hayTab = String(sp?.get("tab") ?? "").trim() !== "";
  const [celular, setCelular] = useState(false);
  useEffect(() => {
    if (ASISTENCIA_PANTALLA_2026_09) setCelular(aparatoDeQuienMira() === "celular");
  }, []);
  // El período del módulo, para que la portada diga de qué quincena habla.
  const periodo = usePeriodoAsistencia();

  const visibles = pestanasDeAsistencia({
    personaEnElCentro: PERSONA_EN_EL_CENTRO,
    planillaUnida: PLANILLA_UNIDA,
  }).filter(([k]) => vePestana(rol, k));
  // Una pestaña que no se ve tampoco se abre por la URL: cae en la primera que
  // esta persona SÍ puede ver. 🔑 No en "planilla" a secas: quien solo aprueba
  // aterrizaría en una pantalla que su propio rol no puede cargar, y vería un
  // error en vez de su trabajo.
  //
  // 🔴 Y CON EL ACOMODO NUEVO, LAS DIRECCIONES VIEJAS ATERRIZAN DONDE VIVE
  // AHORA ESO: `?tab=configuracion` guardado en un favorito cae en Personas y
  // `?tab=justificaciones` en Reporte. La regla vive en `pestanaQueSeAbre`;
  // nadie se queda mirando una pantalla en blanco por un enlace viejo.
  const tab: Tab = pestanaQueSeAbre(tabRaw, visibles);

  // ── 🔴 LAS DIRECCIONES VIEJAS DEJAN DE EXISTIR (19-sep-2026) ──────────────
  //
  // Daniel, mirando `?tab=justificaciones`: *«no creo que debería de existir,
  // ¿no?»*. 🩸 Esas cuatro —`justificaciones`, `vacaciones`, `configuracion` y
  // `reporte`— **se aceptaban y abrían otra pantalla EN SILENCIO**: la URL
  // seguía diciendo «justificaciones» mientras se veía Asistencia, así que la
  // dirección quedaba viva, se podía volver a compartir y el Atrás la devolvía.
  //
  // Ahora la URL se REESCRIBE a la pestaña real. La mudanza no cambió —cada una
  // sigue cayendo donde de verdad vive eso—; lo que cambia es que la dirección
  // vieja deja de existir en cuanto se usa una vez. La regla vive en el módulo
  // puro (`claveQueSeReescribe`), no en este renglón.
  //
  // 🔑 `replace`, no `push`: es la MISMA pantalla, y el Atrás del navegador no
  // tiene que pasar por la dirección que se acaba de corregir.
  //
  // 🔴 Y NO SE TOCA NADA HASTA SABER QUIÉN MIRA: el rol llega en un efecto, y
  // en el primer render `visibles` está vacío. Reescribir ahí convertiría un
  // `?tab=planilla` compartido en `?tab=reporte` antes de saber que esa persona
  // sí ve la Planilla.
  useEffect(() => {
    const aEscribir = claveQueSeReescribe(tabRaw, tab, visibles);
    if (aEscribir) setTab(aEscribir);
  }, [tabRaw, tab, setTab, visibles]);

  // ── 🔴 LA PESTAÑA QUE SE DEJA NO SE DESARMA (24-sep-2026) ────────────────
  //
  // 🩸 Se dibujaba con un `if`, así que al ir de Planilla a Asistencia y volver
  // se perdían la quincena elegida, el cuadro generado, «Antes de cerrar», el
  // estado del cierre y —el que cuesta plata— **el corte del reloj volvía al
  // propuesto (13/28)**; en la otra dirección se perdían el colaborador
  // abierto, el buscador y las horas a medio corregir.
  //
  // 🔴 SOLO LAS YA VISITADAS. Montar las cinco al entrar sería disparar las
  // cinco lecturas de golpe: la que nadie tocó no existe hasta que se toque.
  // 🔑 Y solo las que esta persona PUEDE ver: hasta que llega el rol, `visibles`
  // está vacío y no se monta nada, igual que antes.
  const [visitadas, setVisitadas] = useState<ReadonlySet<string>>(() => new Set<string>());
  useEffect(() => {
    if (!visibles.some(([k]) => k === tab)) return;
    setVisitadas((s) => recordarVisitada(s, tab));
  }, [tab, visibles]);
  const montadas = pestanasMontadas(visitadas, visibles.some(([k]) => k === tab) ? tab : "");
  /** ¿Se monta esta pestaña? Solo si se visitó y su rol la ve. */
  const monta = (k: Tab) => montadas.has(k) && visibles.some(([v]) => v === k);
  // 🔑 El envoltorio se escribe A MANO en cada renglón y NO como un componente
  // definido acá adentro: un componente nuevo en cada render tiene un tipo
  // nuevo, React lo desarma y lo vuelve a armar, y se perdería exactamente lo
  // que este arreglo viene a conservar.
  const escondida = (k: Tab) => (seEsconde(k, tab) ? "hidden" : undefined);

  // 🔴 La portada es una PANTALLA, no un estado escondido: tocar una fila
  // escribe `?tab=`, que en el celular empuja historial, así que el Atrás
  // devuelve esta lista. Nada se monta hasta que se toca algo.
  const enLaPortada = ASISTENCIA_PANTALLA_2026_09 && celular && !hayTab && visibles.length > 1;

  return (
    <>
      {/* El módulo iba en minúscula ("asistencia") y eso se veía: la barra
          sticky y el breadcrumb son ahora lo ÚNICO que nombra la pantalla, así
          que dicen el label real del módulo (`lib/modules.ts`: "Asistencia"). */}
      {/* 🔴 En la portada del celular el título grande «Asistencia» lo dibuja
          `PortadaCelular`; adentro de una pestaña no hay ninguno y lo pone el
          layout (24-sep-2026). */}
      <AppHeader module="Asistencia" tituloEnLaPantalla={enLaPortada} />
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Sin título grande: "Asistencia" ya lo dicen la barra sticky
            (celular) y el breadcrumb (escritorio). Queda sr-only para no dejar
            la página sin encabezado; el `mt-4` de las pestañas se fue con él
            para que no quede un hueco suelto bajo el `py-6`. */}
        <h1 className="sr-only">Asistencia</h1>

        {enLaPortada ? (
          <PortadaCelular
            pestanas={visibles}
            empresa={empresa}
            opciones={opciones}
            onEmpresa={elegirEmpresa}
            desde={periodo.desde}
            hasta={periodo.hasta}
            onAbrir={(k) => setTab(k as Tab)}
          />
        ) : (
        <>
        <div className="flex items-end gap-2 border-b border-gray-200">
          {/* El arrastre lateral vive SOLO en las pestañas: si el «?» quedara
              adentro, en el iPhone habría que arrastrar para encontrar la ayuda. */}
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {visibles.map(([k, label]) => (
              <button key={k} type="button" onClick={() => { setTab(k); setAyuda(false); }}
                className={`min-h-[44px] whitespace-nowrap px-3 text-sm transition ${
                  tab === k && !ayuda
                    ? "border-b-2 border-black font-medium text-gray-900"
                    : "text-gray-500 hover:text-gray-900"
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* La empresa, arriba de las pestañas y para TODAS: filtra lo que se
              mira en cada una y es el selector de la Planilla. */}
          <label className="mb-1 flex shrink-0 items-center gap-2">
            <span className="sr-only">Empresa</span>
            <select
              aria-label="Empresa"
              value={empresa}
              onChange={(e) => elegirEmpresa(e.target.value)}
              className="min-h-[44px] rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm"
            >
              {opciones.map((o) => (
                <option key={o.clave} value={o.clave}>{o.etiqueta}</option>
              ))}
            </select>
          </label>

          {/* Ayuda, no pestaña: discreto, redondo y con el nombre completo para
              quien navegue con lector de pantalla o se quede encima con el mouse. */}
          <button
            type="button"
            onClick={() => setAyuda((v) => !v)}
            aria-pressed={ayuda}
            aria-label="Cómo funciona"
            title="Cómo funciona"
            className={`mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-base transition active:scale-[0.97] ${
              ayuda
                ? "border-black bg-black text-white"
                : "border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-900"
            }`}
          >
            ?
          </button>
        </div>

        <div className="mt-5">
          {ayuda && (
            <div className="space-y-4">
              {/* El "Cómo funciona" DEL MEDIO se fue: el botón "?" que abre
                  esto ya lo dice, y el contenido arranca con "Cómo funciona la
                  marcación". Era la misma frase tres veces en la pantalla. */}
              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={() => setAyuda(false)}
                  className="min-h-[44px] rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]">
                  Cerrar
                </button>
              </div>
              <ComoFuncionaTab />
            </div>
          )}
          {/* 🔴 Con la ayuda abierta las pestañas se ESCONDEN, no se desarman:
              cerrar el «?» tiene que devolver la pantalla donde estaba. */}
          <div hidden={ayuda} className={ayuda ? "hidden" : undefined}>
            {monta("planilla") && (
              <div hidden={seEsconde("planilla", tab)} className={escondida("planilla")}>
                <PlanillaTab empresa={empresa} />
              </div>
            )}
            {monta("prestamos") && (
              <div hidden={seEsconde("prestamos", tab)} className={escondida("prestamos")}>
                <PrestamosTab empresa={empresa} />
              </div>
            )}
            {/* «Reporte» se llama «Asistencia» desde el 10-sep-2026; la clave
                vieja sigue montando la misma pantalla con el interruptor apagado.
                🔑 Las dos claves son UNA sola pestaña montada: nunca están las
                dos en `visibles`, así que no hay dos ReporteTab a la vez. */}
            {(monta("reporte") || monta("asistencia")) && (
              <div
                hidden={seEsconde("reporte", tab) && seEsconde("asistencia", tab)}
                className={seEsconde("reporte", tab) && seEsconde("asistencia", tab) ? "hidden" : undefined}
              >
                <ReporteTab empresa={empresa} />
              </div>
            )}
            {monta("justificaciones") && (
              <div hidden={seEsconde("justificaciones", tab)} className={escondida("justificaciones")}>
                <JustificacionesTab />
              </div>
            )}
            {monta("vacaciones") && (
              <div hidden={seEsconde("vacaciones", tab)} className={escondida("vacaciones")}>
                <VacacionesTab />
              </div>
            )}
            {monta("aprobaciones") && (
              <div hidden={seEsconde("aprobaciones", tab)} className={escondida("aprobaciones")}>
                <AprobacionesTab empresa={empresa} />
              </div>
            )}
            {/* 🔴 «COLABORADORES» ES LA MISMA PANTALLA, EN MODO LISTA. Daniel:
                *«te acepto la queja»* — «Configuración» se llama Personas; y
                desde el 10-sep-2026, *«no lo llames personas, sino colaboradores»*. No
                es un componente nuevo: es `ConfiguracionTab` con las filas
                llevando a la página de cada quien en vez de desplegarse, y
                con Horarios, Feriados y Reglas exactamente donde estaban. Un
                segundo componente sería una segunda lista de personas. */}
            {monta("colaboradores") && (
              <div hidden={seEsconde("colaboradores", tab)} className={escondida("colaboradores")}>
                <ConfiguracionTab personaEnElCentro empresa={empresa} />
              </div>
            )}
            {monta("configuracion") && (
              <div hidden={seEsconde("configuracion", tab)} className={escondida("configuracion")}>
                <ConfiguracionTab />
              </div>
            )}
          </div>
        </div>
        </>
        )}
      </div>
    </>
  );
}
