#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados del REDISEÑO de Cuentas por Cobrar (5-sep-2026) CAZAN de verdad?
# Se rompe el código a propósito, UNA cosa por vez, y se exige que los tests se
# pongan ROJOS. Los CONTROL (mutaciones que NO deben cazarse) tienen que quedar
# verdes: un candado que se pone rojo con cualquier cosa no está midiendo nada.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-cxc-rediseno.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/cxc-sin-pagar.test.ts \
src/__tests__/lib/cxc-correos-por-direccion.test.ts \
src/__tests__/lib/cxc-estado-cuenta-legible.test.ts \
src/__tests__/lib/cxc-cobrar-una-hoja.test.ts \
src/__tests__/lib/cxc-envios-y-pagos-por-fecha.test.ts \
src/__tests__/lib/cxc-ruta-y-error.test.ts \
src/__tests__/lib/cxc-contacto-del-cliente.test.ts \
src/__tests__/lib/cxc-boston-mismo-formato.test.ts \
src/__tests__/components/cxc-tira-totales.test.tsx \
src/__tests__/components/cxc-pestanas-y-menu.test.tsx \
src/__tests__/components/cxc-estado-cuenta-un-boton.test.tsx \
src/__tests__/components/cxc-ultimos-pagos-boton-fila.test.tsx \
src/__tests__/lib/cxc-boston-fuera-de-toda-superficie.test.ts \
src/__tests__/lib/boston-acceso.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

MIG_CONTACTO="supabase/migrations/20260926120000_clientes_master_contacto.sql"
MIG_BOSTON="supabase/migrations/20260928120000_aging_boston_tramos_finos.sql"

ARCHIVOS=(
  "$MIG_CONTACTO"
  "$MIG_BOSTON"
  "src/lib/cxc/sin-pagar.ts"
  "src/lib/cxc/correos-lote.ts"
  "src/lib/cxc/documentos-chicos.ts"
  "src/lib/cxc/envios-registro.ts"
  "src/lib/cxc/pagos-por-fecha.ts"
  "src/lib/cxc/estado-cuenta-email.ts"
  "src/lib/pdf-estado-cuenta.ts"
  "src/lib/modules.ts"
  "src/lib/moduleColors.ts"
  "src/lib/switch-api/sync-clientes-master.ts"
  "next.config.js"
  "src/app/cxc/page.tsx"
  "src/app/cxc/error.tsx"
  "src/app/cxc/components/TiraTotales.tsx"
  "src/app/cxc/components/ClientRow.tsx"
  "src/app/cxc/components/ClientTable.tsx"
  "src/app/cxc/components/ContactPanel.tsx"
  "src/app/cxc/components/HojaCobrar.tsx"
  "src/app/cxc/components/EstadoCuentaDrawer.tsx"
  "src/app/cxc/components/EnviarEmailModal.tsx"
  "src/app/cxc/components/PanelCxcMobile.tsx"
  "src/app/cxc/hooks/useAdminData.ts"
  "src/app/api/cxc/aging/route.ts"
  "src/app/api/cxc/enviar-email/route.ts"
  "src/app/api/cxc/cobrar-lote/route.ts"
  "src/app/api/cxc/envios/route.ts"
  "src/app/api/cxc/ultimos-pagos/route.ts"
  "src/app/api/cxc/boston/route.ts"
  "src/app/api/cxc/boston/estado-cuenta/route.ts"
  "src/app/api/clientes/[codigo]/route.ts"
  "src/components/cxc/BostonTab.tsx"
  "src/components/cxc/BostonHojaCobrar.tsx"
  "src/components/cxc/BostonDocumentosDrawer.tsx"
  "src/components/SearchBar.tsx"
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

probar() { # $1 = nombre de la mutación
  local fallos; fallos="$(corrida)"
  if [ "$fallos" = "muerta" ]; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no hay resumen que leer: $1"
    sobrevivientes=$((sobrevivientes + 1)); return
  fi
  if [ "${fallos:-0}" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos fallos) — $1"
    cazadas=$((cazadas + 1))
  else
    echo "  🔴 SOBREVIVIÓ — $1"
    sobrevivientes=$((sobrevivientes + 1))
  fi
}

probar_control() { # $1 = nombre del control (NO debe cazarse)
  local fallos; fallos="$(corrida)"
  if [ "$fallos" = "0" ]; then
    echo "  ✅ CONTROL OK (verde, como debe) — $1"
    controles_ok=$((controles_ok + 1))
  else
    echo "  🔴 CONTROL MAL (se puso rojo sin motivo) — $1"
    controles_mal=$((controles_mal + 1))
  fi
}

_aplicar() { # $1 archivo, $2 viejo, $3 nuevo
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

mutar() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  restaurar
  _aplicar "$1" "$2" "$3" || { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

control() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  restaurar
  _aplicar "$1" "$2" "$3" || { controles_mal=$((controles_mal + 1)); return; }
  probar_control "$4"
}

echo "── mutando ──────────────────────────────────────────────────────────────"

# ── A. «Sin pagar hace +90 d» ────────────────────────────────────────────────

# 1. El umbral se mueve a 120: 7 clientes dejan de avisar.
mutar "src/lib/cxc/sin-pagar.ts" \
  "export const DIAS_SIN_PAGAR_UMBRAL = 90;" \
  "export const DIAS_SIN_PAGAR_UMBRAL = 120;" \
  "sin-pagar: el umbral pasa de 90 a 120 días"

# 2. El que NUNCA pagó deja de avisar (ACTIVE SHOES, $43.806,10, desaparece).
mutar "src/lib/cxc/sin-pagar.ts" \
  "  return dias === null || dias > DIAS_SIN_PAGAR_UMBRAL;" \
  "  return dias !== null && dias > DIAS_SIN_PAGAR_UMBRAL;" \
  "sin-pagar: el que nunca pagó deja de avisar"

# 3. El corte pasa a >= 90: uno que pagó hace exactamente 90 días entra de más.
mutar "src/lib/cxc/sin-pagar.ts" \
  "  return dias === null || dias > DIAS_SIN_PAGAR_UMBRAL;" \
  "  return dias === null || dias >= DIAS_SIN_PAGAR_UMBRAL;" \
  "sin-pagar: el corte se vuelve >= (entra el de 90 exactos)"

# 4. El último pago se toma del PRIMERO que llega, no del más reciente: el que
#    le pagó a Vistana la semana pasada sale como moroso por Fashion Wear.
mutar "src/lib/cxc/sin-pagar.ts" \
  "    if (!previo || fecha > previo) mapa.set(codigo, fecha);" \
  "    if (!previo) mapa.set(codigo, fecha);" \
  "sin-pagar: se queda con el primer pago que llega, no con el más reciente"

# 5. El texto de la fila deja de distinguir «nunca pagó» de un número.
mutar "src/lib/cxc/sin-pagar.ts" \
  '  return dias === null ? "nunca ha pagado" : `no paga hace ${dias} d`;' \
  '  return `no paga hace ${dias ?? 0} d`;' \
  "sin-pagar: «nunca ha pagado» se vuelve «no paga hace 0 d»"

# 6. El aviso cuenta también a los que tienen saldo A FAVOR.
mutar "src/app/cxc/page.tsx" \
  "kpiClients.filter((c) => c.total > 0 && avisaSinPagar(diasSinPagarDe(c)))" \
  "kpiClients.filter((c) => avisaSinPagar(diasSinPagarDe(c)))" \
  "sin-pagar: el aviso cuenta también el saldo a favor"

# 7. El «no paga hace N d» se dibuja en las 100 filas, no solo con el filtro.
mutar "src/app/cxc/page.tsx" \
  "      sinPagarActivo ? textoSinPagar(diasSinPagarDe(c)) : null," \
  "      textoSinPagar(diasSinPagarDe(c))," \
  "sin-pagar: el aviso de la fila se dibuja siempre"

# 8. El «hoy» del aviso vuelve a ser el del servidor (UTC), no el de Panamá.
mutar "src/app/cxc/page.tsx" \
  "  const hoy = hoyPanama();" \
  "  const hoy = new Date().toISOString().slice(0, 10);" \
  "sin-pagar: el «hoy» deja de ser el de Panamá"

# 9. El mapa de últimos pagos se arma con una consulta propia a switch_recibos
#    (donde conviven Boston y American Classic con el grupo).
mutar "src/app/cxc/hooks/useAdminData.ts" \
  'fetch("/api/cxc/ultimo-pago", { cache: "no-store" })' \
  'fetch("/api/switch_recibos", { cache: "no-store" })' \
  "sin-pagar: el mapa deja de salir de la lectura del grupo"

# ── B. Un correo por DIRECCIÓN ───────────────────────────────────────────────

# 10. Se agrupa por CLIENTE: 13 correos a la misma persona el mismo minuto.
mutar "src/lib/cxc/correos-lote.ts" \
  "    let envio = porCorreo.get(correo);" \
  "    let envio = porCorreo.get(c.codigo ?? correo);" \
  "lote: se agrupa por cliente en vez de por dirección"

# 11. Los que no tienen correo ABORTAN el lote (se cuelan como un envío vacío).
mutar "src/lib/cxc/correos-lote.ts" \
  '    if (!correo) { sinCorreo.push(c); continue; }' \
  '    if (!correo) { sinCorreo.push(c); }' \
  "lote: el que no tiene correo entra igual al envío"

# 12. Las direcciones se comparan con mayúsculas: City Moda se parte en dos.
mutar "src/lib/cxc/correos-lote.ts" \
  '  return (correo ?? "").trim().toLowerCase();' \
  '  return (correo ?? "").trim();' \
  "lote: la dirección deja de compararse en minúsculas"

# 13. Los que quedaron fuera se cuentan, no se nombran.
mutar "src/lib/cxc/correos-lote.ts" \
  "  const nombres = lote.sinCorreo.map((c) => c.nombre).join(\", \");" \
  "  const nombres = String(lote.sinCorreo.length);" \
  "lote: los sin correo se dicen como número, no por nombre"

# 14. El PDF del correo compartido deja de partir por cliente.
mutar "src/lib/pdf-estado-cuenta.ts" \
  "    if (i > 0) doc.addPage();" \
  "    if (false) doc.addPage();" \
  "lote: el PDF deja de dar una hoja por cliente"

# 15. La ruta del lote agrupa a mano en vez de usar el módulo puro.
mutar "src/app/api/cxc/cobrar-lote/route.ts" \
  "  const lote = agruparPorCorreo(destinos);" \
  "  const lote = { envios: destinos.map((d) => ({ correo: d.correo ?? \"\", clientes: [d], total: d.total })), sinCorreo: [], clientesQueComparten: 0, correosCompartidos: 0 };" \
  "lote: la ruta deja de agrupar con el módulo puro"

# ── C. Lo que se manda son SIEMPRE las 6 ─────────────────────────────────────

# 16. El envío vuelve a recortarse por el filtro de la pantalla.
mutar "src/app/api/cxc/enviar-email/route.ts" \
  "function empresasDelEnvio(): string[] {
  return [...CXC_GRUPO_EMPRESA_KEYS];
}" \
  "function empresasDelEnvio(empresaParam?: string): string[] {
  if (empresaParam && (CXC_GRUPO_EMPRESA_KEYS as readonly string[]).includes(empresaParam)) return [empresaParam];
  return [...CXC_GRUPO_EMPRESA_KEYS];
}" \
  "cobrar: el envío vuelve a mirar el filtro de empresa"

# 17. El modal de «Escribirlo yo» vuelve a mandar el alcance de la pantalla.
mutar "src/app/cxc/components/EnviarEmailModal.tsx" \
  "    const params = new URLSearchParams({ codigo, nombre, nombreNormalizado });" \
  "    const params = new URLSearchParams({ codigo, nombre, nombreNormalizado, empresa: \"vistana\" });" \
  "cobrar: el modal vuelve a mandar una empresa"

# 18. El lote deja de mandar las 6 y manda una sola.
mutar "src/app/api/cxc/cobrar-lote/route.ts" \
  "  const empresas = [...CXC_GRUPO_EMPRESA_KEYS];" \
  "  const empresas = [\"vistana\"];" \
  "cobrar: el lote manda una sola empresa"

# ── D. «Cobrar» — una hoja, y los menús no vuelven ───────────────────────────

# 19. Vuelve el menú «···» a la fila del escritorio.
mutar "src/app/cxc/components/ClientTable.tsx" \
  'import { AccordionContent } from "@/components/ui";' \
  'import { AccordionContent } from "@/components/ui";
import OverflowMenu from "@/components/ui/OverflowMenu";' \
  "hoja: vuelve el OverflowMenu a la tabla"

# 20. El botón «Cobrar» desaparece de la fila.
mutar "src/app/cxc/components/ClientRow.tsx" \
  '            Cobrar
          </button>' \
  '            Ver
          </button>' \
  "hoja: el botón de la fila deja de decir «Cobrar»"

# 21. La hoja pierde la salida del correo.
mutar "src/app/cxc/components/HojaCobrar.tsx" \
  '          titulo="Correo"' \
  '          titulo="Correo electrónico"' \
  "hoja: la salida de correo cambia de nombre"

# 22. Sin correo, la fila deja de apagarse (se manda a la nada).
mutar "src/app/cxc/components/HojaCobrar.tsx" \
  "          apagada={!tieneCorreo || cargando}" \
  "          apagada={false}" \
  "hoja: la fila de correo no se apaga sin correo"

# 23. Se retira «Escribirlo yo».
mutar "src/app/cxc/components/HojaCobrar.tsx" \
  "        Escribirlo yo ›" \
  "        Editar ›" \
  "hoja: «Escribirlo yo» cambia de nombre"

# 24b. La hoja deja de subir desde abajo en celular (queda pegada arriba).
mutar "src/app/cxc/components/HojaCobrar.tsx" \
  '<ModalOverlay onBackdropClick={onClose} align="center">' \
  '<ModalOverlay onBackdropClick={onClose} align="start">' \
  "hoja: en celular deja de subir desde abajo"

# 24. El correo sale SIN los 5 segundos de deshacer.
mutar "src/app/cxc/page.tsx" \
  "    scheduleAction({" \
  "    void 0; ({" \
  "hoja: el correo deja de programarse con deshacer"

# ── E. El estado de cuenta legible ───────────────────────────────────────────

# 25. Lo chico se agrupa POR TIPO: se esconde una nota de débito de $5.000.
mutar "src/lib/cxc/documentos-chicos.ts" \
  "  return Math.abs(saldo) < UMBRAL_DOC_CHICO;" \
  "  return Math.abs(saldo) < UMBRAL_DOC_CHICO * 200;" \
  "estado de cuenta: el corte de lo chico sube y esconde plata real"

# 26. El corte deja de mirar el valor absoluto: un crédito chico no se pliega.
mutar "src/lib/cxc/documentos-chicos.ts" \
  "  return Math.abs(saldo) < UMBRAL_DOC_CHICO;" \
  "  return saldo < UMBRAL_DOC_CHICO;" \
  "estado de cuenta: el corte deja de mirar el valor absoluto"

# 27. Vuelven los dos números apilados sin rótulo.
mutar "src/app/cxc/components/EstadoCuentaDrawer.tsx" \
  "            <div className=\"col-span-2\">Fecha</div>" \
  "            <div className=\"col-span-2\">&nbsp;</div>" \
  "estado de cuenta: la tabla pierde un encabezado de columna"

# 28. «Original» repite el mismo número que el saldo.
mutar "src/app/cxc/components/EstadoCuentaDrawer.tsx" \
  '                  {doc.monto === Math.abs(doc.saldo) ? "—" : `$${fmt(doc.monto)}`}' \
  '                  {`$${fmt(doc.monto)}`}' \
  "estado de cuenta: «Original» repite el saldo"

# 29. El pie vuelve a bajar un PDF en vez de llevar a cobrar.
mutar "src/app/cxc/components/EstadoCuentaDrawer.tsx" \
  "                Cobrar
              </button>" \
  "                Descargar PDF
              </button>" \
  "estado de cuenta: el pie vuelve a decir «Descargar PDF»"

# ── F. Últimos pagos por fecha · el rastro de envíos ─────────────────────────

# 30. Los pagos se agrupan por empresa otra vez (18 líneas para decir 3).
mutar "src/lib/cxc/pagos-por-fecha.ts" \
  '    let dia = porDia.get(fecha);' \
  '    let dia = porDia.get(fecha + "|" + p.empresa);' \
  "pagos: se agrupan por empresa en vez de por fecha"

# 31. Las fechas salen de la más vieja a la más nueva.
mutar "src/lib/cxc/pagos-por-fecha.ts" \
  "    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))" \
  "    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))" \
  "pagos: el orden de las fechas se invierte"

# 32. Se vuelve a leer 3 recibos por empresa: un día con 3 tapa las otras fechas.
mutar "src/app/api/cxc/ultimos-pagos/route.ts" \
  "const RECIBOS_PARA_FECHAS = 30;" \
  "const RECIBOS_PARA_FECHAS = 3;" \
  "pagos: vuelven a leerse 3 recibos por empresa"

# 33. Las retenciones vuelven a contar como pago.
mutar "src/app/api/cxc/ultimos-pagos/route.ts" \
  '    .eq("es_retencion", false)' \
  "" \
  "pagos: las retenciones vuelven a contar"

# 34. «Copiaste el mensaje» pasa a decir «Le enviaste…».
mutar "src/lib/cxc/envios-registro.ts" \
  '  if (canal === "copia") return `Copiaste el mensaje ${cuando}`;' \
  "" \
  "rastro: copiar dice «le enviaste», que no le llegó a nadie"

# 35. La marca deja de apagarse a los 7 días.
mutar "src/lib/cxc/envios-registro.ts" \
  "export const VENTANA_MARCA_DIAS = 7;" \
  "export const VENTANA_MARCA_DIAS = 700;" \
  "rastro: la marca dura casi dos años"

# 36. La ruta de envíos acepta anotar un correo que quizá no salió.
mutar "src/app/api/cxc/envios/route.ts" \
  '  if (canal === "correo") {' \
  '  if (false) {' \
  "rastro: se puede anotar un correo sin que Resend confirme"

# ── G. Ruta nueva y pantalla de error ────────────────────────────────────────

# 37. El módulo vuelve a apuntar a /admin.
mutar "src/lib/modules.ts" \
  'label: "Cuentas por Cobrar", href: "/cxc"' \
  'label: "Cuentas por Cobrar", href: "/admin"' \
  "ruta: el módulo vuelve a /admin"

# 38. Se cae la redirección de /admin.
mutar "next.config.js" \
  '      { source: "/admin", destination: "/cxc", permanent: false },' \
  "" \
  "ruta: se retira la redirección de /admin"

# 39. La redirección se hace de TODO /admin (se lleva puesto Usuarios).
mutar "next.config.js" \
  '{ source: "/admin", destination: "/cxc", permanent: false },' \
  '{ source: "/admin/:path*", destination: "/cxc", permanent: false },' \
  "ruta: la redirección se lleva /admin/usuarios"

# 40. Un enlace interno vuelve a apuntar al viejo.
mutar "src/components/SearchBar.tsx" \
  'href: "/cxc", keywords' \
  'href: "/admin", keywords' \
  "ruta: la búsqueda global vuelve a /admin"

# 41. La pantalla de error vuelve a imprimir el mensaje crudo.
mutar "src/app/cxc/error.tsx" \
  "        Fue un problema al leer los datos. No se perdió nada: esta pantalla solo
        consulta saldos, no los modifica." \
  "        {error.message}" \
  "error: vuelve el mensaje crudo a la pantalla"

# ── H. Contacto del cliente ──────────────────────────────────────────────────

# 42. El sync empieza a pisar el contacto que escribió la gente.
mutar "src/lib/switch-api/sync-clientes-master.ts" \
  "      .upsert(slice, { onConflict: \"codigo\", ignoreDuplicates: false });" \
  "      .upsert(slice.map((f) => ({ ...f, contacto: null })), { onConflict: \"codigo\", ignoreDuplicates: false });" \
  "contacto: el sync lo pisa en cada corrida"

# 43. El rescate de las notas del CXC pisa lo que alguien ya escribió.
mutar "$MIG_CONTACTO" \
  "   AND cm.nombre_normalized = o.nombre_normalized
   AND cm.deleted = false
   AND cm.contacto IS NULL;" \
  "   AND cm.nombre_normalized = o.nombre_normalized
   AND cm.deleted = false;" \
  "contacto: el rescate pisa lo escrito a mano"

# 44. El rescate se lleva los contactos de Boston al directorio del grupo.
mutar "$MIG_CONTACTO" \
  " WHERE o.cartera = 'grupo'" \
  " WHERE o.cartera IN ('grupo', 'boston')" \
  "contacto: entra la cartera de Boston al directorio del grupo"

# 45. El backfill de Switch deja de acotar a las 6 del grupo.
mutar "$MIG_CONTACTO" \
  "     WHERE empresa_key IN ('vistana','fashion_wear','fashion_shoes',
                           'active_wear','active_shoes','joystep')" \
  "     WHERE true" \
  "contacto: el backfill de Switch se lleva Boston y ACS"

# 46. La ficha deja de aceptar la casilla.
mutar "src/app/api/clientes/[codigo]/route.ts" \
  '  if ("contacto" in body) allowed.contacto = (body.contacto ?? "").toString().trim() || null;' \
  "" \
  "contacto: la ficha deja de guardarlo"

# 47. El correo saluda con un nombre inventado cuando no hay contacto.
mutar "src/lib/cxc/estado-cuenta-email.ts" \
  '    nombre ? `Buen día ${nombre},` : "Buen día,",' \
  '    `Buen día ${nombre || "cliente"},`,' \
  "contacto: sin contacto el correo saluda «Buen día cliente»"

# ── I. Boston ────────────────────────────────────────────────────────────────

# 48. Los tramos finos de Boston se calculan con OTROS cortes.
mutar "$MIG_BOSTON" \
  "dias >= 0 AND dias <= 30), 0::numeric) AS d0_30" \
  "dias >= 0 AND dias <= 45), 0::numeric) AS d0_30" \
  "boston: el corte fino deja de ser el del grupo"

# 49. La migración se lleva por delante la vista del GRUPO.
mutar "$MIG_BOSTON" \
  "CREATE OR REPLACE VIEW switch_estadocuenta_aging_boston AS" \
  "CREATE OR REPLACE VIEW switch_estadocuenta_aging AS" \
  "boston: la migración toca la vista del grupo"

# 50. La vista de Boston deja de acotar a Boston.
mutar "$MIG_BOSTON" \
  "     AND s.empresa_key = 'confecciones_boston'" \
  "" \
  "boston: la vista deja de acotar a Boston"

# 51. Los tres tramos que se ven cambian de corte.
mutar "$MIG_BOSTON" \
  "dias >= 0 AND dias <= 90), 0::numeric) AS d0_90" \
  "dias >= 0 AND dias <= 60), 0::numeric) AS d0_90" \
  "boston: el tramo 0-90 cambia de corte"

# 52. Boston lee los documentos con el helper del GRUPO.
mutar "src/app/api/cxc/boston/estado-cuenta/route.ts" \
  '    .eq("empresa_key", EMPRESA_BOSTON)' \
  "" \
  "boston: el cajón deja de acotar a su empresa"

# 53. La empresa de Boston sale de la URL.
mutar "src/app/api/cxc/boston/estado-cuenta/route.ts" \
  'const EMPRESA_BOSTON = "confecciones_boston";' \
  'const EMPRESA_BOSTON = "confecciones_boston"; // eslint-disable-line
const _empresaDeLaUrl = (req: NextRequest) => req.nextUrl.searchParams.get("empresa");' \
  "boston: aparece una puerta para elegir empresa por URL"

# 54. Los contactos de Boston salen de clientes_master (el directorio del grupo).
mutar "src/app/api/cxc/boston/route.ts" \
  '      .from("switch_clientes")
      .select("codigo,telefono,celular,email")
      .eq("empresa_key", "confecciones_boston")' \
  '      .from("clientes_master")
      .select("codigo,telefono,celular,email")' \
  "boston: los contactos salen del directorio del grupo"

# 55. El mensaje de Boston lo firma Fashion Group.
mutar "src/components/cxc/BostonHojaCobrar.tsx" \
  '  lineas.push("Confecciones Boston - Departamento de Cobros");' \
  '  lineas.push("Fashion Group - Departamento de Cobros");' \
  "boston: el mensaje lo firma Fashion Group"

# 56. El mensaje de Boston vuelve a decirle «vencido» al cliente.
mutar "src/components/cxc/BostonHojaCobrar.tsx" \
  '  if (c.d121_plus > 0) lineas.push(`Más de 120 días: $${fmt(c.d121_plus)}`);' \
  '  if (c.d121_plus > 0) lineas.push(`VENCIDO CRITICO: $${fmt(c.d121_plus)}`);' \
  "boston: el mensaje al cliente dice «vencido»"

# ── J. La tira de totales ────────────────────────────────────────────────────

# 57. La tira deja de vivir en la grilla de la tabla.
mutar "src/app/cxc/components/TiraTotales.tsx" \
  'className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50' \
  'className="hidden sm:flex flex-wrap gap-2 px-4 py-2 bg-gray-50' \
  "tira: deja de estar en la grilla de 12 de la tabla"

# 58. El chip pierde el nombre largo del `title` (vuelve a haber dos nombres).
# ⚠️ Se muta la rama del chip APAGADO (`: \`...`), que es la que se dibuja con
# la lista sin filtrar — mutar solo la del encendido no cambia lo que se lee.
mutar "src/app/cxc/components/TiraTotales.tsx" \
  '                : `${tramoLabel(k)}' \
  '                : `${AGING[k].colLabel}' \
  "tira: el chip pierde el nombre completo del tramo"

# 59. Sin nadie que avise, la celda 1 dice «0 sin pagar» en vez de los clientes.
mutar "src/app/cxc/components/TiraTotales.tsx" \
  "  const hayAviso = !!sinPagar && sinPagar.cuantos > 0;" \
  "  const hayAviso = !!sinPagar;" \
  "tira: la celda 1 dice «0 sin pagar hace +90 d»"

# 60. Tocar un chip avisa con su rótulo en vez de su clave.
mutar "src/app/cxc/components/TiraTotales.tsx" \
  "            onClick={() => onRiskFilterChange(k)}" \
  "            onClick={() => onRiskFilterChange(AGING[k].colLabel as never)}" \
  "tira: el chip avisa con su rótulo, no con su clave"

echo "── CONTROL (estas NO se deben cazar) ────────────────────────────────────"

# C1. Un comentario cambia: el candado no puede depender de la prosa.
control "src/lib/cxc/sin-pagar.ts" \
  "// ⚠️ «Nunca ha pagado» quiere decir «no hay un solo recibo suyo en lo que este" \
  "// ⚠️ NOTA REESCRITA A PROPÓSITO — «nunca ha pagado» quiere decir que en lo que este" \
  "un comentario reescrito"

# C2. Un color de la tira cambia: el look no es la regla.
control "src/app/cxc/components/TiraTotales.tsx" \
  '  current: "bg-emerald-50",' \
  '  current: "bg-green-50",' \
  "un color de fondo del chip"

# C3. El orden de dos filas de la hoja «Cobrar» no cambia lo que ofrece.
control "src/app/cxc/components/HojaCobrar.tsx" \
  '          detalle="Para pegarlo donde quieras"' \
  '          detalle="Para pegarlo en donde quieras"' \
  "un texto de ayuda de la hoja"

echo "─────────────────────────────────────────────────────────────────────────"
echo "MUTACIONES: $((cazadas + sobrevivientes)) · CAZADAS: $cazadas · SOBREVIVIERON: $sobrevivientes"
echo "CONTROLES:  $((controles_ok + controles_mal)) · OK: $controles_ok · MAL: $controles_mal"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ] && echo "✅ TODAS CAZADAS Y LOS CONTROLES VERDES" || echo "🔴 REVISAR"
