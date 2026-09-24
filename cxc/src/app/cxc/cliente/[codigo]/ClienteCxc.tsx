"use client";

// ─────────────────────────────────────────────────────────────────────────────
// UN CLIENTE, EN RENGLONES — NO EN UNA TABLA DE CINCO COLUMNAS (24-sep-2026).
//
// 🩸 QUÉ REEMPLAZA, medido el 24-sep-2026 en el cajón de City Mall Paso Canoa
// (139 documentos): la tabla del escritorio se dibujaba igual en 390 px y
// **105 de 695 celdas (15 %) salían cortadas o encimadas** — en pantalla se leía
// `1008$10,994.2`, los días pegados al monto y al monto sin su último dígito.
// «Días» tenía 21 px y «100» pide 25; «Original» tenía 50 px y `$29,344.75`
// pide 74. Y había que arrastrar 8.484 px dentro de una ventana de 647.
//
// Acá cada documento es un renglón: número y empresa arriba, fecha y días en
// gris debajo, el saldo a la derecha. Nada se desliza de lado y no hay `<table>`.
//
// 🔴 NINGÚN NÚMERO NACE ACÁ. Los tramos y los totales por empresa son los del
// aging —los mismos que la lista y la computadora—; del estado de cuenta se
// toman los documentos y cuál es el más viejo. El orden de los documentos es el
// que manda el servidor (`fecha`, `ccte_id`): no se reordena.
//
// 🔴 «Cobrar» abre la MISMA hoja del CXC, por el MISMO camino que la ficha del
// cliente (`CobrarEnFicha`): no hay una segunda hoja de cobro en el sistema.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { casaDelRol } from "@/lib/navegacion/casa-del-rol";
import { carteraDelRolEnCxc } from "@/lib/boston/ventas-boston";
import useAdminData from "../../hooks/useAdminData";
import { useUltimosPagosGrupo } from "../../hooks/useUltimosPagosGrupo";
import UltimosPagosPorFecha from "../../components/UltimosPagosPorFecha";
import CobrarEnFicha from "@/app/clientes/[codigo]/CobrarEnFicha";
import type { FilaAgingCliente } from "@/lib/clientes/cliente-para-cobrar";
import type { ConsolidatedClient } from "@/lib/types";
import type { EstadoCuenta } from "@/lib/cxc/estado-cuenta-tipos";
import { B2B_COMPANIES } from "@/lib/companies";
import { fmt, fmtDate } from "@/lib/format";
import { hoyPanama } from "@/lib/fecha-panama";
import { nombreDeCliente } from "@/lib/cxc/nombre-cliente";
import { diasSinPagar } from "@/lib/cxc/sin-pagar";
import { seLeCobra } from "@/lib/cxc/cobrable";
import {
  empresasDelCliente,
  haceCuanto,
  loQueUrge,
  montoExacto,
} from "@/lib/cxc/lista-celular";

export default function ClienteCxc({ codigo }: { codigo: string }) {
  const { authChecked, role } = useAuth({
    moduleKey: "cxc",
    allowedRoles: ["admin", "secretaria", "vendedor"],
  });
  const router = useRouter();
  // 🔴 Esta página es del CXC DEL GRUPO. Quien tiene la cartera de Boston no
  // pide ni una lectura del grupo: se va a su casa, igual que en `/cxc`.
  const esBoston = authChecked && carteraDelRolEnCxc(role) === "boston";
  useEffect(() => {
    if (esBoston) router.replace(casaDelRol(role, null));
  }, [esBoston, role, router]);

  const { clients, loading } = useAdminData(authChecked && !esBoston);
  const [estado, setEstado] = useState<EstadoCuenta | null>(null);
  const [errorDocs, setErrorDocs] = useState(false);
  const [hoja, setHoja] = useState(false);

  const client = useMemo<ConsolidatedClient | null>(
    () =>
      clients.find((c) =>
        Object.values(c.companies).some((d) => d?.codigo === codigo),
      ) ?? null,
    [clients, codigo],
  );

  useEffect(() => {
    if (!authChecked || esBoston || !codigo) return;
    let vivo = true;
    setErrorDocs(false);
    fetch(`/api/cxc/estado-cuenta/${encodeURIComponent(codigo)}?empresa=todas`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http"))))
      .then((d: EstadoCuenta) => { if (vivo) setEstado(d); })
      .catch(() => { if (vivo) setErrorDocs(true); });
    return () => { vivo = false; };
  }, [authChecked, esBoston, codigo]);

  const pagos = useUltimosPagosGrupo(codigo, authChecked && !esBoston);
  const hoy = hoyPanama();

  const nombrePorKey = useMemo(() => {
    const m: Record<string, string> = {};
    for (const co of B2B_COMPANIES) m[co.key] = co.name;
    return m;
  }, []);

  // Cuántos documentos y cuál es el más viejo, POR EMPRESA. Es lo único que se
  // toma del estado de cuenta: los tramos siguen saliendo del aging.
  const docsPorKey = useMemo(() => {
    const m: Record<string, { documentos: number; masViejo: number | null }> = {};
    for (const e of estado?.empresas ?? []) {
      let masViejo: number | null = null;
      for (const d of e.documentos) {
        if (d.dias != null && (masViejo == null || d.dias > masViejo)) masViejo = d.dias;
      }
      m[e.empresa_key] = { documentos: e.documentos.length, masViejo };
    }
    return m;
  }, [estado]);

  const filas = useMemo(
    () => (client ? empresasDelCliente(client, nombrePorKey, docsPorKey) : []),
    [client, nombrePorKey, docsPorKey],
  );

  const documentos = useMemo(() => {
    const out: { key: string; empresa: string; numero: string; fecha: string | null; dias: number | null; saldo: number }[] = [];
    for (const e of estado?.empresas ?? []) {
      e.documentos.forEach((d, i) => {
        out.push({
          key: `${e.empresa_key}-${d.numero}-${i}`,
          empresa: nombrePorKey[e.empresa_key] ?? e.empresa_nombre,
          numero: d.numero,
          fecha: d.fecha,
          dias: d.dias,
          saldo: d.saldo,
        });
      });
    }
    return out;
  }, [estado, nombrePorKey]);

  // El adaptador a la hoja «Cobrar» de siempre: las filas de aging que ya
  // llegaron, tal cual. No se arma un segundo mensaje de cobro.
  const agingParaCobrar = useMemo<FilaAgingCliente[]>(
    () =>
      Object.entries(client?.companies ?? {}).map(([key, d]) => ({
        company_key: key,
        nombre: d?.nombre ?? null,
        total: d?.total ?? 0,
        d0_30: d?.d0_30, d31_60: d?.d31_60, d61_90: d?.d61_90,
        d91_120: d?.d91_120, d121_180: d?.d121_180,
        d181_270: d?.d181_270, d271_365: d?.d271_365, mas_365: d?.mas_365,
      })),
    [client],
  );

  if (!authChecked || esBoston) return null;

  const nombre = client ? nombreDeCliente(client) : estado?.clienteNombre || codigo;
  const dias = client
    ? diasSinPagar(
        Object.values(client.companies).reduce<string | null>((max, d) => {
          const f = (d?.ultimoPagoFecha ?? "").slice(0, 10);
          return f && (!max || f > max) ? f : max;
        }, null),
        hoy,
      )
    : null;

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      <AppHeader module="Cuentas por Cobrar" />

      <div className="mx-auto max-w-2xl pb-12">
        {/* ── Volver y «Cobrar» ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-2 pt-1">
          <Link href="/cxc" className="min-h-[44px] px-3 text-[17px] leading-[44px] text-blue-600 active:opacity-60">
            ‹ Por cobrar
          </Link>
          {client && seLeCobra(client.total) && (
            <button
              type="button"
              onClick={() => setHoja(true)}
              className="min-h-[44px] px-3 text-[17px] font-medium text-blue-600 active:opacity-60"
            >
              Cobrar
            </button>
          )}
        </div>

        {/* ── Quién es y cuánto debe ─────────────────────────────────────── */}
        <header className="px-4 pt-1">
          <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-gray-900">
            {nombre}
          </h1>
          <p className="mt-1.5 text-[16px] text-gray-500 tabular-nums">
            {client ? (
              <>
                ${fmt(client.total)}
                {" · "}
                {loQueUrge(client, dias)}
              </>
            ) : loading ? (
              "Cargando…"
            ) : (
              "Este cliente no tiene saldo pendiente."
            )}
          </p>
          <p className="mt-0.5 text-[13px] text-gray-400">{codigo}</p>
        </header>

        {/* ── Por empresa ────────────────────────────────────────────────── */}
        {filas.length > 0 && (
          <>
            <h2 className="px-5 pb-1 pt-5 text-[12px] uppercase tracking-wider text-gray-500">
              Por empresa · {filas.length}
            </h2>
            <p className="px-5 pb-2 text-[12px] text-gray-400">
              verde hasta 90 días · ámbar 91 a 120 · rojo más de 120
            </p>
            <ul data-lista="cxc-cliente-empresas" className="mx-4 overflow-hidden rounded-2xl bg-white">
              {filas.map((f) => (
                <li key={f.key} className="flex items-start gap-3 border-t border-gray-100 px-4 py-3 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-[17px] font-semibold tracking-tight text-gray-900">{f.nombre}</p>
                    <p className="mt-0.5 text-[14px] tabular-nums">
                      <span className="text-[#0F6E56]">{f.current > 0 ? montoExacto(f.current) : "—"}</span>
                      {" · "}
                      <span className="text-[#B45309]">{f.watch > 0 ? montoExacto(f.watch) : "—"}</span>
                      {" · "}
                      <span className="text-[#A32D2D]">{f.overdue > 0 ? montoExacto(f.overdue) : "—"}</span>
                    </p>
                    <p className="mt-0.5 text-[13px] text-gray-500">
                      {f.documentos} {f.documentos === 1 ? "documento" : "documentos"}
                      {f.masViejo != null && <> · el más viejo {f.masViejo} días</>}
                      {f.ultimoPago && (
                        <> · pagó {montoExacto(f.ultimoPago.monto)} {haceCuanto(f.ultimoPago.fecha, hoy)}</>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-[17px] tabular-nums text-gray-900">
                    {montoExacto(f.total)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* ── Documentos, en renglones ───────────────────────────────────── */}
        <h2 className="px-5 pb-2 pt-5 text-[12px] uppercase tracking-wider text-gray-500">
          Documentos{documentos.length > 0 ? ` · ${documentos.length}` : ""}
        </h2>
        {errorDocs ? (
          <p className="mx-4 rounded-2xl bg-white px-4 py-6 text-center text-[15px] text-red-600">
            No se pudieron cargar los documentos. Intenta de nuevo en unos segundos.
          </p>
        ) : !estado ? (
          <p className="mx-4 rounded-2xl bg-white px-4 py-6 text-center text-[15px] text-gray-400">
            Cargando los documentos…
          </p>
        ) : documentos.length === 0 ? (
          <p className="mx-4 rounded-2xl bg-white px-4 py-6 text-center text-[15px] text-gray-500">
            Este cliente no tiene documentos con saldo pendiente.
          </p>
        ) : (
          <ul data-lista="cxc-cliente-documentos" className="mx-4 overflow-hidden rounded-2xl bg-white">
            {documentos.map((d) => (
              <li key={d.key} className="flex items-start gap-3 border-t border-gray-100 px-4 py-3 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] text-gray-900">
                    {d.numero} · {d.empresa}
                  </p>
                  <p className="mt-0.5 text-[13px] text-gray-500 tabular-nums">
                    {d.fecha ? fmtDate(d.fecha) : "sin fecha"}
                    {d.dias != null && <> · {d.dias} {d.dias === 1 ? "día" : "días"}</>}
                  </p>
                </div>
                <span className={`shrink-0 text-[16px] tabular-nums ${d.saldo < 0 ? "text-[#0F6E56]" : "text-gray-900"}`}>
                  {d.saldo < 0 ? `-$${fmt(Math.abs(d.saldo))}` : `$${fmt(d.saldo)}`}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* ── Últimos pagos ──────────────────────────────────────────────── */}
        <div className="mx-4 mt-5 rounded-2xl bg-white px-4 py-3">
          <UltimosPagosPorFecha pagos={pagos} />
        </div>
      </div>

      {client && (
        <CobrarEnFicha
          datos={{
            codigo,
            nombre,
            contacto: client.contacto,
            email: client.correo,
            telefono: client.telefono,
            celular: client.celular,
          }}
          aging={agingParaCobrar}
          hojaAbierta={hoja}
          onCerrarHoja={() => setHoja(false)}
          cajonAbierto={false}
          onCerrarCajon={() => {}}
          onAbrirHoja={() => setHoja(true)}
        />
      )}
    </div>
  );
}
