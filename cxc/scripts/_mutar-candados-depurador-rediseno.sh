#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados del rediseño del Depurador (4-sep-2026) cazan de verdad? Se
# rompe el código a propósito, una cosa por vez, y se exige que los tests se
# pongan ROJOS. CONTROL (sin mutar) tiene que quedar verde.
#
# Lo que se muta: recordar el mes de la temporada (el 1 de septiembre diría
# agosto) · guardar el pedido para cliente de Reebok en el historial · borrar
# la FILA junto con el archivo a los 90 días · el divisor sin validar en
# Reebok y en Facturas Tienda · la descarga encendida con divisor malo en
# Reebok · «cambiar» que no cambia nada · el historial recibe OTRO blob ·
# un ?tab= viejo que deja de redirigir · la retención cae a 9 días.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: la rama puede traer
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-depurador-rediseno.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/depurador-validacion-pantalla.test.tsx \
src/__tests__/lib/depurador-divisor-tres-caminos.test.tsx \
src/__tests__/lib/depurador-pestanas-rediseno.test.ts \
src/__tests__/api/depurador-historial-archivo.test.ts"

ARCHIVOS=(
  "src/app/productos/cargar/DepuradorClient.tsx"
  "src/app/productos/cargar/ReebokClient.tsx"
  "src/app/productos/cargar/FacturasTiendaClient.tsx"
  "src/app/productos/cargar/pestanas.ts"
  "src/lib/depurador/historial-archivos.ts"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0

probar() { # $1 = nombre de la mutación
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  if ! grep -qE "^ *Tests " <<<"$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no hay resumen que leer: $1"
    sobrevivientes=$((sobrevivientes + 1)); return
  fi
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos fallos) — $1"
    cazadas=$((cazadas + 1))
  else
    echo "  🔴 SOBREVIVIÓ — $1"
    sobrevivientes=$((sobrevivientes + 1))
  fi
}

mutar() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  restaurar
  python3 - "$1" "$2" "$3" <<'PY'
import sys
ruta, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(ruta).read()
if viejo not in s:
    print(f"  ⚠️  el patrón no está en {ruta}: {viejo[:70]}")
    sys.exit(3)
open(ruta, "w").write(s.replace(viejo, nuevo, 1))
PY
  if [ $? -eq 3 ]; then sobrevivientes=$((sobrevivientes + 1)); return 1; fi
  return 0
}

CLIENTE="src/app/productos/cargar/DepuradorClient.tsx"
REEBOK="src/app/productos/cargar/ReebokClient.tsx"
TIENDA="src/app/productos/cargar/FacturasTiendaClient.tsx"
PESTANAS="src/app/productos/cargar/pestanas.ts"
LIMPIEZA="src/lib/depurador/historial-archivos.ts"

echo "── CONTROL (sin mutar): tiene que quedar VERDE ──"
salida="$(npx vitest run $TESTS 2>&1)"
if grep -qE "^ *Tests .*[0-9]+ passed" <<<"$salida" && ! grep -qE "[0-9]+ failed" <<<"$salida"; then
  echo "  ✅ CONTROL verde"
else
  echo "  ⛔ CONTROL ROJO — no tiene sentido mutar sobre tests rotos"; exit 1
fi

echo "── Mutación 1: la temporada vuelve a RECORDARSE (el 1 de septiembre diría agosto) ──"
mutar "$CLIENTE" \
  "const [temporada, setTemporada] = useState(() => hoyPanama().slice(0, 7));" \
  "const [temporada, setTemporada] = useState(() => {
    try {
      const mes = localStorage.getItem(\"fg_last_depurador_mes\");
      const anio = localStorage.getItem(\"fg_last_depurador_anio\");
      if (mes !== null && anio) return \`\${anio}-\${String(parseInt(mes, 10) + 1).padStart(2, \"0\")}\`;
    } catch { /* sin localStorage */ }
    return hoyPanama().slice(0, 7);
  });" \
  "recordar el mes de la temporada" && probar "recordar el mes de la temporada"

echo "── Mutación 2: el pedido para cliente de Reebok SE GUARDA en el historial ──"
mutar "$REEBOK" \
  "        XLSX.writeFile(wb, nombre);
        return;" \
  "        XLSX.writeFile(wb, nombre);
        onDownloaded?.({ empresa: \"Active Shoes\", marca: \"Reebok\", cantidad_estilos: catalogo.length, total_unidades: 0, total_costo: 0 });
        return;" \
  "guardar el pedido de Reebok" && probar "guardar el pedido de Reebok"

echo "── Mutación 3: la limpieza borra la FILA junto con el archivo ──"
mutar "$LIMPIEZA" \
  "    .update({ archivo_path: null })
    .in(\"id\", filas.map((f) => f.id));" \
  "    .delete()
    .in(\"id\", filas.map((f) => f.id));" \
  "borrar la fila junto con el archivo" && probar "borrar la fila junto con el archivo"

echo "── Mutación 4: el divisor de Reebok deja de validar ──"
mutar "$REEBOK" \
  "const msgFormulaA = mensajeDivisorEnPantalla(String(formulaA.divisor || \"\"));" \
  "const msgFormulaA = null as string | null;" \
  "divisor sin validar en Reebok" && probar "divisor sin validar en Reebok"

echo "── Mutación 5: en Reebok se valida pero la DESCARGA queda encendida ──"
mutar "$REEBOK" \
  "disabled={!!downloading || quedoVacio || divisorBloqueaDescarga}" \
  "disabled={!!downloading || quedoVacio}" \
  "descarga Reebok encendida con divisor malo" && probar "descarga Reebok encendida con divisor malo"

echo "── Mutación 6: el divisor de Facturas Tienda deja de apagar la descarga ──"
mutar "$TIENDA" \
  "const divisorBloqueaDescarga = Object.keys(marcasDivisorMsg).length > 0;" \
  "const divisorBloqueaDescarga = false;" \
  "divisor sin validar en Facturas Tienda" && probar "divisor sin validar en Facturas Tienda"

echo "── Mutación 7: «cambiar» no cambia nada ──"
mutar "$CLIENTE" \
  "onCambiar={(key) => setEmpresaManual(key)}" \
  "onCambiar={() => {}}" \
  "que cambiar no cambie nada" && probar "que cambiar no cambie nada"

echo "── Mutación 8: el historial recibe OTRO blob (no el que se descargó) ──"
mutar "$CLIENTE" \
  "          archivo: { blob, nombre }," \
  "          archivo: { blob: new Blob([]), nombre }," \
  "el historial recibe otro blob" && probar "el historial recibe otro blob"

echo "── Mutación 9: ?tab=historial (viejo) deja de redirigir ──"
mutar "$PESTANAS" \
  "  historial: { tab: \"plantilla\", vista: \"historial\" }," \
  "" \
  "el tab viejo historial no redirige" && probar "el tab viejo historial no redirige"

echo "── Mutación 10: la retención cae a 9 días (borra archivos vivos) ──"
mutar "$LIMPIEZA" \
  "export const RETENCION_ARCHIVO_DIAS = 90;" \
  "export const RETENCION_ARCHIVO_DIAS = 9;" \
  "retención de 9 días" && probar "retención de 9 días"

restaurar
echo ""
echo "══════════════════════════════════════════"
echo "  Cazadas: $cazadas · Sobrevivientes: $sobrevivientes (de 10)"
echo "══════════════════════════════════════════"
[ "$sobrevivientes" -eq 0 ] || exit 1
