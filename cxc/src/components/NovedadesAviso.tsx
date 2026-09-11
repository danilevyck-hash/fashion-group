"use client";
// ─────────────────────────────────────────────────────────────────────────────
// LA TIRA DE «QUÉ CAMBIÓ» (9-sep-2026).
//
// Una tira gris arriba del contenido, con una × para cerrarla. Cuelga del
// encabezado que ya comparten los módulos (`AppHeader`), así que no hubo que
// tocar 22 pantallas.
//
// 🔴 NO BLOQUEA NADA. No es un modal: no hay fondo oscuro, no hay `position:
// fixed`, no atrapa el teclado y la pantalla de abajo se usa igual con la tira
// puesta. Hay candado que exige las tres cosas.
//
// 🔴 SE VE UNA VEZ POR PERSONA Y POR NOVEDAD — Y «UNA VEZ» ES MOSTRARLA, NO
// CERRARLA (10-sep-2026). Daniel, textual: *«se muestra una vez y se va solo al
// cerrarlo; si no lo cierran, no se vuelve a mostrar»*. Antes lo visto se
// anotaba solo al tocar la ×, así que quien no la tocaba la veía en cada
// visita. Ahora se anota EN EL MOMENTO EN QUE SE DIBUJA (`marcarVistas`), con
// el MISMO mecanismo y en los mismos dos lugares; la × sigue apagándola en el
// acto. Lo leído se guarda en DOS lugares a propósito, y los dos son de la
// persona:
//   · `novedades_vistas` en la base — es la fuente, la que viaja con ella a
//     cualquier aparato y la que le deja a Daniel contar cuántos la vieron;
//   · `localStorage` en este navegador — para que la × apague la tira EN EL
//     ACTO, sin esperar a la red, y para que cerrar funcione mientras la DDL
//     `20261024120000` no haya corrido.
// Se leen los dos y se unen: si cualquiera de los dos dice «ya la vio», no
// vuelve.
//
// ⚠️ QUIÉN VE QUÉ LO DECIDE EL SERVIDOR, no este archivo: la ruta filtra por los
// módulos de la cookie firmada. Acá solo se dibuja lo que llegó.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";
import { hoyPanama } from "@/lib/fecha-panama";
import { NOVEDADES } from "@/lib/novedades/lista";
import { novedadesParaMostrar, type Novedad } from "@/lib/novedades/seleccion";
import DibujoNovedad from "@/components/novedades/DibujoNovedad";

/**
 * 🔴 EL AVISO ESPERA A QUE LA PANTALLA CARGUE (9-sep-2026).
 *
 * 🩸 Sin esta espera, la tira pedía lo suyo EN EL MISMO instante en que el
 * módulo pedía sus datos, y competía con él: la pantalla de Guías ›
 * Configuración se quedó en «Cargando…» dentro de su propia prueba, que le da
 * 60 ms para estar lista. Un aviso de «qué cambió» no puede hacer que la
 * pantalla tarde más en aparecer — primero los datos del módulo, después el
 * aviso.
 */
export const ESPERA_MS = 800;

/** Lo cerrado en ESTE navegador. Respaldo del dato personal, nunca la fuente. */
export const LLAVE_LOCAL = "fg_novedades_vistas";

function leerLocal(): string[] {
  try {
    const crudo = localStorage.getItem(LLAVE_LOCAL);
    const lista = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(lista) ? lista.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}

function anotarLocal(ids: string[]): void {
  try {
    const todas = Array.from(new Set([...leerLocal(), ...ids]));
    localStorage.setItem(LLAVE_LOCAL, JSON.stringify(todas));
  } catch { /* sin localStorage: la tabla es la que manda igual */ }
}

interface Props {
  /** La `key` del módulo en el que está parado. `null` = ninguno (no se pide). */
  moduloKey: string | null;
}

export default function NovedadesAviso({ moduloKey }: Props) {
  const [pendientes, setPendientes] = useState<Novedad[]>([]);
  const [locales, setLocales] = useState<string[]>([]);
  const [cerrada, setCerrada] = useState(false);

  useEffect(() => {
    setLocales(leerLocal());
  }, []);

  // 🔴 NO SE LE PREGUNTA AL SERVIDOR SI NO HAY NADA QUE PREGUNTAR. La lista
  // escrita a mano ya dice si este módulo tiene alguna novedad viva que esta
  // persona no haya cerrado; el servidor solo puede devolver un subconjunto de
  // eso. Hoy la traen CINCO de los 22 módulos, así que en las otras diecisiete
  // pantallas esto no agrega ni una lectura de red.
  const hayAlgoQuePreguntar = novedadesParaMostrar({
    novedades: NOVEDADES,
    moduloKey,
    hoy: hoyPanama(),
    vistas: locales,
    modulosDelUsuario: moduloKey ? [moduloKey] : [],
  }).length > 0;

  useEffect(() => {
    if (!moduloKey || !hayAlgoQuePreguntar) { setPendientes([]); return; }
    let vivo = true;
    setCerrada(false);
    const reloj = setTimeout(() => {
      (async () => {
        try {
          const r = await fetch(`/api/novedades?modulo=${encodeURIComponent(moduloKey)}`);
          if (!r.ok) return;
          const j = await r.json();
          if (vivo && Array.isArray(j?.novedades)) setPendientes(j.novedades);
        } catch { /* sin red no hay aviso, y no pasa nada */ }
      })();
    }, ESPERA_MS);
    return () => { vivo = false; clearTimeout(reloj); };
  }, [moduloKey, hayAlgoQuePreguntar]);

  // El corte a tres y el filtro por lo cerrado acá salen de la MISMA función
  // que usa el servidor. Dos reglas para lo mismo es cómo se llega a cuatro
  // avisos en pantalla.
  const aMostrar = novedadesParaMostrar({
    novedades: pendientes,
    moduloKey,
    hoy: hoyPanama(),
    vistas: locales,
    // El servidor ya comprobó que el módulo es suyo; acá no se vuelve a decidir.
    modulosDelUsuario: moduloKey ? [moduloKey] : [],
  });

  /** Anota «ya la vio» en el navegador y en la base. Idempotente: cada id una vez. */
  const yaAnotadas = useRef<Set<string>>(new Set());
  const marcarVistas = useCallback((ids: string[]) => {
    const nuevas = ids.filter((id) => !yaAnotadas.current.has(id));
    if (nuevas.length === 0) return;
    for (const id of nuevas) yaAnotadas.current.add(id);
    anotarLocal(nuevas);
    fetch("/api/novedades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: nuevas }),
    }).catch(() => { /* queda anotado en este navegador; se reintenta al volver */ });
  }, []);

  // 🔴 MOSTRARLA YA CUENTA COMO VISTA (10-sep-2026). Se anota al dibujarse, sin
  // tocar `locales`: la tira se queda en pantalla hasta la × o hasta que la
  // persona se vaya, y a la próxima visita ya no vuelve.
  // ⚠️ Solo lo que de verdad SE DIBUJA: con la tira cerrada, las que subirían
  // en su lugar no se muestran y por eso tampoco se anotan.
  const huella = aMostrar.map((n) => n.id).join("|");
  useEffect(() => {
    if (!huella || cerrada) return;
    marcarVistas(huella.split("|"));
  }, [huella, cerrada, marcarVistas]);

  const cerrar = useCallback(() => {
    const ids = aMostrar.map((n) => n.id);
    if (ids.length === 0) return;
    setCerrada(true);
    marcarVistas(ids);
    setLocales((prev) => Array.from(new Set([...prev, ...ids])));
  }, [aMostrar, marcarVistas]);

  if (cerrada || aMostrar.length === 0) return null;

  return (
    <aside
      role="status"
      aria-label="Qué cambió"
      data-novedades
      className="w-full border-b border-gray-200 bg-gray-50"
    >
      <div className="flex items-start gap-3 px-4 py-2 sm:px-6">
        <span className="mt-1.5 hidden flex-shrink-0 text-[11px] font-semibold uppercase tracking-wide text-teal-700 sm:block">
          Qué cambió
        </span>
        <ul className="flex-1 space-y-1 py-1">
          {aMostrar.map((n) => (
            <li key={n.id} className="text-sm leading-snug text-gray-700">
              {/* 🔴 SIN DIBUJO, EL RENGLÓN ES EL DE SIEMPRE. Solo las novedades
                  donde la persona no encuentra la cosa sola llevan cuadrito, y
                  ahí el renglón se vuelve una fila que ENVUELVE: en el celular
                  el dibujo cae debajo del texto en vez de cortarlo. */}
              {n.dibujo ? (
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{n.texto}</span>
                  <DibujoNovedad clave={n.dibujo} modulo={n.modulo} />
                </span>
              ) : (
                n.texto
              )}
            </li>
          ))}
        </ul>
        <button
          onClick={cerrar}
          aria-label="Cerrar avisos"
          title="Cerrar"
          className="-my-1 -mr-2 flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center text-gray-400 transition hover:text-gray-700"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
