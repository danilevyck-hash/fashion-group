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
import { Ayuda } from "@/components/shared/Ayuda";
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
import { hoyPanama } from "@/lib/fecha-panama";
import {
  fraseBaja,
  marcoDespuesDeLaBaja,
  MOTIVOS_SALIDA,
  OPCION_MOTIVO,
  tieneBaja,
  type MotivoSalida,
} from "@/lib/asistencia/vigencia";
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
  // ── Altas y bajas ──────────────────────────────────────────────────────────
  fechaIngreso: string | null;
  fechaSalida: string | null;
  motivoSalida: MotivoSalida | null;
  /** Derivado de la fecha en el servidor, nunca un campo aparte. */
  activo: boolean;
  /** «Renunció el 12 de agosto de 2026». `null` si sigue trabajando. */
  baja: string | null;
  marcoDespuesDeLaBaja: boolean;
}

interface Resumen {
  total: number;
  sinConfigurar: number;
  sinSalario: number;
  conMarcaciones: number;
  bajas: number;
}

interface Datos {
  personas: Persona[];
  reglas: ReglasAsistencia;
  resumen: Resumen;
  faltaMigracion: boolean;
  avisoMigracion: string | null;
  avisoMigracionBajas: string | null;
  puedeDarDeBaja: boolean;
  avisoBajas: { titulo: string; detalle: string[] } | null;
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
  /** YYYY-MM-DD o "". Se guarda y NO prorratea el salario: esa regla no está
   *  definida y hay que preguntarla antes de inventar medio sueldo. */
  fechaIngreso: string;
  /** YYYY-MM-DD o "". Vacía = trabaja acá. */
  fechaSalida: string;
  /** Obligatorio si hay fecha de salida: los dos, o ninguno. */
  motivoSalida: string;
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
const firma = (b: Borrador) =>
  `${b.nombre.trim()}|${b.salario.trim()}|${b.jornada}|${b.empresa}`
  + `|${b.fechaIngreso}|${b.fechaSalida}|${b.motivoSalida}`;

/**
 * ¿La baja está completa? La fecha y el motivo VIAJAN JUNTOS: una baja sin
 * motivo es la mitad del dato que la liquidación va a necesitar, y el servidor
 * la rechaza. Se frena acá para no mandar un PUT que ya se sabe que rebota.
 */
const bajaCompleta = (b: Borrador) =>
  (b.fechaSalida.trim() === "") === (b.motivoSalida.trim() === "");

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
      fechaIngreso: p.fechaIngreso ?? "",
      fechaSalida: p.fechaSalida ?? "",
      motivoSalida: p.motivoSalida ?? "",
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
      const completo = b.nombre.trim() !== "" && b.empresa !== "" && bajaCompleta(b);
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
            // Vacío viaja como vacío: el servidor lo convierte en `null` y eso
            // es exactamente "reactivar". Mandar `null` desde acá sería la misma
            // decisión tomada dos veces, en dos lugares.
            fechaIngreso: b.fechaIngreso,
            fechaSalida: b.fechaSalida,
            motivoSalida: b.motivoSalida,
          }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? "No se pudo guardar");

        // Se pinta lo que DEVUELVE el servidor —ya validado y redondeado—, no lo
        // que se tecleó: así lo que se ve es lo que quedó guardado. Si por lo que
        // sea no viniera la ficha de vuelta, se cae al borrador en vez de
        // reventar: una excepción acá tumbaría la pantalla entera.
        const eco = d.persona as
          | {
              nombre: string;
              salarioMensual: number | null;
              jornadaSemanal: number;
              empresa: string;
              fechaIngreso?: string | null;
              fechaSalida?: string | null;
              motivoSalida?: MotivoSalida | null;
            }
          | undefined;
        const salarioTexto = b.salario.trim().replace(",", ".");
        const salarioNum = Number(salarioTexto);
        const p = eco ?? {
          nombre: b.nombre.trim(),
          salarioMensual:
            salarioTexto !== "" && Number.isFinite(salarioNum) && salarioNum > 0 ? salarioNum : null,
          jornadaSemanal: b.jornada,
          empresa: b.empresa,
          fechaIngreso: b.fechaIngreso || null,
          fechaSalida: b.fechaSalida || null,
          motivoSalida: (b.motivoSalida || null) as MotivoSalida | null,
        };
        // La vigencia que quedó guardada, ya normalizada por el servidor.
        const vig = {
          fechaIngreso: p.fechaIngreso ?? null,
          fechaSalida: p.fechaSalida ?? null,
          motivoSalida: p.motivoSalida ?? null,
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
                  ...vig,
                  // 🔑 `activo` y la frase se DERIVAN de la fecha con las mismas
                  // funciones que usa el servidor: dos redacciones distintas para
                  // el mismo hecho es la forma de que se contradigan.
                  activo: !tieneBaja(vig),
                  baja: fraseBaja(vig, hoyPanama()),
                  marcoDespuesDeLaBaja: marcoDespuesDeLaBaja(vig, x.ultimaMarca),
                },
          );
          return {
            ...prev,
            personas,
            // 🔑 Todas las cuentas van sobre los ACTIVOS. Quien ya no trabaja
            // acá no es trabajo pendiente de nadie; contarlo inflaría para
            // siempre el número que la contable usa para saber cuánto le falta.
            resumen: {
              ...prev.resumen,
              total: personas.filter((x) => x.activo).length,
              bajas: personas.filter((x) => !x.activo).length,
              sinConfigurar: personas.filter((x) => x.activo && !x.configurado).length,
              sinSalario: personas.filter((x) => x.activo && x.faltaSalario).length,
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

  /**
   * DAR DE BAJA Y REACTIVAR.
   *
   * 🩸 ACÁ NO SE GUARDA SOLO, Y ES A PROPÓSITO. Todo lo demás de esta pantalla
   * guarda al tocarse porque corregir un salario es corregir un dato. Dar de
   * baja NO es un dato: es sacar a una persona de todas las planillas que
   * vienen. Una fecha elegida a medias no puede disparar eso, así que hay un
   * botón que dice exactamente lo que va a pasar.
   *
   * Manda la ficha COMPLETA (nombre, salario, jornada, empresa) porque el PUT
   * es un upsert de la fila entera: mandar solo la fecha borraría lo demás.
   */
  const guardarBaja = useCallback(
    async (p: Persona, fechaSalida: string, motivoSalida: string) => {
      setGuardando(true);
      try {
        const res = await fetch("/api/asistencia/configuracion", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            codigo: p.codigo,
            nombre: p.nombre ?? "",
            salarioMensual: p.salarioMensual === null ? "" : String(p.salarioMensual),
            jornadaSemanal: p.jornadaSemanal,
            empresa: p.empresa ?? "",
            fechaIngreso: p.fechaIngreso ?? "",
            fechaSalida,
            motivoSalida,
          }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? "No se pudo guardar");

        const vig = {
          fechaIngreso: p.fechaIngreso ?? null,
          fechaSalida: fechaSalida || null,
          motivoSalida: (motivoSalida || null) as MotivoSalida | null,
        };
        setDatos((prev) => {
          if (!prev) return prev;
          const personas = prev.personas.map((x) =>
            x.codigo !== p.codigo
              ? x
              : {
                  ...x,
                  ...vig,
                  activo: !tieneBaja(vig),
                  baja: fraseBaja(vig, hoyPanama()),
                  marcoDespuesDeLaBaja: marcoDespuesDeLaBaja(vig, x.ultimaMarca),
                },
          );
          return {
            ...prev,
            personas,
            resumen: {
              ...prev.resumen,
              total: personas.filter((x) => x.activo).length,
              bajas: personas.filter((x) => !x.activo).length,
              sinConfigurar: personas.filter((x) => x.activo && !x.configurado).length,
              sinSalario: personas.filter((x) => x.activo && x.faltaSalario).length,
            },
          };
        });
        // La persona cambia de lista, así que la fila abierta ya no está donde
        // estaba: se cierra en vez de dejar un formulario huérfano.
        setAbierta(null);
        setBorrador(null);
        const quien = p.nombre ?? `el código ${p.codigo}`;
        toast(
          fechaSalida
            ? `Listo. ${quien} no sale en las quincenas posteriores al ${fechaSalida}; las anteriores quedan igual.`
            : `Listo. ${quien} vuelve a salir en la planilla.`,
          "success",
        );
      } catch (e) {
        toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
      } finally {
        setGuardando(false);
      }
    },
    [toast],
  );

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

  /**
   * 🩸 LAS BAJAS NO SE MEZCLAN CON LOS ACTIVOS. Una lista donde conviven los que
   * trabajan acá y los que se fueron obliga a leer fila por fila para saber a
   * quién hay que configurarle algo — y la ficha de quien se fue está completa,
   * así que se ve idéntica a la de quien está. Van en su propio bloque, abajo.
   */
  const activos = useMemo(() => (datos?.personas ?? []).filter((p) => p.activo), [datos]);
  const bajas = useMemo(() => (datos?.personas ?? []).filter((p) => !p.activo), [datos]);

  const visibles = useMemo(() => {
    if (filtro === "todos") return activos;
    if (filtro === "faltan") return activos.filter((p) => !p.configurado || p.faltaSalario);
    return activos.filter((p) => p.empresa === filtro);
  }, [activos, filtro]);

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
            {/* Cómo se llena la lista se aprende una vez: al ⓘ. Lo que sí pide
                acción —cuántas fichas faltan, quién sigue marcando después de
                irse— se queda en pantalla, abajo. */}
            <div className="-ml-2 -mt-1">
              <Ayuda titulo="Cómo se llena esta lista" etiqueta="Cómo se llena">
                <p>
                  El reloj solo manda un número por persona. Acá le pones nombre, sueldo y
                  <b> a qué empresa pertenece</b> — eso último es lo que separa la planilla de
                  Boston, la de Vistana y la de Fashion Wear, que comparten el mismo reloj.
                  <b> Se guarda solo</b> apenas cambias algo.
                </p>
              </Ayuda>
            </div>

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

            {/* 🩸 EL AVISO QUE NO SE ESCONDE: dada de baja y sigue marcando. Va
                en ROJO y arriba de la lista porque las dos explicaciones posibles
                —volvió, o alguien usa su huella— piden que alguien haga algo. */}
            {datos.avisoBajas && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900">
                <b>{datos.avisoBajas.titulo}</b>
                <ul className="mt-1 space-y-0.5 text-red-800">
                  {datos.avisoBajas.detalle.map((d) => (
                    <li key={d}>· {d}</li>
                  ))}
                </ul>
              </div>
            )}

            {datos.avisoMigracionBajas && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                {datos.avisoMigracionBajas}
              </p>
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
                  {/* Cuenta ACTIVOS: la planilla de Boston no incluye a los que
                      se fueron, así que la píldora tampoco puede contarlos. */}
                  {etiquetaEmpresa(e)} ({activos.filter((p) => p.empresa === e).length})
                </button>
              ))}
            </div>

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
                              <Etiqueta texto="Nombre" />
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
                              <Etiqueta texto="Salario mensual" />
                              {/* «Déjalo vacío si todavía no lo sabes» vive en el
                                  propio campo: es una instrucción de un campo
                                  obvio, no algo que haya que leer aparte. */}
                              <input
                                type="text" inputMode="decimal"
                                value={borrador.salario}
                                onChange={(e) => setBorrador({ ...borrador, salario: e.target.value })}
                                onBlur={() => void guardar(p.codigo, borrador)}
                                placeholder="850.00 — vacío si no lo sabes"
                                className={`${CAMPO} tabular-nums`}
                              />
                            </div>
                            <div>
                              <Etiqueta texto="Jornada por semana" />
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
                              <Etiqueta texto="Empresa" />
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
                            <div>
                              {/* ⚠️ Se GUARDA y no reparte el salario. La regla de
                                  proporción de quien entra a mitad de quincena no
                                  está definida: inventarla sería inventar plata. Eso
                                  se aprende una vez → ⓘ. */}
                              <Etiqueta
                                texto="Empezó a trabajar"
                                ayuda="Opcional. El sueldo de la quincena no se reparte por días."
                              />
                              <input
                                type="date"
                                value={borrador.fechaIngreso}
                                onChange={(e) =>
                                  setBorrador({ ...borrador, fechaIngreso: e.target.value })
                                }
                                onBlur={() => void guardar(p.codigo, borrador)}
                                className={`${CAMPO} tabular-nums`}
                              />
                            </div>
                          </div>

                          <BloqueBaja
                            persona={p}
                            puede={datos.puedeDarDeBaja}
                            ocupado={guardando}
                            onGuardar={(fecha, motivo) => void guardarBaja(p, fecha, motivo)}
                          />

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

            {/* ── LOS QUE YA NO TRABAJAN ACÁ ────────────────────────────────
                Aparte de los activos y al final: no son trabajo pendiente. No
                se borra a nadie —la ficha es lo que hace que una quincena vieja
                se pueda reimprimir— y se puede reactivar de un clic. */}
            {bajas.length > 0 && (
              <details className="rounded-lg border border-gray-200 bg-gray-50">
                <summary className="flex min-h-[44px] cursor-pointer items-center px-3 py-2.5 text-sm text-gray-700">
                  Ya no trabajan acá ({bajas.length})
                </summary>
                <div className="border-t border-gray-200 bg-white">
                  <div className="px-1 py-0.5">
                    <Ayuda titulo="Qué pasa con quien ya no trabaja acá" etiqueta="Qué pasa con sus quincenas">
                      <ExplicacionBaja />
                    </Ayuda>
                  </div>
                  {bajas.map((p) => (
                    <div
                      key={p.codigo}
                      className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-3 py-2.5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-gray-900">
                          {p.nombre ?? `Código ${p.codigo}`}
                          <span className="ml-1.5 text-xs text-gray-400">código {p.codigo}</span>
                        </span>
                        <span className="block text-[12px] text-gray-500">
                          {p.baja}
                          {p.empresa ? ` · ${etiquetaEmpresa(p.empresa)}` : ""}
                        </span>
                        {p.marcoDespuesDeLaBaja && (
                          <span className="mt-0.5 block text-[12px] text-red-700">
                            Marcó en el reloj después de esa fecha (última {p.ultimaMarca}).
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        disabled={guardando || !datos.puedeDarDeBaja}
                        onClick={() => void guardarBaja(p, "", "")}
                        className={`${PILL_BASE} ${PILL_OFF} disabled:opacity-50`}
                      >
                        Volvió a trabajar acá
                      </button>
                    </div>
                  ))}
                </div>
              </details>
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
                <div className="-ml-2 -mt-1">
                  <Ayuda titulo="Para qué sirven estos números" etiqueta="Para qué sirven">
                    <p>
                      Todos los números con los que se calcula. Si la ley o un acuerdo cambia,
                      se cambia acá y el reporte lo usa de inmediato — no hay que tocar el sistema.
                    </p>
                  </Ayuda>
                </div>

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
                  {/* Sin ayuda propia: el ⓘ de «Hora extra de día», dos campos
                      arriba, ya explica qué es un factor. Repetirlo no agrega. */}
                  <Campo label="Domingos y feriados"
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
                  {/* Sin ayuda: el sufijo «%» del campo ya dice lo mismo. */}
                  <Campo label="Seguro social" sufijo="%"
                    valor={form.seguroSocialPct} onChange={(v) => set("seguroSocialPct", v)} />
                  <Campo label="Seguro educativo" sufijo="%"
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
                  <div className="flex flex-wrap items-center gap-1">
                    <h3 className="text-sm font-medium text-gray-900">Esto no se cambia desde acá</h3>
                    {/* El POR QUÉ no son campos se lee una vez. Las tres reglas
                        siguen a la vista: son las que hay que conocer para
                        cuadrar contra el Excel de la contable. */}
                    <Ayuda titulo="Por qué no se pueden cambiar" className="-my-3">
                      <p>
                        No son números: es la forma del cálculo. Si alguna vez cambia, se cambia
                        en el sistema — así nadie rompe la planilla sin querer.
                      </p>
                    </Ayuda>
                  </div>
                  <ul className="mt-1 space-y-1 text-[12px] leading-relaxed text-gray-600">
                    <li>· La ausencia se descuenta como horas × valor de la hora.</li>
                    <li>· La quincena va del 1 al 15 y del 16 al 30.</li>
                    <li>· El día 31 no se paga, pero sí se descuenta si se falta.</li>
                  </ul>
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

/**
 * DAR DE BAJA — con fecha y motivo, nunca borrando.
 *
 * 🩸 POR QUÉ NO HAY UN BOTÓN DE BORRAR. Borrar la ficha se lleva el nombre, el
 * salario y la empresa: o sea, todo lo que hace falta para volver a armar una
 * quincena vieja. La planilla de julio en que esa persona SÍ trabajó dejaría de
 * cuadrar, y una planilla cerrada tiene que poder reimprimirse igual dentro de
 * dos años.
 *
 * 🔑 EL BOTÓN ES EXPLÍCITO aunque el resto de la pantalla guarde solo: elegir
 * una fecha a medias no puede sacar a nadie de las planillas que vienen.
 */
function BloqueBaja({
  persona, puede, ocupado, onGuardar,
}: {
  persona: Persona;
  /** `false` = falta correr el SQL de las bajas. Se dice, no se esconde el botón. */
  puede: boolean;
  ocupado: boolean;
  onGuardar: (fechaSalida: string, motivo: string) => void;
}) {
  // El borrador de la baja vive acá y no en el de la ficha: es otra acción, con
  // su propio botón. Este bloque solo se pinta en la ficha de alguien ACTIVO —
  // la baja se corrige desde la lista de abajo, reactivando y volviendo a dar.
  const [fecha, setFecha] = useState(persona.fechaSalida ?? "");
  const [motivo, setMotivo] = useState<string>(persona.motivoSalida ?? "");
  const listo = fecha.trim() !== "" && motivo.trim() !== "";

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-1">
        <h4 className="text-sm font-medium text-gray-900">¿Se fue de la empresa?</h4>
        {/* Qué le pasa a sus quincenas se aprende una vez. El aviso de que
            todavía no se puede guardar (falta la migración) NO se esconde: va
            abajo, en pantalla. */}
        <Ayuda titulo="Qué pasa al dar de baja" className="-my-3">
          <ExplicacionBaja conFecha />
        </Ayuda>
      </div>

      {!puede && (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[12px] text-amber-800">
          Todavía no se puede guardar una baja: falta correr el archivo de la base de datos.
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Etiqueta texto="Último día de trabajo" />
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
            className={`${CAMPO} tabular-nums`} />
        </div>
        <div>
          {/* Se guarda para la LIQUIDACIÓN, no para el cálculo de la quincena:
              ahí un despido injustificado paga indemnización y una renuncia no.
              La planilla trata los tres motivos exactamente igual. */}
          <Etiqueta
            texto="¿Por qué salió?"
            ayuda="La planilla se calcula igual en los tres casos. Se guarda para la liquidación."
          />
          <div className="flex flex-wrap gap-2">
            {MOTIVOS_SALIDA.map((m) => (
              <button key={m} type="button" onClick={() => setMotivo(m)}
                className={`${PILL_BASE} ${motivo === m ? PILL_ON : PILL_OFF}`}>
                {OPCION_MOTIVO[m]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={!listo || ocupado || !puede}
          onClick={() => onGuardar(fecha, motivo)}
          className="min-h-[44px] rounded-md bg-black px-4 text-sm text-white transition active:scale-[0.97] disabled:opacity-40">
          Dar de baja
        </button>
        {!listo && (
          <span className="text-[12px] text-gray-400">
            Elige la fecha y el motivo.
          </span>
        )}
      </div>
    </div>
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

/**
 * Qué le pasa a las quincenas de quien se fue. Se escribe UNA vez y se muestra
 * en los dos lugares donde hace falta (el bloque de dar de baja y la lista de
 * los que ya no trabajan acá): dos redacciones del mismo hecho es la forma de
 * que terminen contradiciéndose.
 */
function ExplicacionBaja({ conFecha }: { conFecha?: boolean }) {
  return (
    <p>
      {conFecha && (
        <>
          Se da de baja con la <b>fecha de su último día</b>.{" "}
        </>
      )}
      Sigue apareciendo entera en las quincenas en que trabajó, incluida la de su salida, y
      desaparece de las siguientes. No se borra nada: si vuelve, se reactiva.
    </p>
  );
}

/**
 * La etiqueta de un campo, con su ⓘ al lado cuando hace falta explicar CÓMO se
 * usa el número.
 *
 * 🔑 La metodología va detrás del toque, no debajo de cada campo: son textos
 * que se aprenden una vez y que, repetidos en cada carga de pantalla, hacen que
 * se deje de leer también lo que sí importa. Lo que cambia una decisión —lo que
 * falta, lo que no se puede guardar todavía— sigue SIEMPRE a la vista.
 */
function Etiqueta({ texto, ayuda }: { texto: string; ayuda?: string }) {
  return (
    <div className="mb-1 flex flex-wrap items-center gap-0.5">
      <label className="block text-xs uppercase tracking-wide text-gray-400">{texto}</label>
      {ayuda && (
        // -my-3: el botón sigue midiendo 44 px (regla de la casa), solo deja de
        // empujar el renglón de la etiqueta.
        <Ayuda titulo={texto} className="-my-3">
          <p>{ayuda}</p>
        </Ayuda>
      )}
    </div>
  );
}

function Bloque({
  titulo, ayuda, nota, children,
}: { titulo: string; ayuda?: string; nota?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-1">
        <h3 className="text-sm font-medium text-gray-900">{titulo}</h3>
        {/* `ayuda` EXPLICA → va al ⓘ, que se aprende una vez. `nota` ADVIERTE
            → se queda en pantalla y en ámbar: esconder un aviso detrás de un
            toque es exactamente igual que borrarlo. */}
        {ayuda && (
          <Ayuda titulo={titulo} className="-my-3">
            <p>{ayuda}</p>
          </Ayuda>
        )}
      </div>
      {nota && <p className="mt-1 text-[12px] text-amber-800">{nota}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Campo({
  label, ayuda, sufijo, valor, onChange,
}: {
  label: string;
  /** Cómo se usa el número. Opcional: si el sufijo del campo ya lo dice («%»),
   *  repetirlo abajo es texto que nadie vuelve a leer. */
  ayuda?: string;
  sufijo?: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Etiqueta texto={label} ayuda={ayuda} />
      <div className="flex items-center gap-2">
        <input type="text" inputMode="decimal" value={valor}
          onChange={(e) => onChange(e.target.value)} className={`${CAMPO} tabular-nums`} />
        {sufijo && <span className="shrink-0 text-[12px] text-gray-400">{sufijo}</span>}
      </div>
    </div>
  );
}
