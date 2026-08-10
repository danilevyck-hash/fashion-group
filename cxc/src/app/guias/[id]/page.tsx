"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LA PÁGINA DE UNA GUÍA. Acá se termina de despachar.
//
// 🩸 POR QUÉ EXISTE. En la lista, abrir una guía pendiente desplegaba el
// formulario de despacho ENTERO dentro de la fila —y arriba, en la misma
// tarjeta, un botón "Editar"—. Dos caminos para lo mismo. Daniel, textual:
// *"solo quiero una y en boton de editar para entrar a la guia y terminarla"*.
// Ahora la fila solo muestra la guía; el botón trae acá, y acá se termina.
//
// La lista NO perdió nada: los envíos, el chip del cliente, "Imprimir" y el
// menú "···" siguen en su acordeón, igual que antes. Lo único que salió de ahí
// es el formulario.
// ─────────────────────────────────────────────────────────────────────────────

import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast } from "@/components/ui";
import DespachoForm from "../components/DespachoForm";
import { useDespachoGuia } from "../components/useDespachoGuia";
import { fmtDate, fmtGuia } from "@/lib/format";
import { numeroTranspDeLinea } from "@/lib/guias/falta-para-despachar";

/** Los mismos que ya podían despachar desde la lista. Vendedor mira, no toca. */
const DESPACHO_ROLES = ["admin", "secretaria", "bodega"];

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <span className="text-xs uppercase tracking-wide text-gray-400 block">{etiqueta}</span>
      <span className="text-sm font-medium break-words">{valor || "—"}</span>
    </div>
  );
}

export default function GuiaPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? null;
  const { authChecked, role } = useAuth({
    moduleKey: "guias",
    allowedRoles: ["admin", "secretaria", "bodega", "vendedor"],
  });

  // 🔴 Hooks ANTES de cualquier return condicional (regla de React).
  const s = useDespachoGuia(authChecked ? id : null);

  if (!authChecked || !id) return null;

  const puedeDespachar = DESPACHO_ROLES.includes(role || "");
  const g = s.guia;
  const items = g?.guia_items || [];
  const titulo = g ? `Guía ${fmtGuia(g.numero)}` : "Guía";

  return (
    <div>
      <AppHeader
        module="Guías de Despacho"
        breadcrumbs={[{ label: g ? fmtGuia(g.numero) : "Guía" }]}
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {/* Encabezado: ‹ Atrás · Guía GT-190 */}
        <div className="flex items-center gap-3 mb-5">
          <button
            type="button"
            onClick={() => router.push("/guias")}
            className="inline-flex items-center min-h-[44px] px-2 -ml-2 text-sm text-blue-700 hover:text-blue-900 transition"
          >
            ‹ Atrás
          </button>
          <h1 className="text-lg font-semibold tracking-tight truncate">{titulo}</h1>
        </div>

        {s.loading ? (
          <div className="space-y-3">
            <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
            <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
          </div>
        ) : s.error || !g ? (
          <p className="text-sm text-red-500">{s.error || "No encontrada"}</p>
        ) : (
          <div className="space-y-4">
            {/* Datos de la guía */}
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Dato etiqueta="Fecha" valor={fmtDate(g.fecha)} />
                <Dato etiqueta="Transportista" valor={g.transportista || ""} />
                <Dato etiqueta="Envíos" valor={String(items.length)} />
                <Dato etiqueta="Bultos" valor={String(g.total_bultos ?? items.reduce((a, i) => a + (i.bultos || 0), 0))} />
              </div>
              {/* Cambiar los envíos vive en su propia pantalla, la de siempre.
                  Acá se termina el despacho; allá se corrigen los renglones. */}
              {!s.despachada && puedeDespachar && (
                <Link
                  href={`/guias/${id}/editar`}
                  className="mt-3 inline-flex items-center min-h-[44px] text-sm text-blue-700 hover:text-blue-900 transition"
                >
                  Cambiar los envíos de esta guía
                </Link>
              )}
            </div>

            {/* Los envíos, siempre visibles: se despacha mirándolos. */}
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <span className="text-xs uppercase tracking-wide text-gray-400 block mb-3">
                Envíos de esta guía
              </span>
              <ul className="divide-y divide-gray-100">
                {items.map((item, idx) => (
                  <li key={item.id || idx} className="py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-sm font-medium break-words">{item.cliente || "Sin cliente"}</span>
                      <span className="block text-xs text-gray-500 break-words">
                        {[item.direccion, item.empresa, item.facturas].filter(Boolean).join(" · ")}
                      </span>
                      {(s.despachada || !puedeDespachar) && (
                        <span className="block text-xs text-gray-500 mt-0.5">
                          N° guía transportista:{" "}
                          <span className="font-medium text-gray-700">
                            {numeroTranspDeLinea(item.numero_guia_transp, g.numero_guia_transp) || "—"}
                          </span>
                        </span>
                      )}
                    </div>
                    <span className="text-sm tabular-nums shrink-0">{item.bultos || 0} bultos</span>
                  </li>
                ))}
                {items.length === 0 && (
                  <li className="py-2.5 text-sm text-gray-400">Esta guía no tiene envíos cargados.</li>
                )}
              </ul>
            </div>

            {s.despachada ? (
              /* Ya despachada: lo que se firmó, de solo lectura. */
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <span className="text-xs uppercase tracking-wide text-gray-400 block mb-3">
                  {g.estado === "Rechazada" ? "Esta guía fue rechazada" : "Ya despachada"}
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Dato etiqueta="Cómo salió" valor={g.tipo_despacho === "directo" ? "Entrega directa" : "Transportista externo"} />
                  <Dato etiqueta="Placa" valor={g.placa || ""} />
                  {g.nombre_chofer && <Dato etiqueta="Chofer" valor={g.nombre_chofer} />}
                  <Dato etiqueta="Recibido por" valor={g.receptor_nombre || ""} />
                  <Dato etiqueta="Cédula" valor={g.cedula || ""} />
                </div>
                {g.motivo_rechazo && (
                  <div className="mt-3 rounded-md bg-red-50 border border-red-100 px-3 py-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-red-500">Motivo de rechazo</p>
                    <p className="text-xs text-red-700 mt-0.5">{g.motivo_rechazo}</p>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  {g.firma_base64 && (
                    <div>
                      <span className="text-xs uppercase tracking-wide text-gray-400 block mb-1">
                        {g.tipo_despacho === "directo" ? "Firma del chofer" : "Firma del transportista"}
                      </span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={g.firma_base64} alt="Firma" className="h-12 border border-gray-200 rounded p-1 bg-white" />
                    </div>
                  )}
                  {g.firma_entregador_base64 && (
                    <div>
                      <span className="text-xs uppercase tracking-wide text-gray-400 block mb-1">
                        {g.tipo_despacho === "directo" ? "Firma del cliente" : "Firma del entregador"}
                      </span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={g.firma_entregador_base64} alt="Firma" className="h-12 border border-gray-200 rounded p-1 bg-white" />
                    </div>
                  )}
                </div>
                <Link
                  href={`/guias/${id}/imprimir`}
                  className="mt-4 inline-flex items-center min-h-[44px] text-sm text-blue-700 hover:text-blue-900 transition"
                >
                  Ver e imprimir la guía
                </Link>
              </div>
            ) : puedeDespachar ? (
              <DespachoForm
                items={items}
                numerosTransp={s.numerosTransp}
                setNumeroTransp={s.setNumeroTransp}
                tipoDespacho={s.tipoDespacho}
                setTipoDespacho={s.setTipoDespacho}
                bPlaca={s.bPlaca}
                setBPlaca={s.setBPlaca}
                bReceptor={s.bReceptor}
                setBReceptor={s.setBReceptor}
                bCedula={s.bCedula}
                setBCedula={s.setBCedula}
                bChofer={s.bChofer}
                setBChofer={s.setBChofer}
                bSaving={s.bSaving}
                onConfirmar={(f1, f2) => { void s.confirmarDespacho(f1, f2); }}
                pendingFirma1={s.pendingFirma1}
                pendingFirma2={s.pendingFirma2}
                onFirma1Change={s.setPendingFirma1}
                onFirma2Change={s.setPendingFirma2}
              />
            ) : (
              <p className="text-sm text-gray-500">
                Esta guía todavía no se despachó. Solo bodega, secretaría o un
                administrador pueden despacharla.
              </p>
            )}
          </div>
        )}
        <Toast message={s.toast} />
      </div>
    </div>
  );
}
