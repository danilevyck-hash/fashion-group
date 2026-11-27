"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ESTADOS DE CUENTA POR WHATSAPP (27-nov-2026, Daniel aprobó el mockup).
//
// La fila «Semana del … · N clientes sin correo · X de N» abre la lista con
// «Enviar». Los PDF son los de Switch que el cron del lunes dejó guardados
// (`lib/cxc/estado-cuenta-whatsapp.ts`).
//   • Teléfono: hoja de compartir con el texto + los PDF; ella ELIGE EL CHAT.
//   • Computadora: se descargan los PDF y se abre WhatsApp Web con el texto.
// Queda marcado (quién y cuándo) con «Deshacer» de 5 s: el POST sale al vencer.
//
// 🩸 iOS exige que `share()` salga del toque, sin un `await` de red antes: por
// eso los PDF se bajan al abrir la lista y «Enviar» los usa ya en mano.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";
import { BottomSheet, Modal } from "@/components/ui";
import UndoToast from "@/components/UndoToast";
import { useUndoAction } from "@/lib/hooks/useUndoAction";
import { compartirArchivos, descargarArchivo } from "@/lib/compartir-archivo";
import { enlaceWhatsAppWeb, rotuloSemana } from "@/lib/cxc/estado-cuenta-whatsapp";

interface PdfWa {
  empresa: string;
  nombreEmpresa: string;
  total: number;
  archivo: string;
}

interface ClienteWa {
  codigo: string;
  nombre: string;
  saldo: number;
  pdfs: PdfWa[];
  texto: string;
  enviado: { por: string; en: string } | null;
}

interface Props {
  /** Teléfono (hoja de compartir) o computadora (descarga + WhatsApp Web). */
  celular: boolean;
}

const dinero = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function cuando(iso: string): string {
  return new Date(iso).toLocaleString("es-PA", {
    timeZone: "America/Panama",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function EstadosPorWhatsApp({ celular }: Props) {
  const [semana, setSemana] = useState<string | null>(null);
  const [clientes, setClientes] = useState<ClienteWa[]>([]);
  const [abierta, setAbierta] = useState(false);
  const [listos, setListos] = useState<Record<string, File[]>>({});
  const [error, setError] = useState<string | null>(null);
  const bajando = useRef(false);
  const { pendingUndo, scheduleAction, undoAction } = useUndoAction();

  useEffect(() => {
    let vivo = true;
    fetch("/api/cxc/whatsapp", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { semana: string | null; clientes: ClienteWa[] } | null) => {
        if (!vivo || !d?.semana) return;
        setSemana(d.semana);
        setClientes(d.clientes);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  // Al abrir la lista se bajan los PDF (de a tres), para que «Enviar» no espere.
  useEffect(() => {
    if (!abierta || !semana || bajando.current) return;
    bajando.current = true;
    setError(null);
    // Solo lo que falta: al volver a abrir no se baja otra vez lo que ya está.
    const cola = clientes.filter((c) => !listos[c.codigo]);
    const uno = async (c: ClienteWa) => {
      const archivos = await Promise.all(
        c.pdfs.map(async (p) => {
          const q = new URLSearchParams({ semana, codigo: c.codigo, empresa: p.empresa });
          const r = await fetch(`/api/cxc/whatsapp?${q}`, { cache: "no-store" });
          if (!r.ok) throw new Error(String(r.status));
          return new File([await r.blob()], p.archivo, { type: "application/pdf" });
        }),
      );
      setListos((m) => ({ ...m, [c.codigo]: archivos }));
    };
    const trabajador = async () => {
      for (let c = cola.shift(); c; c = cola.shift()) {
        await uno(c).catch(() => setError("Algún PDF no se pudo bajar. Cierra y vuelve a abrir la lista."));
      }
    };
    void Promise.all([trabajador(), trabajador(), trabajador()]).finally(() => {
      bajando.current = false;
    });
  }, [abierta, semana, clientes, listos]);

  const marcar = useCallback(
    (c: ClienteWa) => {
      const antes = c.enviado;
      scheduleAction({
        id: `wa-${c.codigo}`,
        message: `${c.nombre}: enviado por WhatsApp`,
        onOptimistic: () =>
          setClientes((l) => l.map((x) => (x.codigo === c.codigo ? { ...x, enviado: { por: "", en: new Date().toISOString() } } : x))),
        onRevert: () => setClientes((l) => l.map((x) => (x.codigo === c.codigo ? { ...x, enviado: antes } : x))),
        execute: async () => {
          const r = await fetch("/api/cxc/whatsapp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ semana, codigo: c.codigo }),
          });
          const d = (await r.json().catch(() => ({}))) as { enviado?: { por: string; en: string }; error?: string };
          if (!r.ok || !d.enviado) {
            setError(d.error ?? "No se pudo anotar el envío");
            throw new Error("no anotado");
          }
          setClientes((l) => l.map((x) => (x.codigo === c.codigo ? { ...x, enviado: d.enviado! } : x)));
        },
      });
    },
    [scheduleAction, semana],
  );

  // Sin `await` antes de compartir: los archivos ya están en mano.
  const enviar = (c: ClienteWa) => {
    const archivos = listos[c.codigo];
    if (!archivos) return;
    setError(null);
    if (celular) {
      // WhatsApp a veces suelta el texto cuando van archivos: queda copiado para pegarlo.
      navigator.clipboard?.writeText(c.texto).catch(() => {});
      void compartirArchivos(archivos, { text: c.texto }).then((r) => {
        if (r === "compartido") marcar(c);
      });
      return;
    }
    window.open(enlaceWhatsAppWeb(c.texto), "_blank", "noopener");
    archivos.forEach(descargarArchivo);
    marcar(c);
  };

  if (!semana || !clientes.length) return null;

  const enviados = clientes.filter((c) => c.enviado).length;
  const total = clientes.reduce((s, c) => s + c.saldo, 0);
  const pendientes = clientes.filter((c) => !c.enviado);
  const hechos = clientes.filter((c) => c.enviado);

  const boton = (c: ClienteWa, texto: string, principal: boolean) => {
    const listo = !!listos[c.codigo];
    return (
      <button
        type="button"
        disabled={!listo}
        onClick={() => enviar(c)}
        className={
          principal
            ? "shrink-0 rounded-md bg-black px-3.5 py-2 text-[15px] font-medium text-white active:scale-[0.97] disabled:opacity-40"
            : "shrink-0 rounded-md px-2 py-2 text-[15px] text-gray-600 active:scale-[0.97] disabled:opacity-40"
        }
      >
        {listo ? texto : "Preparando…"}
      </button>
    );
  };

  const lista = (
    <div className={celular ? "px-4 pb-8" : ""}>
      <p className="text-[20px] font-semibold text-gray-900">Estados de cuenta por WhatsApp</p>
      <p className="mt-0.5 text-[15px] text-gray-500">
        Semana del {rotuloSemana(semana)} · {enviados} de {clientes.length} enviados
      </p>
      {!celular && (
        <p className="mt-1 text-sm text-gray-500">«Enviar» descarga los PDF y abre WhatsApp Web con el texto: elige el chat y adjunta los PDF.</p>
      )}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {pendientes.length > 0 && (
        <>
          <p className="mt-5 pb-1.5 text-sm font-semibold text-gray-600">Pendientes</p>
          <ul className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            {pendientes.map((c) => (
              <li key={c.codigo} className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
                <span className="min-w-0">
                  <span className="block truncate text-[16px] font-semibold text-gray-900">{c.nombre}</span>
                  <span className="block text-[14px] text-gray-500">
                    {c.pdfs.length} PDF de Switch · <span className="tabular-nums">{dinero(c.saldo)}</span>
                  </span>
                </span>
                {boton(c, "Enviar", true)}
              </li>
            ))}
          </ul>
        </>
      )}

      {hechos.length > 0 && (
        <>
          <p className="mt-5 pb-1.5 text-sm font-semibold text-gray-600">Enviados</p>
          <ul className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            {hechos.map((c) => (
              <li key={c.codigo} className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0">
                <span className="min-w-0">
                  <span className="block truncate text-[16px] font-semibold text-gray-900">{c.nombre}</span>
                  <span className="block text-[14px] text-gray-500">
                    Enviado por WhatsApp{c.enviado!.por ? ` · ${c.enviado!.por}` : ""} · {cuando(c.enviado!.en)}
                  </span>
                </span>
                {boton(c, "Reenviar", false)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );

  return (
    <section data-wa-semana className={celular ? undefined : "mb-4"}>
      {celular && <h2 className="px-8 pt-5 pb-1.5 text-sm font-semibold text-gray-600">Estados de cuenta por WhatsApp</h2>}
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className={
          celular
            ? "mx-4 flex w-[calc(100%-2rem)] items-center justify-between rounded-2xl bg-white px-4 py-3.5 text-left active:bg-gray-50"
            : "flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left hover:bg-gray-50"
        }
      >
        <span>
          <span className="block text-[17px] font-semibold leading-tight text-gray-900">
            {celular ? "" : "Estados de cuenta por WhatsApp · "}Semana del {rotuloSemana(semana)}
          </span>
          <span className="mt-0.5 block text-[15px] text-gray-500">
            {clientes.length} clientes sin correo · ${Math.round(total).toLocaleString("en-US")}
          </span>
        </span>
        <span className="flex items-center gap-2 text-[15px] tabular-nums text-gray-600">
          {enviados} de {clientes.length}
          <span className="text-gray-300">›</span>
        </span>
      </button>

      {celular ? (
        <BottomSheet open={abierta} onClose={() => setAbierta(false)} abreCompleta>
          {lista}
        </BottomSheet>
      ) : (
        <Modal open={abierta} onClose={() => setAbierta(false)} maxWidth="max-w-xl">
          {lista}
        </Modal>
      )}

      {pendingUndo && <UndoToast message={pendingUndo.message} startedAt={pendingUndo.startedAt} onUndo={undoAction} />}
    </section>
  );
}
