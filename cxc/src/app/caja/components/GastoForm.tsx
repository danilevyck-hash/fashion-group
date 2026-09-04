"use client";

import { ReactNode, useState, type CSSProperties } from "react";
import { CajaResponsable } from "./types";
import SearchableSelect from "@/components/ui/SearchableSelect";

// Estilo que iguala el look de los <select> nativos de Caja para los
// SearchableSelect (responsable/categoría).
const cajaInputStyle: CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 10px",
  fontFamily: "var(--caja-font-sans)",
  fontSize: 13,
  color: "var(--caja-fg-strong)",
  background: "#fff",
  outline: "none",
  borderRadius: 6,
  border: "1px solid var(--caja-border-default)",
  transition: "border-color 120ms ease, box-shadow 120ms ease",
};
const cajaInputFocusStyle: CSSProperties = {
  borderColor: "var(--caja-accent)",
  boxShadow: "var(--caja-focus-shadow)",
};

export interface GastoFormValues {
  gFecha: string;
  gDescripcion: string;
  gProveedor: string;
  gNroFactura: string;
  gSubtotal: string;
  gItbmsPct: string;
  gCategoria: string;
  gResponsableId: string;
}

export interface GastoFormSetters {
  setGFecha: (v: string) => void;
  setGDescripcion: (v: string) => void;
  setGProveedor: (v: string) => void;
  setGNroFactura: (v: string) => void;
  setGSubtotal: (v: string) => void;
  setGItbmsPct: (v: string) => void;
  setGCategoria: (v: string) => void;
  setGResponsableId: (v: string) => void;
}

export function normalizeStr(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

interface Props {
  values: GastoFormValues;
  setters: GastoFormSetters;
  subtotalNum: number;
  totalNum: number;
  categorias: string[];
  responsablesCatalog: CajaResponsable[];
  showManageCat: boolean;
  newCatName: string;
  isOwner: boolean;
  setCategorias: (v: string[]) => void;
  setShowManageCat: (v: boolean) => void;
  setNewCatName: (v: string) => void;
}

/* ---------- Layout primitives ---------- */

function Section({ eyebrow, children, last = false }: { eyebrow: string; children: ReactNode; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 0 : 40 }}>
      <div
        className="pb-2 mb-4"
        style={{ borderBottom: "1px solid var(--caja-stone-200)" }}
      >
        <div className="caja-eyebrow">{eyebrow}</div>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "var(--caja-fg-default)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {label}
        {required && (
          <span style={{ color: "var(--caja-danger)" }}>*</span>
        )}
      </label>
      {children}
      {hint && (
        <div
          className="text-xs mt-0.5 leading-snug"
          style={{ color: "var(--caja-fg-muted)" }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "date";
  ariaLabel?: string;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      type={type}
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      placeholder={placeholder}
      style={{
        width: "100%",
        height: 44,
        padding: "0 10px",
        fontFamily: type === "date" ? "var(--caja-font-mono)" : "var(--caja-font-sans)",
        fontSize: 13,
        color: "var(--caja-fg-strong)",
        background: "#fff",
        outline: "none",
        borderRadius: 6,
        border: `1px solid ${focus ? "var(--caja-accent)" : "var(--caja-border-default)"}`,
        boxShadow: focus ? "var(--caja-focus-shadow)" : "none",
        transition: "border-color 120ms ease, box-shadow 120ms ease",
      }}
    />
  );
}

function SelectInput({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width: "100%",
          height: 44,
          padding: "0 32px 0 10px",
          fontFamily: "var(--caja-font-sans)",
          fontSize: 13,
          color: "var(--caja-fg-strong)",
          background: "#fff",
          outline: "none",
          borderRadius: 6,
          border: `1px solid ${focus ? "var(--caja-accent)" : "var(--caja-border-default)"}`,
          boxShadow: focus ? "var(--caja-focus-shadow)" : "none",
          appearance: "none",
          WebkitAppearance: "none",
          transition: "border-color 120ms ease, box-shadow 120ms ease",
        }}
      >
        {children}
      </select>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          position: "absolute",
          right: 10,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--caja-fg-muted)",
          pointerEvents: "none",
        }}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );
}

function MoneyInputFlat({
  value,
  onChange,
  placeholder,
  readOnly,
  highlight,
  ariaLabel,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  highlight?: boolean;
  ariaLabel?: string;
}) {
  const [focus, setFocus] = useState(false);
  const border = focus
    ? "var(--caja-accent)"
    : highlight
      ? "var(--caja-accent)"
      : "var(--caja-border-default)";
  const bg = highlight ? "var(--caja-accent-soft)" : "#fff";
  const color = highlight ? "var(--caja-teal-900)" : "var(--caja-fg-strong)";
  const prefixColor = highlight
    ? "var(--caja-teal-800)"
    : "var(--caja-fg-muted)";
  return (
    <div style={{ position: "relative", width: "100%", height: 48 }}>
      <span
        style={{
          position: "absolute",
          left: 12,
          top: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          color: prefixColor,
          fontSize: 14,
          fontWeight: highlight ? 600 : 400,
          fontFamily: "var(--caja-font-mono)",
          pointerEvents: "none",
        }}
      >
        $
      </span>
      <input
        value={value}
        readOnly={readOnly}
        aria-label={ariaLabel}
        onChange={(e) =>
          !readOnly && onChange?.(e.target.value.replace(/[^0-9.]/g, ""))
        }
        onFocus={() => !readOnly && setFocus(true)}
        onBlur={() => !readOnly && setFocus(false)}
        placeholder={placeholder}
        inputMode="decimal"
        tabIndex={readOnly ? -1 : 0}
        style={{
          boxSizing: "border-box",
          width: "100%",
          height: 48,
          margin: 0,
          background: bg,
          borderRadius: 6,
          padding: "0 14px 0 26px",
          fontFamily: "var(--caja-font-mono)",
          fontSize: 14,
          color,
          outline: "none",
          textAlign: "right",
          fontWeight: highlight ? 600 : 500,
          cursor: readOnly ? "default" : "text",
          display: "block",
          border: `1px solid ${border}`,
          boxShadow: focus ? "var(--caja-focus-shadow)" : "none",
          transition: "border-color 120ms ease, box-shadow 120ms ease",
        }}
      />
    </div>
  );
}

/* ---------- Sugerencia de categoría por keywords del concepto ---------- */
// Preselecciona (no fuerza): solo sugiere si la categoría existe en la lista.
const CATEGORIA_KEYWORDS: { cat: string; kws: string[] }[] = [
  { cat: "Transporte", kws: ["taxi", "uber", "didi", "bus", "pasaje", "transporte", "peaje", "estacionamiento", "parqueo"] },
  { cat: "Combustible", kws: ["gasolina", "combustible", "diesel"] },
  { cat: "Alimentacion", kws: ["comida", "almuerzo", "desayuno", "cena", "restaurante", "cafe", "café", "snack", "agua", "refresco", "soda", "merienda"] },
  { cat: "Limpieza", kws: ["limpieza", "detergente", "cloro", "escoba", "jabon", "jabón", "toalla", "desinfectante"] },
  { cat: "Papeleria", kws: ["papeleria", "papelería", "tinta", "toner", "tóner", "resma", "boligrafo", "bolígrafo", "lapiz", "lápiz", "impresion", "impresión", "fotocopia", "sobre", "carpeta"] },
  { cat: "Envios", kws: ["correo", "encomienda", "envio", "envío", "courier", "flete"] },
  { cat: "Servicios", kws: ["internet", "telefono", "teléfono", "electricidad", "recarga"] },
  { cat: "Mantenimiento", kws: ["ferreteria", "ferretería", "tornillo", "herramienta", "reparacion", "reparación", "mantenimiento", "pintura", "bombillo", "foco"] },
];

function suggestCategoria(desc: string, categorias: string[]): string | null {
  const d = desc.toLowerCase();
  if (d.trim().length < 3) return null;
  for (const { cat, kws } of CATEGORIA_KEYWORDS) {
    if (kws.some((k) => d.includes(k))) {
      const match = categorias.find((c) => c.toLowerCase() === cat.toLowerCase());
      if (match) return match;
    }
  }
  return null;
}

/* ---------- Form ---------- */

export default function GastoForm({
  values,
  setters,
  subtotalNum,
  totalNum,
  categorias,
  responsablesCatalog,
  showManageCat,
  newCatName,
  isOwner,
  setCategorias,
  setShowManageCat,
  setNewCatName,
}: Props) {
  const {
    gFecha, gDescripcion, gProveedor, gNroFactura,
    gSubtotal, gItbmsPct, gCategoria,
    gResponsableId,
  } = values;
  const {
    setGFecha, setGDescripcion, setGProveedor, setGNroFactura,
    setGSubtotal, setGItbmsPct, setGCategoria,
    setGResponsableId,
  } = setters;

  const [catError, setCatError] = useState<string | null>(null);
  // Mientras el usuario no toque la categoría a mano, la preseleccionamos según
  // las keywords del concepto. Tras un cambio manual, dejamos de sugerir.
  const [categoriaTouched, setCategoriaTouched] = useState(false);

  // El ITBMS arranca plegado: solo 9 de 77 gastos vivos lo tienen (medido
  // 4-sep-2026) y sus tres campos ocupaban un tercio del formulario. Abre
  // desplegado si el gasto que llega YA trae un porcentaje. La cuenta no
  // cambia: plegado, itbms = 0 igual que hoy.
  const [itbmsPedido, setItbmsPedido] = useState(false);
  const itbmsAbierto = itbmsPedido || parseFloat(gItbmsPct) > 0;

  function handleDescripcionChange(v: string) {
    setGDescripcion(v);
    if (!categoriaTouched) {
      const s = suggestCategoria(v, categorias);
      if (s) setGCategoria(s);
    }
  }

  // Live ITBMS amount derived from the percent + subtotal.
  const itbmsAmount = Math.round(subtotalNum * (parseFloat(gItbmsPct) / 100) * 100) / 100;

  return (
    <div>
      {/* Comprobante */}
      <Section eyebrow="Comprobante">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: 24,
          }}
          className="caja-grid-comprobante"
        >
          <Field label="Fecha" required>
            <TextInput type="date" value={gFecha} onChange={setGFecha} ariaLabel="Fecha" />
          </Field>
          <Field label="Descripción" required>
            <TextInput
              value={gDescripcion}
              onChange={handleDescripcionChange}
              placeholder="¿En qué se gastó?"
              ariaLabel="Descripción"
            />
          </Field>
        </div>
      </Section>

      {/* Origen del gasto */}
      <Section eyebrow="Origen del gasto">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 180px",
            gap: 24,
          }}
          className="caja-grid-origen"
        >
          <Field label="Proveedor" required>
            <TextInput
              value={gProveedor}
              onChange={setGProveedor}
              placeholder="Nombre del proveedor"
              ariaLabel="Proveedor"
            />
          </Field>
          {/* Sin `hint`: es el único campo sin el asterisco rojo, y "Opcional"
              vive donde el ojo ya está mirando — dentro del casillero. */}
          <Field label="Nº de factura">
            <TextInput
              value={gNroFactura}
              onChange={setGNroFactura}
              placeholder="Opcional"
              ariaLabel="Nº de factura"
            />
          </Field>
        </div>
      </Section>

      {/* Clasificación */}
      <Section eyebrow="Clasificación">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 24,
          }}
          className="caja-grid-clasif"
        >
          <Field label="Responsable" required>
            <SearchableSelect
              value={gResponsableId}
              onChange={setGResponsableId}
              options={responsablesCatalog.map((r) => ({ value: r.id, label: r.nombre }))}
              placeholder="Buscar responsable…"
              ariaLabel="Responsable"
              style={cajaInputStyle}
              focusStyle={cajaInputFocusStyle}
            />
          </Field>
          <Field label="Categoría" required>
            <SearchableSelect
              value={gCategoria}
              onChange={(v) => { setCategoriaTouched(true); setGCategoria(v); }}
              options={categorias.map((c) => ({ value: c, label: c }))}
              placeholder="Buscar categoría…"
              ariaLabel="Categoría"
              style={cajaInputStyle}
              focusStyle={cajaInputFocusStyle}
            />
          </Field>
        </div>
        {isOwner && (
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => {
                setCatError(null);
                setShowManageCat(!showManageCat);
              }}
              type="button"
              className="inline-flex min-h-[44px] items-center gap-1.5 text-xs px-2 rounded transition-colors"
              style={{
                color: "var(--caja-fg-muted)",
                border: "1px solid var(--caja-border-subtle)",
                background: "#fff",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--caja-fg-strong)";
                e.currentTarget.style.borderColor = "var(--caja-border-default)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--caja-fg-muted)";
                e.currentTarget.style.borderColor = "var(--caja-border-subtle)";
              }}
              title="Gestionar categorías"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Gestionar categorías
            </button>
            {showManageCat && (
              <div
                className="mt-3 p-3 rounded text-sm space-y-2"
                style={{
                  background: "var(--caja-stone-50)",
                  border: "1px solid var(--caja-border-subtle)",
                }}
              >
                {categorias.map((c) => (
                  <div key={c} className="flex items-center justify-between py-1">
                    <span style={{ color: "var(--caja-fg-default)" }}>{c}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        setCatError(null);
                        const res = await fetch("/api/caja/categorias", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ nombre: c }),
                        });
                        if (!res.ok) {
                          const payload = await res.json().catch(() => null);
                          setCatError(
                            payload && typeof payload.error === "string"
                              ? payload.error
                              : "No se pudo eliminar la categoría.",
                          );
                          return;
                        }
                        setCategorias(categorias.filter((x) => x !== c));
                      }}
                      className="inline-flex h-11 w-11 items-center justify-center text-sm ml-3 -my-2 transition-colors"
                      style={{ color: "var(--caja-fg-subtle)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--caja-danger)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--caja-fg-subtle)")}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Nueva categoría"
                    className="flex-1 min-h-[44px] text-sm outline-none bg-transparent"
                    style={{ borderBottom: "1px solid var(--caja-border-default)" }}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      setCatError(null);
                      const normalized = normalizeStr(newCatName);
                      if (!normalized || categorias.includes(normalized)) return;
                      const res = await fetch("/api/caja/categorias", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ nombre: normalized }),
                      });
                      if (!res.ok) {
                        const payload = await res.json().catch(() => null);
                        setCatError(
                          payload && typeof payload.error === "string"
                            ? payload.error
                            : "No se pudo crear la categoría.",
                        );
                        return;
                      }
                      setCategorias([...categorias, normalized]);
                      setNewCatName("");
                    }}
                    className="inline-flex h-11 w-11 items-center justify-center text-sm -my-1 transition-colors"
                    style={{ color: "var(--caja-fg-muted)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--caja-accent)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--caja-fg-muted)")}
                  >
                    ＋
                  </button>
                </div>
                {catError && (
                  <p
                    className="text-xs"
                    style={{ color: "var(--caja-danger-onSoft)" }}
                  >
                    {catError}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Montos (USD) */}
      <Section eyebrow="Montos (USD)" last>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: itbmsAbierto ? "1fr 1fr 1fr" : "1fr 1fr",
            gap: 16,
          }}
          className="caja-grid-montos"
        >
          {/* Subtotal */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--caja-fg-default)",
                marginBottom: 6,
              }}
            >
              Subtotal <span style={{ color: "var(--caja-danger)" }}>*</span>
            </label>
            <MoneyInputFlat
              value={gSubtotal}
              onChange={setGSubtotal}
              placeholder="0.00"
              ariaLabel="Subtotal"
            />
            {gSubtotal && subtotalNum <= 0 && (
              <p
                className="text-xs mt-1"
                style={{ color: "var(--caja-danger-onSoft)" }}
              >
                El monto debe ser mayor a $0
              </p>
            )}
          </div>

          {itbmsAbierto ? (
            <>
              {/* ITBMS */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--caja-fg-default)",
                    marginBottom: 6,
                  }}
                >
                  ITBMS
                </label>
                <SelectInput value={gItbmsPct} onChange={setGItbmsPct}>
                  <option value="0">0%</option>
                  <option value="7">7%</option>
                </SelectInput>
                <div
                  className="text-xs mt-1.5 leading-snug"
                  style={{ color: "var(--caja-fg-muted)" }}
                >
                  Calculado al {gItbmsPct}% del subtotal:{" "}
                  <span className="caja-mono">${itbmsAmount.toFixed(2)}</span>
                </div>
              </div>

              {/* Total */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--caja-fg-default)",
                    marginBottom: 6,
                  }}
                >
                  Total
                </label>
                <MoneyInputFlat
                  value={totalNum > 0 ? totalNum.toFixed(2) : ""}
                  placeholder="0.00"
                  readOnly
                  highlight
                  ariaLabel="Total"
                />
              </div>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button
                type="button"
                onClick={() => setItbmsPedido(true)}
                className="inline-flex min-h-[44px] items-center gap-1 text-xs px-2 rounded transition-colors"
                style={{
                  color: "var(--caja-fg-muted)",
                  border: "1px solid var(--caja-border-subtle)",
                  background: "#fff",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--caja-fg-strong)";
                  e.currentTarget.style.borderColor = "var(--caja-border-default)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--caja-fg-muted)";
                  e.currentTarget.style.borderColor = "var(--caja-border-subtle)";
                }}
              >
                ＋ Agregar ITBMS
              </button>
            </div>
          )}
        </div>
      </Section>

      {/* Stack form rows on small screens */}
      <style jsx>{`
        @media (max-width: 640px) {
          :global(.caja-grid-comprobante),
          :global(.caja-grid-origen),
          :global(.caja-grid-clasif),
          :global(.caja-grid-montos) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
