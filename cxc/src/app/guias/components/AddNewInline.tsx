"use client";

import { useState } from "react";

interface AddNewInlineProps {
  onAdd: (v: string) => void;
  placeholder: string;
}

export default function AddNewInline({ onAdd, placeholder }: AddNewInlineProps) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-gray-300 hover:text-gray-500 transition text-xs ml-1"
        title="Agregar nuevo"
      >
        ＋
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 ml-1">
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={placeholder}
        className="border-b border-gray-300 py-0.5 px-1 text-xs outline-none focus:border-black w-24"
        autoFocus
      />
      <button
        onClick={() => {
          if (val.trim()) {
            onAdd(val.trim());
            setVal("");
            setOpen(false);
          }
        }}
        className="text-xs text-gray-500 hover:text-black"
      >
        OK
      </button>
      <button
        onClick={() => {
          setVal("");
          setOpen(false);
        }}
        className="text-xs text-gray-300 hover:text-black"
      >
        ×
      </button>
    </span>
  );
}
