"use client";

import { useRef, useState } from "react";
import {
  MARCA_CATALOGO,
  descripcionesDeMarca,
  esDescripcionCatalogada,
  marcaKey,
  marcaRubroKey,
  type CatalogoDescripciones,
  type Redondeo,
  type MarcaFormula,
  type MarcaRubroFormula,
} from "@/lib/depurador/logic";

interface Summary { marcaOk: number; descOk: number; delOk: number; errors: string[] }

const CATALOG_MARCA_KEYS = new Set(MARCA_CATALOGO.map((c) => marcaKey(c.marca)));
const catalogMarca = (m: string) => MARCA_CATALOGO.find((c) => marcaKey(c.marca) === marcaKey(m));
const redondeoLabel = (r: Redondeo) => (r === "half" ? ".50" : r === "par" ? "Par" : "Entero");
const parseRedondeo = (v: unknown): Redondeo => {
  const s = marcaKey(v as string);
  if (s.includes("par")) return "par";
  return s.includes("half") || s.includes(".5") || s.includes("50") ? "half" : "int";
};
const isBlank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

// Pool de concurrencia simple (no martillar el server con 200+ requests a la vez).
async function runPool<T>(items: T[], n: number, fn: (it: T) => Promise<void>) {
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (idx < items.length) { const i = idx++; await fn(items[i]); }
    })
  );
}

export default function BulkExcel({ catalogo, onDone }: { catalogo: CatalogoDescripciones | null; onDone?: () => void }) {
  const [busy, setBusy] = useState<"" | "download" | "upload">("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const styleHeader = (ws: Record<string, { s?: unknown }>, ncols: number) => {
    for (let c = 0; c < ncols; c++) {
      const cell = ws[String.fromCharCode(65 + c) + "1"];
      if (cell) cell.s = { font: { bold: true }, fill: { patternType: "solid", fgColor: { rgb: "F3EFE7" } } };
    }
  };

  const download = async () => {
    if (busy || !catalogo) return;
    setBusy("download"); setSummary(null);
    try {
      const [mf, rf] = await Promise.all([
        fetch("/api/productos/cargar/formulas").then((r) => r.json()).catch(() => ({ rows: [] })),
        fetch("/api/productos/cargar/rubro-formulas").then((r) => r.json()).catch(() => ({ rows: [] })),
      ]);
      const marcaByKey = new Map<string, MarcaFormula>((mf.rows ?? []).map((f: MarcaFormula) => [marcaKey(f.marca), f]));
      const rubroByKey = new Map<string, MarcaRubroFormula>((rf.rows ?? []).map((f: MarcaRubroFormula) => [marcaRubroKey(f.marca, f.rubro), f]));

      const marcaAoa: (string | number)[][] = [["Marca", "Divisor", "Extra", "Redondeo"]];
      for (const c of MARCA_CATALOGO) {
        const f = marcaByKey.get(marcaKey(c.marca));
        marcaAoa.push([c.marca, f?.divisor ?? "", f?.extra ?? "", f ? redondeoLabel(f.redondeo) : ""]);
      }
      const descAoa: (string | number)[][] = [["Marca", "Descripción", "Divisor", "Extra", "Redondeo"]];
      for (const c of MARCA_CATALOGO) {
        for (const d of descripcionesDeMarca(catalogo, c.marca)) {
          const f = rubroByKey.get(marcaRubroKey(c.marca, d));
          descAoa.push([c.marca, d, f?.divisor ?? "", f?.extra ?? "", f ? redondeoLabel(f.redondeo) : ""]);
        }
      }

      const XLSX = (await import("xlsx-js-style")).default;
      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.aoa_to_sheet(marcaAoa);
      const ws2 = XLSX.utils.aoa_to_sheet(descAoa);
      ws1["!cols"] = [{ wch: 22 }, { wch: 10 }, { wch: 8 }, { wch: 12 }];
      ws2["!cols"] = [{ wch: 22 }, { wch: 34 }, { wch: 10 }, { wch: 8 }, { wch: 12 }];
      styleHeader(ws1 as Record<string, { s?: unknown }>, 4);
      styleHeader(ws2 as Record<string, { s?: unknown }>, 5);
      XLSX.utils.book_append_sheet(wb, ws1, "Por marca");
      XLSX.utils.book_append_sheet(wb, ws2, "Por descripción");
      XLSX.writeFile(wb, "Formulas-precio.xlsx");
    } finally {
      setBusy("");
    }
  };

  const upload = async (file: File) => {
    if (busy || !catalogo) return;
    setBusy("upload"); setSummary(null);
    const errors: string[] = [];
    try {
      const XLSX = (await import("xlsx-js-style")).default;
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = (name: string): unknown[][] | null => {
        const sn = wb.SheetNames.find((s: string) => marcaKey(s) === marcaKey(name));
        return sn ? (XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null }) as unknown[][]) : null;
      };
      const marcaRows = sheet("Por marca");
      const descRows = sheet("Por descripción");

      // Excepciones actuales (para borrar las que vengan en blanco y obtener ids).
      const rf = await fetch("/api/productos/cargar/rubro-formulas").then((r) => r.json()).catch(() => ({ rows: [] }));
      const rubroByKey = new Map<string, MarcaRubroFormula>((rf.rows ?? []).map((f: MarcaRubroFormula) => [marcaRubroKey(f.marca, f.rubro), f]));

      const marcaUpserts: { marca: string; empresa: string; divisor: number; extra: number; redondeo: Redondeo }[] = [];
      const descUpserts: { marca: string; desc: string; divisor: number; extra: number; redondeo: Redondeo }[] = [];
      const descDeletes: { id: string; label: string }[] = [];

      // Hoja "Por marca"
      if (marcaRows) {
        for (let i = 1; i < marcaRows.length; i++) {
          const row = marcaRows[i]; if (!row) continue;
          const marca = String(row[0] ?? "").trim();
          if (!marca) continue;
          if (!CATALOG_MARCA_KEYS.has(marcaKey(marca))) { errors.push(`Por marca: "${marca}" no está en el catálogo`); continue; }
          if (isBlank(row[1])) continue; // en blanco = no tocar
          const divisor = Number(row[1]);
          const extra = Math.round(Number(row[2] ?? 0));
          const redondeo = parseRedondeo(row[3]);
          if (!Number.isFinite(divisor) || divisor <= 0) { errors.push(`Por marca: "${marca}" divisor inválido`); continue; }
          if (!Number.isFinite(extra) || extra < 0 || extra > 5) { errors.push(`Por marca: "${marca}" extra inválido`); continue; }
          const cat = catalogMarca(marca)!;
          marcaUpserts.push({ marca: cat.marca, empresa: cat.empresa, divisor, extra, redondeo });
        }
      }

      // Hoja "Por descripción"
      if (descRows) {
        for (let i = 1; i < descRows.length; i++) {
          const row = descRows[i]; if (!row) continue;
          const marca = String(row[0] ?? "").trim();
          const desc = String(row[1] ?? "").trim();
          if (!marca && !desc) continue;
          if (!esDescripcionCatalogada(catalogo, marca, desc)) { errors.push(`Por descripción: "${marca} · ${desc}" no está en el catálogo`); continue; }
          const cat = catalogMarca(marca)!;
          const canonDesc = descripcionesDeMarca(catalogo, cat.marca).find((d) => marcaKey(d) === marcaKey(desc)) ?? desc;
          const key = marcaRubroKey(cat.marca, canonDesc);
          if (isBlank(row[2])) {
            const ex = rubroByKey.get(key);
            if (ex?.id) descDeletes.push({ id: ex.id, label: `${cat.marca} · ${canonDesc}` });
            continue; // en blanco sin excepción guardada = nada que hacer
          }
          const divisor = Number(row[2]);
          const extra = Math.round(Number(row[3] ?? 0));
          const redondeo = parseRedondeo(row[4]);
          if (!Number.isFinite(divisor) || divisor <= 0) { errors.push(`Por descripción: "${cat.marca} · ${canonDesc}" divisor inválido`); continue; }
          if (!Number.isFinite(extra) || extra < 0 || extra > 5) { errors.push(`Por descripción: "${cat.marca} · ${canonDesc}" extra inválido`); continue; }
          descUpserts.push({ marca: cat.marca, desc: canonDesc, divisor, extra, redondeo });
        }
      }

      let marcaOk = 0, descOk = 0, delOk = 0;
      await runPool(marcaUpserts, 6, async (u) => {
        const res = await fetch("/api/productos/cargar/formulas", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ marca: u.marca, empresa: u.empresa, divisor: u.divisor, extra: u.extra, redondeo: u.redondeo }),
        });
        if (res.ok) marcaOk++; else errors.push(`No se pudo guardar marca "${u.marca}"`);
      });
      await runPool(descUpserts, 6, async (u) => {
        const res = await fetch("/api/productos/cargar/rubro-formulas", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ marca: u.marca, rubro: u.desc, divisor: u.divisor, extra: u.extra, redondeo: u.redondeo }),
        });
        if (res.ok) descOk++; else errors.push(`No se pudo guardar "${u.marca} · ${u.desc}"`);
      });
      await runPool(descDeletes, 6, async (u) => {
        const res = await fetch(`/api/productos/cargar/rubro-formulas?id=${encodeURIComponent(u.id)}`, { method: "DELETE" });
        if (res.ok) delOk++; else errors.push(`No se pudo borrar "${u.label}"`);
      });

      setSummary({ marcaOk, descOk, delOk, errors });
      onDone?.();
    } catch (e) {
      setSummary({ marcaOk: 0, descOk: 0, delOk: 0, errors: [e instanceof Error ? e.message : "No se pudo leer el archivo."] });
    } finally {
      setBusy("");
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-stone-200 bg-white px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-stone-500">Edición en masa</span>
        <button
          type="button" onClick={download} disabled={!!busy || !catalogo}
          className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold text-stone-900 transition hover:border-teal-600 hover:text-teal-800 active:scale-[0.97] disabled:opacity-50"
        >
          {busy === "download" ? "Generando…" : "Descargar Excel"}
        </button>
        <button
          type="button" onClick={() => inputRef.current?.click()} disabled={!!busy || !catalogo}
          className="rounded-md bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-teal-700 active:scale-[0.97] disabled:opacity-50"
        >
          {busy === "upload" ? "Subiendo…" : "Subir Excel"}
        </button>
        <input
          ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) upload(e.target.files[0]); }}
        />
        <span className="text-[12px] text-stone-500">2 hojas: &quot;Por marca&quot; y &quot;Por descripción&quot;.</span>
      </div>

      {summary && (
        <div className="mt-2.5 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-[13px] text-stone-700">
          <b className="text-teal-800">{summary.marcaOk}</b> fórmulas de marca · <b className="text-teal-800">{summary.descOk}</b> excepciones
          actualizadas/creadas · <b className="text-teal-800">{summary.delOk}</b> borradas
          {summary.errors.length > 0 && (
            <>
              {" "}· <b className="text-amber-700">{summary.errors.length} con error</b>
              <ul className="ml-4 mt-1 list-disc text-[12px] text-stone-500">
                {summary.errors.slice(0, 10).map((x, i) => <li key={i}>{x}</li>)}
                {summary.errors.length > 10 && <li>…y {summary.errors.length - 10} más.</li>}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
