"use client";

type MarcaCodigo = "TH" | "CK" | "RBK";
type Size = "sm" | "md";

interface MarcaBadgeProps {
  codigo: MarcaCodigo;
  size?: Size;
}

const MARCA_STYLES: Record<MarcaCodigo, { bg: string; text: string; label: string }> = {
  TH: { bg: "bg-blue-600", text: "text-white", label: "Tommy" },
  CK: { bg: "bg-black", text: "text-white", label: "Calvin" },
  RBK: { bg: "bg-red-600", text: "text-white", label: "Reebok" },
};

const SIZES: Record<Size, string> = {
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-2.5 py-1",
};

export function MarcaBadge({ codigo, size = "sm" }: MarcaBadgeProps) {
  const style = MARCA_STYLES[codigo];
  if (!style) {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-gray-100 text-gray-600 font-medium ${SIZES[size]}`}
      >
        {codigo}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${style.bg} ${style.text} ${SIZES[size]}`}
    >
      {style.label}
    </span>
  );
}

export default MarcaBadge;
