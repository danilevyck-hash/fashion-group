"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LA CARTERA DE CONFECCIONES BOSTON, CON LA FORMA DE LA DEL GRUPO (23-sep-2026).
//
// Daniel: David ve «Cuentas por Cobrar» —la MISMA pantalla del grupo— con la
// cartera de Boston y nada más. Acá se monta esa pantalla: la tira de totales
// con «N sin pagar hace +90 d», la tabla que abre por «más viejo sin pagar» con
// su bloque «Saldo a favor (N)», el Excel y el PDF, y «Cobrar» con su correo y
// el Deshacer de 5 segundos.
//
// 🔴 MISMO FORMATO, APARTE. Los datos entran por `/api/cxc/boston` (la ruta de
// Boston, la única que David puede leer) y se les da la forma del grupo en
// `lib/cxc/boston-como-grupo.ts`, un módulo puro. NO se toca `useAdminData` ni
// ninguna lectura del grupo, y la hoja «Cobrar» y el cajón de documentos son
// los DE BOSTON (`BostonHojaCobrar`, `BostonDocumentosDrawer`): el correo sale
// por `/api/cxc/boston/enviar-email` y firma como Boston.
//
// 🔴 EL PAPEL FIRMA COMO BOSTON: `CASA_BOSTON` entra al PDF (sin el logo del
// grupo, sin `fashiongr.com` en el pie), y el subtítulo dice «Confecciones
// Boston», no «Fashion Group · 6 empresas».
//
// Lo que Boston NO tiene, y no se inventa: «mandar a varios» (no hay ruta de
// lote), la marca «le enviaste hace N días» (el registro de envíos es del
// grupo) y la ficha `/clientes/…` (Boston no está en `clientes_master`).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import type { ConsolidatedClient } from "@/lib/types";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { useUndoAction } from "@/lib/hooks/useUndoAction";
import { fmt } from "@/lib/format";
import { normalizeName } from "@/lib/normalize";
import { hoyPanama } from "@/lib/fecha-panama";
import { EMPRESA_BOSTON } from "@/lib/boston/rol";
import { CASA_BOSTON } from "@/lib/cxc/casa-del-papel";
import { seLeCobra } from "@/lib/cxc/cobrable";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { empresasCarteraAparte } from "@/lib/switch-api/empresas";
import { nombreDeCliente } from "@/lib/cxc/nombre-cliente";
import { diasSinPagar, avisaSinPagar, textoSinPagar } from "@/lib/cxc/sin-pagar";
import {
  COMPANIA_BOSTON,
  clienteParaCobrarBoston,
  codigoDeClienteBoston,
  consolidarCarteraBoston,
  idsDeSwitchBoston,
  ultimoPagoBoston,
  type RespuestaCarteraBoston,
} from "@/lib/cxc/boston-como-grupo";
import {
  ORDEN_AL_ABRIR,
  compararClientes,
  ordenAlTocarTitulo,
  ordenEfectivo,
  pasaFiltroRiesgo,
  siguienteRiskFilter,
  type OrdenOverride,
  type RiskFilter,
  type SortKey,
} from "@/lib/cxc-orden";
import { AGING } from "@/lib/cxc-aging";
import AvisoRechazosSwitch from "@/components/AvisoRechazosSwitch";
import SyncStatus from "@/components/shared/SyncStatus";
import UndoToast from "@/components/UndoToast";
import { Toast, PullToRefresh } from "@/components/ui";
import BostonDocumentosDrawer from "@/components/cxc/BostonDocumentosDrawer";
import BostonHojaCobrar, { type CorreoProgramadoBoston } from "@/components/cxc/BostonHojaCobrar";
import UltimosPagos from "@/components/cxc/UltimosPagos";
import { useUltimosPagosBoston } from "@/components/cxc/useUltimosPagosBoston";
import TiraTotales from "./TiraTotales";
import ClientTable from "./ClientTable";
import MenuDescargar from "./MenuDescargar";
import PanelCxcMobile from "./PanelCxcMobile";
import { SkeletonRow } from "./Skeleton";
import { useDescargasCartera } from "../hooks/useDescargasCartera";

/** Solo Boston: la lista se DERIVA (`estadoCuenta:true` + `cxc:false`), nunca se escribe. */
const EMPRESAS_BOSTON = empresasCarteraAparte();
const COMPANIAS = [COMPANIA_BOSTON];
const SIN_MARCA = () => null;
const NADA = () => { /* Boston no manda a varios */ };

const fetcher = (u: string) => fetch(u, { cache: "no-store" }).then((r) => {
  if (!r.ok) throw new Error("No se pudo leer la cartera de Boston");
  return r.json() as Promise<RespuestaCarteraBoston>;
});

/** Lo que se despliega bajo la fila: el saldo, los últimos pagos POR ID de Switch y las dos salidas. */
function DetalleBoston({
  client,
  abierto,
  clienteSwitchId,
  onCobrar,
  onDocumentos,
}: {
  client: ConsolidatedClient;
  abierto: boolean;
  clienteSwitchId: number | null;
  onCobrar: (c: ConsolidatedClient) => void;
  onDocumentos: (c: ConsolidatedClient) => void;
}) {
  const pagos = useUltimosPagosBoston(abierto ? clienteSwitchId : null);
  return (
    <div className="bg-gray-50/80 px-6 py-4 border-b border-gray-200 space-y-3">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
        <span className="text-gray-500">{COMPANIA_BOSTON.name} · {codigoDeClienteBoston(client)}</span>
        <span className={AGING.current.text}>{AGING.current.colLabel} ${fmt(client.current)}</span>
        <span className={AGING.watch.text}>{AGING.watch.colLabel} ${fmt(client.watch)}</span>
        <span className={AGING.overdue.text}>{AGING.overdue.colLabel} ${fmt(client.overdue)}</span>
        <span className="font-semibold text-gray-900">Total ${fmt(client.total)}</span>
      </div>
      <UltimosPagos pagos={pagos} />
      <div className="flex items-center gap-3 flex-wrap">
        {seLeCobra(client.total) && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCobrar(client); }}
            className="inline-flex items-center gap-1.5 rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white transition active:scale-[0.97]"
          >
            Cobrar
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDocumentos(client); }}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition active:scale-[0.97]"
        >
          Ver los documentos
        </button>
      </div>
    </div>
  );
}

export default function CarteraBoston() {
  const { data, error, isLoading, mutate } = useSWR("/api/cxc/boston", fetcher, {
    dedupingInterval: 60_000,
    revalidateOnFocus: true,
  });

  // La forma del grupo, del módulo puro. Se recalcula solo cuando llega dato.
  const clients = useMemo(() => consolidarCarteraBoston(data?.clientes ?? []), [data]);
  const ultimoPago = useMemo(() => ultimoPagoBoston(data?.clientes ?? []), [data]);
  const idsSwitch = useMemo(() => idsDeSwitchBoston(data?.clientes ?? []), [data]);

  // Los MISMOS filtros del grupo, en la URL con `replace`: son del mismo nivel.
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useUrlState<RiskFilter>("risk", "all");
  const handleRiskFilterChange = useCallback((tocada: RiskFilter) => {
    setRiskFilter(siguienteRiskFilter(riskFilter, tocada));
  }, [riskFilter, setRiskFilter]);
  const [sinPagarRaw, setSinPagar] = useUrlState("sinpagar", "");
  const sinPagarActivo = sinPagarRaw === "1";
  const toggleSinPagar = useCallback(() => setSinPagar(sinPagarActivo ? "" : "1"), [sinPagarActivo, setSinPagar]);
  // 🔴 ABRE POR «MÁS VIEJO SIN PAGAR», igual que el grupo (`ORDEN_AL_ABRIR`).
  const [ordenOverride, setOrdenOverride] = useState<OrdenOverride | null>(ORDEN_AL_ABRIR);
  const orden = ordenEfectivo(riskFilter, ordenOverride);

  const hoy = hoyPanama();
  const diasSinPagarDe = useCallback(
    (c: ConsolidatedClient): number | null => diasSinPagar(ultimoPago[codigoDeClienteBoston(c)] ?? null, hoy),
    [ultimoPago, hoy],
  );
  const avisoSinPagarDe = useCallback(
    (c: ConsolidatedClient): string | null => textoSinPagar(diasSinPagarDe(c)),
    [diasSinPagarDe],
  );

  const filtered = useMemo(() => {
    let result = clients;
    if (riskFilter !== "all") result = result.filter((c) => pasaFiltroRiesgo(c, riskFilter));
    if (sinPagarActivo) result = result.filter((c) => avisaSinPagar(diasSinPagarDe(c)));
    if (search) {
      const q = normalizeName(search);
      const qLower = search.toLowerCase();
      result = result.filter((c) =>
        c.nombre_normalized.includes(q) ||
        codigoDeClienteBoston(c).toLowerCase().includes(qLower) ||
        (c.correo && c.correo.toLowerCase().includes(qLower)) ||
        (c.telefono && c.telefono.includes(search)) ||
        (c.celular && c.celular.includes(search)));
    }
    return [...result].sort((a, b) => compararClientes(a, b, { orden, diasSinPagar: diasSinPagarDe }));
  }, [clients, riskFilter, sinPagarActivo, search, orden, diasSinPagarDe]);

  // 🔴 SOLO LOS QUE DEBEN, como en el grupo: al saldo a favor no se le cobra.
  const avisoSinPagar = useMemo(() => {
    const deudores = clients.filter((c) => c.total > 0 && avisaSinPagar(diasSinPagarDe(c)));
    return { cuantos: deudores.length, monto: Math.round(deudores.reduce((s, c) => s + c.total, 0) * 100) / 100 };
  }, [clients, diasSinPagarDe]);

  // 🔴 El papel firma como Boston, y lo que se baja es lo que se está viendo.
  const descargar = useDescargasCartera(filtered, COMPANIAS, EMPRESA_BOSTON, CASA_BOSTON);
  const [showExport, setShowExport] = useState(false);

  // Cobrar y documentos: los componentes DE BOSTON.
  const [cobrarA, setCobrarA] = useState<ConsolidatedClient | null>(null);
  const [documentosDe, setDocumentosDe] = useState<ConsolidatedClient | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const avisar = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const { scheduleAction, undoAction, pendingUndo } = useUndoAction();

  // 🔴 El correo sale con un clic y se puede deshacer 5 segundos: el POST real
  // ocurre al vencer el plazo, contra la ruta de Boston. Mismo patrón del grupo.
  const programarCorreo = (datos: CorreoProgramadoBoston) => {
    scheduleAction({
      id: `boston-correo-${datos.codigo}`,
      message: `Correo enviado a ${datos.destinatario}`,
      execute: async () => {
        const res = await fetch("/api/cxc/boston/enviar-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(datos),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          avisar(d?.error || "No se pudo enviar el correo. Intenta de nuevo.");
        }
      },
    });
  };

  const toggleSort = (key: SortKey) => setOrdenOverride({ risk: riskFilter, ...ordenAlTocarTitulo(orden, key) });
  const sortArrow = (key: SortKey) => (orden.key !== key ? " ↕" : orden.dir === "desc" ? " ↓" : " ↑");

  const renderDetalle = useCallback(
    (client: ConsolidatedClient, abierto: boolean) => (
      <DetalleBoston
        client={client}
        abierto={abierto}
        clienteSwitchId={idsSwitch.get(codigoDeClienteBoston(client)) ?? null}
        onCobrar={setCobrarA}
        onDocumentos={setDocumentosDe}
      />
    ),
    [idsSwitch],
  );

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-red-600">No se pudo cargar la cartera de Confecciones Boston.</p>
        <button type="button" onClick={() => void mutate()} className="mt-4 text-sm bg-black text-white px-4 py-2 rounded-md active:scale-[0.97]">
          Reintentar
        </button>
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={async () => { await mutate(); }}>
      <div data-cartera="boston">
        <PanelCxcMobile
          filtered={filtered}
          roleClients={clients}
          cxcCompanies={COMPANIAS}
          search={search}
          setSearch={setSearch}
          riskFilter={riskFilter}
          setRiskFilter={handleRiskFilterChange}
          companyFilter={EMPRESA_BOSTON}
          setCompanyFilter={NADA}
          onOpenEstado={setDocumentosDe}
          onCobrar={setCobrarA}
          sinPagar={avisoSinPagar}
          sinPagarActivo={sinPagarActivo}
          onToggleSinPagar={toggleSinPagar}
          avisoSinPagarDe={avisoSinPagarDe}
          marcaEnvioDe={SIN_MARCA}
          canExport
          onDescargar={descargar}
          empresaRestriction={EMPRESA_BOSTON}
          onSyncedNow={() => void mutate()}
          avisoMontos={data?.avisoMontos ?? null}
          cartera="boston"
        />

        <div className="hidden lg:block max-w-6xl mx-auto px-6 py-8">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="relative w-[230px]">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente…"
                aria-label="Buscar cliente de Confecciones Boston"
                className="w-full pl-10 pr-3 min-h-[44px] bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="ml-auto flex items-center gap-3">
              <SyncStatus tabla="estadocuenta" empresasEsperadas={EMPRESAS_BOSTON} empresaLabels={EMPRESA_KEY_TO_NAME} />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowExport(!showExport)}
                  aria-haspopup="menu"
                  aria-expanded={showExport}
                  className="text-sm bg-black text-white px-4 rounded-lg font-medium hover:bg-gray-800 active:scale-[0.97] transition-all flex items-center gap-2 min-h-[44px]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Descargar
                </button>
                {showExport && (<>
                  <div className="fixed inset-0 z-10" onClick={() => setShowExport(false)} />
                  <div className="absolute right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-20 w-80 py-1">
                    <MenuDescargar onDescargar={(clave, formato) => { setShowExport(false); void descargar(clave, formato); }} />
                  </div>
                </>)}
              </div>
            </div>
          </div>

          <AvisoRechazosSwitch texto={data?.avisoMontos} className="mb-4" />

          <TiraTotales
            roleClients={clients}
            riskFilter={riskFilter}
            onRiskFilterChange={handleRiskFilterChange}
            sinPagar={avisoSinPagar}
            sinPagarActivo={sinPagarActivo}
            onToggleSinPagar={toggleSinPagar}
          />

          <ClientTable
            filtered={filtered}
            roleCompanies={COMPANIAS}
            companyFilter={EMPRESA_BOSTON}
            toggleSort={toggleSort}
            sortArrow={sortArrow}
            onCobrar={setCobrarA}
            onOpenEstado={setDocumentosDe}
            seleccion={new Set()}
            onSeleccionar={NADA}
            onSeleccionarTodos={NADA}
            avisoSinPagarDe={avisoSinPagarDe}
            marcaEnvioDe={SIN_MARCA}
            renderDetalle={renderDetalle}
            sinSeleccion
          />
        </div>

        <BostonDocumentosDrawer
          codigo={documentosDe ? codigoDeClienteBoston(documentosDe) : null}
          nombre={documentosDe ? nombreDeCliente(documentosDe) : ""}
          clienteSwitchId={documentosDe ? (idsSwitch.get(codigoDeClienteBoston(documentosDe)) ?? null) : null}
          onClose={() => setDocumentosDe(null)}
        />

        <BostonHojaCobrar
          cliente={cobrarA ? clienteParaCobrarBoston(cobrarA) : null}
          onClose={() => setCobrarA(null)}
          onVerDocumentos={(c) => {
            setCobrarA(null);
            setDocumentosDe(clients.find((x) => codigoDeClienteBoston(x) === c.codigo) ?? null);
          }}
          onProgramarCorreo={programarCorreo}
        />

        {pendingUndo && (
          <UndoToast message={pendingUndo.message} startedAt={pendingUndo.startedAt} onUndo={undoAction} />
        )}
        <Toast message={toast} />
      </div>
    </PullToRefresh>
  );
}
