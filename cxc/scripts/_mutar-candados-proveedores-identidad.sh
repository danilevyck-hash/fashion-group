#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿LOS CANDADOS DE «UN PROVEEDOR, UNA FILA» CAZAN DE VERDAD? (6-sep-2026)
#
# Se rompe el código a propósito, UNA cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROLES (sin mutar) tienen que quedar VERDES: una ✅ ahí
# significa que los candados fallan por otra razón y el resto de la corrida no
# dice nada.
#
# Lo que este trabajo dejó puesto y no se puede volver a romper:
#   1. La identidad sale de una lista ESCRITA A MANO, con grano
#      (empresa_key, proveedor_switch_id) — nunca el nombre, nunca el código solo.
#   2. 🩸 La CÉDULA no agrupa: tres pares que la comparten son empresas
#      distintas, y el proveedor más grande tiene DOS cédulas.
#   3. Nada por parecido: ni distancia de edición, ni trigramas, ni fonética.
#   4. La lista pasa de 47 a 43 filas y el total NO se mueve ($5,199,705.82).
#   5. La pantalla muestra UN proveedor por fila y DE QUÉ EMPRESAS viene.
#   6. La lectura del amarre falla ABIERTA: sin tabla, la pantalla es la de antes.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: este trabajo trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-proveedores-identidad.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/proveedores-identidad.test.ts \
src/__tests__/components/proveedores-una-fila-por-proveedor.test.tsx \
src/__tests__/lib/proveedores-derivados.test.ts \
src/__tests__/lib/reclamos-proveedor-por-codigo.test.ts \
src/__tests__/lib/backup-nada-sin-copia.test.ts"

ARCHIVOS=(
  "src/lib/proveedores/identidad.ts"
  "src/lib/proveedores/amarre-lectura.ts"
  "src/lib/proveedores/lista.ts"
  "src/lib/backup/tablas.ts"
  "src/app/api/cron/backup/route.ts"
  "src/app/api/proveedores/route.ts"
  "src/app/api/proveedores/[key]/route.ts"
  "src/app/proveedores/ProveedoresListClient.tsx"
  "src/app/proveedores/excel-proveedores.ts"
  "supabase/migrations/20261010120000_proveedor_amarre.sql"
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
# `\n` en el reemplazo = salto de línea de verdad (bash lo pasa literal).
viejo, nuevo = viejo.replace("\\n", "\n"), nuevo.replace("\\n", "\n")
s = open(ruta).read()
if viejo not in s:
    print(f"  ⚠️  el patrón no está en {ruta}: {viejo[:70]}")
    sys.exit(3)
open(ruta, "w").write(s.replace(viejo, nuevo, 1))
PY
  [ $? -eq 3 ] && { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

echo "── CONTROL 1 (sin mutar) ────────────────────────────────────────────────"
# ⚠️ `probar` está escrito para MUTACIONES: ahí «✅ CAZADA» = hubo fallos. En el
# CONTROL la lectura es al revés — lo bueno es el «🔴 SOBREVIVIÓ» (0 fallos).
probar "CONTROL 1 — sin mutar. Acá lo BUENO es el 🔴 (0 fallos)"
control_1=$cazadas
cazadas=0; sobrevivientes=0

echo "── 1. EL GRANO DEL AMARRE: (empresa, proveedor_switch_id) ───────────────"

# 1.1 La llave pierde la empresa: `122` en Fashion Wear y en Active Shoes son
#     proveedores DISTINTOS y caerían en el mismo amarre.
mutar "src/lib/proveedores/identidad.ts" \
  '  return `${empresaKey}#${proveedorSwitchId}`;' \
  '  return `${proveedorSwitchId}`;' \
  "identidad: la llave pierde la empresa"

# 1.2 El amarre se ignora: se vuelve a agrupar solo por nombre.
mutar "src/lib/proveedores/identidad.ts" \
  '  const hit = indice.get(claveDeFila(fila.empresa_key, fila.proveedor_switch_id));' \
  '  const hit = undefined as ReturnType<typeof indice.get>;' \
  "identidad: el amarre deja de aplicarse"

# 1.3 Deja de fallar abierto: sin amarre la fila se queda sin clave.
mutar "src/lib/proveedores/identidad.ts" \
  '  return { clave: normProvName(fila.nombre), nombreMostrado: null, amarrada: false };' \
  '  return { clave: "", nombreMostrado: null, amarrada: false };' \
  "identidad: sin amarre deja de caer al nombre normalizado"

# 1.4 El amarre cruza por NOMBRE en vez de por la fila real.
mutar "src/lib/proveedores/identidad.ts" \
  '  for (const a of amarres) m.set(claveDeFila(a.empresa_key, a.proveedor_switch_id), a);' \
  '  for (const a of amarres) m.set(a.proveedor_canonico, a);' \
  "identidad: el índice se arma por nombre"

echo "── 2. 🩸 LA CÉDULA NO AGRUPA ────────────────────────────────────────────"

# 2.1 Se agrupa por cédula: Boston se comería FASHION WEAR, INC ($76.165,72).
mutar "src/lib/proveedores/lista.ts" \
  '    const { clave, nombreMostrado } = aplicarAmarre(r, indice);' \
  '    const { nombreMostrado } = aplicarAmarre(r, indice); const clave = r.identificacion ?? "";' \
  "lista: se agrupa por la cédula"

# 2.2 La cédula se cuela en el módulo que decide la identidad.
mutar "src/lib/proveedores/identidad.ts" \
  'export interface FilaProveedorIdentificable {' \
  'export interface FilaProveedorIdentificable {\n  identificacion?: string | null;' \
  "identidad: el módulo vuelve a mirar la cédula"

# 2.3 La lista de «no son el mismo» pierde a FASHION WEAR, INC.
mutar "src/lib/proveedores/identidad.ts" \
  '    nombres: ["CONFECCIONES BOSTON", "FASHION WEAR, INC"],' \
  '    nombres: ["CONFECCIONES BOSTON"],' \
  "identidad: se borra el caso Fashion Wear de NO_SON_EL_MISMO"

# 2.4 La migración junta a FASHION WEAR, INC con Boston.
mutar "supabase/migrations/20261010120000_proveedor_amarre.sql" \
  "  ('joystep',           3, '123',  'CONFECCIONES BOSTON',      'CONFECCIONES BOSTON', 'CONFECCIONES BOSTON S.A')," \
  "  ('american_classic',  2, '112',  'FASHION WEAR, INC',        'CONFECCIONES BOSTON', 'CONFECCIONES BOSTON S.A'),\n  ('joystep',           3, '123',  'CONFECCIONES BOSTON',      'CONFECCIONES BOSTON', 'CONFECCIONES BOSTON S.A')," \
  "migración: se une FASHION WEAR, INC a Boston por la cédula"

# 2.5 La migración deja de decir por qué no se unen.
mutar "supabase/migrations/20261010120000_proveedor_amarre.sql" \
  '«fashion wear no es boston»' \
  '(ver el mapa)' \
  "migración: se borra el «fashion wear no es boston»"

echo "── 3. NADA POR PARECIDO ─────────────────────────────────────────────────"

# 3.1 Entra una distancia de edición al módulo de identidad.
mutar "src/lib/proveedores/identidad.ts" \
  'export function claveDeFila(' \
  'export function similarity(a: string, b: string): number { return a === b ? 1 : 0; }\nexport function claveDeFila(' \
  "identidad: se agrega una función de parecido"

# 3.2 La migración usa trigramas.
mutar "supabase/migrations/20261010120000_proveedor_amarre.sql" \
  'CREATE INDEX IF NOT EXISTS proveedor_amarre_canonico_idx' \
  'CREATE INDEX IF NOT EXISTS proveedor_amarre_trigram_idx ON proveedor_amarre USING gin (proveedor_canonico gin_trgm_ops);\nCREATE INDEX IF NOT EXISTS proveedor_amarre_canonico_idx' \
  "migración: se indexa por trigramas para parear por parecido"

echo "── 4. LA LISTA SE REAGRUPA Y EL TOTAL NO SE MUEVE ───────────────────────"

# 4.1 Se agrega un quinto grupo que Daniel no confirmó.
mutar "supabase/migrations/20261010120000_proveedor_amarre.sql" \
  "  ('active_shoes',      8, '118',  'GRUPO J NAVARRO'," \
  "  ('american_classic', 17, '1117', 'AMERICAN  SPORTSWEAR',     'AMERICAN SPORTSWEAR SA', NULL),\n  ('active_shoes',      8, '118',  'GRUPO J NAVARRO'," \
  "migración: se cuela un quinto grupo sin decisión de Daniel"

# 4.2 Un amarre apunta a una fila que no existe en producción.
mutar "supabase/migrations/20261010120000_proveedor_amarre.sql" \
  "  ('vistana',           9, '179',  'CONFECCIONES BOSTON'," \
  "  ('vistana',         999, '179',  'CONFECCIONES BOSTON'," \
  "migración: un amarre apunta a una fila inexistente"

# 4.3 El saldo se cuenta dos veces al agrupar.
mutar "src/lib/proveedores/lista.ts" \
  '        saldo_total: round2(rs.reduce((s, r) => s + Number(r.saldo_total), 0)),' \
  '        saldo_total: round2(rs.reduce((s, r) => s + Number(r.saldo_total), 0) * 2),' \
  "lista: el saldo de la fila se duplica"

# 4.4 Se inventa un nombre que Switch nunca mandó.
mutar "supabase/migrations/20261010120000_proveedor_amarre.sql" \
  "'CONFECCIONES BOSTON', 'CONFECCIONES BOSTON S.A')," \
  "'CONFECCIONES BOSTON', 'Confecciones Boston, S.A. (Panamá)')," \
  "migración: se inventa el nombre que se muestra"

echo "── 5. LA PANTALLA: UNA FILA Y DE QUÉ EMPRESAS VIENE ─────────────────────"

# 5.1 La fila deja de decir de qué empresas viene.
mutar "src/lib/proveedores/lista.ts" \
  '        empresas,' \
  '        empresas: [],' \
  "lista: la fila deja de decir de qué empresas viene"

# 5.2 Vuelve el conteo pelado en la columna de la derecha.
mutar "src/app/proveedores/ProveedoresListClient.tsx" \
  '          {(it.empresas ?? []).map(nombreCortoEmpresa).join(" · ")}' \
  '          {it.empresas_count}' \
  "pantalla: la columna vuelve a ser un número"

# 5.3 El orden de las empresas deja de ser por saldo.
mutar "src/lib/proveedores/lista.ts" \
  '        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))' \
  '        .sort((a, b) => a[0].localeCompare(b[0]))' \
  "lista: las empresas dejan de ordenarse por saldo"

# 5.4 El nombre vuelve a salir con los espacios dobles de Switch.
mutar "src/lib/proveedores/lista.ts" \
  '  return largo.replace(/\s+/g, " ").trim();' \
  '  return largo;' \
  "lista: el nombre vuelve a traer el espacio doble de Switch"

# 5.5 El nombre escrito a mano deja de mandar.
mutar "src/lib/proveedores/lista.ts" \
  '  if (escrito) return escrito;' \
  '  if (false && escrito) return escrito;' \
  "lista: el nombre del amarre deja de usarse"

# 5.6 La ficha deja de decir las otras grafías.
mutar "src/lib/proveedores/lista.ts" \
  '    .filter((g) => g !== nombre)' \
  '    .filter(() => false)' \
  "ficha: se dejan de decir las otras grafías de Switch"

echo "── 6. EL BUSCADOR MIRA TODAS LAS GRAFÍAS ────────────────────────────────"

# 6.1 Buscar «boston» deja de encontrar la fila que se muestra con otra grafía.
mutar "src/lib/proveedores/lista.ts" \
  '      return (g?.filas ?? []).some((r) => normProvName(r.nombre).includes(q));' \
  '      return false;' \
  "buscador: deja de mirar las otras grafías"

echo "── 7. LA FICHA Y LOS RECLAMOS MIRAN LAS MISMAS FILAS ────────────────────"

# 7.1 La ficha vuelve a agrupar por nombre y se desarma el proveedor.
mutar "src/lib/proveedores/lista.ts" \
  '  const rs = rows.filter((r) => aplicarAmarre(r, indice).clave === key);' \
  '  const rs = rows.filter((r) => normProvName(r.nombre) === key);' \
  "ficha: vuelve a agrupar por nombre"

# 7.2 Los reclamos de la ficha se buscan con otras filas que la ficha.
mutar "src/app/api/proveedores/[key]/route.ts" \
  '    const pares = paresDelProveedor(filasDelProveedor(rows, key, amarres));' \
  '    const pares = paresDelProveedor(rows.filter((r) => r.nombre === key));' \
  "ficha: los reclamos dejan de usar las filas del proveedor"

# 7.3 La ruta de la lista deja de pedir los amarres.
mutar "src/app/api/proveedores/route.ts" \
  '      ...buildList(rows, { empresa: sp.get("empresa"), q: sp.get("q"), amarres }),' \
  '      ...buildList(rows, { empresa: sp.get("empresa"), q: sp.get("q") }),' \
  "ruta: la lista deja de pedir los amarres"

echo "── 8. LA LECTURA FALLA ABIERTA ──────────────────────────────────────────"

# 8.1 Un error de lectura tumba el módulo entero.
mutar "src/lib/proveedores/amarre-lectura.ts" \
  '    console.error(`[proveedores] amarre no disponible: ${error.message}`);
    return [];' \
  '    throw new Error(`[proveedores] amarre no disponible: ${error.message}`);' \
  "lectura: el amarre deja de fallar abierto"

echo "── 9. LA TABLA NO SE QUEDA SIN COPIA NI SE PUEDE DROPEAR ────────────────"

# 9.1 Sale de la clasificación del respaldo.
mutar "src/lib/backup/tablas.ts" \
  '  "proveedor_amarre",' \
  '  // "proveedor_amarre",' \
  "respaldo: la tabla sale de la clasificación"

# 9.2 Sale del respaldo de verdad.
mutar "src/app/api/cron/backup/route.ts" \
  '  { table: "proveedor_amarre" },' \
  '  // { table: "proveedor_amarre" },' \
  "respaldo: la tabla deja de copiarse"

# 9.3 Una migración la dropea.
mutar "supabase/migrations/20261010120000_proveedor_amarre.sql" \
  'CREATE TABLE IF NOT EXISTS proveedor_amarre (' \
  'DROP TABLE IF EXISTS proveedor_amarre;\nCREATE TABLE IF NOT EXISTS proveedor_amarre (' \
  "migración: se dropea la tabla del amarre"

# 9.4 El borrado deja de ser firmado.
mutar "supabase/migrations/20261010120000_proveedor_amarre.sql" \
  '  CONSTRAINT proveedor_amarre_baja_firmada CHECK (' \
  '  CONSTRAINT proveedor_amarre_baja_sin_firma CHECK (' \
  "migración: la baja deja de ser firmada"

# 9.5 La única deja de ser «entre activas» (una baja bloquearía el alta nueva).
mutar "supabase/migrations/20261010120000_proveedor_amarre.sql" \
  '  ON proveedor_amarre (empresa_key, proveedor_switch_id)
  WHERE activo;' \
  '  ON proveedor_amarre (empresa_key, proveedor_switch_id);' \
  "migración: la única deja de ser solo entre activas"

# 9.6 Se apaga la RLS.
mutar "supabase/migrations/20261010120000_proveedor_amarre.sql" \
  'ALTER TABLE proveedor_amarre ENABLE ROW LEVEL SECURITY;' \
  '-- sin RLS' \
  "migración: se apaga la RLS"

total_cazadas=$cazadas
total_sobrevivientes=$sobrevivientes

echo "── CONTROL 2 (sin mutar, después de restaurar todo) ─────────────────────"
restaurar
cazadas=0; sobrevivientes=0
probar "CONTROL 2 — sin mutar. Acá lo BUENO es el 🔴 (0 fallos)"
control_2=$cazadas

echo "─────────────────────────────────────────────────────────────────────────"
echo "CONTROL 1: $control_1 · CONTROL 2: $control_2 (los dos tienen que ser 0)"
echo "RESULTADO: $total_cazadas cazadas · $total_sobrevivientes sobrevivientes"
[ "$total_sobrevivientes" -eq 0 ] && [ "$control_1" -eq 0 ] && [ "$control_2" -eq 0 ] \
  && echo "✅ TODAS CAZADAS" || echo "🔴 REVISAR"
