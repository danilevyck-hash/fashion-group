#!/usr/bin/env bash
# Verificador de mutaciones de Caja Menuda (cierre con saldo + formulario de
# tanda, 4-sep-2026). Mismo arnés que _mutar-candados-aprobador-empresa.sh:
# restaura por COPIA (no git checkout), reemplazo LITERAL vía _mutar-aplicar.py,
# y una corrida que no colecta tests se denuncia en vez de leerse como
# «sobrevivió».
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS=(
  src/__tests__/api/caja-cierre-con-saldo.test.ts
  src/__tests__/components/caja-formulario.test.tsx
)
ARCHIVOS=(
  "src/app/api/caja/periodos/[id]/route.ts"
  src/app/caja/components/NuevoGastoDrawer.tsx
  src/app/caja/components/GastoForm.tsx
)
TMP=$(mktemp -d); trap 'for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; rm -rf "$TMP"' EXIT INT TERM PIPE
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f"|tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; }

CAZ=0; SOB=0; NOOP=0
probar() {
  local out; out=$(npx vitest run "${TESTS[@]}" 2>&1)
  if ! grep -qE 'Tests +[0-9]+ (failed|passed)' <<<"$out"; then echo "MUERTA"; return; fi
  grep -oE 'Tests +[0-9]+ failed' <<<"$out" | grep -oE '[0-9]+' | head -1 || echo 0
}
mutar() { # archivo  viejo  nuevo  nombre
  local f="$1" antes; antes=$(md5 -q "$f")
  python3 scripts/_mutar-aplicar.py "$f" "$2" "$3" >/dev/null 2>&1
  if [ "$antes" = "$(md5 -q "$f")" ]; then
    echo "  ⛔ NO MUTÓ (patrón muerto) — $4"; NOOP=$((NOOP+1)); restaurar; return
  fi
  local n; n=$(probar)
  if [ "$n" = "MUERTA" ]; then echo "  ⛔ corrida MUERTA (no colectó) — $4"; NOOP=$((NOOP+1))
  elif [ "${n:-0}" -gt 0 ] 2>/dev/null; then echo "  ✅ cazada ($n) — $4"; CAZ=$((CAZ+1))
  else echo "  🔴 SOBREVIVIÓ — $4"; SOB=$((SOB+1)); fi
  restaurar
}

echo "== control: sin mutar debe dar 0 fallos =="
echo "  fallos: $(probar)"

mutar "src/app/api/caja/periodos/[id]/route.ts" \
  '  const today = new Date().toISOString().slice(0, 10);
  // `saldo_cierre` congela la foto del cierre' \
  '  if (Math.abs(saldo) > 0.005) {
    return NextResponse.json({ error: "No se puede cerrar con este saldo. Reabastece o ajusta los gastos." }, { status: 400 });
  }
  const today = new Date().toISOString().slice(0, 10);
  // `saldo_cierre` congela la foto del cierre' \
  'vuelve el bloqueo del cierre por saldo distinto de 0'

mutar "src/app/api/caja/periodos/[id]/route.ts" \
  '    .update({ estado: "cerrado", fecha_cierre: today, saldo_cierre: saldo })' \
  '    .update({ estado: "cerrado", fecha_cierre: today })' \
  'el saldo del cierre no se guarda'

mutar "src/app/api/caja/periodos/[id]/route.ts" \
  '  const siguiente = await abrirPeriodo(fondo, auth.userId ?? null);' \
  '  const siguiente = null;' \
  'cerrar deja de abrir el período siguiente'

mutar src/app/caja/components/NuevoGastoDrawer.tsx \
  '  function resetForm() {
    setGDescripcion("");' \
  '  function resetForm() {
    setGFecha(new Date().toISOString().slice(0, 10));
    setGDescripcion("");' \
  'la fecha vuelve a hoy en «Guardar y nuevo»'

mutar src/app/caja/components/NuevoGastoDrawer.tsx \
  '  const totalNum = Math.round((subtotalNum + itbmsNum) * 100) / 100;' \
  '  const totalNum = subtotalNum;' \
  'el ITBMS deja de entrar al total'

mutar src/app/caja/components/NuevoGastoDrawer.tsx \
  '  const itbmsNum = Math.round(subtotalNum * (parseFloat(gItbmsPct) / 100) * 100) / 100;' \
  '  const itbmsNum = Math.round(subtotalNum * (parseFloat(gItbmsPct) / 100) * 2 * 100) / 100;' \
  'el ITBMS calcula el doble (la cuenta cambia)'

mutar src/app/caja/components/GastoForm.tsx \
  '            <TextInput
              value={gProveedor}
              onChange={setGProveedor}
              placeholder="Nombre del proveedor"
              ariaLabel="Proveedor"
            />' \
  '            <TextInput
              value={gProveedor}
              onChange={setGProveedor}
              placeholder="Nombre del proveedor"
              ariaLabel="Proveedor"
            />
            <datalist id="caja-proveedores"><option value="La Parrillada" /></datalist>' \
  'aparece una lista de proveedores sugeridos'

mutar src/app/caja/components/NuevoGastoDrawer.tsx \
  '    !!gProveedor.trim() &&' \
  '    !!gProveedor.trim() &&
    !!gNroFactura.trim() &&' \
  'el N° de factura se vuelve obligatorio'

echo ""
echo "== resultado: cazadas $CAZ · sobrevivieron $SOB · muertas/no-op $NOOP =="
