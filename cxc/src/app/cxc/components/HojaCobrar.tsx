"use client";

// ─────────────────────────────────────────────────────────────────────────────
// «COBRAR» — UNA HOJA, CUATRO SALIDAS.
//
// 🩸 QUÉ REEMPLAZA (5-sep-2026). Para mandarle el estado de cuenta a un cliente
// había SEIS puertas que hacían lo mismo: las 4 opciones del menú "···", el
// botón negro «Estado de cuenta» del panel expandido, y el menú de clic
// derecho. Ninguna se veía sin abrir algo, ninguna decía qué iba a salir, y las
// tres listas de opciones vivían en tres archivos distintos que había que
// mantener iguales a mano.
//
// Ahora hay UN botón visible en cada fila —«Cobrar»— que abre esta hoja. La
// hoja dice ARRIBA qué se va a mandar (al día, cuántas empresas, cuánto) y
// ofrece las cuatro salidas, en el orden en que se usan.
//
// 🔴 LO QUE SE MANDA SON SIEMPRE LAS 6 EMPRESAS, sin importar el filtro de la
// pantalla. Daniel: *«todo»*. La regla vive en el SERVIDOR
// (`empresasDelEnvio()` en `/api/cxc/enviar-email`), no acá: esta hoja pinta lo
// que esa ruta le contesta. Candado: `cxc-cobrar-manda-las-seis.test.ts`.
//
// 🔴 EL CORREO SE MANDA CON UN CLIC, y por eso trae DESHACER de 5 segundos —el
// patrón `useUndoAction`/`UndoToast` del sistema—: el envío real ocurre recién
// al vencer esos 5 segundos. Sin ventana de compose de por medio; quien quiera
// escribirlo tiene «Escribirlo yo», que abre el formulario completo de siempre.
//
// ⚠️ Sin correo cargado la fila de Correo sale APAGADA y dice dónde cargarlo.
// Medido el 5-sep-2026: 21 de los 100 clientes con saldo no tienen correo.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import Link from "next/link";
import { ModalOverlay } from "@/components/ui";
import type { ConsolidatedClient } from "@/lib/types";
import { nombreDeCliente } from "@/lib/cxc/nombre-cliente";
import { fmt, fmtDate } from "@/lib/format";
import type { EstadoCuenta } from "./EstadoCuentaDrawer";
import { cuadrarConSwitch } from "@/lib/cxc/estado-cuenta-switch";
import { Aviso } from "@/components/ui/Aviso";
import { aparatoDeQuienMira } from "@/lib/aparato";
import { compartirArchivo, descargarArchivo } from "@/lib/compartir-archivo";
import { ESTADO_CUENTA_UN_BOTON_2026_10 } from "@/lib/cxc/estado-cuenta-un-boton-2026-10";
import { montoExacto, type RenglonEmpresaCliente } from "@/lib/cxc/lista-celular";
import { montoDeTabla, nombreCortoEmpresa, totalDelDesglose } from "@/lib/cxc/desglose-celular-2026-11";
import { daysSince, daysAgingColor } from "@/lib/cxc-aging";

/** El código Switch (D-XXX) es el mismo en todas las empresas del cliente. */
function codigoDe(client: ConsolidatedClient): string | null {
  return Object.values(client.companies).find((c) => c?.codigo)?.codigo ?? null;
}
// 🔴 El nombre que se LEE sale de UNA función, la misma del papel
// (`lib/cxc/nombre-cliente.ts`). Acá vivía una copia suya, sin el respaldo
// capitalizado. Ver el encabezado de ese archivo (20-sep-2026).
const nombreDe = (client: ConsolidatedClient): string => nombreDeCliente(client);

/** Lo que hay que saber para mandar el correo cuando venzan los 5 segundos. */
export interface CorreoProgramado {
  codigo: string;
  nombre: string;
  nombreNormalizado: string;
  destinatario: string;
  asunto: string;
  cuerpo: string;
}

interface Preview {
  destinatario: string;
  asunto: string;
  cuerpo: string;
  sharedCount: number;
  totalDocs: number;
  estadoCuenta: EstadoCuenta;
}

interface Props {
  client: ConsolidatedClient | null;
  onClose: () => void;
  /** Programa el envío con sus 5 segundos de «Deshacer». */
  onProgramarCorreo: (datos: CorreoProgramado) => void;
  onWhatsApp: (client: ConsolidatedClient) => void;
  onCopiar: (client: ConsolidatedClient) => void;
  /** Abre el formulario completo (destinatario/asunto/cuerpo editables). */
  onEscribirloYo: (client: ConsolidatedClient) => void;
  /** «Le enviaste el estado de cuenta hace 3 días», o `null`. */
  marcaEnvio: string | null;
  /**
   * 🔴 LO QUE AGREGÓ EL CELULAR (24-sep-2026), y SOLO eso: dos líneas de
   * contexto y una salida de lectura. Nada de lo que se MANDA cambió — las
   * cuatro salidas, las 6 empresas del servidor y el deshacer de 5 s son los
   * mismos. Sin estas props la hoja se dibuja EXACTAMENTE como el 5-sep-2026,
   * que es lo que ve la computadora.
   */
  /** El saldo exacto que trae la fila: se lee sin esperar a la red. */
  totalDeLaFila?: number | null;
  /** «Último pago 20 ago · $234,189.21», ya redactado por quien abre la hoja. */
  ultimoPagoTexto?: string | null;
  /** A dónde lleva «Ver los documentos ›». `null` = no se dibuja. */
  hrefDocumentos?: string | null;
  /**
   * 🔴 GRUPO POR OMISIÓN; UNA SOLA EMPRESA CUANDO HAGA FALTA (7-oct-2026,
   * propuesta). Es el MISMO filtro de empresa que ya tiene la lista arriba —
   * no se agrega un selector nuevo: con «Todas» (`"all"` o sin valor) el PDF
   * que se DESCARGA es el del grupo; filtrada a una empresa, el PDF es solo
   * de esa empresa. ⚠️ Lo que se ENVÍA por correo o WhatsApp NO mira este
   * filtro: sigue siendo SIEMPRE las 6 empresas (`empresasDelEnvio()`, en el
   * servidor) — ésa es la deuda completa, la única cifra que el cliente puede
   * reconocer. Interruptor `ESTADO_CUENTA_UN_BOTON_2026_10`.
   */
  companyFilter?: string;
  /**
   * 🔴 EL DESGLOSE POR EMPRESA DEL CELULAR (12-nov-2026,
   * `CXC_DESGLOSE_CELULAR_2026_11`). Con filas, la hoja abre con el nombre de
   * título, el total grande, la tabla por empresa y «Enviar estado de cuenta»,
   * que despliega las MISMAS cuatro salidas. `null` = la hoja de siempre (lo
   * que ve la computadora).
   */
  desglose?: RenglonEmpresaCliente[] | null;
}

export default function HojaCobrar({
  client,
  onClose,
  onProgramarCorreo,
  onWhatsApp,
  onCopiar,
  onEscribirloYo,
  marcaEnvio,
  totalDeLaFila = null,
  ultimoPagoTexto = null,
  hrefDocumentos = null,
  companyFilter,
  desglose = null,
}: Props) {
  const abierto = !!client;
  const codigo = client ? codigoDe(client) : null;
  const nombre = client ? nombreDe(client) : "";
  const nombreNormalizado = client?.nombre_normalized ?? "";

  const [preview, setPreview] = useState<Preview | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [salidasAbiertas, setSalidasAbiertas] = useState(false);
  useEffect(() => { setSalidasAbiertas(false); }, [client]);

  useEffect(() => {
    if (!abierto || !codigo) return;
    let cancelado = false;
    setCargando(true);
    setError(null);
    setPreview(null);
    const params = new URLSearchParams({ codigo, nombre, nombreNormalizado });
    fetch(`/api/cxc/enviar-email?${params.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http"))))
      .then((d: Preview) => { if (!cancelado) setPreview(d); })
      .catch(() => { if (!cancelado) setError("No se pudo preparar el estado de cuenta. Intenta de nuevo en unos segundos."); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [abierto, codigo, nombre, nombreNormalizado]);

  if (!abierto || !client) return null;

  const datos = preview?.estadoCuenta ?? null;
  const empresas = datos?.empresas.length ?? 0;
  const encabezado = datos
    ? `Estado de cuenta al ${fmtDate(datos.generadoEn.slice(0, 10))} · ${empresas} ${empresas === 1 ? "empresa" : "empresas"} · $${fmt(datos.total)}`
    : "Preparando el estado de cuenta…";

  const tieneCorreo = !!preview?.destinatario;

  // 🔴 SI EL TOTAL NO CUADRA CONTRA SWITCH, SE DICE ANTES DE MANDARLO
  // (9-sep-2026). Es el último momento en que se puede parar: de acá para
  // adelante el papel ya salió al cliente con un número que Switch no
  // reconoce. Sin dato de Switch no se afirma nada.
  const saldoSwitch = datos
    ? datos.empresas.reduce<number | null>(
        (acc, e) => (e.saldoSwitch == null ? acc : (acc ?? 0) + e.saldoSwitch),
        null,
      )
    : null;
  const cuadre = datos ? cuadrarConSwitch(datos.total, saldoSwitch) : null;

  // 🔴 EN LA COMPUTADORA SIEMPRE SE DESCARGA (7-oct-2026). Preguntarle al
  // navegador si "puede compartir archivos" (`canShare`) ya no distingue
  // celular de computadora: Chrome y Safari de escritorio, sobre HTTPS (y
  // sobre `localhost`), también contestan que sí. El botón entonces abría la
  // hoja nativa del SISTEMA —sin "guardar" ni WhatsApp entre las opciones— y
  // se quedaba «ocupado» (gris) todo el tiempo que esa hoja estuviera abierta,
  // medido con un navegador real, no solo leyendo el código. Se pregunta por
  // el DEDO (`lib/aparato.ts`), la misma regla que ya usa «Compartir» de
  // Guías, y el PDF se entrega con la misma puerta única (`compartirArchivo`).
  async function entregarPdf() {
    if (!datos || !codigo) return;
    setOcupado(true);
    setError(null);
    try {
      // 🔴 DESCARGAR RESPETA EL FILTRO DE EMPRESA; ENVIAR NO (7-oct-2026,
      // propuesta). Con la lista mirando una sola empresa, el PAPEL que se
      // baja es de esa empresa sola — se pide por la MISMA puerta que ya mira
      // el cajón de documentos (`/api/cxc/estado-cuenta/[codigo]`). Sin
      // filtro (o «Todas»), sigue siendo el `datos` del grupo que ya se
      // preparó para enviar. Interruptor `ESTADO_CUENTA_UN_BOTON_2026_10`:
      // apagado, siempre se descarga `datos` tal cual, como hoy.
      let datosPdf = datos;
      let unaEmpresaElegida = false;
      if (ESTADO_CUENTA_UN_BOTON_2026_10 && companyFilter && companyFilter !== "all") {
        const r = await fetch(
          `/api/cxc/estado-cuenta/${encodeURIComponent(codigo)}?empresa=${encodeURIComponent(companyFilter)}`,
          { cache: "no-store" },
        );
        if (r.ok) { datosPdf = await r.json(); unaEmpresaElegida = true; }
      }
      const { buildEstadoCuentaPDF } = await import("@/lib/pdf-estado-cuenta");
      const { doc, filename } = buildEstadoCuentaPDF(datosPdf, nombre, { unaEmpresaElegida });
      const blob = doc.output("blob");
      const file = new File([blob], filename, { type: "application/pdf" });
      if (aparatoDeQuienMira() === "celular") {
        const resultado = await compartirArchivo(file, {
          title: "Estado de cuenta",
          text: `Estado de cuenta — ${nombre}`,
        });
        if (resultado === "cancelado") return;
      } else {
        descargarArchivo(file);
      }
    } catch (e) {
      console.error("[cxc/cobrar] PDF:", e);
      setError("No se pudo preparar el PDF. Intenta de nuevo en unos segundos.");
    } finally {
      setOcupado(false);
    }
  }

  function mandarCorreo() {
    if (!preview || !codigo || !preview.destinatario) return;
    onProgramarCorreo({
      codigo,
      nombre,
      nombreNormalizado,
      destinatario: preview.destinatario,
      asunto: preview.asunto,
      cuerpo: preview.cuerpo,
    });
    onClose();
  }

  const avisos = (
    <>
      {cuadre && !cuadre.cuadra && cuadre.aviso && (
        <Aviso
        >
          {cuadre.aviso}
        </Aviso>
      )}

      {preview && preview.sharedCount >= 10 && (
        <Aviso
        >
          Correo registrado en {preview.sharedCount} clientes distintos. Verifica el destinatario.
        </Aviso>
      )}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

    </>
  );

  const salidas = (
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
        <FilaAccion
          titulo="Correo"
          detalle={
            cargando ? "Buscando el correo del cliente…"
              : tieneCorreo ? preview!.destinatario
              : "Este cliente no tiene correo — cárgalo en su ficha"
          }
          apagada={!tieneCorreo || cargando}
          onClick={mandarCorreo}
        />
        <FilaAccion
          titulo="WhatsApp"
          detalle={client.celular || client.telefono || "Este cliente no tiene teléfono — cárgalo en su ficha"}
          apagada={!client.celular && !client.telefono}
          onClick={() => { onWhatsApp(client); onClose(); }}
        />
        <FilaAccion
          titulo="Copiar mensaje"
          onClick={() => { onCopiar(client); onClose(); }}
        />
        <FilaAccion
          titulo="Descargar PDF"
          detalle={datos ? `${preview?.totalDocs ?? 0} documentos con saldo` : "Preparando…"}
          apagada={!datos || ocupado}
          onClick={entregarPdf}
        />
      </ul>
  );

  const cuerpo = (
    <div className="space-y-3">
      <div>
        <p className="text-base font-semibold text-gray-900">
          {datos?.clienteNombre || nombre}
          {totalDeLaFila != null && (
            <span className="tabular-nums font-normal text-gray-600"> · ${fmt(totalDeLaFila)}</span>
          )}
        </p>
        {ultimoPagoTexto && <p className="text-xs text-gray-500 mt-0.5">{ultimoPagoTexto}</p>}
        <p className="text-xs text-gray-500 mt-0.5">{encabezado}</p>
        {marcaEnvio && <p className="text-xs text-gray-400 mt-0.5">{marcaEnvio}</p>}
      </div>

      {avisos}

      {salidas}

      <div className="flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={() => { onEscribirloYo(client); onClose(); }}
        className="inline-flex items-center min-h-[44px] text-sm font-medium text-blue-600 hover:text-blue-800 transition"
      >
        Editar mensaje ›
      </button>
      {/* Los documentos se MIRAN, no se mandan: por eso es un enlace y no una
          quinta salida de la lista de arriba. */}
      {hrefDocumentos && (
        <Link
          href={hrefDocumentos}
          onClick={onClose}
          className="inline-flex items-center min-h-[44px] text-sm font-medium text-blue-600 hover:text-blue-800 transition"
        >
          Estado de cuenta ›
        </Link>
      )}
      </div>
    </div>
  );

  // 🔴 EL CELULAR CON DESGLOSE (12-nov-2026, `CXC_DESGLOSE_CELULAR_2026_11`).
  // Lo que se MANDA no cambia: las cuatro salidas son las de arriba, y el
  // estado de cuenta se sigue preparando AL ABRIR la hoja (el `useEffect` del
  // principio), así el PDF ya está listo cuando el dedo toca «Descargar PDF»
  // —iOS no abre la hoja de compartir si en el medio hay una espera de red—.
  const total = desglose ? totalDelDesglose(desglose) : null;
  const cuerpoDesglose = desglose && total && (
    <div className="space-y-3">
      <div>
        <p className="text-[28px] leading-tight font-semibold tabular-nums text-gray-900">
          ${fmt(totalDeLaFila ?? total.total)}
        </p>
        {marcaEnvio && <p className="text-xs text-gray-400 mt-0.5">{marcaEnvio}</p>}
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Desglose por empresa ({desglose.length})
        </p>
        <table className="w-full text-[12.5px] tabular-nums tracking-tight">
          <thead>
            <tr className="text-[11px] font-medium uppercase text-gray-400">
              <th className="text-left font-medium pb-1.5">Empresa</th>
              <th className="text-right font-medium pb-1.5 pl-1.5 text-emerald-600">0-90</th>
              <th className="text-right font-medium pb-1.5 pl-1.5 text-amber-600">91-120</th>
              <th className="text-right font-medium pb-1.5 pl-1.5 text-red-500">+120</th>
              <th className="text-right font-medium pb-1.5 pl-1.5">Total</th>
            </tr>
          </thead>
          <tbody>
            {desglose.map((f) => (
              <FilaDesglose key={f.key} fila={f} />
            ))}
            <tr className="border-t border-gray-300 font-semibold">
              <td className="pt-2 text-left">Total</td>
              <td className="pt-2 pl-1.5 text-right whitespace-nowrap text-emerald-700">{montoDeTabla(total.current)}</td>
              <td className="pt-2 pl-1.5 text-right whitespace-nowrap text-amber-600">{montoDeTabla(total.watch)}</td>
              <td className="pt-2 pl-1.5 text-right whitespace-nowrap text-red-600">{montoDeTabla(total.overdue)}</td>
              <td className="pt-2 pl-1.5 text-right whitespace-nowrap">{montoDeTabla(total.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {avisos}

      {!salidasAbiertas ? (
        <button
          type="button"
          onClick={() => setSalidasAbiertas(true)}
          className="block w-full rounded-md bg-black px-4 py-3.5 text-base font-semibold text-white transition active:scale-[0.97]"
        >
          Enviar estado de cuenta
        </button>
      ) : (
        <div className="space-y-1">
          <p className="text-xs text-gray-500">{encabezado}</p>
          {salidas}
          <button
            type="button"
            onClick={() => { onEscribirloYo(client); onClose(); }}
            className="inline-flex items-center min-h-[44px] text-sm font-medium text-blue-600 hover:text-blue-800 transition"
          >
            Editar mensaje ›
          </button>
        </div>
      )}

      {hrefDocumentos && (
        <div className="flex justify-center">
          <Link
            href={hrefDocumentos}
            onClick={onClose}
            className="inline-flex items-center min-h-[44px] text-sm font-medium text-blue-600 hover:text-blue-800 transition"
          >
            Ver ficha completa ›
          </Link>
        </div>
      )}
    </div>
  );

  // 🔴 EN CELULAR LA HOJA SUBE DESDE ABAJO. No hace falta un segundo
  // componente: `ModalOverlay` con `align="center"` ES el patrón de
  // hoja-desde-abajo del sistema (`items-end sm:items-center`) — pegada al
  // borde inferior en celular y centrada desde iPad. Una hoja aparte solo para
  // el celular sería una segunda que mantener igual a mano.
  return (
    <ModalOverlay onBackdropClick={onClose} align="center">
      <div className="bg-white rounded-t-2xl sm:rounded-lg w-full sm:max-w-md mx-0 sm:mx-4 mb-0 sm:my-16 border border-gray-200 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{cuerpoDesglose ? (datos?.clienteNombre || nombre) : "Enviar estado de cuenta"}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-gray-400 hover:text-gray-700 transition -mr-1 p-1"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-5 py-4">{cuerpoDesglose || cuerpo}</div>
      </div>
    </ModalOverlay>
  );
}

function FilaAccion({
  titulo,
  detalle,
  apagada = false,
  onClick,
}: {
  titulo: string;
  detalle?: string;
  apagada?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={apagada}
        onClick={onClick}
        className="w-full text-left px-4 py-3 min-h-[44px] transition hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed"
      >
        <span className="block text-sm font-medium text-gray-900">{titulo}</span>
        {detalle && <span className="block text-xs text-gray-500 mt-0.5 truncate">{detalle}</span>}
      </button>
    </li>
  );
}

/**
 * Una empresa del desglose del celular: sus tres tramos y el total, y debajo
 * «Últ. pago $X · N d · Últ. compra $Y · N d». Los días del pago con el MISMO
 * color de la computadora (`daysAgingColor`); los de la compra en gris, como
 * allá: una compra vieja no es plata en riesgo.
 */
function FilaDesglose({ fila }: { fila: RenglonEmpresaCliente }) {
  const diasPago = daysSince(fila.ultimoPago?.fecha);
  const diasCompra = daysSince(fila.ultimaCompra?.fecha);
  return (
    <>
      <tr className="border-t border-gray-100">
        <td className="pt-2 text-left text-[13.5px] font-semibold text-gray-900 whitespace-nowrap">
          {nombreCortoEmpresa(fila.key, fila.nombre)}
        </td>
        <td className="pt-2 pl-1.5 text-right whitespace-nowrap text-emerald-700">{montoDeTabla(fila.current)}</td>
        <td className="pt-2 pl-1.5 text-right whitespace-nowrap text-amber-600">{montoDeTabla(fila.watch)}</td>
        <td className="pt-2 pl-1.5 text-right whitespace-nowrap text-red-600">{montoDeTabla(fila.overdue)}</td>
        <td className="pt-2 pl-1.5 text-right whitespace-nowrap font-semibold">{montoDeTabla(fila.total)}</td>
      </tr>
      <tr>
        <td colSpan={5} className="pb-2 text-left text-[11px] text-gray-500 whitespace-nowrap">
          Últ. pago{" "}
          {fila.ultimoPago ? (
            <>
              {montoExacto(fila.ultimoPago.monto)} ·{" "}
              <span className={daysAgingColor(diasPago)}>{diasPago != null ? `${diasPago} d` : ""}</span>
            </>
          ) : (
            <span className="text-gray-300">—</span>
          )}
          {" · "}Últ. compra{" "}
          {fila.ultimaCompra ? (
            <>
              {montoExacto(fila.ultimaCompra.monto)} ·{" "}
              <span className="text-gray-500">{diasCompra != null ? `${diasCompra} d` : ""}</span>
            </>
          ) : (
            <span className="text-gray-300">—</span>
          )}
        </td>
      </tr>
    </>
  );
}
