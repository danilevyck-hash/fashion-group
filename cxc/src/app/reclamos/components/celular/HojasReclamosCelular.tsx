"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LAS HOJAS DEL CELULAR DE RECLAMOS (24-sep-2026) — 7b · 8b · 11c · 3e.
//
//  · «Cobrar»          (7b) — el monto es el número grande y editable, un solo
//                             botón negro que dice cuánto, Deshacer de 5 s.
//  · «Mandar»          (8b) — «Para» puesto, el texto plegado, dice qué va
//                             adjunto, un botón, Deshacer de 5 s.
//  · «Más opciones»    (11c/2e) — todo lo que se puede hacer, en renglones.
//  · Fotos y Seguimiento (3e) — dos pantallas completas que se abren desde el
//                             reclamo, en vez de dos cajas siempre abiertas.
//
// 🔴 Suben DESDE ABAJO con `ModalOverlay align="center"`, el patrón de hoja de
// la casa (el mismo de «Cobrar» en Cuentas por Cobrar): no se estrena un
// segundo mecanismo.
//
// 🔴 ACÁ NO SE MANDA NADA. Las hojas juntan lo que el usuario escribe y llaman
// a los manejadores de `ReclamosClient` — las MISMAS rutas y los MISMOS
// payloads de la computadora.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState, type ReactNode } from "react";
import { ModalOverlay } from "@/components/ui";
import { fmt, fmtDate } from "@/lib/format";
import { hoyPanama } from "@/lib/fecha-panama";
import { montoCel, SE_DESHACE } from "@/lib/reclamos/celular";
import { COMPROBANTE_OBLIGATORIO, FALTA_COMPROBANTE } from "@/lib/reclamos/rotulos";
import { asuntoPorDefecto, loQueVaAdjunto, mensajePorDefecto } from "@/lib/reclamos/correo-proveedor";
import { notaEnPantalla } from "@/lib/reclamos/texto";
import { validateComprobanteFile } from "../fotoUpload";
import type { Foto, Seguimiento } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// El envase
// ─────────────────────────────────────────────────────────────────────────────

export function Hoja({
  titulo,
  onCerrar,
  children,
  marca,
}: {
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  marca?: string;
}) {
  return (
    <ModalOverlay onBackdropClick={onCerrar} align="center">
      <div
        data-hoja={marca}
        className="mx-0 mb-0 max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border border-gray-200 bg-white sm:mx-4 sm:my-16 sm:max-w-md sm:rounded-lg"
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 pb-3 pt-5">
          <h2 className="text-base font-semibold text-gray-900">{titulo}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="-mr-1 p-1 text-gray-400 transition hover:text-gray-700"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </ModalOverlay>
  );
}

const FILA = "flex min-h-[50px] w-full items-center justify-between gap-3 px-5 py-3 text-left";
const NEGRO =
  "mx-5 mb-2 mt-4 block w-[calc(100%-2.5rem)] rounded-xl bg-black px-4 py-3.5 text-center text-[17px] font-medium text-white active:scale-[0.98] transition disabled:opacity-50";

// ─────────────────────────────────────────────────────────────────────────────
// 1 · «Más opciones» — 11c en el reclamo, 2e en la lista de la empresa
// ─────────────────────────────────────────────────────────────────────────────

export interface OpcionDeHoja {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

export function HojaOpciones({
  titulo,
  opciones,
  onCerrar,
}: {
  titulo: string;
  opciones: OpcionDeHoja[];
  onCerrar: () => void;
}) {
  return (
    <Hoja titulo={titulo} onCerrar={onCerrar} marca="opciones">
      <ul className="divide-y divide-gray-100 pb-2">
        {opciones.map((o) => (
          <li key={o.label}>
            <button
              type="button"
              onClick={() => { onCerrar(); o.onClick(); }}
              className={`${FILA} text-[17px] active:bg-gray-50 ${o.destructive ? "text-red-600" : "text-gray-900"}`}
            >
              {o.label}
            </button>
          </li>
        ))}
      </ul>
    </Hoja>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · «Cobrar» (7b)
// ─────────────────────────────────────────────────────────────────────────────

export interface FilaDeCobro {
  monto: number;
  nota_credito: string;
  fecha: string;
}

export function HojaCobrar({
  nroReclamo,
  reclamado,
  requiereComprobante,
  guardando,
  onCerrar,
  onCobrar,
}: {
  nroReclamo: string;
  /** El total del reclamo: viene PUESTO y editable (14 de 14 cobros fueron el total exacto). */
  reclamado: number;
  requiereComprobante: boolean;
  guardando: boolean;
  onCerrar: () => void;
  /** La MISMA firma que el modal de la computadora: filas + comprobante. */
  onCobrar: (filas: FilaDeCobro[], comprobante: File | null) => void;
}) {
  const [monto, setMonto] = useState(reclamado > 0 ? reclamado.toFixed(2) : "");
  const [fecha, setFecha] = useState(() => hoyPanama());
  const [nc, setNc] = useState("");
  const [verNc, setVerNc] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const valor = Number(monto);
  const listo = Number.isFinite(valor) && valor > 0;

  function elegir(f: File | null) {
    if (!f) return;
    const err = validateComprobanteFile(f);
    if (err) { setError(err); return; }
    setError(null);
    setFile(f);
  }

  function cobrar() {
    if (requiereComprobante && !file) { setError(FALTA_COMPROBANTE); return; }
    if (!listo) { setError("Escribe cuánto entró."); return; }
    if (!fecha) { setError("Falta la fecha."); return; }
    setError(null);
    onCobrar([{ monto: valor, nota_credito: nc.trim(), fecha }], file);
  }

  return (
    <Hoja titulo={`Cobrar ${nroReclamo}`} onCerrar={onCerrar} marca="cobrar">
      {/* 🔴 El monto es el número grande, y se toca para cambiarlo: el cobro
          parcial sigue siendo posible, solo deja de ser el caso por el que se
          diseña (14 de 14 cobros fueron el total exacto, al centavo). */}
      <label className="block px-5 pt-4">
        <span className="sr-only">Cuánto entró</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          aria-label="Cuánto entró"
          className="w-full border-none bg-transparent p-0 text-center text-[40px] font-light leading-none tracking-tight tabular-nums text-gray-900 outline-none"
        />
      </label>
      <p className="px-5 pt-2 text-center text-[13px] text-gray-500">
        Reclamado {montoCel(reclamado)} · puede ser parcial
      </p>

      <ul className="mt-4 divide-y divide-gray-100 border-y border-gray-100">
        <li>
          <label className={`${FILA} text-[17px] text-gray-900`}>
            <span className="text-gray-500">Fecha</span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              aria-label="Fecha del cobro"
              className="bg-transparent text-right text-[17px] text-gray-900 outline-none"
            />
          </label>
        </li>
        {requiereComprobante && (
          <li>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => elegir(e.target.files?.[0] ?? null)}
            />
            <button type="button" onClick={() => fileRef.current?.click()} className={`${FILA} text-[17px] active:bg-gray-50`}>
              <span className="text-gray-500">Comprobante *</span>
              <span className={file ? "truncate text-gray-900" : "text-blue-600"}>
                {file ? `📎 ${file.name}` : "Tomar foto"}
              </span>
            </button>
          </li>
        )}
        <li>
          {verNc ? (
            <label className={`${FILA} text-[17px] text-gray-900`}>
              <span className="shrink-0 text-gray-500">N° nota de crédito</span>
              <input
                type="text"
                value={nc}
                onChange={(e) => setNc(e.target.value)}
                placeholder="Ej. 4020000422"
                aria-label="N° de nota de crédito"
                className="min-w-0 flex-1 bg-transparent text-right text-[17px] text-gray-900 outline-none"
              />
            </label>
          ) : (
            <button type="button" onClick={() => setVerNc(true)} className={`${FILA} text-[17px] active:bg-gray-50`}>
              <span className="text-gray-500">N° de nota de crédito</span>
              <span className="text-gray-400">opcional</span>
            </button>
          )}
        </li>
      </ul>

      {requiereComprobante && (
        <p className="px-5 pt-3 text-[13px] text-gray-500">{COMPROBANTE_OBLIGATORIO}</p>
      )}
      {error && <p className="px-5 pt-3 text-[13px] text-red-600">{error}</p>}

      <button type="button" onClick={cobrar} disabled={guardando} className={NEGRO}>
        {guardando ? "Cobrando…" : `Cobrar ${montoCel(listo ? valor : reclamado)}`}
      </button>
      <p className="px-5 pb-5 text-center text-[13px] text-gray-400">{SE_DESHACE}</p>
    </Hoja>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · «Mandar al proveedor» (8b)
// ─────────────────────────────────────────────────────────────────────────────

export interface EnvioAlProveedor {
  to: string;
  cc: string;
  subject: string;
  message: string;
}

export function HojaCorreo({
  empresa,
  contactoNombre,
  correo,
  cuantos,
  facturas,
  fotos,
  enviando,
  onCerrar,
  onMandar,
}: {
  empresa: string;
  contactoNombre?: string | null;
  correo: string;
  cuantos: number;
  /** Cuántas facturas del proveedor viajan (las que existen). */
  facturas: number;
  fotos: number;
  enviando: boolean;
  onCerrar: () => void;
  /** Mismo payload que la ventana de la computadora. */
  onMandar: (envio: EnvioAlProveedor) => void;
}) {
  const [to, setTo] = useState(correo);
  const [cc, setCc] = useState("");
  const [verCc, setVerCc] = useState(false);
  const [verTexto, setVerTexto] = useState(false);
  const [subject, setSubject] = useState(() => asuntoPorDefecto(cuantos, empresa));
  const [message, setMessage] = useState(() => mensajePorDefecto(cuantos, empresa, contactoNombre ?? undefined));
  const [error, setError] = useState<string | null>(null);

  function mandar() {
    if (!to.trim()) { setError("Falta el correo del proveedor."); return; }
    if (!subject.trim()) { setError("Falta el asunto."); return; }
    setError(null);
    onMandar({ to: to.trim(), cc: cc.trim(), subject: subject.trim(), message: message.trim() });
  }

  return (
    <Hoja titulo={`Mandar a ${(contactoNombre || "").trim() || empresa}`} onCerrar={onCerrar} marca="correo">
      <ul className="mt-1 divide-y divide-gray-100 border-y border-gray-100">
        <li>
          <label className={`${FILA} text-[17px] text-gray-900`}>
            <span className="shrink-0 text-gray-500">Para</span>
            <input
              type="email"
              inputMode="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="Para"
              className="min-w-0 flex-1 bg-transparent text-right text-[16px] text-gray-900 outline-none"
            />
          </label>
        </li>
        <li>
          {verCc ? (
            <label className={`${FILA} text-[17px] text-gray-900`}>
              <span className="shrink-0 text-gray-500">Copia</span>
              <input
                type="text"
                inputMode="email"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="copia@correo.com"
                aria-label="Copia"
                className="min-w-0 flex-1 bg-transparent text-right text-[16px] text-gray-900 outline-none"
              />
            </label>
          ) : (
            <button type="button" onClick={() => setVerCc(true)} className={`${FILA} text-[17px] active:bg-gray-50`}>
              <span className="text-gray-500">Copia</span>
              <span className="text-blue-600">Agregar</span>
            </button>
          )}
        </li>
        <li>
          <button type="button" onClick={() => setVerTexto((v) => !v)} className={`${FILA} text-[17px] active:bg-gray-50`}>
            <span className="text-gray-500">Ver el texto</span>
            <span className="text-gray-400">{verTexto ? "⌄" : "›"}</span>
          </button>
          {verTexto && (
            <div className="space-y-2 px-5 pb-4">
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                aria-label="Asunto"
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-[16px] outline-none focus:border-gray-400"
              />
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                aria-label="Mensaje"
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-[16px] outline-none focus:border-gray-400"
              />
            </div>
          )}
        </li>
        <li className={`${FILA} text-[17px]`}>
          <span className="text-gray-500">Van adjuntos</span>
          <span className="truncate text-gray-900">{loQueVaAdjunto({ facturas, fotos })}</span>
        </li>
      </ul>

      {error && <p className="px-5 pt-3 text-[13px] text-red-600">{error}</p>}

      <button type="button" onClick={mandar} disabled={enviando} className={NEGRO}>
        {enviando ? "Mandando…" : "Mandar"}
      </button>
      <p className="px-5 pb-5 text-center text-[13px] text-gray-400">{SE_DESHACE}</p>
    </Hoja>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Fotos y Seguimiento (3e) — dos pantallas, no dos cajas siempre abiertas
// ─────────────────────────────────────────────────────────────────────────────

export function HojaFotos({
  fotos,
  subiendo,
  onAgregar,
  onBorrar,
  onVer,
  onCerrar,
}: {
  fotos: Foto[];
  subiendo: boolean;
  onAgregar: (files: File[]) => void;
  onBorrar: (foto: Foto) => void;
  onVer: (url: string) => void;
  onCerrar: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <Hoja titulo={`Fotos · ${fotos.length} de 5`} onCerrar={onCerrar} marca="fotos">
      <div className="px-5 py-4">
        {fotos.length === 0 ? (
          <p className="py-6 text-center text-[15px] text-gray-500">Todavía ninguna foto</p>
        ) : (
          /* 🔴 LAS CINCO ENTRAN SIN DESLIZAR: la quinta quedaba fuera de la tira
             y nada lo decía. Y la × que borra evidencia medía 28 px: acá el
             borrar es un renglón propio, de 44. */
          <ul className="space-y-3">
            {fotos.filter((f) => !!f.url).map((f) => (
              <li key={f.id} className="flex items-center gap-3">
                <button type="button" onClick={() => onVer(f.url)} className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt="" className="h-20 w-20 rounded-lg border border-gray-200 object-cover" />
                </button>
                <button
                  type="button"
                  onClick={() => onBorrar(f)}
                  className="min-h-[44px] flex-1 text-left text-[15px] text-red-600 active:opacity-60"
                >
                  Eliminar esta foto
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {fotos.length < 5 && (
        <>
          <input
            ref={ref}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={subiendo}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) onAgregar(files);
              if (ref.current) ref.current.value = "";
            }}
          />
          <button type="button" disabled={subiendo} onClick={() => ref.current?.click()} className={NEGRO}>
            {subiendo ? "Subiendo…" : "Agregar fotos"}
          </button>
          <div className="pb-5" />
        </>
      )}
    </Hoja>
  );
}

export function HojaSeguimiento({
  seguimiento,
  nota,
  setNota,
  onAgregar,
  onCerrar,
}: {
  seguimiento: Seguimiento[];
  nota: string;
  setNota: (v: string) => void;
  onAgregar: () => void;
  onCerrar: () => void;
}) {
  return (
    <Hoja titulo="Lo que ha pasado" onCerrar={onCerrar} marca="seguimiento">
      <div className="px-5 py-4">
        {seguimiento.length === 0 ? (
          <p className="py-4 text-center text-[15px] text-gray-500">Todavía no ha pasado nada</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {seguimiento.map((s) => {
              const leida = notaEnPantalla(s.nota, s.autor);
              return (
                <li key={s.id} className="py-3">
                  <p className="text-[15px] text-gray-900">{leida.texto}</p>
                  <p className="mt-0.5 text-[13px] text-gray-400">
                    {fmtDate(s.created_at.slice(0, 10))}
                    {leida.autor ? ` — ${leida.autor}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        <input
          type="text"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Agregar nota…"
          aria-label="Agregar nota"
          className="mt-3 w-full rounded-xl border border-transparent bg-[#E9E9EB] px-4 py-3 text-[16px] text-gray-900 placeholder:text-gray-500 outline-none focus:border-gray-400"
        />
      </div>
      <button type="button" onClick={onAgregar} disabled={!nota.trim()} className={NEGRO}>
        Agregar la nota
      </button>
      <div className="pb-5" />
    </Hoja>
  );
}

/** El pie de plata de una hoja: se usa en la del cobro y en el detalle. */
export function montoDe(n: number): string {
  return `$${fmt(n)}`;
}
