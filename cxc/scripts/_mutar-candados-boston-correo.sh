#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿LOS CANDADOS DEL CORREO DE CONFECCIONES BOSTON CAZAN DE VERDAD? (9-sep-2026)
#
# Se rompe el código a propósito, UNA cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROLES (sin mutar) tienen que quedar VERDES: una ✅ ahí
# significa que los candados fallan por otra razón y el resto de la corrida no
# dice nada.
#
# Lo que este trabajo dejó puesto y no se puede volver a romper:
#   1. NADA de lo que recibe un cliente de Boston dice Fashion Group — ni el
#      remitente, ni el asunto, ni la firma, ni el membrete, ni el PDF (que
#      tampoco lleva el logo ni el dominio del grupo).
#   2. Boston va APARTE: su ruta, su consulta, sus correos de `switch_clientes`
#      acotado a Boston — nunca `clientes_master`, nunca `fetchEstadoCuentaData`.
#   3. El envío se anota DESPUÉS de que Resend confirma, y la anotación dice de
#      qué cartera es, así que su marca no se pinta en el CXC del grupo.
#   4. Sin correo cargado el botón NO se prende (medido: 119 de 398 lo tienen).
#   5. Solo admin y gerente_boston pueden mandarlo.
#   6. La palabra «vencido» sigue prohibida hacia el cliente.
#   7. La cabeza de SU papel trae sus cuatro líneas (CONFECCIONES BOSTON S.A ·
#      655-544-133465 · TEL vacío · ventas@cboston.net) y NUNCA las de otra
#      empresa — ni el correo del grupo, que le devolvería al papel el
#      «fashiongr.com» que se le acaba de sacar.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: este trabajo trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-boston-correo.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/boston-correo-lo-firma-boston.test.ts \
src/__tests__/components/boston-hoja-cobrar-correo.test.tsx \
src/__tests__/lib/cxc-boston-mismo-formato.test.ts \
src/__tests__/lib/cxc-boston-fuera-de-toda-superficie.test.ts \
src/__tests__/lib/cxc-estado-cuenta-legible.test.ts \
src/__tests__/lib/cxc-estado-cuenta-forma-switch.test.ts \
src/__tests__/lib/cxc-empresa-fiscal-las-seis.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/cxc/casa-del-papel.ts"
  "src/lib/cxc/boston-correo.ts"
  "src/lib/cxc/boston-estado-cuenta.ts"
  "src/lib/cxc/pdf-estado-cuenta-hoja.ts"
  "src/lib/pdf-estado-cuenta.ts"
  "src/app/api/cxc/boston/enviar-email/route.ts"
  "src/app/api/cxc/boston/estado-cuenta/route.ts"
  "src/app/api/cxc/envios/route.ts"
  "src/components/cxc/BostonHojaCobrar.tsx"
  "src/components/cxc/BostonTab.tsx"
  "src/lib/cxc/boston-roles.ts"
  "src/lib/cxc/empresa-fiscal.ts"
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

echo "── 1. 🔴 EL CORREO DICE FASHION GROUP ───────────────────────────────────"

# 1.1 El remitente vuelve a ser el del grupo.
mutar "src/lib/cxc/casa-del-papel.ts" \
  '  remitente: "Confecciones Boston <cobros@fashiongr.com>",' \
  '  remitente: "Fashion Group <cobros@fashiongr.com>",' \
  "el remitente de Boston dice Fashion Group"

# 1.2 El membrete de la banda negra vuelve a ser el del grupo.
mutar "src/lib/cxc/casa-del-papel.ts" \
  '  membrete: "CONFECCIONES BOSTON",' \
  '  membrete: "FASHION GROUP",' \
  "el membrete del correo dice FASHION GROUP"

# 1.3 La firma del correo la firma el grupo.
mutar "src/lib/cxc/casa-del-papel.ts" \
  '  firma: "Confecciones Boston",' \
  '  firma: "Fashion Group Panamá",' \
  "la firma del correo dice Fashion Group Panamá"

# 1.4 El asunto lo firma el grupo.
mutar "src/lib/cxc/boston-correo.ts" \
  '  return `${CASA_BOSTON.nombre} — Estado de cuenta ${mes}`;' \
  '  return `Fashion Group — Estado de cuenta ${mes}`;' \
  "el asunto dice Fashion Group"

# 1.5 El cuerpo nombra al grupo.
mutar "src/lib/cxc/boston-correo.ts" \
  '    `Adjunto encontrarán su estado de cuenta con ${CASA_BOSTON.nombre} al cierre del mes de ${mes}.`,' \
  '    `Adjunto encontrarán su estado de cuenta con Fashion Group al cierre del mes de ${mes}.`,' \
  "el cuerpo del correo dice Fashion Group"

# 1.6 El nombre del archivo adjunto lo firma el grupo.
mutar "src/app/api/cxc/boston/enviar-email/route.ts" \
  'sanitizeFilenamePart(`Estado de cuenta — ${CASA_BOSTON.nombre} — ${nombre} — ${mes}`)' \
  'sanitizeFilenamePart(`Estado de cuenta — Fashion Group — ${nombre} — ${mes}`)' \
  "el PDF adjunto se llama Fashion Group"

# 1.7 El `from` de Resend deja de mirar la casa.
mutar "src/app/api/cxc/boston/enviar-email/route.ts" \
  '    from: CASA_BOSTON.remitente,' \
  '    from: "Fashion Group <cobros@fashiongr.com>",' \
  "el from de Resend dice Fashion Group"

echo "── 2. 🔴 EL PAPEL SE FIRMA SOLO / SE FIRMA MAL ──────────────────────────"

# 2.1 Boston hereda la casa del grupo (logo y pie de Fashion Group).
mutar "src/lib/cxc/casa-del-papel.ts" \
  '  confecciones_boston: CASA_BOSTON,' \
  '  confecciones_boston: CASA_GRUPO,' \
  "Boston hereda la casa del grupo"

# 2.2 El papel de Boston se lleva el logo de Fashion Group.
mutar "src/lib/cxc/casa-del-papel.ts" \
  '  logo: null,
  // Sin el dominio del grupo: el cliente de Boston no le compra a fashiongr.com.' \
  '  logo: { base64: FG_LOGO_BASE64, width: FG_LOGO_WIDTH, height: FG_LOGO_HEIGHT },
  // Sin el dominio del grupo: el cliente de Boston no le compra a fashiongr.com.' \
  "el papel de Boston se lleva el logo del grupo"

# 2.3 El pie del papel de Boston vuelve al dominio del grupo.
mutar "src/lib/cxc/casa-del-papel.ts" \
  '  pie: "Confidencial",' \
  '  pie: "Confidencial · fashiongr.com",' \
  "el pie del papel de Boston dice fashiongr.com"

# 2.4 El pie deja de mirar la casa y se escribe a mano (el defecto de siempre).
mutar "src/lib/cxc/pdf-estado-cuenta-hoja.ts" \
  '    doc.text(`Generado ${hoyDMY()} · ${casa.pie}`, w / 2, h - 10, { align: "center" });' \
  '    doc.text(`Generado ${hoyDMY()} · Confidencial · fashiongr.com`, w / 2, h - 10, { align: "center" });' \
  "el pie del PDF se escribe a mano"

# 2.5 La cabeza deja de preguntar la casa y estampa el logo del grupo siempre.
mutar "src/lib/cxc/pdf-estado-cuenta-hoja.ts" \
  '  const casa = casaDeEmpresa(empresaKey);' \
  '  const casa = CASA_GRUPO_FORZADA();' \
  "la cabeza del papel deja de derivar la casa"

# 2.6 Un papel mezclado se estampa con Fashion Group.
mutar "src/lib/cxc/casa-del-papel.ts" \
  '  for (const key of empresaKeys) {
    const casa = CASA_POR_EMPRESA[key];
    if (casa) return casa;
  }
  return CASA_GRUPO;' \
  '  return CASA_GRUPO;' \
  "un papel con Boston adentro se firma como Fashion Group"

echo "── 3. 🔴 BOSTON DEJA DE IR APARTE ───────────────────────────────────────"

# 3.1 El correo de Boston sale por la ruta del GRUPO.
mutar "src/components/cxc/BostonHojaCobrar.tsx" \
  '      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http"))))' \
  '      .then((r) => (r.ok ? fetch("/api/cxc/enviar-email?x=1").then(() => r.json()) : Promise.reject(new Error("http"))))' \
  "la hoja pide la ruta del grupo"

# 3.2 La lectura de Boston usa el helper del grupo.
mutar "src/lib/cxc/boston-estado-cuenta.ts" \
  'export async function fetchEstadoCuentaBoston(codigo: string): Promise<EstadoCuenta> {' \
  'import { fetchEstadoCuentaData } from "@/lib/cxc/estado-cuenta-data";\nexport async function fetchEstadoCuentaBoston(codigo: string): Promise<EstadoCuenta> {' \
  "la lectura de Boston importa fetchEstadoCuentaData"

# 3.3 El correo del cliente sale del directorio del GRUPO.
mutar "src/app/api/cxc/boston/enviar-email/route.ts" \
  '    .from("switch_clientes")
    .select("email")
    .eq("empresa_key", EMPRESA_BOSTON)' \
  '    .from("clientes_master")
    .select("email")' \
  "el correo del cliente sale de clientes_master"

# 3.4 La consulta de documentos pierde el filtro de empresa.
mutar "src/lib/cxc/boston-estado-cuenta.ts" \
  '    .eq("empresa_key", EMPRESA_BOSTON)
    .eq("cliente_codigo", codigo)
    .neq("saldo", 0)' \
  '    .eq("cliente_codigo", codigo)
    .neq("saldo", 0)' \
  "la consulta de Boston deja de acotar por empresa"

# 3.5 La ficha del cliente deja de acotar a Boston (se lleva la del grupo).
mutar "src/lib/cxc/boston-estado-cuenta.ts" \
  '    .select("nombre, email, telefono, celular, identificacion, raw_data")
    .eq("empresa_key", EMPRESA_BOSTON)' \
  '    .select("nombre, email, telefono, celular, identificacion, raw_data")' \
  "la ficha del cliente de Boston deja de acotar"

# 3.6 La ruta del cajón vuelve a armar su propia consulta.
mutar "src/app/api/cxc/boston/estado-cuenta/route.ts" \
  '  let estado;
  try {
    estado = await fetchEstadoCuentaBoston(codigo);' \
  '  let estado;
  try {
    estado = await (async () => { await supabaseServer.from("switch_estadocuenta").select("*"); throw new Error("x"); })();' \
  "el cajón vuelve a consultar por su cuenta"

echo "── 4. 🔴 EL RASTRO DEL ENVÍO ────────────────────────────────────────────"

# 4.1 Se anota ANTES de mandar (el correo puede no salir nunca).
mutar "src/app/api/cxc/boston/enviar-email/route.ts" \
  '  try {
    const res = await fetch("https://api.resend.com/emails", {' \
  '  await supabaseServer.from("cxc_emails_enviados").insert({ cliente_codigo: codigo, empresas: [EMPRESA_BOSTON], destinatario, cc: null, asunto, enviado_por: "x", resultado: "ok", canal: "correo" });
  try {
    const res = await fetch("https://api.resend.com/emails", {' \
  "el envío se anota ANTES de que Resend confirme"

# 4.2 Un fallo de Resend deja de cortar: el correo no sale y la fila se anota.
mutar "src/app/api/cxc/boston/enviar-email/route.ts" \
  '      return NextResponse.json({ error: "No se pudo enviar el correo. Intenta de nuevo." }, { status: 500 });
    }
  } catch (e) {' \
  '    }
  } catch (e) {' \
  "un fallo de Resend deja de cortar el envío"

# 4.3 La anotación deja de decir de qué cartera es.
mutar "src/app/api/cxc/boston/enviar-email/route.ts" \
  '      empresas: [EMPRESA_BOSTON],' \
  '      empresas: [],' \
  "la anotación no dice que es de Boston"

# 4.4 La anotación pierde el canal.
mutar "src/app/api/cxc/boston/enviar-email/route.ts" \
  '.insert({ ...fila, canal: "correo" })' \
  '.insert({ ...fila })' \
  "la anotación pierde el canal «correo»"

# 4.5 El CXC del grupo vuelve a pintar la marca de Boston.
mutar "src/app/api/cxc/envios/route.ts" \
  '    if (Array.isArray(empresas) && empresas.includes(EMPRESA_CARTERA_APARTE)) continue;' \
  '    if (false) continue;' \
  "el CXC del grupo pinta la marca de un cobro de Boston"

echo "── 5. 🔴 SIN CORREO CARGADO, EL BOTÓN SE PRENDE IGUAL ───────────────────"

# 5.1 El botón deja de mirar si hay correo.
mutar "src/components/cxc/BostonHojaCobrar.tsx" \
  '                disabled={!tieneCorreo || cargando}' \
  '                disabled={false}' \
  "el botón de Correo se prende sin correo cargado"

# 5.2 Se inventa un correo cuando el cliente no tiene.
mutar "src/app/api/cxc/boston/enviar-email/route.ts" \
  '  return ((data?.[0]?.email as string | null) ?? "").trim();' \
  '  return ((data?.[0]?.email as string | null) ?? "cobros@fashiongr.com").trim();' \
  "se inventa un correo para el cliente que no tiene"

# 5.3 El servidor deja de validar el destinatario.
mutar "src/app/api/cxc/boston/enviar-email/route.ts" \
  '  if (!destinatario || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destinatario)) {' \
  '  if (false) {' \
  "el servidor acepta cualquier destinatario"

echo "── 6. 🔴 QUIÉN PUEDE MANDARLO ───────────────────────────────────────────"

# 6.1 Secretaria y vendedor pueden mandar el cobro de Boston.
mutar "src/app/api/cxc/boston/enviar-email/route.ts" \
  '  const auth = requireRole(req, rolesBoston());
  if (auth instanceof NextResponse) return auth;

  const RESEND_KEY' \
  '  const auth = requireRole(req, ["admin", "secretaria", "vendedor", "bodega", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  const RESEND_KEY' \
  "el POST deja entrar a secretaria y vendedor"

# 6.2 La lista de roles de Boston se abre.
mutar "src/lib/cxc/boston-roles.ts" \
  'export const ROLES_BOSTON = ["admin", ROL_BOSTON] as const;' \
  'export const ROLES_BOSTON = ["admin", ROL_BOSTON, "secretaria"] as const;' \
  "la lista de roles de Boston suma a secretaria"

echo "── 7. ⚠️ LA PALABRA PROHIBIDA Y LOS TRAMOS ──────────────────────────────"

# 7.1 El correo llama «vencido» a la antigüedad.
mutar "src/lib/cxc/boston-correo.ts" \
  '          <th style="${TH};text-align:left">Antigüedad</th>' \
  '          <th style="${TH};text-align:left">Vencido</th>' \
  "el correo dice «Vencido»"

# 7.2 Los tramos se rotulan a mano en vez de salir de `cxc-aging`.
mutar "src/lib/cxc/boston-correo.ts" \
  '        <td style="${TD}">${escapeHtml(tramoRango(k))}</td>' \
  '        <td style="${TD}">${escapeHtml("Saldo vencido")}</td>' \
  "los tramos del correo se rotulan a mano"

# 7.3 El resumen suma los tres tramos mal (crédito sumando).
mutar "src/lib/cxc/boston-correo.ts" \
  '  const total = Math.round((t.current + t.watch + t.overdue) * 100) / 100;' \
  '  const total = Math.round((t.current + t.watch) * 100) / 100;' \
  "el total del resumen se olvida un tramo"

echo "── 8. 🔴 LA CABEZA FISCAL DE BOSTON ─────────────────────────────────────"

# 8.1 A Boston le ponen el correo del grupo: su papel vuelve a decir fashiongr.com.
mutar "src/lib/cxc/empresa-fiscal.ts" \
  '    correo: "ventas@cboston.net",' \
  '    correo: CORREO_DEL_GRUPO,' \
  "a Boston le ponen el correo del grupo"

# 8.2 La ficha de Boston desaparece: su papel vuelve a salir con las líneas en blanco.
mutar "src/lib/cxc/empresa-fiscal.ts" \
  '  confecciones_boston: {
    legal: "CONFECCIONES BOSTON S.A",
    identificacion: "655-544-133465",
    correo: "ventas@cboston.net",
  },' \
  '' \
  "Boston se queda sin ficha fiscal"

# 8.3 Boston hereda la identificación de Fashion Wear (mentira fiscal).
mutar "src/lib/cxc/empresa-fiscal.ts" \
  '    identificacion: "655-544-133465",' \
  '    identificacion: "40254-103-278837",' \
  "Boston sale con la identificación de Fashion Wear"

# 8.4 El correo propio deja de respetarse y todas caen al del grupo.
mutar "src/lib/cxc/empresa-fiscal.ts" \
  '        correo: r.correo ?? CORREO_DEL_GRUPO,' \
  '        correo: CORREO_DEL_GRUPO,' \
  "el correo propio de una empresa deja de respetarse"

# 8.5 El teléfono deja de ir vacío.
mutar "src/lib/cxc/empresa-fiscal.ts" \
  '        telefono: "",' \
  '        telefono: "727-7247",' \
  "el teléfono deja de ir vacío"

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
