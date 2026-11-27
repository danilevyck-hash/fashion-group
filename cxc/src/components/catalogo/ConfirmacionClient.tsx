"use client";

// Pantalla de CONFIRMACIÓN post-checkout (las 4 marcas): estado real del
// pedido y su envío a Switch leído del server. Acciones: Enviar/Reintentar
// solo si aplica, la LISTA (el botón que Daniel pidió el 25-ago-2026 — ver
// `destino-comprobantes.ts`), Ver PDF (`verPdf`: hoja de compartir con el
// dedo, pestaña nueva en la computadora), y Volver al catálogo.
//
// El techo de 3 acciones (decisión de Daniel del 5-jul) sigue valiendo en el
// camino NORMAL, que es el que se ve casi siempre: con el pedido ya en Switch
// no hay «Enviar», así que quedan exactamente tres. Las cuatro solo aparecen
// cuando el envío falló o todavía no salió — y ahí «Enviar» es lo que la
// persona vino a hacer.

import { AlertTriangle } from "lucide-react";
import { ICONOS_DE_LINEA_EN_TODO } from "@/lib/ui/revision-110-ajustes";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fmt } from "@/lib/format";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import EnviarDocumentoSwitch from "@/components/catalogo/EnviarDocumentoSwitch";
import {
  type DocumentoSwitch,
  normalizarDocumento,
  palabraDelPapel,
  tituloEnviadoASwitch,
} from "@/lib/catalogo/documento-switch";
import { destinoLista } from "@/lib/catalogo/destino-comprobantes";
import { Aviso } from "@/components/ui/Aviso";
import { verPdf } from "@/lib/compartir-archivo";

/**
 * 🩸 EL PDF SE PREPARA ANTES DEL TOQUE (27-nov-2026). «Ver PDF» era un enlace
 * con `target="_blank"` a la ruta del PDF: en la app instalada en el iPhone o
 * el iPad la MISMA ventana se iba al PDF, sin «volver» ni «compartir», y había
 * que cerrar la app. Ahora el archivo se baja apenas el pedido queda y el toque
 * lo pasa a `verPdf` sin ningún `await` de red en el medio (iOS solo abre la
 * hoja de compartir dentro del gesto). El nombre lo da el servidor.
 */
async function leerPdfDelPedido(url: string, respaldo: string): Promise<File | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    const cd = r.headers.get("Content-Disposition") || "";
    const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    const nombre = m ? decodeURIComponent(m[1]) : respaldo;
    return new File([await r.blob()], nombre, { type: "application/pdf" });
  } catch {
    return null;
  }
}

interface Envio {
  estado: string;
  pedido_switch_id: number | null;
  numero_interno: string | null;
  error_detalle: string | null;
  /** 'pedido' | 'cotizacion'. Ausente en envíos viejos = pedido. */
  documento?: string | null;
}
interface Order { id: string; order_number: string; client_name: string; total: number }

export default function ConfirmacionClient({ marca, orderId }: { marca: MarcaUiKey; orderId: string }) {
  // Config por marca vía MARCA_THEME (PR-2).
  const theme = getMarcaTheme(marca)!;
  const cfg = { catalogHref: theme.catalogoHref, api: theme.api };
  const [order, setOrder] = useState<Order | null>(null);
  const [envio, setEnvio] = useState<Envio | null | undefined>(undefined);
  // «Pausar Switch»: el pedido quedó en espera y sale solo al terminar la pausa.
  const [enEspera, setEnEspera] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);
  // 🔴 EL ROL DECIDE A DÓNDE LLEVA EL BOTÓN DE LA LISTA. Esta pantalla la ven
  // los tres roles que arman pedidos (admin, secretaria y vendedor) y el panel
  // de Comprobantes es de admin+secretaria: al vendedor lo lleva a SU lista.
  // Mismo `sessionStorage.cxc_role` que ya lee el detalle del pedido.
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => { setRole(sessionStorage.getItem("cxc_role") || ""); }, []);
  const destino = destinoLista(theme, role);

  const load = useCallback(async () => {
    const [oRes, eRes] = await Promise.all([
      fetch(`${cfg.api}/orders/${orderId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${cfg.api}/orders/${orderId}/enviar-switch`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setOrder(oRes);
    setEnvio(eRes?.envio ?? null);
    setEnEspera(eRes?.envio ? null : eRes?.enEspera ?? null);
  }, [cfg.api, orderId]);

  useEffect(() => { load(); }, [load]);

  // 🔴 velocidad-2026-11: el checkout contesta antes de que Switch termine.
  // Mientras no haya fila (o siga 'pendiente', con el POST en vuelo) se dice
  // «Enviando a Switch…» y se vuelve a leer cada 2 s; a los 2 min se deja de
  // esperar y la pantalla muestra lo que haya, como siempre.
  const [esperandoEnvio, setEsperandoEnvio] = useState(false);
  useEffect(() => {
    try { setEsperandoEnvio(new URLSearchParams(window.location.search).get("enviando") === "1"); } catch { /* */ }
  }, []);
  const enCurso = envio?.estado === "pendiente" || (esperandoEnvio && envio === null && !enEspera);
  const [vencido, setVencido] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVencido(true), 120_000);
    return () => clearTimeout(t);
  }, []);
  const enviando = enCurso && !vencido;
  useEffect(() => {
    if (!enviando) return;
    const t = setTimeout(() => { void load(); }, 2_000);
    return () => clearTimeout(t);
  }, [enviando, envio, load]);

  async function reintentar(documento: DocumentoSwitch) {
    setRetrying(true);
    setRetryMsg(null);
    try {
      const res = await fetch(`${cfg.api}/orders/${orderId}/enviar-switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documento }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) {
        setRetryMsg(data?.error || "El reintento falló. Intenta de nuevo en unos minutos.");
        if (Array.isArray(data?.errores)) setRetryMsg(`${data.error}: ${data.errores.join(" · ")}`);
      }
      await load();
    } catch {
      setRetryMsg("Sin conexión — intenta de nuevo.");
    } finally {
      setRetrying(false);
    }
  }

  const ambiguo = envio?.estado === "enviado" && (envio.error_detalle || "").startsWith("AMBIGUO");
  const switchOk = envio && (envio.estado === "verificado" || (envio.estado === "enviado" && !ambiguo));
  // Distinguir "nunca se intentó" (envio null — ej. pedido legacy) de "falló"
  // (estado error): decir "no se completó" sin intento previo confunde
  // (diagnóstico del piloto 4-jul).
  const sinIntento = envio === null;
  const puedeReintentar = !enviando && !enEspera && (sinIntento || envio?.estado === "error");
  // Qué hay en Switch. Envío viejo o DDL pendiente = pedido, que es lo único
  // que este sistema sabía crear antes del 24-ago-2026.
  const documento = normalizarDocumento(envio?.documento);
  // 🔴 La palabra del título. `palabraDelPapel` devuelve la de Switch cuando el
  // pedido YA salió, y la de la casa mientras no salió — no inventa etiqueta
  // para algo que todavía no es ninguna de las dos.
  const palabra = palabraDelPapel(envio);

  // El PDF, listo antes del toque (ver `leerPdfDelPedido`). Se vuelve a pedir
  // si el envío cambia, porque la palabra del papel (Pedido/Cotización) sale de él.
  const [pdf, setPdf] = useState<File | null>(null);
  const [pdfFalla, setPdfFalla] = useState(false);
  const [intentoPdf, setIntentoPdf] = useState(0);
  const clavePdf = enviando || envio === undefined ? null : `${envio?.estado ?? ""}|${envio?.documento ?? ""}`;
  useEffect(() => {
    if (clavePdf === null) return;
    let vivo = true;
    setPdf(null);
    setPdfFalla(false);
    void leerPdfDelPedido(`${cfg.api}/orders/${orderId}/pdf`, `Pedido-${orderId}.pdf`).then((f) => {
      if (!vivo) return;
      if (f) setPdf(f);
      else setPdfFalla(true);
    });
    return () => { vivo = false; };
  }, [clavePdf, intentoPdf, cfg.api, orderId]);


  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10">
      {order === null && envio === undefined ? (
        <div className="h-40 animate-pulse rounded-lg bg-gray-100" />
      ) : (
        <div className="space-y-4">
          {/* Estado principal */}
          <div className={`rounded-lg border-2 p-6 text-center ${switchOk ? "border-emerald-300 bg-emerald-50" : ambiguo ? "border-amber-300 bg-amber-50" : sinIntento || enviando ? "border-gray-300 bg-gray-50" : "border-red-200 bg-red-50"}`}>
            <div className="text-3xl">{switchOk ? "✓" : ambiguo ? (ICONOS_DE_LINEA_EN_TODO ? <AlertTriangle aria-hidden className="mx-auto h-8 w-8 text-amber-600" /> : "⚠️") : sinIntento || enviando ? "→" : "!"}</div>
            {/* 🔴 EL TÍTULO DICE CUÁL DE LAS DOS FUE. Decía "Pedido TOM-027
                guardado" en grande aunque lo mandado hubiera sido una
                COTIZACIÓN, y el renglón chico de abajo la contradecía. El
                número NO cambia — TOM-027 se llama así siempre —, cambia la
                palabra que lo acompaña. Si todavía no salió a Switch no es
                ninguna de las dos: se queda con "Pedido", que es como la casa
                lo llamó desde siempre. */}
            <h1 className="mt-2 text-lg font-semibold">
              {order ? `${palabra} ${order.order_number} guardado` : `${palabra} guardado`}
            </h1>
            {switchOk ? (
              <p className="mt-1 text-sm text-emerald-800">
                {tituloEnviadoASwitch(documento)} — N° <span className="font-semibold tabular-nums">{envio?.numero_interno}</span>
                {envio?.estado === "verificado" ? " · verificado ✓" : ""}
              </p>
            ) : ambiguo ? (
              <p className="mt-1 text-sm text-amber-800">
                Switch no respondió al enviar — el pedido pudo o no haberse creado allá.
                Revisa el panel de Switch antes de reintentar.
              </p>
            ) : enEspera ? (
              <p className="mt-1 text-sm text-amber-800" role="status">{enEspera}</p>
            ) : enviando ? (
              <p className="mt-1 text-sm text-gray-600" role="status">Enviando a Switch…</p>
            ) : sinIntento ? (
              /* "Puedes enviarlo con el botón de abajo" se podó (12-ago-2026):
                 señalaba el único botón primario de la tarjeta, a 20 px. */
              <p className="mt-1 text-sm text-gray-600">
                Este pedido aún no se ha enviado a Switch.
              </p>
            ) : (
              <div className="mt-1 text-sm text-red-800">
                <p>El envío a Switch falló — el pedido está guardado en el sistema y no se pierde.</p>
                {envio?.error_detalle && <p className="mt-1 text-xs">{envio.error_detalle}</p>}
              </div>
            )}
            {order && (
              <p className="mt-2 text-xs text-gray-500 tabular-nums">
                {order.client_name} · Total ${fmt(Number(order.total) || 0)}
              </p>
            )}
          </div>

          {retryMsg && (
            <Aviso
              tono="error"
            >
              {retryMsg}
            </Aviso>
          )}

          {/* Acciones — máximo 3: enviar/reintentar (si aplica), Ver PDF
              (hoja de compartir con el dedo), volver. */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {/* 🔴 Las dos salidas, directo (25-ago-2026): antes era un botón
                que abría una ventana preguntando cuál. La etiqueta de la
                cotización viaja pegada a la opción. */}
            {puedeReintentar && (
              <div className="sm:col-span-2">
                <EnviarDocumentoSwitch
                  onElegir={(d) => { void reintentar(d); }}
                  enviando={retrying}
                />
              </div>
            )}
            {/* 🔴 UN TOQUE HASTA LA LISTA (25-ago-2026). Antes había que volver
                al catálogo, salir a Catálogos, elegir la marca, tocar
                «Administrar» y recién ahí la pestaña. El destino y el rótulo
                salen del MISMO lugar (`destino-comprobantes.ts`) — un botón
                que dice una cosa y lleva a otra es el modo de fallo que eso
                impide. */}
            <Link
              href={destino.href}
              data-medir="ver-lista"
              className="rounded-md border border-gray-300 px-4 min-h-[48px] text-sm font-medium text-gray-800 hover:border-gray-400 transition flex items-center justify-center"
            >
              {destino.label}
            </Link>
            <button
              type="button"
              onClick={() => { if (pdf) void verPdf(pdf); else setIntentoPdf((n) => n + 1); }}
              disabled={!pdf && !pdfFalla}
              className="rounded-md border border-gray-200 px-4 min-h-[48px] text-sm font-medium text-gray-700 hover:border-gray-300 active:scale-[0.97] transition flex items-center justify-center disabled:opacity-60"
            >
              {pdf ? "Ver PDF" : pdfFalla ? "Reintentar PDF" : "Preparando PDF…"}
            </button>
            <Link href={cfg.catalogHref} className="rounded-md border border-gray-200 px-4 min-h-[48px] text-sm text-gray-500 hover:border-gray-300 transition flex items-center justify-center">
              Volver al catálogo
            </Link>
          </div>

        </div>
      )}
    </div>
  );
}
