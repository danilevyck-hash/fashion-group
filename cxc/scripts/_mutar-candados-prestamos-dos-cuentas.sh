#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de Préstamos (dos cuentas · tope · aprobación de Daniel) cazan
# de verdad? Se rompe el código a propósito, una cosa por vez, y se exige que
# los tests se pongan ROJOS.
#
# Las seis que el brief pide cazar sí o sí:
#   · que lo pendiente SUME al saldo
#   · que Contabilidad pueda aprobar
#   · que el freno de duplicados vuelva a leer la NOTA
#   · que el tope mire solo la cuenta de préstamo
#   · que el DAÑO se frene por tope
#   · que se ate por parecido
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada.
#
#   bash scripts/_mutar-candados-prestamos-dos-cuentas.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/prestamos-dos-cuentas.test.ts \
src/__tests__/lib/prestamos-tope.test.ts \
src/__tests__/lib/prestamos-un-solo-lugar.test.ts \
src/__tests__/lib/prestamos-salida-con-deuda.test.ts \
src/__tests__/lib/prestamos-amarre-migracion.test.ts \
src/__tests__/lib/asistencia-prestamo-planilla.test.ts \
src/__tests__/api/prestamos-tope-y-duplicados.test.ts \
src/__tests__/excel-exports-finanzas.test.ts \
src/__tests__/iphone-targets-prestamos.test.ts \
src/__tests__/ipad-caja-prestamos-cheques.test.ts"

SALDO="src/lib/prestamos-saldo.ts"
TOPE="src/lib/prestamos-tope.ts"
CONCEPTOS="src/lib/prestamos-conceptos.ts"
ROLES="src/lib/prestamos-roles.ts"
MOVS="src/app/api/prestamos/movimientos/route.ts"
PEND="src/app/api/prestamos/pendientes/route.ts"
PLANILLA="src/lib/asistencia/prestamos-planilla.ts"
LISTA="src/lib/prestamos-lista-server.ts"
MIGRA="supabase/migrations/20260925120000_prestamos_dos_cuentas_y_tope.sql"
CRON="src/app/api/cron/prestamos-caducan/route.ts"
CONFIG="src/app/asistencia/ConfiguracionTab.tsx"
EXCEL="src/lib/exports/prestamos-excel.ts"
TABLA="src/app/prestamos/components/MovimientoTable.tsx"

ARCHIVOS=("$SALDO" "$TOPE" "$CONCEPTOS" "$ROLES" "$MOVS" "$PEND" "$PLANILLA" "$LISTA" "$MIGRA" "$CRON" "$CONFIG" "$EXCEL" "$TABLA")

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
  [ $? -eq 3 ] && { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

echo "═══ LAS SEIS DEL BRIEF ══════════════════════════════════════════════════"

# 1. 🔴 Lo pendiente SUMA al saldo — es el bug de los $700 de Luis Arroyo, al revés.
mutar "$SALDO" \
  '    if (m.estado !== "aprobado") continue;' \
  '    if (m.estado === "rechazado") continue;' \
  "lo pendiente suma al saldo"

# 2. 🔴 Contabilidad puede aprobar.
mutar "$ROLES" \
  '  if (!s || !esAdminDePrestamos(s.role)) return false;
  return String(s.userName ?? "").trim().toLowerCase() === USUARIO_APRUEBA_PRESTAMOS;' \
  '  return !!s && esRolDePrestamos(s.role);' \
  "Contabilidad puede aprobar"

# 3. ⚠️ Cualquier admin puede aprobar (hay dos: daniel y alberto).
mutar "$ROLES" \
  '  return String(s.userName ?? "").trim().toLowerCase() === USUARIO_APRUEBA_PRESTAMOS;' \
  '  return true;' \
  "el otro admin también aprueba"

# 4. 🔴 El freno de duplicados vuelve a leer la NOTA.
mutar "$MOVS" \
  '      const origen = String(m.origen_pago ?? "").trim() || ORIGEN_POR_DEFECTO;
      if (origen !== ORIGEN_POR_DEFECTO) return false;' \
  '      if (!String(m.notas ?? "").startsWith("Deducción quincenal")) return false;' \
  "el freno vuelve a leer la nota"

# 5. 🔴 El tope mira SOLO la cuenta de préstamo.
mutar "$MOVS" \
  '      deudaActual: saldo.saldo,' \
  '      deudaActual: saldo.cuentas.prestamo.saldo,' \
  "el tope mira solo el préstamo"

# 6. 🔴 El daño de mercancía se frena por tope.
mutar "$MOVS" \
  '  if (concepto === CONCEPTO_PRESTAMO) {
    const { data: ficha }' \
  '  if (esCargo(concepto)) {
    const { data: ficha }' \
  "el daño se frena por tope"

# 7. 🔴 La migración ata por parecido.
mutar "$MIGRA" \
  "   AND upper(btrim(e.nombre)) = l.nombre
   AND e.empresa              = l.empresa" \
  "   AND upper(btrim(e.nombre)) LIKE l.nombre || '%'
   AND e.empresa              = l.empresa" \
  "la migración ata por parecido"

echo "═══ LAS DOS CUENTAS ═════════════════════════════════════════════════════"

# 8. Un pago de daño se lleva la cuenta de préstamo.
mutar "$SALDO" \
  '  return DE_DANO.has(m.concepto) ? CUENTA_DANO : CUENTA_PRESTAMO;' \
  '  return CUENTA_PRESTAMO;' \
  "todo cae en la cuenta de préstamo"

# 9. La columna `cuenta` deja de mandar sobre el concepto.
mutar "$SALDO" \
  '  const c = String(m.cuenta ?? "").trim();
  if (c === CUENTA_DANO) return CUENTA_DANO;' \
  '  const c = "";
  if (c === CUENTA_DANO) return CUENTA_DANO;' \
  "la columna cuenta deja de mandar"

# 10. La cuenta más vieja deja de ser la más vieja.
mutar "$SALDO" \
  '  if (fp && fd) return fd < fp ? CUENTA_DANO : CUENTA_PRESTAMO;' \
  '  if (fp && fd) return CUENTA_PRESTAMO;' \
  "el pago ya no baja la cuenta más vieja"

# 11. El desempate sin fechas deja de ser estable.
mutar "$SALDO" \
  '  if (fd && !fp) return CUENTA_DANO;
  return CUENTA_PRESTAMO;' \
  '  if (fd && !fp) return CUENTA_DANO;
  return CUENTA_DANO;' \
  "el desempate sin fechas cambia de cuenta"

# 12. La planilla capea la SUMA contra el total en vez de cada cuenta a la suya.
mutar "$PLANILLA" \
  '  const deP = saldoP > 0 && cuotaP > 0 ? Math.min(cuotaP, saldoP) : 0;
  const deD = saldoD > 0 && cuotaD > 0 ? Math.min(cuotaD, saldoD) : 0;
  const monto = centavos(deP + deD);' \
  '  const monto = centavos(Math.min(cuotaP + cuotaD, saldoP + saldoD));' \
  "la planilla capea la suma contra el total"

# 13. La planilla propone SOLO la cuota de préstamo (Daniel dijo «juntos»).
mutar "$PLANILLA" \
  '        cuota: centavos(num(f.cuota) + num(f.cuotaDano)),' \
  '        cuota: centavos(num(f.cuota)),' \
  "la casilla muestra solo la cuota de préstamo"

# 14. «Daño de mercancía» pasa a ser un valor guardado, no una etiqueta.
mutar "$CONCEPTOS" \
  'export const CONCEPTO_DANO = "Responsabilidad por daño";' \
  'export const CONCEPTO_DANO = "Daño de mercancía";' \
  "el concepto se renombra en la base"

# 15. Los conceptos retirados dejan de contar.
mutar "$SALDO" \
  'export const CONCEPTOS_RESTAN = ["Pago", "Abono extra", "Pago de responsabilidad"] as const;' \
  'export const CONCEPTOS_RESTAN = ["Pago"] as const;' \
  "los conceptos retirados dejan de contar"

echo "═══ EL TOPE Y LO QUE ESPERA ═════════════════════════════════════════════"

# 16. Sin sueldo cargado, sin tope.
mutar "$TOPE" \
  '  return s > 0 ? centavos(s) : TOPE_SIN_SALARIO;' \
  '  return s > 0 ? centavos(s) : Number.POSITIVE_INFINITY;' \
  "sin sueldo cargado no hay tope"

# 17. El piso sin sueldo deja de ser $500.
mutar "$TOPE" \
  'export const TOPE_SIN_SALARIO = 500;' \
  'export const TOPE_SIN_SALARIO = 1000;' \
  "el piso sin sueldo cambia de número"

# 18. Justo en el tope ya no pasa (o pasa de más).
mutar "$TOPE" \
  '  return { pasa: quedaria <= tope,' \
  '  return { pasa: quedaria < tope,' \
  "el borde del tope se corre"

# 19. Lo pendiente deja de verse en la ficha.
mutar "$TABLA" \
  '                    Esperando a Daniel · {desdeCuandoEspera(m.fecha, hoy)}' \
  '                    Registrado' \
  "la ficha deja de decir que espera a Daniel"

# 20. Lo pendiente sale en el Excel como si fuera plata entregada.
mutar "$EXCEL" \
  '      .filter((m) => m.estado === "aprobado" && m.deleted !== true)' \
  '      .filter((m) => m.deleted !== true)' \
  "el Excel publica lo que todavía espera"

# 21. La caducidad se corre de 7 días.
mutar "$TOPE" \
  'export const DIAS_CADUCIDAD_PENDIENTE = 7;' \
  'export const DIAS_CADUCIDAD_PENDIENTE = 30;' \
  "lo pendiente caduca a los 30 días"

# 22. Una fecha inválida caduca el préstamo igual.
mutar "$TOPE" \
  '  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  return hoy >= sumarDias(f, DIAS_CADUCIDAD_PENDIENTE);' \
  '  return true;' \
  "una fecha rota borra plata"

# 23. El cron borra también lo aprobado.
mutar "$CRON" \
  '      .eq("estado", ESTADO_PENDIENTE);' \
  '      .not("id", "is", null);' \
  "el cron borra movimientos aprobados"

# 24. El cron caduca en silencio.
mutar "$CRON" \
  '  if (borrados > 0) {' \
  '  if (borrados > 99999) {' \
  "el cron caduca sin avisar"

echo "═══ LO QUE NO PUEDE VOLVER ══════════════════════════════════════════════"

# 25. El hard delete del historial vuelve.
mutar "$MOVS" \
  '    .update({ deleted: true })
    .eq("empleado_id", empleado_id)' \
  '    .delete()
    .eq("empleado_id", empleado_id)' \
  "vuelve el hard delete del historial"

# 26. La lectura vuelve a perder las filas con `deleted` en NULL.
mutar "$LISTA" \
  '        .or("deleted.is.null,deleted.eq.false")
        .order("id", { ascending: true })' \
  '        .eq("deleted", false)
        .order("id", { ascending: true })' \
  "la lista pierde las filas con deleted en NULL"

# 27. El aviso de salida con deuda desaparece.
mutar "$CONFIG" \
  '      {(persona.deudaPrestamo ?? 0) > 0 && (' \
  '      {false && (persona.deudaPrestamo ?? 0) > 0 && (' \
  "no se avisa que se va debiendo"

# 28. La deuda deja de viajar a Asistencia.
mutar "$LISTA" \
  'export async function leerDeudaPorCodigo' \
  'export async function leerDeudaPorCodigoRenombrada' \
  "la deuda deja de llegar a Asistencia"

# 29. La bandera `activo` vuelve a filtrar la lista.
mutar "$LISTA" \
  '        .or("deleted.is.null,deleted.eq.false")
        .order("id", { ascending: true })
        .range(from, to),
  );

  const personas' \
  '        .or("deleted.is.null,deleted.eq.false")
        .eq("activo", true)
        .order("id", { ascending: true })
        .range(from, to),
  );

  const personas' \
  "vuelve el filtro por la bandera activo"

# 30. La migración renombra un concepto.
mutar "$MIGRA" \
  "COMMENT ON COLUMN prestamos_empleados.activo IS" \
  "UPDATE prestamos_movimientos SET concepto = 'Daño de mercancía' WHERE concepto = 'Responsabilidad por daño';
COMMENT ON COLUMN prestamos_empleados.activo IS" \
  "la migración renombra un concepto"

# 31. La migración junta las fichas de Ramón sin el guard.
mutar "$MIGRA" \
  '  IF v_ok AND v_saldo_vieja = 0 THEN' \
  '  IF true THEN' \
  "las fichas de Ramón se juntan sin guard"

# 32. La migración dropea la columna `activo`.
mutar "$MIGRA" \
  'ALTER TABLE prestamos_empleados
  ADD COLUMN IF NOT EXISTS deduccion_dano numeric NOT NULL DEFAULT 0;' \
  'ALTER TABLE prestamos_empleados
  ADD COLUMN IF NOT EXISTS deduccion_dano numeric NOT NULL DEFAULT 0;
ALTER TABLE prestamos_empleados DROP COLUMN activo;' \
  "la migración dropea la columna activo"

echo "─────────────────────────────────────────────────────────────────────────"
echo "cazadas: $cazadas · sobrevivientes: $sobrevivientes"
[ "$sobrevivientes" -eq 0 ]
