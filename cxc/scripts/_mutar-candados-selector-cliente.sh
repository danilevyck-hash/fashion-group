#!/usr/bin/env bash
# Verificación por MUTACIÓN de los candados del selector único de cliente.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA, así que las
# mutaciones se apilan y ninguna se prueba por separado. Ya pasó en este repo
# (ver el bloque de "pedidos: el cliente se elige" en CLAUDE.md).
set -uo pipefail
cd "$(dirname "$0")/.."

PICKER=src/components/ClientePicker.tsx
SUGE=src/components/SugerenciasCliente.tsx
MOTOR=src/lib/clientes/sugerencias.ts
FORM=src/app/guias/components/GuiaForm.tsx
TYPEAHEAD=src/app/guias/components/ClienteTypeahead.tsx
INTRUSO=src/components/ClienteBuscadorNuevo.tsx

SUITE=(
  src/__tests__/un-solo-selector-de-cliente.test.ts
  src/__tests__/components/cliente-red-de-seguridad.test.tsx
  src/__tests__/components/guia-cliente-desplegable.test.tsx
  src/__tests__/components/guias-form.test.tsx
  src/__tests__/components/guias-sugerencias-cliente.test.tsx
  src/__tests__/components/marketing-registrar-gasto.test.tsx
  src/__tests__/lib/clientes-sugerencias.test.ts
)

TMP=$(mktemp -d)
for f in "$PICKER" "$SUGE" "$MOTOR" "$FORM"; do
  cp "$f" "$TMP/$(echo "$f" | tr / _)"
done

restaurar() {
  for f in "$PICKER" "$SUGE" "$MOTOR" "$FORM"; do
    cp "$TMP/$(echo "$f" | tr / _)" "$f"
  done
  rm -f "$TYPEAHEAD" "$INTRUSO"
}

cazadas=0
total=0

probar() {  # $1 = nombre de la mutación
  total=$((total + 1))
  local salida
  salida=$(npx vitest run "${SUITE[@]}" 2>&1)
  if echo "$salida" | grep -qE "Tests +.*failed"; then
    local n
    n=$(echo "$salida" | grep -oE "[0-9]+ failed" | head -1)
    echo "  ✅ CAZADA ($n) — $1"
    cazadas=$((cazadas + 1))
  else
    echo "  ❌ SOBREVIVIÓ — $1"
  fi
  restaurar
}

echo "== 1. la salida a mano vuelve a llamarse solo \"Otro\" =="
perl -0pi -e 's/➕ No está en la lista — escribir a mano/Otro/' "$PICKER"
probar 'rótulo "Otro"'

echo "== 2. el distintivo del campo vuelve a decir \"Otro\" =="
perl -0pi -e 's/>\s*A mano\s*</>Otro</' "$PICKER"
probar 'chip "Otro"'

echo "== 3. el selector deja de dibujar la red de seguridad =="
perl -0pi -e 's/\{mostrarSugerencias && \(/\{false \&\& \(/' "$PICKER"
probar "sin sugerencias en el selector"

echo "== 4. la sugerencia ATA SOLA cuando hay un único candidato =="
perl -0pi -e 's/  const uno = sugerencias\.length === 1 \? sugerencias\[0\] : null;/  const uno = sugerencias.length === 1 ? sugerencias[0] : null;\n  if (uno) onElegir(uno.nombre, uno.codigo);/' "$SUGE"
probar "ata sola con un candidato"

echo "== 5. D-201 vuelve a sugerirse =="
perl -0pi -e 's/export const CODIGOS_QUE_NO_SE_SUGIEREN: readonly string\[\] = \["D-201"\];/export const CODIGOS_QUE_NO_SE_SUGIEREN: readonly string[] = [];/' "$MOTOR"
probar "D-201 recomendado"

echo "== 6. la diferencia de número deja de avisarse =="
perl -0pi -e 's/  if \(dA && dB && dA !== dB\) avisos\.push\("numeros-distintos"\);/  if (false) avisos.push("numeros-distintos");/' "$MOTOR"
probar "sin aviso de números"

echo "== 7. el aviso \"no hay ninguno parecido\" se enciende en TODAS las filas =="
# La perilla efectiva vive en el SELECTOR: `SugerenciasCliente` siempre recibe
# un valor explícito, así que mutar su default sería un no-op perfecto.
perl -0pi -e 's/  avisarSinParecidos = false,/  avisarSinParecidos = true,/' "$PICKER"
probar "grita en cada renglón a mano"

echo "== 8. elegir cliente se vuelve OBLIGATORIO por defecto =="
perl -0pi -e 's/  permitirOtro = true,/  permitirOtro = false,/' "$PICKER"
probar "sin salida a mano por defecto"

echo "== 9. las guías apagan la salida a mano =="
perl -0pi -e 's/          topClientes=\{clientesTop\}/          topClientes={clientesTop}\n          permitirOtro={false}/' "$FORM"
probar "guías sin salida a mano"

echo "== 10. aparece un SEGUNDO selector de cliente en el sistema =="
cat > "$INTRUSO" <<'TSX'
"use client";
import { useState } from "react";
import { useBusquedaClientes } from "@/lib/hooks/useBusquedaClientes";
export default function ClienteBuscadorNuevo({ onSelect }: { onSelect: (n: string, c: string) => void }) {
  const [cliente, setCliente] = useState("");
  const { hits } = useBusquedaClientes(cliente, true);
  return (
    <>
      <input value={cliente} onChange={(e) => setCliente(e.target.value)} />
      {hits.map((h) => (
        <button key={h.codigo} onClick={() => onSelect(h.nombre, h.codigo)}>{h.nombre}</button>
      ))}
    </>
  );
}
TSX
probar "selector nuevo sin pasar por el compartido"

echo "== 11. vuelve el typeahead libre de Marketing =="
cat > "$TYPEAHEAD" <<'TSX'
"use client";
export default function ClienteTypeahead() {
  return null;
}
TSX
probar "ClienteTypeahead de vuelta"

restaurar
rm -rf "$TMP"
echo
echo "RESULTADO: $cazadas de $total mutaciones cazadas"
[ "$cazadas" -eq "$total" ]
