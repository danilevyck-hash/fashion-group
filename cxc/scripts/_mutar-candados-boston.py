#!/usr/bin/env python3
"""
VERIFICACIÓN POR MUTACIÓN de los candados del módulo Confecciones Boston.

Rompe el producto de UNA forma concreta y exige que los tests se pongan ROJOS.
Un candado que no caza su mutación no protege nada.

🩸 TRES LECCIONES DE ESTE REPO, aplicadas acá:
  · Restaura por COPIA, NUNCA con `git checkout`: hay archivos NUEVOS en la
    rama y git aborta el comando entero sin restaurar nada, así que las
    mutaciones se apilarían y ninguna se probaría por separado.
  · El reemplazo es LITERAL (str.replace), no `perl -0pi -e 's|A|B|'`: el
    código real tiene `||` y `/`, y cualquier delimitador se des-escapa, se
    come el archivo entero y deja un "SOBREVIVIÓ" falso.
  · DENUNCIA el patrón que no muta (⛔) en vez de cantarlo como cazado, y exige
    que vitest haya COLECTADO tests antes de creerle a un cero.

Y trae una mutación de CONTROL que a propósito no matchea: si no sale ⛔, el
denunciador está roto y todos los ✅ valen lo mismo que un barrido vacío.
"""
import hashlib
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
TESTS = [
    "src/__tests__/lib/boston-acceso.test.ts",
    "src/__tests__/lib/cxc-boston-permiso.test.ts",
    "src/__tests__/lib/catalogo-roles.test.ts",
    "src/__tests__/lib/comisiones-contabilidad.test.tsx",
]

# (nombre, archivo, texto viejo, texto nuevo)
MUTACIONES = [
    (
        "el rol pierde su módulo: `boston` se le abre a todos",
        "src/lib/boston/rol.ts",
        'export const ROLES_MODULO_BOSTON = ["admin", ROL_BOSTON] as const;',
        'export const ROLES_MODULO_BOSTON = ["admin", ROL_BOSTON, "vendedor"] as const;',
    ),
    (
        "David gana un segundo módulo (deja de auto-redirigirse)",
        "src/lib/modules.ts",
        '{ key: "directorio",    label: "Clientes",           href: "/clientes",         icon: Contact,          roles: ["admin", "secretaria", "vendedor"],           group: "ventas-clientes" },',
        '{ key: "directorio",    label: "Clientes",           href: "/clientes",         icon: Contact,          roles: ["admin", "secretaria", "vendedor", ROL_BOSTON],           group: "ventas-clientes" },',
    ),
    (
        "el rol deja de ser un rol REAL del sistema",
        "src/lib/modules.ts",
        '  { key: ROL_BOSTON, label: "Gerente Confecciones Boston" },\n',
        "",
    ),
    (
        "🔴 FUGA 1: la búsqueda global se le abre",
        "src/app/api/search/route.ts",
        'requireRole(req, ["admin", "secretaria", "vendedor", "bodega", "contabilidad"])',
        'requireRole(req, ["admin", "secretaria", "vendedor", "bodega", "contabilidad", "gerente_boston"])',
    ),
    (
        "🔴 FUGA 2: /home le dibuja el buscador del grupo",
        "src/app/home/page.tsx",
        '{["admin", "secretaria"].includes(role) && (',
        '{["admin", "secretaria", "gerente_boston"].includes(role) && (',
    ),
    (
        "🔴 FUGA 2: /home pierde el auto-redirect de módulo único",
        "src/app/home/page.tsx",
        "    if (visible.length === 1) {\n      router.push(visible[0].href);\n    }",
        "    if (visible.length === 99) {\n      router.push(visible[0].href);\n    }",
    ),
    (
        "🔴 el CXC del GRUPO se le abre",
        "src/app/api/cxc/aging/route.ts",
        '!["secretaria", "vendedor"].includes(session.role)',
        '!["secretaria", "vendedor", "gerente_boston"].includes(session.role)',
    ),
    (
        "una ruta de /api/boston/** escribe su propia lista de roles",
        "src/app/api/boston/ventas/route.ts",
        "requireRole(req, rolesModuloBoston())",
        'requireRole(req, ["admin", "gerente_boston"])',
    ),
    (
        "una ruta de /api/boston/** queda ABIERTA (sin guard)",
        "src/app/api/boston/inicio/route.ts",
        "  const auth = requireRole(req, rolesModuloBoston());\n  if (auth instanceof NextResponse) return auth;\n",
        "",
    ),
    (
        "la ruta de ventas lee la empresa de la URL",
        "src/app/api/boston/ventas/route.ts",
        '.eq("empresa_key", EMPRESA_BOSTON)',
        '.eq("empresa_key", req.nextUrl.searchParams.get("empresa") ?? EMPRESA_BOSTON)',
    ),
    (
        "la ruta de clientes escribe la empresa a mano",
        "src/app/api/boston/clientes/route.ts",
        '.eq("empresa_key", EMPRESA_BOSTON)',
        '.eq("empresa_key", "confecciones_boston")',
    ),
    (
        "🔴 la PLANILLA deja de recortar el dinero",
        "src/lib/boston/rol.ts",
        "export const VE_SUELDOS_DE_BOSTON = false;",
        "export const VE_SUELDOS_DE_BOSTON = true;",
    ),
    (
        "🔴 el recorte de la planilla alcanza a TODOS los roles",
        "src/lib/boston/rol.ts",
        "  return esGerenteBoston(rol) && !VE_SUELDOS_DE_BOSTON;",
        "  return !VE_SUELDOS_DE_BOSTON;",
    ),
    (
        "🔴 la línea recortada deja pasar el SUELDO MENSUAL",
        "src/lib/boston/planilla-sin-dinero.ts",
        '  "jornadaSemanal",',
        '  "jornadaSemanal",\n  "salarioMensual",',
    ),
    (
        "🔴 la línea recortada deja pasar el MONTO de las extras",
        "src/lib/boston/planilla-sin-dinero.ts",
        "    ? { minutos: em.minutos ?? 0, diurnoMin: em.diurnoMin ?? 0, nocturnoMin: em.nocturnoMin ?? 0 }",
        "    ? { ...em, minutos: em.minutos ?? 0, diurnoMin: em.diurnoMin ?? 0, nocturnoMin: em.nocturnoMin ?? 0 }",
    ),
    (
        "🔴 la planilla deja de forzarle la empresa (acepta ?empresa=vistana)",
        "src/app/api/asistencia/planilla/route.ts",
        "  const empresa = esGerenteBoston(auth.role)\n    ? EMPRESA_BOSTON\n    : empresaRaw",
        "  const empresa = false\n    ? EMPRESA_BOSTON\n    : empresaRaw",
    ),
    (
        "la planilla le contesta 403 (el rol sale del guard)",
        "src/app/api/asistencia/planilla/route.ts",
        "requireRole(req, [...asistenciaRoles(), ...aprobacionesRoles(), ROL_BOSTON])",
        "requireRole(req, [...asistenciaRoles(), ...aprobacionesRoles()])",
    ),
    (
        "🔴 la cartera de Boston se le cierra (pierde su pestaña CXC)",
        "src/lib/cxc/boston-roles.ts",
        'export const ROLES_BOSTON = ["admin", "secretaria", ROL_BOSTON] as const;',
        'export const ROLES_BOSTON = ["admin", "secretaria"] as const;',
    ),
    (
        "🔴 los favoritos del GRUPO se le abren",
        "src/lib/cxc/cartera-http.ts",
        "  if (!esGerenteBoston(rol) || cartera === CARTERA_BOSTON) return null;",
        "  return null;\n  if (!esGerenteBoston(rol) || cartera === CARTERA_BOSTON) return null;",
    ),
    (
        "el favorito de Boston se le cierra también (el guard se vuelve total)",
        "src/lib/cxc/cartera-http.ts",
        "  if (!esGerenteBoston(rol) || cartera === CARTERA_BOSTON) return null;",
        "  if (!esGerenteBoston(rol)) return null;",
    ),
    (
        "Catálogos vuelve como pestaña del módulo",
        "src/lib/boston/rol.ts",
        '  { key: "prestamos", label: "Préstamos" },',
        '  { key: "prestamos", label: "Préstamos" },\n  { key: "catalogos", label: "Catálogos" },',
    ),
    (
        "una pestaña inventada en la URL se acepta",
        "src/lib/boston/rol.ts",
        "  return typeof valor === \"string\" && KEYS_TAB.has(valor) ? (valor as TabBoston) : \"inicio\";",
        "  return (valor ?? \"inicio\") as TabBoston;",
    ),
    (
        "aparece una ruta nueva en /api/boston/** sin que nadie la mire",
        "__NUEVA_RUTA__",
        "",
        "",
    ),
    (
        "CONTROL — este patrón NO existe (tiene que salir ⛔)",
        "src/lib/boston/rol.ts",
        "ESTE_TEXTO_NO_EXISTE_EN_NINGUN_LADO_12345",
        "otra cosa",
    ),
]

RUTA_NUEVA = RAIZ / "src/app/api/boston/__mutante__/route.ts"
CUERPO_RUTA_NUEVA = """import { NextRequest, NextResponse } from "next/server";
export async function GET(_req: NextRequest) {
  return NextResponse.json({ ok: true });
}
"""


def md5(p: Path) -> str:
    return hashlib.md5(p.read_bytes()).hexdigest()


def correr_tests() -> tuple[bool, str]:
    """Devuelve (hubo_fallos, resumen). Exige que vitest haya colectado tests."""
    r = subprocess.run(
        ["./node_modules/.bin/vitest", "run", *TESTS],
        cwd=RAIZ, capture_output=True, text=True, timeout=900,
    )
    salida = r.stdout + r.stderr
    m = re.search(r"Tests\s+(?:(\d+) failed \|)?\s*(\d+) passed", salida)
    if not m:
        return False, "⚠️ vitest no colectó tests — la corrida murió, un cero acá no significa nada"
    fallos = int(m.group(1) or 0)
    return fallos > 0, f"{fallos} fallo(s)"


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="mut-boston-"))
    cazadas, sobrevivieron, no_op = [], [], []

    for nombre, rel, viejo, nuevo in MUTACIONES:
        print(f"\n── {nombre}")

        if rel == "__NUEVA_RUTA__":
            RUTA_NUEVA.parent.mkdir(parents=True, exist_ok=True)
            RUTA_NUEVA.write_text(CUERPO_RUTA_NUEVA)
            rojo, det = correr_tests()
            shutil.rmtree(RUTA_NUEVA.parent)
            (cazadas if rojo else sobrevivieron).append(nombre)
            print(f"   {'✅ CAZADA' if rojo else '🔴 SOBREVIVIÓ'} — {det}")
            continue

        p = RAIZ / rel
        if viejo not in p.read_text():
            no_op.append(nombre)
            print("   ⛔ EL PATRÓN NO MATCHEA — la mutación no se aplicó, este resultado NO vale")
            continue

        respaldo = tmp / rel.replace("/", "__")
        shutil.copy2(p, respaldo)
        antes = md5(p)
        p.write_text(p.read_text().replace(viejo, nuevo, 1))
        if md5(p) == antes:
            shutil.copy2(respaldo, p)
            no_op.append(nombre)
            print("   ⛔ EL ARCHIVO NO CAMBIÓ — este resultado NO vale")
            continue

        try:
            rojo, det = correr_tests()
        finally:
            shutil.copy2(respaldo, p)

        (cazadas if rojo else sobrevivieron).append(nombre)
        print(f"   {'✅ CAZADA' if rojo else '🔴 SOBREVIVIÓ'} — {det}")

    shutil.rmtree(tmp, ignore_errors=True)

    print("\n" + "═" * 70)
    print(f"CAZADAS       {len(cazadas)}")
    print(f"SOBREVIVIERON {len(sobrevivieron)}")
    for n in sobrevivieron:
        print(f"   🔴 {n}")
    print(f"NO-OP         {len(no_op)}")
    for n in no_op:
        print(f"   ⛔ {n}")

    # La de CONTROL tiene que ser no-op; si no, el denunciador está roto.
    control = "CONTROL — este patrón NO existe (tiene que salir ⛔)"
    if control not in no_op:
        print("\n🔴 EL DENUNCIADOR ESTÁ ROTO: la mutación de control no salió ⛔.")
        return 1
    if len(no_op) > 1:
        print("\n🔴 Hay mutaciones que no se aplicaron: sus resultados no valen.")
        return 1
    return 1 if sobrevivieron else 0


if __name__ == "__main__":
    sys.exit(main())
