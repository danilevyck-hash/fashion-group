"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * LA PERSONA EN EL CENTRO — su página.
 *
 * Daniel, al aprobar el mockup: *«sí me gustó, para editar una info como
 * seguros, que sea con Editar»*.
 *
 * Arriba, su información **como texto** y un botón «Editar» a la vista. Abajo,
 * todo lo suyo, cada cosa con su botón: Préstamos · Justificaciones ·
 * Vacaciones · Asistencia del período.
 *
 * 🔴 NADA DE LO QUE SE GUARDA CAMBIA. Cada sección llama a los MISMOS endpoints
 * de siempre (`/api/asistencia/configuracion`, `/justificaciones`,
 * `/vacaciones`, `/prestamos-deuda`, `/reporte`) con la persona ya puesta. Esto
 * es reubicar y presentar, no un modelo nuevo.
 * ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import AppHeader from "@/components/AppHeader";
import { useToast } from "@/components/ToastSystem";
import { puedeCerrar } from "@/lib/asistencia/roles";
import {
  abreEnEditar,
  esPersonaNueva,
  RUTA_PERSONAS,
} from "@/lib/asistencia/persona-en-el-centro";
import { tituloDePersona } from "@/lib/asistencia/ficha-persona";
import { avisoGuardadoConSalida } from "@/lib/asistencia/salida-con-deuda";
import { textoConfirmar } from "@/lib/asistencia/codigos-ignorados";
import FichaTexto from "./FichaTexto";
import FichaEditar, { type BorradorFicha, borradorDe } from "./FichaEditar";
import SeccionPrestamos from "./SeccionPrestamos";
import SeccionDiaLibre from "./SeccionDiaLibre";
// 🔴 «Otros servicios» va entre Préstamos y Justificaciones (15-sep-2026,
// mockup aprobado por Daniel): es lo que se le SUMA al neto, al lado de lo que
// se le resta.
import SeccionOtrosServicios from "./SeccionOtrosServicios";
import SeccionJustificaciones from "./SeccionJustificaciones";
import SeccionVacaciones from "./SeccionVacaciones";
import SeccionAsistencia from "./SeccionAsistencia";
import type { HorarioDeLaPagina, PersonaDeLaPagina, PermisosDeLaPagina } from "./tipos";

export default function PersonaPagina({ codigo }: { codigo: string }) {
  const { toast } = useToast();
  const router = useRouter();

  const [rol, setRol] = useState("");
  useEffect(() => { setRol(sessionStorage.getItem("cxc_role") || ""); }, []);
  // 🔴 LA FICHA LA TOCAN DANIEL Y LA CONTADORA, NADIE MÁS (10-sep-2026). La
  // secretaria MIRA. Es la misma lista derivada de siempre —quien cierra la
  // planilla— y el freno de verdad está en el PUT.
  const puedeEditar = puedeCerrar(rol);

  const nueva = esPersonaNueva(codigo);
  const [persona, setPersona] = useState<PersonaDeLaPagina | null>(null);
  const [permisos, setPermisos] = useState<PermisosDeLaPagina | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [borrador, setBorrador] = useState<BorradorFicha | null>(null);
  /** Su horario guardado y el que se está editando (se guarda con Guardar). */
  const [horario, setHorario] = useState<HorarioDeLaPagina | null>(null);
  const [horarioBorrador, setHorarioBorrador] = useState<HorarioDeLaPagina | null>(null);
  const [horarioCompleto, setHorarioCompleto] = useState(true);
  /** Sube de a uno para que las secciones vuelvan a leer después de guardar. */
  const [refresco, setRefresco] = useState(0);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      // 🔴 SE PIDE A ESTA PERSONA, NO LA LISTA ENTERA (14-sep-2026).
      //
      // Acá decía: *«EL MISMO GET DE SIEMPRE. No se estrena una ruta "de una
      // persona": dos lecturas de la misma ficha es cómo nacen dos verdades»*.
      // 🔑 EL MIEDO ERA EL CORRECTO —de esta ficha sale lo que se le paga a la
      // gente— y lo que estaba mal era el remedio: lo que no puede haber son dos
      // CÁLCULOS, no dos lecturas. Pedir la lista para quedarse con una fila
      // costaba leer las 6.998 marcaciones de 180 días (835 KB en siete páginas
      // de PostgREST): **1.656 ms medidos contra producción**, contra 189-408 ms
      // pidiendo solo a esta persona.
      //
      // 🔴 NO HAY DOS CÁLCULOS: el mapeo de una fila a una persona vive en
      // `lib/asistencia/ficha-de-configuracion.ts` y las DOS rutas llaman la
      // MISMA función. Y hay candado que corre los dos caminos sobre el universo
      // entero y exige igualdad campo por campo
      // (`asistencia-ficha-una-persona.test.ts`): el día que difieran en uno
      // solo, el build se pone rojo.
      //
      // ⚠️ Guardar sigue siendo el `PUT /api/asistencia/configuracion` de
      // siempre, unas líneas más abajo: la puerta de ESCRITURA sigue siendo una.
      const r = await fetch(
        `/api/asistencia/configuracion/persona?codigo=${encodeURIComponent(codigo)}`,
        { cache: "no-store" },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "No se pudo cargar");
      setPermisos({
        puedeDarDeBaja: !!d.puedeDarDeBaja,
        puedeMarcarServicioProfesional: !!d.puedeMarcarServicioProfesional,
        puedeQuitarSeguros: !!d.puedeQuitarSeguros,
        puedeCargarBaseSeguros: !!d.puedeCargarBaseSeguros,
        puedeMarcarSueldoFijo: !!d.puedeMarcarSueldoFijo,
      });
      // `null` = o no existe, o el código está ignorado — exactamente lo que
      // devolvía el `find` sobre la lista, que ya venía sin los ignorados.
      setPersona((d.persona ?? null) as PersonaDeLaPagina | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    } finally {
      setCargando(false);
    }
  }, [codigo]);

  useEffect(() => { void cargar(); }, [cargar]);

  // 🔴 UNA PERSONA NUEVA ABRE DIRECTO EN EDITAR — y una ficha que todavía no
  // existe, también: enseñar diez guiones y pedir que además toquen «Editar»
  // es un paso de más para decir lo que la pantalla ya sabe.
  useEffect(() => {
    if (cargando) return;
    if (abreEnEditar(codigo, !!persona)) {
      setBorrador(borradorDe(persona, nueva ? "" : codigo));
      setEditando(true);
    }
  }, [cargando, codigo, persona, nueva]);

  const titulo = useMemo(
    () => (nueva
      ? "Nuevo colaborador"
      : tituloDePersona({ nombre: persona?.nombre ?? null, codigo })),
    [nueva, persona, codigo],
  );

  // 🔴 EL HORARIO, EN LA FICHA (29-sep-2026). La misma lectura que la sección
  // «Horarios» de la lista: el horario es uno solo, visible en dos lugares.
  const cargarHorario = useCallback(async () => {
    if (nueva) return;
    try {
      const r = await fetch("/api/asistencia/horarios", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) return;
      const f = (d.personas ?? []).find((p: { codigo: string }) => String(p.codigo) === codigo);
      setHorarioCompleto(!d.faltaMigracion);
      setHorario(f ? {
        ...f,
        diasLaborables: Array.isArray(f.diasLaborables) ? f.diasLaborables : [1, 2, 3, 4, 5],
        entradaAfuera: f.entradaAfuera ?? null,
        salidaAfuera: f.salidaAfuera ?? null,
      } : null);
    } catch { /* sin horario la ficha se edita igual; la lista lo sigue mostrando */ }
  }, [codigo, nueva]);
  useEffect(() => { void cargarHorario(); }, [cargarHorario]);
  // Si se abrió Editar antes de que llegara el horario, entra en cuanto llega.
  useEffect(() => {
    if (editando) setHorarioBorrador((h) => h ?? horario);
  }, [editando, horario]);

  function abrirEditar() {
    setBorrador(borradorDe(persona, nueva ? "" : codigo));
    setHorarioBorrador(horario);
    setEditando(true);
  }

  async function guardar(b: BorradorFicha) {
    setGuardando(true);
    try {
      const r = await fetch("/api/asistencia/configuracion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // 🔴 EL MISMO CUERPO QUE MANDA LA PANTALLA DE SIEMPRE. Los nombres de
        // los campos no se inventan acá: el validador del servidor es el único
        // que decide qué es válido.
        body: JSON.stringify({
          codigo: b.codigo.trim(),
          nombre: b.nombre.trim(),
          salarioMensual: b.salario.trim() === "" ? null : Number(b.salario),
          jornadaSemanal: b.jornada,
          empresa: b.empresa,
          fechaIngreso: b.fechaIngreso || null,
          fechaSalida: b.fechaSalida || null,
          motivoSalida: b.motivoSalida || null,
          servicioProfesional: b.servicioProfesional,
          pagaSeguros: b.pagaSeguros,
          baseSeguros: b.baseSeguros.trim() === "" ? null : b.baseSeguros.trim(),
          noMarcaReloj: b.noMarcaReloj,
          cobraHorasExtra: b.cobraHorasExtra,
          trabajaAfuera: b.trabajaAfuera,
          posicion: b.posicion.trim(),
          cedula: b.cedula.trim(),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar");
      // El horario, solo si cambió, por la MISMA puerta que usa la lista.
      if (horarioBorrador && JSON.stringify(horarioBorrador) !== JSON.stringify(horario)) {
        const h = horarioBorrador;
        const rh = await fetch("/api/asistencia/horarios", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(horarioCompleto
            ? { codigo: h.codigo, nombre: h.nombre, entrada: h.entrada, salida: h.salida,
                diasLaborables: h.diasLaborables, entradaAfuera: h.entradaAfuera, salidaAfuera: h.salidaAfuera }
            : { codigo: h.codigo, nombre: h.nombre, entrada: h.entrada, salida: h.salida }),
        });
        const dh = await rh.json().catch(() => ({}));
        if (!rh.ok) throw new Error(dh.error ?? "Se guardó la ficha, pero no el horario");
        await cargarHorario();
      }
      // 🔴 Con fecha de salida, el aviso dice desde cuándo y —si debe— cuánto
      // hay que descontarle de la liquidación: la ficha se cierra al guardar y
      // el cartel del formulario se va con ella. Ámbar y 8 s cuando hay deuda.
      const deuda = persona?.deudaPrestamo ?? 0;
      if (b.fechaSalida) {
        toast(avisoGuardadoConSalida(titulo, b.fechaSalida, deuda), deuda > 0 ? "warning" : "success");
      } else {
        toast("Ficha guardada", "success");
      }
      await cargar();
      setRefresco((n) => n + 1);
      setEditando(false);
      // Un alta cambia de dirección: pasa de `/nueva` a la de su código.
      if (nueva) router.replace(`${RUTA_PERSONAS}/${encodeURIComponent(b.codigo.trim())}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
    } finally {
      setGuardando(false);
    }
  }

  /** 🔴 Ignorar ESCONDE, no borra: ni las marcaciones ni la ficha se tocan. */
  async function ignorar() {
    if (!window.confirm(textoConfirmar(codigo, titulo))) return;
    try {
      const r = await fetch("/api/asistencia/codigos-ignorados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "No se pudo");
      toast("Código oculto", "success");
      router.push("/asistencia?tab=colaboradores");
    } catch {
      toast("No se pudo ignorar el código. Intenta de nuevo.", "error");
    }
  }

  return (
    <>
      <AppHeader module="Asistencia y planilla" />
      <div className="mx-auto max-w-4xl px-4 py-6">
        {/* Volver: una sola salida, arriba, sin competir con nada. */}
        <Link
          href="/asistencia?tab=colaboradores"
          className="inline-flex min-h-[44px] items-center text-sm text-gray-500 transition hover:text-gray-900"
        >
          ‹ Colaboradores
        </Link>

        <h1 className="mt-1 text-xl font-semibold text-gray-900">{titulo}</h1>

        {cargando && <p className="mt-6 text-sm text-gray-500">Cargando…</p>}

        {error && (
          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-900">No se pudo cargar esta ficha.</p>
            <p className="mt-1 text-[13px] text-gray-500">
              No se perdió nada: esta pantalla solo consulta. Intenta de nuevo en unos segundos.
            </p>
            <button type="button" onClick={() => void cargar()}
              className="mt-3 min-h-[44px] rounded-md bg-black px-3 text-sm text-white transition active:scale-[0.97]">
              Intentar de nuevo
            </button>
          </div>
        )}

        {!cargando && !error && (
          <div className="mt-4 space-y-4">
            {editando && borrador ? (
              <FichaEditar
                borrador={borrador}
                onCambio={setBorrador}
                onGuardar={() => void guardar(borrador)}
                onCancelar={() => { setEditando(false); if (nueva) router.push("/asistencia?tab=colaboradores"); }}
                guardando={guardando}
                nueva={nueva}
                permisos={permisos}
                deudaPrestamo={persona?.deudaPrestamo ?? 0}
                horario={horarioBorrador}
                onCambioHorario={setHorarioBorrador}
                puedeEditar={puedeEditar}
                onCambioFoto={() => setRefresco((n) => n + 1)}
              />
            ) : (
              <FichaTexto
                persona={persona}
                codigo={codigo}
                puedeEditar={puedeEditar}
                onEditar={abrirEditar}
                onIgnorar={() => void ignorar()}
              />
            )}

            {/* 🔴 TODO LO SUYO, CADA COSA CON SU BOTÓN. Solo con la ficha
                guardada: mientras no exista no hay a quién prestarle ni a quién
                justificarle nada, y dibujar cuatro secciones vacías arriba de
                un formulario de alta es ruido. */}
            {!nueva && persona && (
              <>
                <SeccionPrestamos codigo={codigo} refresco={refresco} />
                {/* 🔴 APARTE de Préstamos, a propósito: lo que debe por un día
                    libre de la empresa se paga SOLO con horas extra y nunca sale
                    del sueldo. Se dibuja solo cuando hay algo que decir. */}
                <SeccionDiaLibre codigo={codigo} refresco={refresco} />
                <SeccionOtrosServicios codigo={codigo} refresco={refresco} />
                <SeccionJustificaciones codigo={codigo} empresa={persona.empresa} refresco={refresco} />
                <SeccionVacaciones codigo={codigo} refresco={refresco} />
                <SeccionAsistencia codigo={codigo} refresco={refresco} />
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
