"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN — todo lo que hay que dejar puesto para que la planilla salga.
//
// Cuatro secciones, en el orden en que se llenan:
//   1. PERSONAS.  El reloj manda códigos numéricos (1, 5, 6, 7… hasta 53) con el
//      nombre en blanco. Acá el código 6 se vuelve una persona con sueldo,
//      jornada y EMPRESA. La empresa es lo que más pesa: Confecciones Boston,
//      Vistana y Fashion Wear comparten el mismo reloj, así que sin ese dato los
//      minutos de las tres salen en un solo montón y no hay planilla posible.
//   2. HORARIOS.  Hora de salida y almuerzo, persona por persona.
//   3. FERIADOS.  Los días que no cuentan como ausencia de nadie.
//   4. REGLAS.    Daniel: *"todos los calculos deben de ser configurables en caso
//      de que algo cambie"*. Todos los números del cálculo se editan acá.
//
// 🩸 HORARIOS Y FERIADOS ERAN PESTAÑAS DE PRIMER NIVEL Y NO LO MERECÍAN
// (6-ago-2026). Feriados se toca una vez al año —los 22 de Panamá ya están
// cargados— y Horarios cuando entra alguien; las dos pesaban lo mismo que la
// Planilla en la barra de arriba. Una pestaña se gana el lugar por lo que HACÉS
// ahí, no por la tabla que guarda. **No se quitó ni una función**: son las
// MISMAS pantallas (`HorariosTab`, `FeriadosTab`), montadas acá adentro.
//
// 🔑 Las secciones cargan sus datos RECIÉN al abrirse (no están montadas
// mientras están cerradas): abrir Configuración no dispara tres consultas.
//
// Los 38 códigos que ya marcan aparecen SIEMPRE, configurados o no, y los que
// faltan van primero: la pantalla tiene que mostrar el trabajo pendiente, no
// esconderlo detrás de una lista vacía.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import {
  EMPRESAS_ASISTENCIA,
  JORNADAS,
  etiquetaEmpresa,
  type ReglasAsistencia,
} from "@/lib/asistencia/config";
import { rataPorHoraCalculo } from "@/lib/asistencia/rata";
import {
  avisoPendientes,
  faltaEnPersona,
  fraseFalta,
} from "@/lib/asistencia/configuracion-avisos";
import HorariosTab from "./HorariosTab";
import FeriadosTab from "./FeriadosTab";

interface Persona {
  codigo: string;
  nombre: string | null;
  salarioMensual: number | null;
  jornadaSemanal: number;
  empresa: string | null;
  configurado: boolean;
  faltaSalario: boolean;
  marcaciones: number;
  ultimaMarca: string | null;
  rataHora: number | null;
  valorMinuto: number | null;
}

interface Resumen {
  total: number;
  sinConfigurar: number;
  sinSalario: number;
  conMarcaciones: number;
}

interface Datos {
  personas: Persona[];
  reglas: ReglasAsistencia;
  resumen: Resumen;
  faltaMigracion: boolean;
  avisoMigracion: string | null;
}

/** El formulario guarda TEXTO: hay que poder borrar un campo para reescribirlo.
 *  La conversión y el rango los decide el servidor, nunca esta pantalla. */
type FormReglas = Record<keyof ReglasAsistencia, string>;

/** Lo que se está editando de UNA persona. Un solo objeto, no cuatro estados
 *  sueltos: las píldoras guardan al tocarse y necesitan el borrador COMPLETO
 *  y ya mezclado, no el valor viejo de los otros tres campos. */
interface Borrador {
  nombre: string;
  salario: string;
  jornada: number;
  empresa: string;
}

const CAMPO =
  "min-h-[44px] w-full rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm";
const PILL_BASE =
  "min-h-[44px] rounded-md border px-3 text-sm transition active:scale-[0.97]";
const PILL_ON = "border-black bg-black text-white";
const PILL_OFF = "border-gray-200 text-gray-600 hover:border-gray-400";

/**
 * Las columnas del escritorio. Se declaran UNA vez y las usan el encabezado y
 * cada fila: si el encabezado y las filas tuvieran dos rejillas distintas, los
 * títulos dejarían de caer sobre su columna en cuanto alguien tocara una.
 *
 * ⚠️ La cadena va COMPLETA y con el prefijo `lg:` en cada clase, no armada con
 * plantillas: Tailwind purga leyendo el archivo como texto, así que una clase
 * que solo existe al ejecutar no llega al CSS. El corte es `lg` (1024) porque
 * el iPad de 834 no aguanta seis columnas — ahí van las tarjetas.
 */
const COLUMNAS =
  "lg:grid lg:grid-cols-[minmax(0,1fr)_9rem_5rem_6.5rem_6rem_5rem] lg:items-center lg:gap-x-3";

const money = (n: number | null, dec = 2) =>
  n === null
    ? "—"
    : `$${n.toLocaleString("es-PA", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;

function reglasAForm(r: ReglasAsistencia): FormReglas {
  return {
    toleranciaTardanzaMin: String(r.toleranciaTardanzaMin),
    extraMinimoMin: String(r.extraMinimoMin),
    almuerzoDefaultMin: String(r.almuerzoDefaultMin),
    recargoExtraDiurno: String(r.recargoExtraDiurno),
    recargoExtraNocturno: String(r.recargoExtraNocturno),
    horaCorteNocturno: r.horaCorteNocturno,
    recargoDomingoFeriado: String(r.recargoDomingoFeriado),
    divisor40: String(r.divisor40),
    divisor48: String(r.divisor48),
    seguroSocialPct: String(r.seguroSocialPct),
    seguroEducativoPct: String(r.seguroEducativoPct),
    excedenteHorasDia: String(r.excedenteHorasDia),
    recargoExcedenteNocturnaMixta: String(r.recargoExcedenteNocturnaMixta),
  };
}

/** La firma de un borrador. Sirve para no mandar dos veces el mismo PUT cuando
 *  el `blur` de un campo dispara justo después de que la píldora ya guardó. */
const firma = (b: Borrador) => `${b.nombre.trim()}|${b.salario.trim()}|${b.jornada}|${b.empresa}`;

export default function ConfiguracionTab() {
  const { toast } = useToast();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "faltan" | string>("todos");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [estadoFila, setEstadoFila] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [ultimaFirma, setUltimaFirma] = useState<string>("");

  // Qué secciones están abiertas. Personas arranca abierta: es la lista de
  // pendientes y lo primero que hay que terminar de llenar.
  const [seccion, setSeccion] = useState<Record<string, boolean>>({ personas: true });
  const alternar = (k: string) => setSeccion((s) => ({ ...s, [k]: !s[k] }));

  const [form, setForm] = useState<FormReglas | null>(null);
  const [guardandoReglas, setGuardandoReglas] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/asistencia/configuracion", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "No se pudo cargar");
      setDatos(d as Datos);
      setForm(reglasAForm(d.reglas));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setDatos(null);
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  function abrir(p: Persona) {
    if (abierta === p.codigo) {
      setAbierta(null);
      setBorrador(null);
      return;
    }
    const b: Borrador = {
      nombre: p.nombre ?? "",
      salario: p.salarioMensual === null ? "" : String(p.salarioMensual),
      jornada: p.jornadaSemanal,
      empresa: p.empresa ?? "",
    };
    setAbierta(p.codigo);
    setBorrador(b);
    setUltimaFirma(firma(b));
    setEstadoFila(null);
  }

  /**
   * Guarda EN CUANTO se cambia algo, como `HorariosTab`. Sin botón: un botón
   * que guarda lo que ya se guardó solo es una promesa de más.
   *
   * 🔑 Dos frenos, y los dos hacen falta:
   *  · No se manda nada mientras falte el nombre o la empresa — el servidor los
   *    exige y el PUT rebotaría con un 400 por cada tecla. En vez de eso se dice
   *    en la misma fila qué falta.
   *  · No se recarga la lista entera. El servidor la ordena con los pendientes
   *    PRIMERO, así que recargar movería de lugar la fila que se está editando
   *    justo al terminar de escribir el nombre. Se actualiza esa fila y nada más,
   *    con lo que DEVUELVE el servidor —no con lo que se tecleó—, así lo que se
   *    ve en pantalla es lo que quedó guardado.
   */
  const guardar = useCallback(
    async (codigo: string, b: Borrador) => {
      const completo = b.nombre.trim() !== "" && b.empresa !== "";
      if (!completo) {
        setEstadoFila(null);
        return;
      }
      // Nada cambió desde el último guardado bueno → no se manda nada. Es lo
      // que evita un PUT por cada `blur` de un campo que nadie tocó (y el
      // `blur` dispara SIEMPRE que se toca una píldora de al lado).
      if (firma(b) === ultimaFirma) return;

      setGuardando(true);
      setEstadoFila("guardando");
      try {
        const res = await fetch("/api/asistencia/configuracion", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            codigo,
            nombre: b.nombre,
            // Se manda el texto TAL CUAL: el servidor decide qué es un salario
            // válido. Convertir acá con Number() haría que un campo vacío viajara
            // como 0 y un 0 no puede entrar.
            salarioMensual: b.salario,
            jornadaSemanal: b.jornada,
            empresa: b.empresa,
          }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? "No se pudo guardar");

        // Se pinta lo que DEVUELVE el servidor —ya validado y redondeado—, no lo
        // que se tecleó: así lo que se ve es lo que quedó guardado. Si por lo que
        // sea no viniera la ficha de vuelta, se cae al borrador en vez de
        // reventar: una excepción acá tumbaría la pantalla entera.
        const eco = d.persona as
          | { nombre: string; salarioMensual: number | null; jornadaSemanal: number; empresa: string }
          | undefined;
        const salarioTexto = b.salario.trim().replace(",", ".");
        const salarioNum = Number(salarioTexto);
        const p = eco ?? {
          nombre: b.nombre.trim(),
          salarioMensual:
            salarioTexto !== "" && Number.isFinite(salarioNum) && salarioNum > 0 ? salarioNum : null,
          jornadaSemanal: b.jornada,
          empresa: b.empresa,
        };
        setDatos((prev) => {
          if (!prev) return prev;
          const personas = prev.personas.map((x) =>
            x.codigo !== codigo
              ? x
              : {
                  ...x,
                  nombre: p.nombre,
                  salarioMensual: p.salarioMensual,
                  jornadaSemanal: p.jornadaSemanal,
                  empresa: p.empresa,
                  configurado: true,
                  faltaSalario: p.salarioMensual === null,
                  // La MISMA función que usa la planilla para multiplicar.
                  rataHora: rataPorHoraCalculo(p.salarioMensual, p.jornadaSemanal, prev.reglas),
                },
          );
          return {
            ...prev,
            personas,
            resumen: {
              ...prev.resumen,
              sinConfigurar: personas.filter((x) => !x.configurado).length,
              sinSalario: personas.filter((x) => x.faltaSalario).length,
            },
          };
        });
        setUltimaFirma(firma(b));
        setEstadoFila("guardado");
      } catch (e) {
        setEstadoFila("error");
        toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
      } finally {
        setGuardando(false);
      }
    },
    [toast, ultimaFirma],
  );

  /** Cambia el borrador y guarda de una. Lo usan las píldoras (jornada, empresa),
   *  donde el cambio es un clic entero y no hay nada que esperar. */
  const cambiarYGuardar = (codigo: string, cambios: Partial<Borrador>) => {
    if (!borrador) return;
    const nuevo = { ...borrador, ...cambios };
    setBorrador(nuevo);
    void guardar(codigo, nuevo);
  };

  async function guardarReglas() {
    if (!form) return;
    setGuardandoReglas(true);
    try {
      const res = await fetch("/api/asistencia/configuracion/reglas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "No se pudo guardar");
      toast("Listo, las reglas quedaron guardadas", "success");
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
    } finally {
      setGuardandoReglas(false);
    }
  }

  const visibles = useMemo(() => {
    const lista = datos?.personas ?? [];
    if (filtro === "todos") return lista;
    if (filtro === "faltan") return lista.filter((p) => !p.configurado || p.faltaSalario);
    return lista.filter((p) => p.empresa === filtro);
  }, [datos, filtro]);

  // UN solo aviso, con el desglose adentro. Antes eran dos carteles ámbar
  // apilados que decían casi lo mismo y competían entre ellos.
  const aviso = useMemo(
    () => (datos ? avisoPendientes(datos.resumen) : null),
    [datos],
  );

  const set = (k: keyof ReglasAsistencia, v: string) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const pendientes = datos ? datos.resumen.sinConfigurar + datos.resumen.sinSalario : 0;

  return (
    <div className="space-y-3">
      {datos?.faltaMigracion && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900">
          <b>Falta un paso antes de poder guardar.</b>
          <p className="mt-1">{datos.avisoMigracion}</p>
          <p className="mt-1 text-amber-800">
            Mientras tanto puedes ver la lista de gente que marca, pero lo que escribas
            no se va a guardar.
          </p>
        </div>
      )}

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {datos === null && !error && (
        <p className="py-8 text-center text-sm text-gray-400">Cargando…</p>
      )}

      {datos && (
        <>
          {/* ── 1. PERSONAS ──────────────────────────────────────────────── */}
          <Seccion
            titulo="Personas"
            resumen={
              pendientes > 0
                ? `${datos.resumen.total} en la lista · ${pendientes} sin terminar`
                : `${datos.resumen.total} en la lista · todas listas`
            }
            alerta={pendientes > 0}
            abierta={!!seccion.personas}
            onToggle={() => alternar("personas")}
          >
            <p className="text-sm text-gray-500">
              El reloj solo manda un número por persona. Acá le pones nombre, sueldo y
              <b> a qué empresa pertenece</b> — eso último es lo que separa la planilla de
              Boston, la de Vistana y la de Fashion Wear, que comparten el mismo reloj.
              <b> Se guarda solo</b> apenas cambias algo.
            </p>

            {aviso && (
              <div className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                <b>{aviso.titulo}</b>
                <ul className="mt-1 space-y-0.5 text-amber-800">
                  {aviso.detalle.map((d) => (
                    <li key={d}>· {d}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setFiltro("todos")}
                className={`${PILL_BASE} ${filtro === "todos" ? PILL_ON : PILL_OFF}`}>
                Todos ({datos.resumen.total})
              </button>
              <button type="button" onClick={() => setFiltro("faltan")}
                className={`${PILL_BASE} ${filtro === "faltan" ? PILL_ON : PILL_OFF}`}>
                Falta configurar ({pendientes})
              </button>
              {EMPRESAS_ASISTENCIA.map((e) => (
                <button key={e} type="button" onClick={() => setFiltro(e)}
                  className={`${PILL_BASE} ${filtro === e ? PILL_ON : PILL_OFF}`}>
                  {etiquetaEmpresa(e)} ({datos.personas.filter((p) => p.empresa === e).length})
                </button>
              ))}
            </div>

            {visibles.length === 0 && (
              <p className="py-10 text-center text-sm text-gray-500">
                No hay nadie en este filtro.
              </p>
            )}

            {visibles.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                {/* Encabezado SOLO en escritorio: con 38 filas, sin títulos de
                    columna no se sabe qué es cada número. En celular cada dato
                    lleva su propia etiqueta dentro de la tarjeta. */}
                <div
                  className={`hidden border-b border-gray-200 px-3 py-2 text-[10.5px] uppercase tracking-wide text-gray-400 ${COLUMNAS}`}
                >
                  <span>Persona</span>
                  <span>Empresa</span>
                  <span className="text-right">Jornada</span>
                  <span className="text-right">Salario</span>
                  <span className="text-right">Rata / hora</span>
                  <span className="text-right">Estado</span>
                </div>

                {visibles.map((p) => {
                  const falta = faltaEnPersona(p);
                  const abiertaEsta = abierta === p.codigo;
                  return (
                    <div key={p.codigo} className="border-b border-gray-100 last:border-0">
                      <button
                        type="button"
                        onClick={() => abrir(p)}
                        aria-expanded={abiertaEsta}
                        className={`w-full px-3 py-2.5 text-left transition hover:bg-gray-50 ${
                          abiertaEsta ? "bg-gray-50" : ""
                        }`}
                      >
                        {/* ── ESCRITORIO: columnas alineadas ── */}
                        <span className={`hidden ${COLUMNAS}`}>
                          <span className="min-w-0">
                            <NombrePersona p={p} />
                          </span>
                          <span className="truncate text-[13px] text-gray-600">
                            {p.empresa ? etiquetaEmpresa(p.empresa) : "—"}
                          </span>
                          <span className="text-right text-[13px] tabular-nums text-gray-600">
                            {p.jornadaSemanal} h
                          </span>
                          <span className="text-right text-[13px] tabular-nums text-gray-600">
                            {money(p.salarioMensual)}
                          </span>
                          {/* 🔴 DOS decimales, no cuatro: es el número EXACTO con
                              el que multiplica la planilla. Ver lib/asistencia/rata.ts */}
                          <span className="text-right text-[13px] tabular-nums text-gray-600">
                            {money(p.rataHora)}
                          </span>
                          <span className="text-right">
                            <Indicador falta={falta.length} />
                          </span>
                        </span>

                        {/* ── CELULAR e iPAD: tarjeta (patrón PanelCxcMobile) ── */}
                        <span className="block lg:hidden">
                          <span className="flex items-start justify-between gap-3">
                            <NombrePersona p={p} />
                            <Indicador falta={falta.length} />
                          </span>
                          <span className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                            <Dato etiqueta="Empresa" valor={p.empresa ? etiquetaEmpresa(p.empresa) : "—"} />
                            <Dato etiqueta="Jornada" valor={`${p.jornadaSemanal} h/semana`} numero />
                            <Dato etiqueta="Salario" valor={money(p.salarioMensual)} numero />
                            <Dato etiqueta="Rata / hora" valor={money(p.rataHora)} numero />
                          </span>
                        </span>
                      </button>

                      {abiertaEsta && borrador && (
                        <div className="border-t border-gray-100 bg-gray-50 px-3 py-3">
                          {falta.length > 0 && (
                            <p className="mb-3 text-[12px] text-amber-800">
                              Falta {fraseFalta(falta)}.
                            </p>
                          )}

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
                                Nombre
                              </label>
                              <input
                                type="text"
                                value={borrador.nombre}
                                onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
                                // Se guarda al SALIR del campo, no en cada tecla:
                                // un PUT por letra sería un PUT por letra.
                                onBlur={() => void guardar(p.codigo, borrador)}
                                placeholder="Ángela García"
                                className={CAMPO}
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
                                Salario mensual
                              </label>
                              <input
                                type="text" inputMode="decimal"
                                value={borrador.salario}
                                onChange={(e) => setBorrador({ ...borrador, salario: e.target.value })}
                                onBlur={() => void guardar(p.codigo, borrador)}
                                placeholder="850.00"
                                className={`${CAMPO} tabular-nums`}
                              />
                              <p className="mt-1 text-[11px] text-gray-400">
                                Déjalo vacío si todavía no lo sabes.
                              </p>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
                                Jornada por semana
                              </label>
                              <div className="flex gap-2">
                                {JORNADAS.map((j) => (
                                  <button key={j} type="button"
                                    onClick={() => cambiarYGuardar(p.codigo, { jornada: j })}
                                    className={`${PILL_BASE} tabular-nums ${borrador.jornada === j ? PILL_ON : PILL_OFF}`}>
                                    {j} horas
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
                                Empresa
                              </label>
                              <div className="flex flex-wrap gap-2">
                                {EMPRESAS_ASISTENCIA.map((e) => (
                                  <button key={e} type="button"
                                    onClick={() => cambiarYGuardar(p.codigo, { empresa: e })}
                                    className={`${PILL_BASE} ${borrador.empresa === e ? PILL_ON : PILL_OFF}`}>
                                    {etiquetaEmpresa(e)}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <button type="button" onClick={() => { setAbierta(null); setBorrador(null); }}
                              className="min-h-[44px] rounded-md border border-gray-300 px-4 text-sm text-gray-700 transition hover:border-black active:scale-[0.97]">
                              Cerrar
                            </button>
                            {/* El estado del guardado automático, dicho en la
                                misma fila. Sin esto, "se guarda solo" es un acto
                                de fe: no hay botón que confirme nada. */}
                            <span className="text-[12px]">
                              {estadoFila === "guardando" && <span className="text-gray-400">Guardando…</span>}
                              {estadoFila === "guardado" && <span className="text-emerald-700">Guardado</span>}
                              {estadoFila === "error" && (
                                <button type="button" onClick={() => void guardar(p.codigo, borrador)}
                                  disabled={guardando} className="text-red-700 underline">
                                  No se pudo guardar — reintentar
                                </button>
                              )}
                              {estadoFila === null && (borrador.nombre.trim() === "" || borrador.empresa === "") && (
                                <span className="text-amber-700">
                                  Apenas pongas el nombre y la empresa, se guarda solo.
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Seccion>

          {/* ── 2. HORARIOS ──────────────────────────────────────────────── */}
          <Seccion
            titulo="Horarios"
            resumen="Hora de salida y almuerzo, persona por persona"
            abierta={!!seccion.horarios}
            onToggle={() => alternar("horarios")}
          >
            <HorariosTab />
          </Seccion>

          {/* ── 3. FERIADOS ──────────────────────────────────────────────── */}
          <Seccion
            titulo="Feriados y cierres"
            resumen="Los días que no cuentan como ausencia de nadie"
            abierta={!!seccion.feriados}
            onToggle={() => alternar("feriados")}
          >
            <FeriadosTab />
          </Seccion>

          {/* ── 4. REGLAS ────────────────────────────────────────────────── */}
          <Seccion
            titulo="Reglas del cálculo"
            resumen="Tolerancias, recargos, divisores y descuentos de ley"
            abierta={!!seccion.reglas}
            onToggle={() => alternar("reglas")}
          >
            {form && (
              <>
                <p className="text-sm text-gray-500">
                  Todos los números con los que se calcula. Si la ley o un acuerdo cambia,
                  se cambia acá y el reporte lo usa de inmediato — no hay que tocar el sistema.
                </p>

                <Bloque titulo="Tardanzas, almuerzo y horas extra">
                  <Campo label="Tolerancia de tardanza" ayuda="Minutos de gracia a la entrada. Pasados, la tardanza se cuenta desde las 8:00."
                    sufijo="minutos" valor={form.toleranciaTardanzaMin}
                    onChange={(v) => set("toleranciaTardanzaMin", v)} />
                  <Campo label="Mínimo para contar hora extra" ayuda="Quedarse menos de esto no cuenta como extra."
                    sufijo="minutos" valor={form.extraMinimoMin}
                    onChange={(v) => set("extraMinimoMin", v)} />
                  <Campo label="Almuerzo por defecto" ayuda="Se usa para quien no tenga uno propio en Horarios."
                    sufijo="minutos" valor={form.almuerzoDefaultMin}
                    onChange={(v) => set("almuerzoDefaultMin", v)} />
                </Bloque>

                <Bloque titulo="Recargos">
                  <Campo label="Hora extra de día" ayuda="Se escribe como factor: 1.25 es la hora y cuarto."
                    valor={form.recargoExtraDiurno} onChange={(v) => set("recargoExtraDiurno", v)} />
                  <Campo label="Hora extra de noche" ayuda="Aplica pasada la hora de corte de abajo."
                    valor={form.recargoExtraNocturno} onChange={(v) => set("recargoExtraNocturno", v)} />
                  <Campo label="Hora de corte de la tarde"
                    ayuda="Hasta esta hora la extra va al recargo de día; desde el minuto siguiente al de noche. Es la misma frontera que marca la jornada nocturna."
                    valor={form.horaCorteNocturno} onChange={(v) => set("horaCorteNocturno", v)} />
                  <Campo label="Domingos y feriados" ayuda="También es un factor."
                    valor={form.recargoDomingoFeriado} onChange={(v) => set("recargoDomingoFeriado", v)} />
                </Bloque>

                {/* 🩸 ANTES DECÍA "Divisores" Y LA CONTABLE NO LO ENTENDIÓ. Revisó el
                    cuadro entero, validó todo y se trabó justo acá: *"no sé a qué se
                    refiere eso de divisores"*. Ella es una de las tres personas que
                    usa esta pantalla (contabilidad tiene el módulo), así que la
                    etiqueta estaba mal, no ella. Y la lógica ya la tiene —dijo *"la
                    rata de hora depende de la cantidad de horas laborables a la
                    semana"*—, solo faltaba decirlo en su idioma.

                    ⚠️ El nombre TÉCNICO sigue siendo `divisor40` / `divisor48`, en el
                    código y en las columnas `divisor_40` / `divisor_48` de la base.
                    Se deja a propósito: renombrar la columna pediría otra migración a
                    mano y no cambiaría nada de lo que la contable lee. Lo que importa
                    es la etiqueta. */}
                <Bloque
                  titulo="Horas que se trabajan al mes"
                  ayuda="El salario mensual se divide entre estas horas para sacar la rata por hora."
                >
                  <Campo label="40 horas por semana" ayuda="Total de horas al mes de quien trabaja 40 horas por semana."
                    sufijo="al mes" valor={form.divisor40} onChange={(v) => set("divisor40", v)} />
                  <Campo label="48 horas por semana" ayuda="Total de horas al mes de quien trabaja 48 horas por semana."
                    sufijo="al mes" valor={form.divisor48} onChange={(v) => set("divisor48", v)} />
                </Bloque>

                <Bloque titulo="Descuentos de ley">
                  <Campo label="Seguro social" ayuda="En por ciento." sufijo="%"
                    valor={form.seguroSocialPct} onChange={(v) => set("seguroSocialPct", v)} />
                  <Campo label="Seguro educativo" ayuda="En por ciento." sufijo="%"
                    valor={form.seguroEducativoPct} onChange={(v) => set("seguroEducativoPct", v)} />
                </Bloque>

                <Bloque
                  titulo="Excedente en jornada nocturna o mixta"
                  nota="Se guarda, pero TODAVÍA NO SE USA para calcular nada. Aplica a partir de la cuarta hora extra del día y solo pasada la hora de corte de arriba — las dos condiciones a la vez. La hora es la MISMA de arriba, por eso no se pide otra vez. Ojo: no es lo mismo que la columna &quot;Exedente de 9 horas&quot; del Excel viejo."
                >
                  <Campo label="Desde cuántas horas extra al día" ayuda="3 quiere decir que aplica desde la cuarta hora extra."
                    sufijo="horas" valor={form.excedenteHorasDia}
                    onChange={(v) => set("excedenteHorasDia", v)} />
                  <Campo label="Recargo del excedente" ayuda="Factor confirmado por la contable: 2.625, que es 1.5 × 1.75."
                    valor={form.recargoExcedenteNocturnaMixta}
                    onChange={(v) => set("recargoExcedenteNocturnaMixta", v)} />
                </Bloque>

                {/* ⛔ Se dice en la pantalla para que nadie lo pida como campo: son
                    la FORMA del cálculo, no números sueltos. Ver `config.ts`. */}
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <h3 className="text-sm font-medium text-gray-900">Esto no se cambia desde acá</h3>
                  <ul className="mt-1 space-y-1 text-[12px] leading-relaxed text-gray-600">
                    <li>· La ausencia se descuenta como horas × valor de la hora.</li>
                    <li>· La quincena va del 1 al 15 y del 16 al 30.</li>
                    <li>· El día 31 no se paga, pero sí se descuenta si se falta.</li>
                  </ul>
                  <p className="mt-1.5 text-[12px] text-gray-500">
                    No son números: es la forma del cálculo. Si alguna vez cambia, se cambia
                    en el sistema — así nadie rompe la planilla sin querer.
                  </p>
                </div>

                <button type="button" onClick={() => void guardarReglas()} disabled={guardandoReglas}
                  className="min-h-[44px] rounded-md bg-black px-4 text-sm text-white transition active:scale-[0.97] disabled:opacity-50">
                  {guardandoReglas ? "Guardando…" : "Guardar las reglas"}
                </button>
              </>
            )}
          </Seccion>
        </>
      )}
    </div>
  );
}

/**
 * Una sección de Configuración. Cerrada muestra el título y una línea de
 * resumen; abierta, la pantalla entera.
 *
 * 🔑 El contenido NO se monta mientras está cerrada. Horarios y Feriados
 * consultan al servidor al montarse: dejarlos montados haría 3 consultas cada
 * vez que alguien entra a Configuración, aunque venga solo a poner un salario.
 */
function Seccion({
  titulo, resumen, alerta, abierta, onToggle, children,
}: {
  titulo: string;
  resumen: string;
  alerta?: boolean;
  abierta: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <button type="button" onClick={onToggle} aria-expanded={abierta}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-gray-50">
        <span className="min-w-0">
          <span className="block text-base font-semibold text-gray-900">{titulo}</span>
          <span className={`block text-[12px] ${alerta ? "text-amber-700" : "text-gray-500"}`}>
            {resumen}
          </span>
        </span>
        <span className={`shrink-0 text-gray-400 transition ${abierta ? "rotate-180" : ""}`}>▾</span>
      </button>
      {abierta && (
        <div className="space-y-3 border-t border-gray-100 px-4 py-4">{children}</div>
      )}
    </section>
  );
}

/** El nombre, con el código al lado. Sin nombre se muestra EL CÓDIGO —el dato
 *  que sí existe y el que está pegado al reloj—, nunca «Sin nombre»: dos filas
 *  seguidas se veían idénticas. */
function NombrePersona({ p }: { p: { nombre: string | null; codigo: string; marcaciones: number; ultimaMarca: string | null } }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate text-sm text-gray-900">
        {p.nombre ?? `Código ${p.codigo}`}
        {p.nombre && <span className="ml-1.5 text-xs text-gray-400">código {p.codigo}</span>}
      </span>
      <span className="block truncate text-[11px] text-gray-400">
        {p.marcaciones} marcaciones{p.ultimaMarca ? ` · última ${p.ultimaMarca}` : ""}
      </span>
    </span>
  );
}

/** UN indicador por fila, no tres. El detalle de qué falta se lee al abrirla. */
function Indicador({ falta }: { falta: number }) {
  return falta > 0 ? (
    <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[12px] font-semibold text-amber-800">
      Falta
    </span>
  ) : (
    <span className="text-[12px] text-gray-300">Listo</span>
  );
}

/** Un par etiqueta/valor de la tarjeta de celular. En la tabla del escritorio la
 *  etiqueta vive en el encabezado de la columna y acá no haría falta. */
function Dato({ etiqueta, valor, numero }: { etiqueta: string; valor: string; numero?: boolean }) {
  return (
    <span className="block">
      <span className="block text-[10.5px] uppercase tracking-wide text-gray-400">{etiqueta}</span>
      <span className={`block text-gray-700 ${numero ? "tabular-nums" : ""}`}>{valor}</span>
    </span>
  );
}

function Bloque({
  titulo, ayuda, nota, children,
}: { titulo: string; ayuda?: string; nota?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-medium text-gray-900">{titulo}</h3>
      {/* `ayuda` explica; `nota` advierte. Van en colores distintos a propósito:
          si todo fuera ámbar, nada llamaría la atención. */}
      {ayuda && <p className="mt-1 text-[12px] leading-relaxed text-gray-500">{ayuda}</p>}
      {nota && <p className="mt-1 text-[12px] text-amber-800">{nota}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Campo({
  label, ayuda, sufijo, valor, onChange,
}: {
  label: string;
  ayuda: string;
  sufijo?: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">{label}</label>
      <div className="flex items-center gap-2">
        <input type="text" inputMode="decimal" value={valor}
          onChange={(e) => onChange(e.target.value)} className={`${CAMPO} tabular-nums`} />
        {sufijo && <span className="shrink-0 text-[12px] text-gray-400">{sufijo}</span>}
      </div>
      <p className="mt-1 text-[11px] text-gray-400">{ayuda}</p>
    </div>
  );
}
