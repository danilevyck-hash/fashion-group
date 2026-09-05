"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { fmt, fmtDate } from "@/lib/format";
import { useAuth } from "@/lib/hooks/useAuth";
import { EmptyState, Toast } from "@/components/ui";
import { PRESTAMOS_ROLES } from "@/lib/prestamos-roles";
import { DIAS_CADUCIDAD_PENDIENTE } from "@/lib/prestamos-tope";
import type { PendienteEnPantalla } from "@/app/api/prestamos/pendientes/route";

/**
 * PRÉSTAMOS POR APROBAR — la pantalla de Daniel.
 *
 * 🔴 SOLO ÉL DECIDE, pero TODOS LO VEN. Contabilidad y David abren esta pantalla
 * y ven los mismos montos con los botones apagados. Esconderla de ellos sería
 * volver a tener plata que espera sin que nadie sepa que espera — que es
 * exactamente cómo los $700 de LUIS ADRIAN ARROYO pasaron 22 días en cero.
 *
 * Aprobar → el préstamo pasa a ser plata: suma al saldo y **entra al descuento
 * de la quincena en curso aunque ya haya empezado**.
 * Rechazar → se elimina.
 * Sin respuesta en {DIAS_CADUCIDAD_PENDIENTE} días → se elimina solo (cron
 * `prestamos-caducan`, 13:15 UTC).
 */
export default function PrestamosAprobacionesPage() {
  const router = useRouter();
  const { authChecked } = useAuth({ moduleKey: "prestamos", allowedRoles: [...PRESTAMOS_ROLES] });
  const [items, setItems] = useState<PendienteEnPantalla[]>([]);
  const [puedeDecidir, setPuedeDecidir] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/prestamos/pendientes");
      if (res.ok) {
        const d = await res.json();
        setItems(d.items ?? []);
        setPuedeDecidir(!!d.puedeDecidir);
      }
    } catch { showToast("Sin conexión. Intenta de nuevo."); }
    setCargando(false);
  }, []);

  useEffect(() => { if (authChecked) cargar(); }, [authChecked, cargar]);

  async function decidir(id: string, accion: "aprobar" | "rechazar") {
    setOcupado(id);
    try {
      const res = await fetch("/api/prestamos/pendientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, accion }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        showToast(accion === "aprobar" ? "Aprobado. Ya suma al saldo." : "Rechazado. Se eliminó.");
        cargar();
      } else {
        showToast(json?.error || "No se pudo guardar");
      }
    } catch { showToast("Sin conexión. Intenta de nuevo."); }
    setOcupado(null);
  }

  if (!authChecked) return null;

  const total = items.reduce((s, i) => s + i.monto, 0);

  return (
    <div className="min-h-screen bg-white">
      <AppHeader
        module="Préstamos"
        breadcrumbs={[
          { label: "Préstamos", onClick: () => router.push("/prestamos") },
          { label: "Por aprobar" },
        ]}
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <h1 className="sr-only">Préstamos por aprobar</h1>

        <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2">
          <div className="text-xs text-gray-400 uppercase tracking-wide">Esperando aprobación</div>
          <div className="text-lg font-semibold tabular-nums text-gray-900">${fmt(total)}</div>
          <div className="mt-1 text-xs text-gray-500">
            No suma al saldo de nadie hasta que se apruebe. Sin respuesta en {DIAS_CADUCIDAD_PENDIENTE} días, se elimina solo.
          </div>
        </div>

        {!puedeDecidir && items.length > 0 && (
          <p className="mb-4 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500">
            Esto lo aprueba Daniel. Aquí se ve, pero no se puede tocar.
          </p>
        )}

        {cargando ? null : items.length === 0 ? (
          <EmptyState title="No hay préstamos esperando aprobación" />
        ) : (
          <ul className="space-y-2">
            {items.map((p) => (
              <li key={p.id} className="rounded-lg border border-amber-300 bg-amber-50 p-3 sm:px-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <button
                      onClick={() => router.push(`/prestamos/${p.empleadoId}`)}
                      className="truncate text-left font-medium tracking-tight hover:underline"
                    >
                      {p.nombre}
                    </button>
                    <div className="text-xs text-gray-600">
                      {p.empresa ?? "Sin empresa"} · pedido el {fmtDate(p.fecha)} · esperando {p.espera}
                    </div>
                    {p.notas && <div className="mt-1 text-xs text-gray-500 break-words">{p.notas}</div>}
                  </div>
                  <div className="shrink-0 text-lg font-semibold tabular-nums">${fmt(p.monto)}</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => decidir(p.id, "aprobar")}
                    disabled={!puedeDecidir || ocupado === p.id}
                    title={puedeDecidir ? undefined : "Solo Daniel puede aprobarlo"}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-emerald-600 px-5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Aprobar
                  </button>
                  <button
                    onClick={() => decidir(p.id, "rechazar")}
                    disabled={!puedeDecidir || ocupado === p.id}
                    title={puedeDecidir ? undefined : "Solo Daniel puede rechazarlo"}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-gray-300 px-5 text-sm text-gray-700 transition hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Rechazar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Toast message={toast} />
    </div>
  );
}
