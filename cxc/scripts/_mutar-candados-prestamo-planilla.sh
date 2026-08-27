#!/usr/bin/env bash
# Verificación por MUTACIÓN de los candados del préstamo en la planilla.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA, así que las
# mutaciones se apilan y ninguna se prueba por separado. Ya pasó en este repo.
#
# 🩸 El reemplazo lo hace `_mutar-aplicar.py` con textos LITERALES, no
# `perl -0pi -e 's|…|…|'`: con el delimitador `|`, un `||` del código real se
# des-escapa a una alternación con rama vacía y se come el archivo entero,
# dejando un "SOBREVIVIÓ" falso. Y el script DENUNCIA el patrón que no muta.
set -uo pipefail
cd "$(dirname "$0")/.."

PURO=src/lib/asistencia/prestamos-planilla.ts
MIG=supabase/migrations/20260902120000_prestamos_amarre_codigo.sql
RUTA=src/app/api/asistencia/planilla/route.ts

TESTS=(
  src/__tests__/lib/asistencia-prestamo-planilla.test.ts
  src/__tests__/lib/prestamos-amarre-migracion.test.ts
)

ARCHIVOS=("$PURO" "$MIG" "$RUTA")

TMP=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do
  cp "$f" "$TMP/$(echo "$f" | tr / _)"
done

restaurar() {
  for f in "${ARCHIVOS[@]}"; do
    cp "$TMP/$(echo "$f" | tr / _)" "$f"
  done
}
# 🩸 También en INT/TERM/PIPE: pipear este script a `head` lo mata con SIGPIPE
# y dejaría un archivo MUTADO en el árbol.
trap restaurar EXIT INT TERM PIPE

cazadas=0
total=0
muertas=0

mutar() {  # archivo, viejo, nuevo, [veces]
  python3 scripts/_mutar-aplicar.py "$@"
}

probar() {  # $1 = nombre de la mutación
  total=$((total + 1))
  local salida
  salida=$(npx vitest run "${TESTS[@]}" 2>&1)

  # 🩸 Un cero solo vale si la corrida COLECTÓ tests. Si vitest murió (módulo
  # roto, archivo comido), "0 fallos" se leería como "sobrevivió".
  if ! echo "$salida" | grep -qE "Test Files"; then
    echo "  ⛔ CORRIDA MUERTA — $1 (vitest no colectó nada)"
    muertas=$((muertas + 1))
    restaurar
    return
  fi

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

echo "== 1. la cuota le gana al descuento ya registrado (se invierte el orden) =="
mutar "$PURO" \
  '  const ya = centavos(Math.max(0, num(f.yaDescontado)));
  if (ya > 0) return { monto: ya, origen: "descontado" };' \
  '  const ya = centavos(Math.max(0, num(f.yaDescontado)));' \
&& mutar "$PURO" \
  '  return { monto: centavos(Math.min(cuota, saldo)), origen: "cuota" };' \
  '  if (ya > 0) return { monto: ya, origen: "descontado" };
  return { monto: centavos(Math.min(cuota, saldo)), origen: "cuota" };' \
&& probar 'el hecho consumado deja de ganarle a la cuota'

echo "== 2. la última cuota deja de capearse al saldo =="
mutar "$PURO" 'centavos(Math.min(cuota, saldo))' 'centavos(cuota)' \
&& probar 'min(cuota, saldo) → cuota pelada'

echo "== 3. la ficha archivada vuelve a proponer cuota =="
mutar "$PURO" '  if (!f.activo) return { monto: 0, origen: "cuota" };' '' \
&& probar 'la ficha archivada propone cuota nueva'

echo "== 4. el amarre deja de mandar: se ata por PARECIDO de nombre =="
mutar "$PURO" \
  '    const cod = (f.codigo ?? "").trim();' \
  '    const cod = (f.codigo ?? opts.personas.find((p) => p.etiqueta.toUpperCase().includes((f.nombre.split(" ")[0] ?? "@@@").toUpperCase()))?.codigo ?? "").trim();' \
&& probar 'el código sale de parecerse al nombre'

echo "== 5. el préstamo sin atar deja de decirse =="
mutar "$PURO" \
  'export function textoPrestamoSinAtar(
  items: readonly PrestamoSinAtar[],
): string | null {
  if (items.length === 0) return null;' \
  'export function textoPrestamoSinAtar(
  items: readonly PrestamoSinAtar[],
): string | null {
  if (items.length >= 0) return null;' \
&& probar 'el aviso "préstamo sin persona" se calla'

echo "== 6. el aviso de lo no aprobado pierde el MONTO =="
mutar "$PURO" 'plata(s.sugerido)}`)' '""}`)' \
&& probar 'el aviso dice el nombre pero no el monto'

echo "== 7. «Abono extra» se vuelve un descuento de planilla =="
mutar "$PURO" \
  'export const CONCEPTOS_DESCUENTO = ["Pago", "Pago de responsabilidad"] as const;' \
  'export const CONCEPTOS_DESCUENTO = ["Pago", "Pago de responsabilidad", "Abono extra"] as const;' \
&& probar 'el abono de bolsillo se descuenta otra vez del sueldo'

echo "== 8. la agrupación pasa a ser por FICHA y no por código =="
mutar "$PURO" \
  '    const prev = acumulado.get(cod);' \
  '    const prev = undefined as ReturnType<typeof acumulado.get>;' \
&& probar 'dos fichas del mismo código no suman'

echo "== 9. la migración empieza a parear con LIKE =="
mutar "$MIG" 'AND upper(btrim(e.nombre)) = ap.k' 'AND upper(btrim(e.nombre)) LIKE ap.k' \
&& probar 'el amarre automático usa LIKE'

echo "== 10. la migración deja de mirar la empresa =="
mutar "$MIG" \
  "   AND ap.emp_key = CASE e.empresa
                      WHEN 'Confecciones Boston'   THEN 'confecciones_boston'
                      WHEN 'Vistana International' THEN 'vistana'
                      WHEN 'Fashion Wear'          THEN 'fashion_wear'
                      ELSE NULL
                    END;" \
  '   AND true;' \
&& probar 'el amarre automático ignora la empresa'

echo "== 11. la migración ata aunque haya VARIOS candidatos =="
mutar "$MIG" 'AND ap.cuantos = 1' 'AND ap.cuantos >= 1' \
&& probar 'ata con dos personas del mismo nombre'

echo "== 12. el guard del nombre esperado se vuelve un comentario =="
mutar "$MIG" '        AND upper(btrim(p.nombre)) = l.nombre_planilla' '' \
&& probar 'la lista a mano ya no exige el nombre del código'

echo "== 13. la migración pisa un amarre ya hecho =="
mutar "$MIG" ' WHERE e.empleado_codigo IS NULL' ' WHERE true' 2 \
&& probar 'vuelve a atar lo que alguien ya corrigió'

echo "== 14. se cuela un CUARTO amarre a mano =="
mutar "$MIG" \
  "    ('MARIA BETHANCOURTH',       'Confecciones Boston',   '49',  'MARIA V. BETHANCOURTH G.')" \
  "    ('MARIA BETHANCOURTH',       'Confecciones Boston',   '49',  'MARIA V. BETHANCOURTH G.'),
    ('LAURA CASIANI',            'Confecciones Boston',   '38',  'LAURA LISMARI CASIANO VEGA')" \
&& probar 'LAURA CASIANI se ata a CASIANO'

echo "== 15. la migración le toca el nombre a la ficha de Préstamos =="
mutar "$MIG" \
  '   SET empleado_codigo = ap.empleado_codigo' \
  '   SET empleado_codigo = ap.empleado_codigo, nombre = ap.k' \
&& probar 'el backfill reescribe el nombre escrito a mano'

echo "== 16. CONTROL: un patrón que NO existe (tiene que salir ⛔) =="
mutar "$PURO" 'ESTE_TEXTO_NO_EXISTE_EN_NINGUN_LADO' 'x' \
  || echo "  ⛔ (esperado) el denunciador de patrones muertos funciona"

echo
echo "── $cazadas de $total cazadas · $muertas corridas muertas ──"
[ "$cazadas" -eq "$total" ] && [ "$muertas" -eq 0 ]
