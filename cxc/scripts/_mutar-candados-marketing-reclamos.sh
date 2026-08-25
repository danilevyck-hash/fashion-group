#!/usr/bin/env bash
# ============================================================================
# Verificación por MUTACIÓN de los candados de Marketing/Reclamos (24-ago-2026).
#
# Rompe el arreglo a propósito, una mutación por vez, y exige que algún test se
# ponga ROJO. Una mutación que sobrevive = candado que no sirve.
#
# 🩸 La restauración va por COPIA, no con `git checkout`: hay archivos NUEVOS en
# la rama (los propios tests) y `git checkout -- .` abortaría el comando entero
# sin restaurar nada, apilando mutaciones. Y `probar()` EXIGE encontrar el
# resumen de vitest: si la corrida muere, "0 fallos" se leería como
# "la mutación sobrevivió", que es el peor resultado posible.
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

SUITES=(
  "src/__tests__/components/marketing-reclamos-toques.test.tsx"
  "src/__tests__/lib/reclamos-genero-valor-vs-etiqueta.test.ts"
  "src/__tests__/components/marketing-entrega-form.test.tsx"
  "src/__tests__/lib/marketing-menu-proyecto.test.ts"
)

ARCHIVOS=(
  "src/app/marketing/components/FacturasSection.tsx"
  "src/app/marketing/components/FotosSection.tsx"
  "src/app/marketing/components/ProyectoOverlay.tsx"
  "src/app/marketing/components/ReportePorProyectoView.tsx"
  "src/app/marketing/components/HistorialImpulsadoraModal.tsx"
  "src/app/marketing/components/DetallePeriodoView.tsx"
  "src/app/marketing/mobiliario/page.tsx"
  "src/app/reclamos/components/EnviarProveedorModal.tsx"
  "src/app/reclamos/components/ReclamoForm.tsx"
  "src/app/reclamos/components/ReclamoDetail.tsx"
  "src/app/reclamos/components/constants.ts"
  "src/components/marketing/EntregaForm.tsx"
  "src/lib/reclamos/validate.ts"
  "src/lib/excel-reclamo.ts"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap 'restaurar; rm -rf "$RESPALDO"' EXIT

CAZADAS=0; SOBREVIVIERON=0

probar() {
  local nombre="$1"
  local salida
  salida="$(npx vitest run "${SUITES[@]}" 2>&1)"
  # EXIGE el resumen: sin él la corrida murió y no medimos nada.
  local resumen
  resumen="$(printf '%s' "$salida" | grep -E "^ +Tests +" | tail -1)"
  if [ -z "$resumen" ]; then
    echo "  ⛔ $nombre — la corrida NO produjo resumen de vitest (no se midió)"
    SOBREVIVIERON=$((SOBREVIVIERON+1)); return
  fi
  local fallos
  fallos="$(printf '%s' "$resumen" | grep -oE "[0-9]+ failed" | grep -oE "[0-9]+" || true)"
  if [ -n "$fallos" ] && [ "$fallos" -gt 0 ]; then
    echo "  ✅ $nombre — $fallos test(s) en rojo"
    CAZADAS=$((CAZADAS+1))
  else
    echo "  ❌ $nombre — SOBREVIVIÓ ($resumen)"
    SOBREVIVIERON=$((SOBREVIVIERON+1))
  fi
}

# sustituir <archivo> <viejo> <nuevo>  (literal, con python para no pelear con sed)
sustituir() {
  python3 - "$1" "$2" "$3" <<'PY'
import io,sys
p,o,n=sys.argv[1],sys.argv[2],sys.argv[3]
s=io.open(p,encoding="utf-8").read()
if o not in s:
    sys.stderr.write("NO ENCONTRADO en %s: %r\n" % (p,o[:70])); sys.exit(9)
io.open(p,"w",encoding="utf-8").write(s.replace(o,n,1))
PY
}

mutar() {
  local nombre="$1"; shift
  if ! sustituir "$@"; then
    echo "  ⛔ $nombre — no se pudo aplicar la mutación (patrón no encontrado)"
    SOBREVIVIERON=$((SOBREVIVIERON+1)); restaurar; return
  fi
  probar "$nombre"
  restaurar
}

echo "── 1. Editar · Anular · Eliminar de una factura ──"
mutar "los botones vuelven a medir 24 px" \
  src/app/marketing/components/FacturasSection.tsx \
  'border border-gray-200 rounded-md px-3 min-h-[44px] inline-flex items-center transition"
                    >
                      Editar' \
  'border border-gray-200 rounded px-2 py-1 transition"
                    >
                      Editar'

mutar "Eliminar vuelve a quedar pegado a Anular (sin ml-auto)" \
  src/app/marketing/components/FacturasSection.tsx \
  'className="ml-auto text-xs text-red-700' \
  'className="text-xs text-red-700'

mutar "Eliminar vuelve a decir sólo «Eliminar»" \
  src/app/marketing/components/FacturasSection.tsx \
  '                        Eliminar definitivamente
                      </button>' \
  '                        Eliminar
                      </button>'

mutar "los botones vuelven a esconderse tras el hover" \
  src/app/marketing/components/FacturasSection.tsx \
  '<div className="flex flex-wrap items-center gap-2">' \
  '<div className="opacity-0 group-hover:opacity-100 flex flex-wrap items-center gap-2">'

echo "── 2. El borrado definitivo del proyecto ──"
mutar "el proyecto vuelve a decir sólo «Eliminar»" \
  src/app/marketing/components/ProyectoOverlay.tsx \
  '                      Eliminar definitivamente
                    </button>' \
  '                      Eliminar
                    </button>'

mutar "vuelve a quedar pegado a Editar en la misma fila" \
  src/app/marketing/components/ProyectoOverlay.tsx \
  '<div className="flex flex-col items-end gap-2 mt-1">' \
  '<div className="flex gap-1.5 mt-1">'

mutar "el botón del proyecto pierde los 44 px" \
  src/app/marketing/components/ProyectoOverlay.tsx \
  'className="text-xs px-3 min-h-[44px] inline-flex items-center rounded-md border border-red-300' \
  'className="text-xs px-2 py-1 rounded border border-red-300'

mutar "el borrado deja de pedir escribir el nombre" \
  src/app/marketing/components/ProyectoOverlay.tsx \
  '<ConfirmTypeNameModal' \
  '<ConfirmDeleteModalNoop_' 

mutar "la lista pierde su borrado REVERSIBLE (anular)" \
  src/app/marketing/components/DetallePeriodoView.tsx \
  'label: "Registrado por error — eliminar"' \
  'label: "Eliminar"'

echo "── 3. El correo al proveedor ──"
mutar "el fondo gris vuelve a cerrar con el correo escrito" \
  src/app/reclamos/components/EnviarProveedorModal.tsx \
  '      {...backdrop}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"' \
  '      onMouseDown={() => {}}
      onClick={() => { if (!sending) onClose(); }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"'

mutar "el tacho vuelve a borrar de una, sin preguntar" \
  src/app/reclamos/components/EnviarProveedorModal.tsx \
  'onClick={() => { setBorrandoId(ct.id); setLibretaErr(null); }}' \
  'onClick={() => deleteContacto(ct.id)}'

mutar "el tacho pierde los 44 px" \
  src/app/reclamos/components/EnviarProveedorModal.tsx \
  'className="ml-1 w-11 h-11 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-red-600' \
  'className="p-1 text-gray-400 hover:text-red-600'

mutar "el prefill vuelve a un efecto (la foto sale vacía y no cierra nunca)" \
  src/app/reclamos/components/EnviarProveedorModal.tsx \
  'const { panelRef, backdrop } = useFormModalDismiss(open, onClose, !sending, mounted);' \
  'const { panelRef, backdrop } = useFormModalDismiss(open, onClose, !sending);'

echo "── 4. El filtro de marca ──"
mutar "vuelve a desenvolver un sobre {marcas} que no existe" \
  src/app/marketing/components/ReportePorProyectoView.tsx \
  'const data = (await mkRes.json()) as unknown;
          if (!cancel) setMarcas(Array.isArray(data) ? (data as MkMarca[]) : []);' \
  'const json = (await mkRes.json()) as { marcas?: MkMarca[]; items?: MkMarca[] };
          if (!cancel) setMarcas(json.marcas ?? json.items ?? []);'

echo "── 5. La X de la foto ──"
mutar "la X vuelve a esconderse tras el hover" \
  src/app/marketing/components/FotosSection.tsx \
  'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 focus-visible:opacity-100 transition"' \
  'opacity-0 group-hover:opacity-100 transition"'

mutar "la X vuelve a medir 24 px" \
  src/app/marketing/components/FotosSection.tsx \
  'rounded-full w-11 h-11 flex' \
  'rounded-full w-6 h-6 flex'

echo "── 6. El botón de entregar muebles ──"
mutar "el «Falta: …» desaparece de la pantalla" \
  src/components/marketing/EntregaForm.tsx \
  '{!guardando && falta.length > 0 && (
            <p className="text-xs text-amber-800">Falta: {falta.join(", ")}.</p>
          )}' \
  '{false && (
            <p className="text-xs text-amber-800">Falta: {falta.join(", ")}.</p>
          )}'

mutar "vuelve el globito del mouse en vez del aviso" \
  src/components/marketing/EntregaForm.tsx \
  'disabled={!puedeGuardar}
                className="rounded-md bg-gray-900 text-white px-4 min-h-[44px] text-sm font-medium active:scale-[0.97] transition disabled:opacity-50"' \
  'disabled={!puedeGuardar}
                title="Indica al menos 1 panel"
                className="rounded-md bg-gray-900 text-white px-4 min-h-[44px] text-sm font-medium active:scale-[0.97] transition disabled:opacity-50"'

mutar "el campo deja de decir que es obligatorio" \
  src/components/marketing/EntregaForm.tsx \
  'Obligatorio — sin
                  paneles no se puede registrar la entrega.' \
  'Cuántos paneles van.'

mutar "el aviso vuelve DENTRO del <label> (rompe el nombre accesible)" \
  src/components/marketing/EntregaForm.tsx \
  '                  Cantidad de paneles
                </label>' \
  '                  Cantidad de paneles <span>Obligatorio</span>
                </label>'

echo "── 7 y 8. Mobiliario ──"
mutar "vuelven los dos números idénticos (Valor total + Disponible)" \
  src/app/marketing/mobiliario/page.tsx \
  '          En bodega:{" "}' \
  '          Valor total: {formatearMonto(metricas.enBodega)} · Disponible:{" "}'

mutar "vuelve el segundo «Descargar Excel» dentro del resumen" \
  src/app/marketing/mobiliario/page.tsx \
  '              <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                Resumen por tienda
              </h2>
            </div>
          </div>' \
  '              <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                Resumen por tienda
              </h2>
            </div>
            <button type="button" onClick={() => descargarExcel()} className="text-xs">Descargar Excel</button>
          </div>'

echo "── 9. Anular un pago de impulsadora ──"
mutar "vuelve el prompt() del navegador" \
  src/app/marketing/components/HistorialImpulsadoraModal.tsx \
  'onClick={() => { setAnularPendiente(p); setAnularMotivo(""); }}' \
  'onClick={() => { const m = window.prompt("motivo"); if (m) void anular(p, m); }}'

mutar "el motivo deja de ser obligatorio" \
  src/app/marketing/components/HistorialImpulsadoraModal.tsx \
  'disabled={anulando !== null || anularMotivo.trim().length === 0}' \
  'disabled={anulando !== null}'

mutar "la fecha vuelve a salir como código" \
  src/app/marketing/components/HistorialImpulsadoraModal.tsx \
  'registrado {fmtDate(p.fechaRegistro)}' \
  'registrado {p.fechaRegistro}'

echo "── 10. El género ──"
mutar "🔴 se traduce el VALOR guardado (rompería el CHECK de la base)" \
  src/app/reclamos/components/constants.ts \
  'export const GENEROS = ["Men", "Women", "Kids", "Accessories"] as const;' \
  'export const GENEROS = ["Hombre", "Mujer", "Niños", "Accesorios"] as const;'

mutar "el desplegable vuelve a mostrarse en inglés" \
  src/app/reclamos/components/ReclamoForm.tsx \
  '{GENEROS.map((g) => <option key={g} value={g}>{generoLabel(g)}</option>)}' \
  '{GENEROS.map((g) => <option key={g} value={g}>{g}</option>)}'

mutar "el detalle vuelve a mostrar el valor crudo" \
  src/app/reclamos/components/ReclamoDetail.tsx \
  '{generoLabel(item.genero) || "—"}' \
  '{item.genero || "—"}'

mutar "el error de validación vuelve al inglés" \
  src/lib/reclamos/validate.ts \
  'falta el género (Hombre/Mujer/Niños/Accesorios).' \
  'falta el género (Men/Women/Kids/Accessories).'

mutar "una etiqueta se pierde (queda un género sin traducir)" \
  src/app/reclamos/components/constants.ts \
  '  Kids: "Niños",' \
  ''

mutar "el Excel del proveedor empieza a traducirse (documento externo)" \
  src/lib/excel-reclamo.ts \
  'String(item.genero || "")' \
  'String(generoLabel(item.genero) || "")'

echo
echo "════════════════════════════════════════════"
echo "Mutaciones cazadas:    $CAZADAS"
echo "Mutaciones que vivieron: $SOBREVIVIERON"
echo "════════════════════════════════════════════"
[ "$SOBREVIVIERON" -eq 0 ]
