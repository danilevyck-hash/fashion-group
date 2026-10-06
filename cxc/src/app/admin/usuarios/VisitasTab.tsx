"use client";

// ─────────────────────────────────────────────────────────────────────────────
// «QUIÉN USA QUÉ» — TERCERA PESTAÑA de Usuarios (25-sep-2026).
//
// Daniel, textual: «quién entra a cada módulo lo debes saber tú».
//
// Va acá y NO en un módulo nuevo: Usuarios ya es la pantalla SOLO de admin donde
// se mira quién es quién y quién entró. Una ficha más en el menú por una tabla
// que se consulta cada tanto sería una puerta de más.
//
// 🔴 SOLO LEE, y lo decide el SERVIDOR: `/api/visitas/resumen` le contesta 403 a
// todo el que no sea admin.
//
// ⚠️ Sin gráficas a propósito: dos listas y un número. La pregunta es «¿quién
// abre Comisiones?», y eso se contesta con nombres, no con barras.
//
// ⚠️ Mientras la DDL `20261221120000` no corra no hay nada anotado, y la
// pantalla lo DICE en vez de mostrar ceros como si fueran una medición.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { SkeletonTable } from "@/components/ui";
import { etiquetaDeRol } from "@/lib/roles-etiquetas";
import type { VisitaDeModulo, VisitaDePersona } from "@/lib/visitas/resumen";
import { Aviso } from "@/components/ui/Aviso";
import { ThOrden, useOrdenTabla } from "@/components/ui/OrdenTabla";

/** 6-oct-2026: la tabla «Por usuario» ordena por encabezado (abre como siempre). */
const COLUMNAS_ORDEN = ["modulo", "usuario", "rol", "visitas", "ultima"] as const;
type ColOrden = (typeof COLUMNAS_ORDEN)[number];
const TH = "px-3 py-2 font-medium";

interface Respuesta {
  tablaLista: boolean;
  desde: string;
  dias: number;
  diasQueSeGuardan: number;
  personas: VisitaDePersona[];
  modulos: VisitaDeModulo[];
  sinVisitas: VisitaDeModulo[];
}

/** «hace 3 días», «ayer», «hoy». La misma idea que la lista de sesiones de al
 *  lado: la fecha exacta no dice nada, el «hace cuánto» sí. */
function cuandoFue(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const min = Math.floor(Math.max(0, Date.now() - t) / 60_000);
  if (min < 60) return min < 1 ? "ahora" : `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const d = Math.floor(hr / 24);
  if (d === 1) return "ayer";
  return `hace ${d} días`;
}

/** «9 en el teléfono», «todo en la computadora». Sin chips ni rótulos pegados a
 *  cada número: la frase corta se lee de un vistazo. */
function dondeEntra(celular: number, computadora: number): string {
  if (celular === 0) return "computadora";
  if (computadora === 0) return "teléfono";
  return `${celular} en el teléfono`;
}

export default function VisitasTab() {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [fallo, setFallo] = useState(false);
  const orden = useOrdenTabla<ColOrden>("usuarios-visitas", { columnas: COLUMNAS_ORDEN, textos: ["modulo", "usuario", "rol"] });

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/visitas/resumen");
        const j = await r.json();
        if (!vivo) return;
        if (!r.ok) { setFallo(true); return; }
        setDatos(j as Respuesta);
      } catch {
        if (vivo) setFallo(true);
      }
    })();
    return () => { vivo = false; };
  }, []);

  if (fallo) {
    return (
      <p className="text-sm text-gray-500">
        No se pudo leer el registro de visitas. Vuelve a entrar en un rato.
      </p>
    );
  }
  if (datos === null) return <SkeletonTable rows={6} cols={4} />;

  const sinNada = datos.personas.length === 0;

  return (
    <div className="space-y-6">
      {!datos.tablaLista && (
        <Aviso ayuda="El sistema funciona igual; la medición empieza el día que corra."
        >
          Registro de visitas sin activar: falta correr el cambio de base.
        </Aviso>
      )}

      {datos.tablaLista && sinNada && (
        <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600">
          Todavía no hay visitas anotadas. En unos días esta lista dice quién
          entra a cada módulo.
        </div>
      )}

      {datos.modulos.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-gray-900">Por módulo</h2>
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
            {datos.modulos.map((m) => (
              <li key={m.modulo} className="flex items-baseline justify-between gap-4 px-3 py-2">
                <span className="text-sm text-gray-900">{m.moduloLabel}</span>
                <span className="text-sm tabular-nums text-gray-600">
                  {m.personas} {m.personas === 1 ? "usuario" : "usuarios"} · {m.visitas}{" "}
                  {m.visitas === 1 ? "visita" : "visitas"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {datos.personas.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-gray-900">Por usuario</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <ThOrden col="modulo" api={orden} className={TH}>Módulo</ThOrden>
                  <ThOrden col="usuario" api={orden} className={TH}>Usuario</ThOrden>
                  <ThOrden col="rol" api={orden} className={TH}>Rol</ThOrden>
                  <ThOrden col="visitas" api={orden} derecha className={TH}>Visitas</ThOrden>
                  <th className={TH}>Dispositivo</th>
                  <ThOrden col="ultima" api={orden} className={TH}>Último acceso</ThOrden>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orden.ordenar(datos.personas, (p, c) =>
                  c === "modulo" ? p.moduloLabel : c === "usuario" ? p.nombre : c === "rol" ? etiquetaDeRol(p.rol) : c === "visitas" ? p.visitas : p.ultimaEn,
                ).map((p) => (
                  <tr key={`${p.modulo}-${p.userId}`}>
                    <td className="px-3 py-2 text-gray-900">{p.moduloLabel}</td>
                    <td className="px-3 py-2 text-gray-900">{p.nombre}</td>
                    <td className="px-3 py-2 text-gray-600">{etiquetaDeRol(p.rol)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-900">{p.visitas}</td>
                    <td className="px-3 py-2 text-gray-600">{dondeEntra(p.celular, p.computadora)}</td>
                    <td className="px-3 py-2 text-gray-600">{cuandoFue(p.ultimaEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {datos.tablaLista && datos.sinVisitas.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-gray-900">
            Nadie los abrió en {datos.dias} días
          </h2>
          <p className="text-sm text-gray-600">
            {datos.sinVisitas.map((m) => m.moduloLabel).join(" · ")}
          </p>
        </section>
      )}

      {/* 4-oct-2026: antes un párrafo arriba; ahora UNA línea al final. */}
      <p data-pie-visitas className="text-xs text-gray-500">
        Últimos {datos.dias} días · una visita cada 10 min por persona y módulo · se guarda {datos.diasQueSeGuardan} días
      </p>
    </div>
  );
}
