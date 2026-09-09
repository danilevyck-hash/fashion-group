#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿LOS CANDADOS DE «EL ESTADO DE CUENTA CON LA FORMA DE SWITCH» CAZAN DE VERDAD?
# (9-sep-2026)
#
# Se rompe a propósito CADA una de las cinco decisiones de Daniel y cada regla
# del papel, una por vez, y se exige que los tests se pongan ROJOS. Los CONTROL
# (mutaciones que NO deben cazarse) tienen que quedar verdes: un candado que se
# pone rojo con cualquier cosa no está midiendo nada.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-estado-cuenta-switch.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/cxc-estado-cuenta-forma-switch.test.ts \
src/__tests__/lib/cxc-estado-cuenta-legible.test.ts \
src/__tests__/lib/cxc-papel-vocabulario.test.ts \
src/__tests__/lib/pdf-cliente-layout.test.ts \
src/__tests__/lib/backup-nada-sin-copia.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/cxc/estado-cuenta-switch.ts"
  "src/lib/cxc/estado-cuenta-tipos.ts"
  "src/lib/cxc/estado-cuenta-data.ts"
  "src/lib/cxc/empresa-fiscal.ts"
  "src/lib/cxc/pdf-estado-cuenta-hoja.ts"
  "src/lib/pdf-estado-cuenta.ts"
  "src/lib/cxc-aging.ts"
  "src/lib/switch-api/sync-empresa.ts"
  "src/lib/backup/tablas.ts"
  "src/app/cxc/components/EstadoCuentaDrawer.tsx"
  "src/components/cxc/BostonDocumentosDrawer.tsx"
  "src/app/api/cron/backup/route.ts"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0; controles_ok=0; controles_mal=0

corrida() { # imprime el nº de fallos, o "muerta"
  local salida
  salida="$(npx vitest run $TESTS 2>&1)"
  if ! grep -qE "^ *Tests " <<<"$salida"; then echo "muerta"; return; fi
  grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0
}

probar() {
  local fallos; fallos="$(corrida)"
  if [ "$fallos" = "muerta" ]; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no hay resumen que leer: $1"
    sobrevivientes=$((sobrevivientes + 1)); return
  fi
  if [ "${fallos:-0}" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos fallos) — $1"; cazadas=$((cazadas + 1))
  else
    echo "  🔴 SOBREVIVIÓ — $1"; sobrevivientes=$((sobrevivientes + 1))
  fi
}

probar_control() {
  local fallos; fallos="$(corrida)"
  if [ "$fallos" = "0" ]; then
    echo "  ✅ CONTROL OK (verde, como debe) — $1"; controles_ok=$((controles_ok + 1))
  else
    echo "  🔴 CONTROL MAL (se puso rojo sin motivo) — $1"; controles_mal=$((controles_mal + 1))
  fi
}

_aplicar() {
  python3 - "$1" "$2" "$3" <<'PY'
import sys
ruta, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(ruta, encoding="utf-8").read()
if viejo not in s:
    print(f"  ⚠️  el patrón no está en {ruta}: {viejo[:70]}")
    sys.exit(3)
open(ruta, "w", encoding="utf-8").write(s.replace(viejo, nuevo, 1))
PY
}

mutar() { restaurar; _aplicar "$1" "$2" "$3" || { sobrevivientes=$((sobrevivientes + 1)); return; }; probar "$4"; }
control() { restaurar; _aplicar "$1" "$2" "$3" || { controles_mal=$((controles_mal + 1)); return; }; probar_control "$4"; }

echo "── mutando ──────────────────────────────────────────────────────────────"

# ── A. El papel junta las SEIS compañías en una hoja ─────────────────────────

mutar "src/lib/pdf-estado-cuenta.ts" \
  "    if (i > 0) doc.addPage();
    let y = dibujarCabeza" \
  "    if (i > 99) doc.addPage();
    let y = dibujarCabeza" \
  "A1. el papel junta las compañías en una sola hoja"

mutar "src/lib/pdf-estado-cuenta.ts" \
  "    y = dibujarPie(doc, docs.y, emp, docs.total);" \
  "    y = dibujarPie(doc, docs.y, emp, total);" \
  "A2. el Total General de una compañía suma las anteriores"

# ── B. Aparecen los OCHO tramos de Switch ────────────────────────────────────

mutar "src/lib/cxc-aging.ts" \
  'export const AGING_ORDER: AgingKey[] = ["current", "watch", "overdue"];' \
  'export const AGING_ORDER: AgingKey[] = ["current", "watch", "overdue", "current"];' \
  "B1. los tramos dejan de ser tres"

mutar "src/lib/cxc/pdf-estado-cuenta-hoja.ts" \
  "    head: [AGING_ORDER.map((k) => tramoRango(k))]," \
  '    head: [["0-30 Dias", "31-60 Dias", "61-90 Dias"]],' \
  "B2. el papel escribe los tramos de Switch a mano"

mutar "src/lib/cxc-aging.ts" \
  'export function tramoRango(k: AgingKey): string {
  return AGING[k].rangoLargo;
}' \
  'export function tramoRango(k: AgingKey): string {
  return tramoLabel(k);
}' \
  "B3. el papel del cliente vuelve a decir «Vencido»"

mutar "src/lib/cxc/estado-cuenta-switch.ts" \
  "    if (dias <= 90) t.current += v;
    else if (dias <= 120) t.watch += v;" \
  "    if (dias <= 30) t.current += v;
    else if (dias <= 120) t.watch += v;" \
  "B4. el corte del primer tramo pasa de 90 a 30 días"

mutar "src/lib/cxc/estado-cuenta-switch.ts" \
  "    else t.overdue += v;" \
  "    else t.watch += v;" \
  "B5. el tercer tramo se vacía en el segundo"

# ── C. Vuelven a plegarse los de menos de $50 ────────────────────────────────

mutar "src/app/cxc/components/EstadoCuentaDrawer.tsx" \
  "            {emp.documentos.map((doc, i) => (" \
  "            {partirDocumentos(emp.documentos).grandes.map((doc, i) => (" \
  "C1. el cajón del grupo vuelve a plegar los chicos"

mutar "src/components/cxc/BostonDocumentosDrawer.tsx" \
  "  const visibles = data?.documentos ?? [];" \
  "  const visibles = partirDocumentos(data?.documentos ?? []).grandes;" \
  "C2. el cajón de Boston vuelve a plegar los chicos"

mutar "src/lib/cxc/pdf-estado-cuenta-hoja.ts" \
  "  const { filas, total } = filasDelPapel(emp.documentos);" \
  "  const { filas, total } = filasDelPapel(emp.documentos.filter((d) => Math.abs(d.debito - d.credito) >= 50));" \
  "C3. el PAPEL esconde los documentos de menos de \$50"

# ── D. El nombre del cliente vuelve a MAYÚSCULAS ─────────────────────────────

mutar "src/lib/pdf-estado-cuenta.ts" \
  "  const nombre = nombreDelPapel(data.clienteNombre, nombreDeLaPantalla);" \
  "  const nombre = nombreDeLaPantalla;" \
  "D1. el papel usa el nombre normalizado de la pantalla"

mutar "src/lib/cxc/estado-cuenta-switch.ts" \
  '  const v = (nombreSwitch ?? "").trim();
  if (v) return v;
  return capitalizarNombre(respaldo);' \
  '  const v = (nombreSwitch ?? "").trim();
  if (v) return v;
  return respaldo;' \
  "D2. sin nombre de Switch, el grito pasa tal cual"

mutar "src/lib/cxc/estado-cuenta-switch.ts" \
  "      return token
        .toLocaleLowerCase(\"es\")" \
  "      return token
        .toLocaleLowerCase(\"es\") + \"\"; return token
        .toLocaleLowerCase(\"es\")" \
  "D3. capitalizar deja el nombre en minúsculas"

mutar "src/lib/cxc/estado-cuenta-data.ts" \
  "    clienteNombre: nombreDelPapel(nombreSwitch || ficha.nombre, codigo)," \
  "    clienteNombre: codigo," \
  "D4. el servidor deja de mandar el nombre de Switch"

# ── E. Se cuela un documento con saldo 0 ─────────────────────────────────────

mutar "src/lib/cxc/estado-cuenta-data.ts" \
  '    .neq("saldo", 0)' \
  '    .gte("saldo", 0)' \
  "E1. la consulta deja entrar los documentos ya pagados"

mutar "src/lib/cxc/estado-cuenta-data.ts" \
  '    .order("fecha_creacion", { ascending: true })
    .order("ccte_id", { ascending: true });' \
  '    .order("fecha_creacion", { ascending: true });' \
  "E2. se pierde el desempate del saldo corrido"

# ── F. El cuadre contra Switch se calla ──────────────────────────────────────

mutar "src/lib/cxc/estado-cuenta-switch.ts" \
  "  if (Math.abs(diferencia) <= TOLERANCIA_CUADRE) {
    return { cuadra: true, diferencia, aviso: null };
  }" \
  "  if (true) {
    return { cuadra: true, diferencia, aviso: null };
  }" \
  "F1. el cuadre nunca avisa"

mutar "src/lib/cxc/estado-cuenta-switch.ts" \
  "export const TOLERANCIA_CUADRE = 0.01;" \
  "export const TOLERANCIA_CUADRE = 10000;" \
  "F2. la tolerancia se abre a \$10.000"

mutar "src/app/cxc/components/EstadoCuentaDrawer.tsx" \
  "        if (cuadre.cuadra || !cuadre.aviso) return null;" \
  "        if (true) return null;" \
  "F3. la pantalla esconde el aviso del cuadre"

mutar "src/lib/cxc/estado-cuenta-data.ts" \
  '    .from("switch_estadocuenta_saldo")' \
  '    .from("switch_estadocuenta")' \
  "F4. el cuadre deja de leer lo que manda Switch"

mutar "src/lib/switch-api/sync-empresa.ts" \
  "    await guardarSaldosSwitch(empresaKey, saldosSwitch);" \
  "    void saldosSwitch;" \
  "F5. el sync vuelve a tirar el saldoTotal de Switch"

# ── G. La forma del papel ────────────────────────────────────────────────────

mutar "src/lib/cxc/pdf-estado-cuenta-hoja.ts" \
  '  "N. Interno",' \
  '  "Numero",' \
  "G1. una columna deja de llamarse como en Switch"

mutar "src/lib/cxc/pdf-estado-cuenta-hoja.ts" \
  '  "Débitos",
  "Créditos",' \
  '  "Créditos",
  "Débitos",' \
  "G2. Débitos y Créditos cambian de orden"

mutar "src/lib/cxc/estado-cuenta-switch.ts" \
  '  return `${m[3]}-${m[2]}-${m[1]}`;' \
  '  return `${m[2]}-${m[3]}-${m[1]}`;' \
  "G3. la fecha sale MM-DD-AAAA"

mutar "src/lib/cxc/estado-cuenta-switch.ts" \
  "  if (!iso || !plazo || plazo <= 0) return \"\";" \
  "  if (!iso) return \"\";" \
  "G4. con plazo 0 se inventa una fecha de vencimiento"

mutar "src/lib/cxc/estado-cuenta-switch.ts" \
  "  d.setUTCDate(d.getUTCDate() + Math.round(plazo));" \
  "  d.setUTCDate(d.getUTCDate() + 30);" \
  "G5. el vencimiento deja de mirar el plazo del documento"

mutar "src/lib/cxc/pdf-estado-cuenta-hoja.ts" \
  "    if (f.numeroFiscal) {" \
  "    if (false) {" \
  "G6. el N. Fiscal deja de imprimirse"

mutar "src/lib/cxc/pdf-estado-cuenta-hoja.ts" \
  '  doc.text("RECIBIDO CONFORME", MARGEN, y + 5);' \
  '  doc.text("", MARGEN, y + 5);' \
  "G7. se va el «RECIBIDO CONFORME»"

mutar "src/lib/cxc/pdf-estado-cuenta-hoja.ts" \
  '      "Límite de crédito:",' \
  '      "Limite:",' \
  "G8. la ficha del cliente deja de decir lo de Switch"

mutar "src/lib/cxc/pdf-estado-cuenta-hoja.ts" \
  "    doc.addImage(FG_LOGO_BASE64," \
  "    if (0) doc.addImage(FG_LOGO_BASE64," \
  "G9. el papel se queda sin el logo de la casa"

mutar "src/lib/cxc/pdf-estado-cuenta-hoja.ts" \
  '    doc.text(`Generado ${hoyDMY()} · Confidencial · fashiongr.com`' \
  '    doc.text(`Generado ${hoyDMY()}`' \
  "G10. se va el pie de la casa"

mutar "src/lib/cxc/empresa-fiscal.ts" \
  "  return { ...f, legal: f.legal || nombreDeLaPantalla };" \
  "  return { ...EMPRESA_FISCAL.fashion_wear, legal: f.legal || nombreDeLaPantalla };" \
  "G11. una empresa sin ficha toma los datos de Fashion Wear"

# ── H. El saldo corrido ──────────────────────────────────────────────────────

mutar "src/lib/cxc/estado-cuenta-switch.ts" \
  "    corrido = round2(corrido + d.debito - d.credito);" \
  "    corrido = round2(d.debito - d.credito);" \
  "H1. el saldo deja de ser corrido (cada fila es su propio saldo)"

mutar "src/lib/cxc/estado-cuenta-switch.ts" \
  "    corrido = round2(corrido + d.debito - d.credito);" \
  "    corrido = round2(corrido + d.debito + d.credito);" \
  "H2. los créditos SUMAN en vez de restar"

# ── I. El papel se dibuja encima del pie ─────────────────────────────────────

mutar "src/lib/cxc/pdf-estado-cuenta-hoja.ts" \
  "export const FOOTER_RESERVA_MM = 16;" \
  "export const FOOTER_RESERVA_MM = 0;" \
  "I1. desaparece la reserva del pie"

# ── J. La tabla nueva se queda sin respaldo ──────────────────────────────────

mutar "src/lib/backup/tablas.ts" \
  '  "switch_estadocuenta_saldo",' \
  "" \
  "J1. la tabla nueva sale de la clasificación del respaldo"

mutar "src/app/api/cron/backup/route.ts" \
  '  switch_estadocuenta_saldo: ["empresa_key", "cliente_switch_id"],' \
  "" \
  "J2. el respaldo pagina la tabla nueva sin orden estable"

# ── K. El lote deja de usar la MISMA hoja ────────────────────────────────────

mutar "src/lib/pdf-estado-cuenta.ts" \
  "    total += dibujarCliente(doc, cliente.data, cliente.nombre);" \
  "    total += cliente.data.total;" \
  "K1. «Cobrar a los N» deja de dibujar los documentos"

mutar "src/lib/pdf-estado-cuenta.ts" \
  "  if (clientes.length > 1) {" \
  "  if (clientes.length > 0) {" \
  "K2. con un solo cliente aparece una hoja de Resumen de más"

# ── CONTROLES (NO deben cazarse) ─────────────────────────────────────────────

control "src/lib/cxc/estado-cuenta-switch.ts" \
  "// mismo todo!!!!»* — y, al elegir entre copiar la historia completa o copiar la" \
  "// mismo todo!!!!»* — NOTA REESCRITA A PROPÓSITO: entre copiar la historia o la" \
  "C-1. un comentario reescrito"

control "src/lib/cxc/pdf-estado-cuenta-hoja.ts" \
  "const GRIS = [107, 114, 128] as const;" \
  "const GRIS = [108, 114, 128] as const;" \
  "C-2. un gris del papel un punto más claro"

echo "─────────────────────────────────────────────────────────────────────────"
echo "MUTACIONES: $((cazadas + sobrevivientes)) · CAZADAS: $cazadas · SOBREVIVIERON: $sobrevivientes"
echo "CONTROLES:  $((controles_ok + controles_mal)) · OK: $controles_ok · MAL: $controles_mal"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ] && echo "✅ TODAS CAZADAS Y LOS CONTROLES VERDES" || echo "🔴 REVISAR"
