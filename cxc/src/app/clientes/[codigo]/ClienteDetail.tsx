"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LA FICHA DEL CLIENTE — lo que se ve.
//
// 🔴 EL ORDEN LO DECIDIÓ DANIEL (5-sep-2026): nombre y una sola línea con lo
// fiscal · **cuatro tarjetas** · empresa por empresa · últimos pagos · contacto ·
// y el pie con enlaces. Lo primero que se ve son las cuatro tarjetas, porque son
// las cuatro preguntas que uno se hace al abrir un cliente: cuánto me compró,
// cuánto me debe, cuándo pagó y cuándo compró.
//
// 🔴 UN CERO GRANDE SE LEE COMO DATO ROTO. Ninguna tarjeta escribe `$0.00` en
// letra grande: cuando el dato no existe, dice en palabras qué pasa. La regla
// vive entera en `lib/clientes/ficha.ts` — esta pantalla solo la dibuja.
//
// 🩸 SE FUE EL BOTÓN «EDITAR CONTACTO». Medido el 5-sep-2026: en 150 clientes
// hay **2 notas escritas** y **cero ediciones registradas**. La pantalla estaba
// armada como un formulario (había que apretar «Editar», llenar, «Guardar») y se
// usaba como una pantalla de lectura. Ahora **se edita tocando el dato**: se
// toca, se escribe, y al salir del campo se guarda.
//
// 🩸 SE FUE LA COLUMNA «COBRADO» y el párrafo de ITBMS que la acompañaba. La
// tabla dice ahora lo que se compara: el año, el año pasado, la variación y lo
// que debe.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast, AccordionContent } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { hoyPanama } from "@/lib/fecha-panama";
import { telHref, mailtoHref } from "@/lib/contact-links";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { Ayuda } from "@/components/shared/Ayuda";
import {
  opcionesFichaCliente,
  ROLES_SYNC_FICHA_CLIENTE,
} from "@/components/shared/syncNowOpciones";
import { invalidarDirectorioClientes } from "@/lib/hooks/useBusquedaClientes";
import { fechaCortaPago, type PagoDelDia } from "@/lib/cxc/pagos-por-fecha";
import {
  dinero,
  tarjetaComproDelAnio,
  tarjetaDebe,
  tarjetaDeFecha,
  totalDeEmpresas,
  tieneAlgo,
  variacionVsAnterior,
  veElModulo,
  ROLES_CXC_EN_LA_FICHA,
  ROLES_VENTAS_EN_LA_FICHA,
  SIN_PAGOS_NUNCA,
  SIN_COMPRAS_NUNCA,
  type FilaEmpresa,
} from "@/lib/clientes/ficha";
import { lineaFiscal, ROTULO_DIRECCION_SWITCH } from "@/lib/clientes/direccion-switch";
import { textoYaNoEstaEnSwitch } from "@/lib/clientes/lista";
import type { FilaAgingCliente } from "@/lib/clientes/cliente-para-cobrar";
import CobrarEnFicha from "./CobrarEnFicha";

export type FilaAging = FilaAgingCliente;

/** Los módulos extra que el usuario tiene por `role_permissions`. Es lo que
 *  deja entrar a la secretaria a Cuentas por Cobrar, que no lo tiene por rol.
 *  Falla cerrado: sin poder leerlos, manda el rol. */
function modulosDeLaSesion(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const crudos = JSON.parse(sessionStorage.getItem("fg_modules") || "[]");
    return Array.isArray(crudos) ? (crudos as string[]) : [];
  } catch {
    return [];
  }
}

interface Cliente {
  id: string;
  codigo: string;
  nombre: string;
  razon_social: string | null;
  identificacion: string | null;
  dv: string | null;
  provincia: string | null;
  contacto?: string | null;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  notas: string | null;
  last_synced_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  /** Puesto = Switch ya no lo manda en NINGUNA de las 6 empresas. La ficha lo
   *  dice con fecha; la lista y la búsqueda global ya no lo ofrecen. */
  ausente_desde?: string | null;
  /** La dirección que manda Switch. 🔴 Se MUESTRA y **no alimenta Guías** — ver
   *  `lib/clientes/direccion-switch.ts`. `undefined` mientras la migración
   *  20260930120000 no corra. */
  direccion_switch?: string | null;
}

export interface ClienteDetailData {
  cliente: Cliente;
  anio: number;
  empresas: FilaEmpresa[];
  /** Lo facturado sin restar notas de crédito: distingue «nunca compró» de
   *  «compró y se le acreditó todo». */
  compras_brutas: number;
  ultima_compra: string | null;
  ultimo_pago: { fecha: string; monto: number } | null;
  pagos_por_fecha: PagoDelDia[];
  documentos_con_saldo: number;
  ultimas_guias?: { id: string; numero: number; fecha: string }[];
  aging: FilaAging[];
}

/** Quién puede escribir en la ficha. Es la MISMA lista que `WRITE_ROLES` de
 *  `/api/clientes/[codigo]`: si la pantalla ofreciera más, el campo se
 *  editaría y el servidor lo rechazaría. */
const EDITABLE_ROLES = ["admin", "secretaria"];

export default function ClienteDetail({ initialData }: { initialData: ClienteDetailData }) {
  const { authChecked, role } = useAuth({
    moduleKey: "directorio",
    allowedRoles: ["admin", "secretaria", "vendedor", "bodega"],
  });
  const router = useRouter();

  const [cliente, setCliente] = useState<Cliente>(initialData.cliente);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hojaCobrar, setHojaCobrar] = useState(false);
  const [cajonDocs, setCajonDocs] = useState(false);
  const [guiasAbiertas, setGuiasAbiertas] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);

  // La página es server-rendered: tras «Actualizar ahora» llega un initialData
  // fresco. No se re-siembra mientras se está escribiendo en un campo.
  useEffect(() => {
    if (!editando) setCliente(initialData.cliente);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData.cliente]);

  const guardar = useCallback(async (campo: string, valor: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/clientes/${encodeURIComponent(initialData.cliente.codigo)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [campo]: valor }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "No se pudo guardar. Intenta de nuevo en unos segundos.");
        return;
      }
      setCliente(json.cliente);
      // El selector de clientes (Guías, Recordatorios, Marketing) guarda el
      // directorio en memoria: la app navega sin recargar, así que ese caché
      // sobreviviría a esta edición y seguiría mostrando el dato viejo.
      invalidarDirectorioClientes();
      // ⚠️ La migración del contacto la corre Daniel: si todavía no corrió, lo
      // demás SÍ se guardó y hay que decir qué no.
      setToast(
        campo === "contacto" && json.contactoGuardado === false && valor.trim() !== ""
          ? "Guardado — el contacto todavía no se puede guardar"
          : "Listo, guardado",
      );
    } catch {
      setError("No se pudo guardar. Intenta de nuevo en unos segundos.");
    }
  }, [initialData.cliente.codigo]);

  if (!authChecked) return null;

  const puedeEditar = EDITABLE_ROLES.includes(role);
  // 🔴 «Cobrar», «Ver los N documentos» y «Ver en Cuentas por Cobrar» solo para
  // quien TIENE ese módulo: las rutas de atrás le contestan 403 a bodega, y un
  // botón que siempre falla es peor que no tener el botón. «Ver en Ventas» solo
  // admin, que es el único rol de ese módulo. La regla es PURA (`veElModulo`);
  // acá solo se le pasan el rol y los módulos de la sesión.
  const modulosDelUsuario = modulosDeLaSesion();
  const veCxc = veElModulo(role, ROLES_CXC_EN_LA_FICHA, modulosDelUsuario, "cxc");
  const veVentas = veElModulo(role, ROLES_VENTAS_EN_LA_FICHA, modulosDelUsuario, "ventas");

  const hoy = hoyPanama();
  const anio = initialData.anio;
  const filas = initialData.empresas;
  const total = totalDeEmpresas(filas);
  const activas = filas.filter(tieneAlgo);

  const compro = tarjetaComproDelAnio(total.compras, initialData.compras_brutas, total.comprasAnterior, anio);
  const debe = tarjetaDebe(total.debe, total.compras);
  const pago = tarjetaDeFecha(
    initialData.ultimo_pago?.fecha ?? null,
    hoy,
    initialData.ultimo_pago ? fmtDate(initialData.ultimo_pago.fecha) : "",
    SIN_PAGOS_NUNCA,
    initialData.ultimo_pago?.monto ?? null,
  );
  const compra = tarjetaDeFecha(
    initialData.ultima_compra,
    hoy,
    initialData.ultima_compra ? fmtDate(initialData.ultima_compra) : "",
    SIN_COMPRAS_NUNCA,
  );

  const fiscal = lineaFiscal({
    codigo: cliente.codigo,
    razonSocial: cliente.razon_social,
    ruc: cliente.identificacion,
    direccionSwitch: cliente.direccion_switch,
    provincia: cliente.provincia,
  });

  const opcionesSync = opcionesFichaCliente(activas.map((e) => e.empresa));

  return (
    <div className="min-h-screen bg-white">
      <AppHeader module="Clientes" breadcrumbs={[{ label: cliente.codigo }]} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-2">
          <Link href="/clientes" className="inline-flex min-h-[44px] items-center text-xs text-gray-500 hover:text-black transition">
            ← Clientes
          </Link>
        </div>

        {/* ── 1. ENCABEZADO — el nombre grande y UNA sola línea con lo fiscal ── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{cliente.nombre}</h1>
            <p className="mt-1 text-sm text-gray-500 tabular-nums">{fiscal}</p>
            {cliente.direccion_switch && (
              <p className="mt-0.5 text-xs text-gray-400">
                {ROTULO_DIRECCION_SWITCH}: {cliente.direccion_switch}
              </p>
            )}
            {cliente.ausente_desde && (
              <div className="mt-2 inline-flex items-center rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                {textoYaNoEstaEnSwitch(fmtDate(cliente.ausente_desde.slice(0, 10)))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <SyncNowButton
              opciones={opcionesSync}
              secuencial
              engancharRunning
              roles={ROLES_SYNC_FICHA_CLIENTE}
              resumenExito="Listo, cliente actualizado"
              onSuccess={() => router.refresh()}
            />
            {veCxc && (
              <button
                type="button"
                onClick={() => setHojaCobrar(true)}
                className="inline-flex min-h-[44px] items-center justify-center bg-black text-white text-sm font-medium rounded-md px-4 py-2 transition active:scale-[0.97]"
              >
                Cobrar
              </button>
            )}
          </div>
        </div>

        {/* ── 2. LAS CUATRO TARJETAS ─────────────────────────────────────── */}
        <div data-bloque="tarjetas" className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Tarjeta titulo={`Compró ${anio}`}>
            {compro.monto != null ? (
              <p className="text-xl font-semibold tabular-nums text-gray-900">{dinero(compro.monto)}</p>
            ) : (
              <p className="text-sm font-medium text-gray-500">{compro.frase}</p>
            )}
            {compro.delta && (
              <p
                className={`mt-1 text-xs tabular-nums ${
                  compro.tendencia === "sube" ? "text-emerald-700" : compro.tendencia === "baja" ? "text-red-600" : "text-gray-500"
                }`}
              >
                {compro.delta}
              </p>
            )}
          </Tarjeta>

          <Tarjeta titulo="Debe">
            {debe.monto != null ? (
              <p className="text-xl font-semibold tabular-nums text-red-700">{dinero(debe.monto)}</p>
            ) : (
              <p className="text-sm font-medium text-gray-500">{debe.frase}</p>
            )}
            {debe.proporcion && <p className="mt-1 text-xs text-gray-500">{debe.proporcion}</p>}
          </Tarjeta>

          <Tarjeta titulo="Último pago">
            {pago.cuando ? (
              <p className="text-xl font-semibold text-gray-900">{pago.cuando}</p>
            ) : (
              <p className="text-sm font-medium text-gray-500">{pago.frase}</p>
            )}
            {pago.detalle && <p className="mt-1 text-xs text-gray-500 tabular-nums">{pago.detalle}</p>}
          </Tarjeta>

          <Tarjeta titulo="Última compra">
            {compra.cuando ? (
              <p className="text-xl font-semibold text-gray-900">{compra.cuando}</p>
            ) : (
              <p className="text-sm font-medium text-gray-500">{compra.frase}</p>
            )}
            {compra.detalle && <p className="mt-1 text-xs text-gray-500 tabular-nums">{compra.detalle}</p>}
          </Tarjeta>
        </div>

        {/* ── 3. EMPRESA POR EMPRESA ─────────────────────────────────────── */}
        <section className="border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-1 mb-3">
            <h2 className="text-xs uppercase tracking-[0.05em] text-gray-400">Empresa por empresa</h2>
            {/* 🩸 POR QUÉ «COMPRÓ» Y «DEBE» NO CUADRAN ENTRE SÍ — la pregunta que
                se hace cualquiera al ver las dos cifras juntas. Daniel lo dijo
                así: *«cxc si se muestra con itbms, porq es lo que tengo q
                cobrar»*. NO SE BORRA NUNCA: sin esta explicación la tabla se lee
                como un error de la app, y ahora hace MÁS falta que antes porque
                la tarjeta «Debe» divide una cifra por la otra.
                ⚠️ Lo que se fue el 5-sep-2026 fue la columna «Cobrado» y su
                mención; la explicación quedó, más corta, con las dos columnas
                que hoy están en pantalla. */}
            <Ayuda titulo="Por qué las cifras no cuadran entre sí">
              <span className="font-medium text-gray-900">Compró</span> va sin ITBMS — el impuesto se
              cobra para el fisco, no es venta de la empresa.{" "}
              <span className="font-medium text-gray-900">Debe</span> va con ITBMS, porque es la plata
              que falta cobrar.
            </Ayuda>
          </div>
          {activas.length === 0 ? (
            <p className="text-sm text-gray-500">Todavía no hay movimientos de este cliente.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.05em] text-gray-400 border-b border-gray-200">
                    <th className="py-2 font-normal">Empresa</th>
                    <th className="py-2 font-normal text-right">{anio}</th>
                    <th className="py-2 font-normal text-right">{anio - 1}</th>
                    <th className="py-2 font-normal text-right whitespace-nowrap">vs {anio - 1}</th>
                    <th className="py-2 font-normal text-right">Debe</th>
                  </tr>
                </thead>
                <tbody>
                  {activas.map((e) => (
                    <tr key={e.empresa} className="border-b border-gray-100">
                      <td className="py-2 text-gray-700">{nombreCortoEmpresa(e.empresa)}</td>
                      <td className="py-2 text-right tabular-nums">{dinero(e.compras)}</td>
                      <td className="py-2 text-right tabular-nums text-gray-500">
                        {e.comprasAnterior != null ? dinero(e.comprasAnterior) : "—"}
                      </td>
                      <CeldaVariacion actual={e.compras} anterior={e.comprasAnterior} />
                      <CeldaDebe valor={e.debe} />
                    </tr>
                  ))}
                  <tr className="font-medium">
                    <td className="py-2.5">Total</td>
                    <td className="py-2.5 text-right tabular-nums">{dinero(total.compras)}</td>
                    <td className="py-2.5 text-right tabular-nums text-gray-500">
                      {total.comprasAnterior != null ? dinero(total.comprasAnterior) : "—"}
                    </td>
                    <CeldaVariacion actual={total.compras} anterior={total.comprasAnterior} className="py-2.5" />
                    <CeldaDebe valor={total.debe} className="py-2.5" />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── 4. ÚLTIMOS PAGOS — POR FECHA, no por empresa ────────────────
            🔴 Los clientes grandes le pagan a VARIAS empresas el mismo día: el
            20-ago D-25 pagó $234.189,21 repartido en cuatro. Por empresa eso
            son 12 líneas para decir lo que dicen 3, y ninguna dice cuánto entró
            ese día. Se REUSA el agrupador del CXC (`pagos-por-fecha.ts`). */}
        <section className="border border-gray-200 rounded-lg p-4 mb-4">
          <h2 className="text-xs uppercase tracking-[0.05em] text-gray-400 mb-2">Últimos pagos</h2>
          {initialData.pagos_por_fecha.length === 0 ? (
            <p className="text-sm text-gray-500">Todavía no hay pagos registrados.</p>
          ) : (
            <ul className="space-y-1">
              {initialData.pagos_por_fecha.map((p) => (
                <li key={p.fecha} className="text-sm text-gray-600 tabular-nums">
                  <span className="text-gray-500">{fechaCortaPago(p.fecha, hoy)}</span>
                  {" · "}
                  <span className="font-medium text-gray-900">{dinero(p.monto)}</span>
                  {p.empresas.length > 0 && (
                    <span className="text-gray-500">
                      {" · "}
                      {p.empresas.map((e) => nombreCortoEmpresa(e)).join(" · ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── 5. CONTACTO — se edita TOCANDO el dato ──────────────────────── */}
        <section className="border border-gray-200 rounded-lg p-4 mb-4">
          <h2 className="text-xs uppercase tracking-[0.05em] text-gray-400 mb-3">Contacto</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-3 gap-x-6 text-sm">
            {/* 🔴 «Contacto» va PRIMERO: es lo que se pregunta al llamar a
                cobrar («¿con quién hablo?»). */}
            <CampoEnLinea
              campo="contacto" rotulo="Contacto" valor={cliente.contacto ?? null}
              puedeEditar={puedeEditar} editando={editando} setEditando={setEditando} onGuardar={guardar}
            />
            <CampoEnLinea
              campo="email" rotulo="Correo" valor={cliente.email} tipo="email"
              href={mailtoHref(cliente.email)} falta="Falta el correo"
              puedeEditar={puedeEditar} editando={editando} setEditando={setEditando} onGuardar={guardar}
            />
            <CampoEnLinea
              campo="telefono" rotulo="Teléfono" valor={cliente.telefono || cliente.celular}
              href={telHref(cliente.telefono || cliente.celular)} falta="Falta el teléfono"
              puedeEditar={puedeEditar} editando={editando} setEditando={setEditando} onGuardar={guardar}
            />
          </div>
          <div className="mt-3 border-t border-gray-100 pt-3">
            <CampoEnLinea
              campo="notas" rotulo="Notas" valor={cliente.notas} multilinea
              puedeEditar={puedeEditar} editando={editando} setEditando={setEditando} onGuardar={guardar}
            />
          </div>
          {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
          {puedeEditar && (
            <p className="mt-3 text-xs text-gray-400">Toca un dato para cambiarlo. Se guarda al salir del campo.</p>
          )}
        </section>

        {/* ── 6. EL PIE: ENLACES, NO BOTONES ──────────────────────────────── */}
        <nav aria-label="Más sobre este cliente" className="border-t border-gray-100 pt-4 space-y-1">
          {veCxc && initialData.documentos_con_saldo > 0 && (
            <button
              type="button"
              onClick={() => setCajonDocs(true)}
              className="block min-h-[44px] w-full text-left text-sm text-blue-600 hover:underline"
            >
              Ver los {initialData.documentos_con_saldo}{" "}
              {initialData.documentos_con_saldo === 1 ? "documento" : "documentos"} ›
            </button>
          )}

          {initialData.ultimas_guias && initialData.ultimas_guias.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setGuiasAbiertas((v) => !v)}
                aria-expanded={guiasAbiertas}
                className="block min-h-[44px] w-full text-left text-sm text-blue-600 hover:underline"
              >
                Últimas guías {guiasAbiertas ? "▾" : "›"}
              </button>
              <AccordionContent open={guiasAbiertas}>
                <ul className="divide-y divide-gray-100 pb-2">
                  {initialData.ultimas_guias.map((g) => (
                    <li key={g.id}>
                      <Link
                        href={`/guias/${g.id}/imprimir`}
                        className="-mx-2 flex items-center justify-between rounded px-2 py-2 text-sm transition hover:bg-gray-50"
                      >
                        <span className="text-gray-700">Guía #{g.numero}</span>
                        <span className="tabular-nums text-gray-400">{fmtDate(g.fecha.slice(0, 10))} ›</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </div>
          )}

          {veCxc && (
            <Link
              href={`/cxc?search=${encodeURIComponent(cliente.nombre)}`}
              className="block min-h-[44px] text-sm leading-[44px] text-blue-600 hover:underline"
            >
              Ver en Cuentas por Cobrar ›
            </Link>
          )}
          {veVentas && (
            <Link
              href={`/ventas?tab=clientes&cliente=${encodeURIComponent(cliente.codigo)}`}
              className="block min-h-[44px] text-sm leading-[44px] text-blue-600 hover:underline"
            >
              Ver en Ventas ›
            </Link>
          )}
        </nav>

        {cliente.last_synced_at && (
          <p className="mt-4 text-xs text-gray-400">
            Actualizado desde Switch el {fmtDate(cliente.last_synced_at.slice(0, 10))}
          </p>
        )}
      </main>

      {veCxc && (
        <CobrarEnFicha
          datos={{
            codigo: cliente.codigo,
            nombre: cliente.nombre,
            contacto: cliente.contacto,
            email: cliente.email,
            telefono: cliente.telefono,
            celular: cliente.celular,
          }}
          aging={initialData.aging}
          hojaAbierta={hojaCobrar}
          onCerrarHoja={() => setHojaCobrar(false)}
          cajonAbierto={cajonDocs}
          onCerrarCajon={() => setCajonDocs(false)}
          onAbrirHoja={() => setHojaCobrar(true)}
        />
      )}

      <Toast message={toast} type="success" onDismiss={() => setToast(null)} />
    </div>
  );
}

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="text-xs uppercase tracking-[0.05em] text-gray-400">{titulo}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/** La variación contra el año pasado. Sin base el año pasado NO hay porcentaje:
 *  pasar de $0 a $50.000 no es crecer «infinito». */
function CeldaVariacion({ actual, anterior, className = "py-2" }: { actual: number; anterior: number | null; className?: string }) {
  const v = variacionVsAnterior(actual, anterior);
  if (!v) return <td className={`${className} text-right text-gray-300`}>—</td>;
  const baja = v.startsWith("−");
  return (
    <td className={`${className} text-right tabular-nums ${baja ? "text-red-600" : "text-emerald-700"}`}>{v}</td>
  );
}

/** Saldo a favor del CLIENTE (negativo) en azul: no es deuda, es crédito. */
function CeldaDebe({ valor, className = "py-2" }: { valor: number; className?: string }) {
  if (valor < 0) {
    return <td className={`${className} text-right tabular-nums text-blue-600`}>Saldo a favor {dinero(Math.abs(valor))}</td>;
  }
  return (
    <td className={`${className} text-right tabular-nums ${valor > 0 ? "text-red-700" : "text-gray-400"}`}>
      {valor > 0 ? dinero(valor) : "—"}
    </td>
  );
}

/**
 * 🔴 SE EDITA TOCANDO EL DATO — sin botón «Editar», sin «Guardar» y sin
 * «Cancelar». Se toca, se escribe y al salir del campo (o con Enter) se guarda;
 * Escape deja las cosas como estaban.
 *
 * Cuando el dato FALTA se dice en rojo lo que falta, no un «—» gris: la lista de
 * clientes hace lo mismo, y arreglar esos datos es el trabajo de este módulo.
 */
function CampoEnLinea({
  campo, rotulo, valor, tipo, href, falta, multilinea, puedeEditar, editando, setEditando, onGuardar,
}: {
  campo: string;
  rotulo: string;
  valor: string | null | undefined;
  tipo?: string;
  href?: string | null;
  falta?: string;
  multilinea?: boolean;
  puedeEditar: boolean;
  editando: string | null;
  setEditando: (c: string | null) => void;
  onGuardar: (campo: string, valor: string) => Promise<void>;
}) {
  const abierto = editando === campo;
  const [borrador, setBorrador] = useState(valor ?? "");
  const original = useRef(valor ?? "");

  useEffect(() => {
    if (!abierto) { setBorrador(valor ?? ""); original.current = valor ?? ""; }
  }, [valor, abierto]);

  const cerrar = (guardando: boolean) => {
    setEditando(null);
    // No se manda nada si no cambió nada: abrir un campo y salir no puede
    // producir una escritura contra sí misma.
    if (guardando && borrador.trim() !== original.current.trim()) {
      void onGuardar(campo, borrador);
    } else if (!guardando) {
      setBorrador(original.current);
    }
  };

  if (abierto) {
    const comun = {
      autoFocus: true,
      value: borrador,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setBorrador(e.target.value),
      onBlur: () => cerrar(true),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") { e.preventDefault(); cerrar(false); }
        if (e.key === "Enter" && !multilinea) { e.preventDefault(); (e.target as HTMLElement).blur(); }
      },
      className: "w-full border border-black rounded-md px-2 py-1.5 text-sm outline-none",
    };
    return (
      <div>
        <label className="block text-xs uppercase tracking-[0.05em] text-gray-400 mb-1" htmlFor={`campo-${campo}`}>{rotulo}</label>
        {multilinea
          ? <textarea id={`campo-${campo}`} rows={3} {...comun} />
          : <input id={`campo-${campo}`} type={tipo || "text"} {...comun} />}
      </div>
    );
  }

  const hay = !!(valor && valor.trim());
  const texto = hay ? (
    <span className="text-gray-900 whitespace-pre-wrap">{valor}</span>
  ) : (
    <span className={falta ? "text-red-600" : "text-gray-400"}>{falta ?? "—"}</span>
  );

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.05em] text-gray-400">{rotulo}</p>
      <div className="mt-0.5 flex items-baseline gap-2 text-sm">
        {/* ⚠️ El enlace de llamar/escribir va AL LADO, nunca adentro del botón
            de editar: un `<a>` dentro de un `<button>` es HTML inválido y en el
            iPhone se pelean los dos toques. Tocar el dato edita; el enlace corto
            de al lado llama o escribe. */}
        {puedeEditar ? (
          <button
            type="button"
            onClick={() => setEditando(campo)}
            aria-label={`Cambiar ${rotulo.toLowerCase()}`}
            className="-mx-1 min-h-[32px] flex-1 rounded px-1 text-left transition hover:bg-gray-50"
          >
            {texto}
          </button>
        ) : (
          <div className="flex-1">
            {hay && href ? (
              <a
                href={href}
                className="relative text-blue-600 hover:underline after:absolute after:-inset-y-[14px] after:inset-x-0 after:content-['']"
              >
                {valor}
              </a>
            ) : (
              texto
            )}
          </div>
        )}
        {puedeEditar && hay && href && (
          <a
            href={href}
            className="relative shrink-0 text-xs text-blue-600 hover:underline after:absolute after:-inset-y-[13px] after:inset-x-0 after:content-['']"
            aria-label={`${tipo === "email" ? "Escribir a" : "Llamar a"} ${valor}`}
          >
            {tipo === "email" ? "Escribir" : "Llamar"}
          </a>
        )}
      </div>
    </div>
  );
}
