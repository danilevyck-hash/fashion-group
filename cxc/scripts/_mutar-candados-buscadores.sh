#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de LOS BUSCADORES (11-sep-2026) CAZAN de verdad?
#
# Lo que cubren:
#   1  🔴 PLANILLA NO TIENE BUSCADOR (Daniel: «entonces no lo pongas en planilla»)
#   2  🔴 y su Excel y su PDF salen COMPLETOS
#   3  🔴 EL TOTAL SIGUE AL FILTRO en Préstamos de Asistencia
#   4  🔴 y en Caja Menuda (registros, chips y pies)
#   5  🔴 y en Gastos, recalculando lo que el servidor mandó sumado
#   6  🔴 y en Boston › Préstamos (las tres tarjetas)
#   7  🔴 «en N documentos» desaparece mientras se busca
#   8  🔴 el botón de lote DICE a cuántos afecta, y afecta a esos
#   9  🔴 sin búsqueda, ese mismo botón sigue siendo de TODO lo pendiente
#  10  🔴 el conteo «N de M» al lado del total recortado
#
# Se rompe el código a propósito, una cosa por vez, y se exige que los tests se
# pongan ROJOS. Los dos CONTROLES (cambios inocuos) tienen que SOBREVIVIR.
#
#   bash scripts/_mutar-candados-buscadores.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/components/asistencia-buscadores.test.tsx \
src/__tests__/components/buscador-caja-y-gastos.test.tsx \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/buscar-en-lista.ts"
  "src/lib/asistencia/aprobaciones-vistas.ts"
  "src/app/asistencia/PlanillaTab.tsx"
  "src/app/asistencia/PrestamosTab.tsx"
  "src/app/asistencia/AprobacionesTab.tsx"
  "src/app/caja/components/GastoTable.tsx"
  "src/app/gastos-contabilidad/components/DetalleEgresos.tsx"
  "src/app/boston/tabs/PrestamosBoston.tsx"
  "src/app/productos/cargar/HistorialView.tsx"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0; controles_ok=0; controles_mal=0

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

probar_control() { # $1 = nombre del control (NO debe ser cazado)
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -eq 0 ]; then
    echo "  ✅ CONTROL SANO (no cazado) — $1"
    controles_ok=$((controles_ok + 1))
  else
    echo "  🔴 CONTROL CAZADO (el candado es demasiado estricto) — $1"
    controles_mal=$((controles_mal + 1))
  fi
}

aplicar() { # $1 archivo, $2 viejo, $3 nuevo
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
}

mutar() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  aplicar "$1" "$2" "$3"
  [ $? -eq 3 ] && { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

control() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  aplicar "$1" "$2" "$3"
  [ $? -eq 3 ] && { controles_mal=$((controles_mal + 1)); return; }
  probar_control "$4"
}

echo "── mutando ──────────────────────────────────────────────────────────────"

# 1 · Planilla vuelve a tener buscador (lo que Daniel mandó quitar)
mutar "src/app/asistencia/PlanillaTab.tsx" \
  'import AntesDeCerrar from "./AntesDeCerrar";' \
  'import BuscadorDeLista from "@/components/BuscadorDeLista";
import { PARAM_BUSCAR } from "@/lib/buscar-en-lista";
import AntesDeCerrar from "./AntesDeCerrar";' \
  "1 · la Planilla vuelve a importar el buscador"

# 2 · el total de Préstamos deja de seguir al filtro
mutar "src/app/asistencia/PrestamosTab.tsx" \
  '() => visibles.reduce((a, f) => a + f.saldo, 0),
    [visibles],' \
  '() => (fichas ?? []).reduce((a, f) => a + f.saldo, 0),
    [fichas],' \
  "2 · en Préstamos el total vuelve a sumar TODO con la lista recortada"

# 3 · el encabezado de Préstamos cuenta a todos
mutar "src/app/asistencia/PrestamosTab.tsx" \
  '{visibles.length === 1 ? "1 colaborador con deuda"' \
  '{fichas.length === 1 ? "1 colaborador con deuda"' \
  "3 · el encabezado de Préstamos cuenta la lista entera"

# 4 · el botón de lote de Aprobaciones dice «todo» y manda menos
mutar "src/app/asistencia/AprobacionesTab.tsx" \
  'const rotuloLote = rotuloDeLote(ROTULO_SI_A_TODO, porDecidirVistas.length, buscando);' \
  'const rotuloLote = ROTULO_SI_A_TODO;' \
  "4 · el botón dice «todo lo pendiente» y manda solo lo filtrado"

# 5 · el botón dice «los N que ves» y manda a todos
mutar "src/app/asistencia/AprobacionesTab.tsx" \
  '() => (buscando ? toquesDeEstos(todoLoPendiente, porDecidirVistas.map((p) => p.codigo)) : todoLoPendiente),' \
  '() => todoLoPendiente,' \
  "5 · el botón dice «los N que ves» y manda TODO lo pendiente"

# 6 · el contador grande de Aprobaciones deja de seguir al filtro
mutar "src/app/asistencia/AprobacionesTab.tsx" \
  '<span className="text-sm text-gray-600">por decidir · {hm(minutosVistos)} h</span>' \
  '<span className="text-sm text-gray-600">por decidir · {hm(porDecidir.reduce((a, p) => a + p.minutosPendientes, 0))} h</span>' \
  "6 · el contador de Aprobaciones cuenta los minutos de todos"

# 7 · toquesDeEstos deja de recortar
mutar "src/lib/asistencia/aprobaciones-vistas.ts" \
  'return toques.filter((t) => permitidos.has(t.codigo));' \
  'return [...toques];' \
  "7 · toquesDeEstos devuelve todo"

# 8 · el total de Caja deja de seguir al filtro
mutar "src/app/caja/components/GastoTable.tsx" \
  'const grandTotal = useMemo(() => totalGastado(buscados), [buscados]);' \
  'const grandTotal = useMemo(() => totalGastado(gastos), [gastos]);' \
  "8 · en Caja el total vuelve a ser el del período con la lista recortada"

# 9 · el conteo de registros de Caja cuenta todo
mutar "src/app/caja/components/GastoTable.tsx" \
  '{buscados.length} {buscados.length === 1 ? "registro" : "registros"}' \
  '{gastos.length} {gastos.length === 1 ? "registro" : "registros"}' \
  "9 · en Caja «N registros» cuenta el período entero"

# 10 · los chips de Caja dejan de seguir a la búsqueda
mutar "src/app/caja/components/GastoTable.tsx" \
  '    for (const g of buscados) {' \
  '    for (const g of gastos) {' \
  "10 · los chips de categoría describen el período, no lo buscado"

# 11 · Caja deja de buscar por monto
mutar "src/app/caja/components/GastoTable.tsx" \
  '(g) => [g.proveedor, g.categoria, g.nro_factura, g.descripcion, g.nombre, g.total.toFixed(2)],' \
  '(g) => [g.proveedor, g.categoria, g.nro_factura, g.descripcion, g.nombre],' \
  "11 · en Caja no se puede buscar por monto"

# 12 · Gastos deja de recalcular el total
mutar "src/app/gastos-contabilidad/components/DetalleEgresos.tsx" \
  'const totalGastoCent = buscando ? sumaCent(gastoVistas) : r.totalGastoCent;' \
  'const totalGastoCent = r.totalGastoCent;' \
  "12 · en Gastos «De eso, gastos» vuelve a ser el del mes"

# 13 · «en N documentos» se queda con la búsqueda escrita
mutar "src/app/gastos-contabilidad/components/DetalleEgresos.tsx" \
  '{!buscando && r.documentos !== r.renglones && ` en ${r.documentos} documentos`}' \
  '{r.documentos !== r.renglones && ` en ${r.documentos} documentos`}' \
  "13 · «en N documentos» sigue ahí mientras se busca"

# 14 · las tarjetas de Boston dejan de seguir al filtro
mutar "src/app/boston/tabs/PrestamosBoston.tsx" \
  '  const tarjetas = buscando
    ? {' \
  '  const tarjetas = false
    ? {' \
  "14 · en Boston las tres tarjetas vuelven a ser las del servidor"

# 15 · «Con saldo» de Boston cuenta a quien ya pagó
mutar "src/app/boston/tabs/PrestamosBoston.tsx" \
  'conSaldo: visibles.filter((e) => e.saldo !== 0).length,' \
  'conSaldo: visibles.length,' \
  "15 · «Con saldo» de Boston cuenta a todos los que se ven"

# 16 · el Historial deja de buscar por compañía en pantalla
mutar "src/app/productos/cargar/HistorialView.tsx" \
  '(r) => [r.marca, r.usuario, empresaCanonica(r.empresa), fmtFecha(r.created_at)],' \
  '(r) => [r.marca, r.usuario, r.empresa],' \
  "16 · el Historial busca por el nombre crudo, no por el que se ve"

# 17 · el conteo desaparece (queda el total recortado sin decir contra qué)
mutar "src/lib/buscar-en-lista.ts" \
  '  if (!consulta.trim()) return "";
  return `${visibles} de ${total} ${total === 1 ? sustantivo[0] : sustantivo[1]}`;' \
  '  return "";' \
  "17 · se va el «N de M» que explica el total recortado"

# 18 · la búsqueda pasa a ser por parecido (la regla de la casa)
mutar "src/lib/buscar-en-lista.ts" \
  '  if (!consulta.trim()) return lista as T[];
  return lista.filter((fila) => coincideBusqueda(consulta, campos(fila)));' \
  '  if (!consulta.trim()) return lista as T[];
  return lista.filter((fila) => campos(fila).some((c) => (c ?? "").length > 0));' \
  "18 · el filtro deja pasar cualquier fila con datos"

# 19 · el rótulo del lote pierde el número
mutar "src/lib/buscar-en-lista.ts" \
  '  return visibles === 1 ? "Sí al que ves" : `Sí a los ${visibles} que ves`;' \
  '  return "Sí a los que ves";' \
  "19 · el rótulo del lote deja de decir a cuántos afecta"

# 20 · `vistaDeLista` deja de avisar que no encontró a nadie
mutar "src/lib/buscar-en-lista.ts" \
  '    sinResultados: buscando && visibles.length === 0,' \
  '    sinResultados: false,' \
  "20 · nunca se dice que la búsqueda no encontró a nadie"

echo
echo "── controles (NO deben ser cazados) ─────────────────────────────────────"

control "src/lib/buscar-en-lista.ts" \
  'export const PLACEHOLDER_GASTO = "Buscar gasto…";' \
  'export const PLACEHOLDER_GASTO = "Buscar un gasto…";' \
  "CONTROL: cambia el texto del placeholder de Caja"

control "src/app/caja/components/GastoTable.tsx" \
  '<BuscadorDeLista
          className="mb-3"' \
  '<BuscadorDeLista
          className="mb-4"' \
  "CONTROL: el buscador de Caja cambia de margen"

restaurar
echo
echo "── CONTROL FINAL (sin mutar) ────────────────────────────────────────────"
salida="$(npx vitest run $TESTS 2>&1)"
grep -E "^ *(Tests|Test Files) " <<<"$salida"
echo
echo "══ resultado: $cazadas cazadas · $sobrevivientes sobrevivientes · controles: $controles_ok sanos / $controles_mal cazados ══"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ]
