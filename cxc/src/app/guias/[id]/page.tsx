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
import ListaEnvios from "../components/ListaEnvios";
import { useDespachoGuia } from "../components/useDespachoGuia";
import { fmtDate, fmtGuia } from "@/lib/format";
import {
  ETIQUETA_TIPO_DESPACHO,
  esEntregaDirecta,
  guiaSinNumeroTransp,
  sinCeroPelado,
  tipoDespachoEfectivo,
} from "@/lib/guias/modo-despacho";

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
                {/* Los bultos se SUMAN de los renglones, siempre: bodega los
                    corrige acá mismo y el total tiene que moverse con ellos.
                    (`guia_transporte` no tiene columna de total; el listado la
                    calcula igual.) */}
                <Dato etiqueta="Bultos" valor={String(items.reduce((a, i) => a + (i.bultos || 0), 0))} />
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

            {/* 🔴 LA MARCA DE LO QUE FALTÓ. El N° del transportista dejó de
                bloquear el despacho —*"a veces el transportista lo da, a veces
                no"*— y una guía puede salir sin él. Que no bloquee no significa
                que se pierda: queda dicho acá y en la lista de guías, para que
                alguien pueda encontrarlas.

                ⚠️ NO se ofrece anotarlo desde acá: una guía despachada está
                cerrada a edición y ese candado no se toca. Abrirle una puerta de
                escritura a una guía firmada es otra decisión, y es de Daniel. */}
            {guiaSinNumeroTransp(g) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-900">
                  Esta guía salió sin el N° del transportista.
                </p>
              </div>
            )}

            {/* 🔴 UNA SOLA LISTA DE ENVÍOS. Cada renglón trae su caja del N° del
                transportista y su botón "Corregir" — antes los mismos 7 envíos
                se dibujaban dos veces en esta pantalla (acá de solo lectura y
                otra vez completos dentro del formulario de despacho). */}
            <ListaEnvios
              items={items}
              numeroGuiaCabecera={g.numero_guia_transp}
              numerosTransp={s.numerosTransp}
              setNumeroTransp={s.setNumeroTransp}
              editable={!s.despachada && puedeDespachar}
              externo={s.tipoDespacho === "externo"}
              onCorregir={s.corregirItem}
            />

            {/* 🔴 LAS OBSERVACIONES, DONDE SE CARGA EL CAMIÓN.
                Se escriben al crear la guía y vivían SOLO en el acordeón de la
                lista y en el papel: quien despacha tenía que volver a la lista
                y abrir la guía ahí para leerlas. El dato ya viajaba a esta
                pantalla — solo no se dibujaba.

                Va acá, pegado a los envíos y ARRIBA de los campos que se
                llenan al despachar: se lee antes de trabajar, no después.

                ⚠️ Es de SOLO LECTURA. La observación se edita donde se
                editaba; esta pantalla la muestra, no la cambia.

                ⚠️ Y se muestra TAL CUAL está guardada. Hay basura adentro
                (GT-124 tiene "|", GT-001 tiene "S1373259"): filtrarla o
                "limpiarla" es decisión de Daniel, no de esta pantalla. */}
            {String(g.observaciones ?? "").trim() && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <span className="text-xs uppercase tracking-wide text-amber-700 block mb-1">
                  Observaciones
                </span>
                {/* Medido sobre las 36 notas reales de producción: mediana 32
                    caracteres, la más larga 83, máximo 2 líneas. Es texto
                    CORTO — se lee de un vistazo y NO se trunca (`break-words`
                    parte una palabra larga en vez de desbordar; `pre-wrap`
                    respeta el salto de línea de la única nota que lo tiene). */}
                <p className="text-sm text-amber-900 whitespace-pre-wrap break-words">
                  {String(g.observaciones ?? "").trim()}
                </p>
              </div>
            )}

            {s.despachada ? (
              /* Ya despachada: lo que se firmó, de solo lectura. */
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <span className="text-xs uppercase tracking-wide text-gray-400 block mb-3">
                  Ya despachada
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Dato etiqueta="Cómo salió" valor={ETIQUETA_TIPO_DESPACHO[tipoDespachoEfectivo(g)]} />
                  {/* En entrega directa no hay placa, y un "0" no es una placa. */}
                  {!esEntregaDirecta(g) && <Dato etiqueta="Placa" valor={sinCeroPelado(g.placa)} />}
                  {g.nombre_chofer && <Dato etiqueta="Chofer" valor={g.nombre_chofer} />}
                  <Dato etiqueta="Recibido por" valor={g.receptor_nombre || ""} />
                  <Dato etiqueta="Cédula" valor={g.cedula || ""} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  {g.firma_base64 && (
                    <div>
                      <span className="text-xs uppercase tracking-wide text-gray-400 block mb-1">
                        {esEntregaDirecta(g) ? "Firma del chofer" : "Firma del transportista"}
                      </span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={g.firma_base64} alt="Firma" className="h-12 border border-gray-200 rounded p-1 bg-white" />
                    </div>
                  )}
                  {g.firma_entregador_base64 && (
                    <div>
                      <span className="text-xs uppercase tracking-wide text-gray-400 block mb-1">
                        {esEntregaDirecta(g) ? "Firma del cliente" : "Firma del entregador"}
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
                juegos={s.juegos}
                onUsarJuego={s.usarJuego}
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
