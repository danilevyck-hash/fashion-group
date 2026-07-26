// Candado: los archivos de Storage se replican SOLO a Cloudflare R2.
//
// El 26-jul-2026 se eliminó la réplica bucket→bucket dentro del MISMO proyecto
// de Supabase (backups/_storage/<bucket>/<path>). Medido antes de borrarla:
// 1.596 archivos / 103,2 MB — el 18% del GB del plan (Storage estaba al 56%) —
// para una copia que moría junto con el proyecto que decía proteger. Encima
// llegaba a medias: nunca había copiado `marketing` (55,1 MB) ni
// `joybees-photos` (15,9 MB). R2 sí tiene los 5 buckets completos (3.204
// archivos, 198 MB), verificados uno a uno por tamaño y 20 por sha256.
//
// Este test existe para que no vuelva sola: es fácil "restaurar" la función
// creyendo que agrega seguridad. Si alguien la re-agrega a propósito, tiene que
// borrar este test y explicar por qué en el PR.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const raiz = join(__dirname, "..", "..", "..");
const routeSrc = readFileSync(join(raiz, "src/app/api/cron/backup/route.ts"), "utf-8");
const restoreSrc = readFileSync(join(raiz, "scripts/restore.mjs"), "utf-8");
/** Código sin comentarios: los comentarios SÍ mencionan la réplica eliminada
 *  (explican por qué se fue) y no deben hacer fallar el candado. */
const routeCodigo = routeSrc
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");

describe("backup: la réplica de Storage va solo a R2", () => {
  it("el cron no define ni llama a la réplica intra-Supabase", () => {
    expect(routeCodigo).not.toContain("replicateStorage(");
    expect(routeCodigo).not.toContain("MANIFEST_PATH");
    expect(routeCodigo).not.toContain("REPLICA_DEADLINE_MS");
  });

  it("no sube nada al prefijo _storage del bucket backups salvo el meta auditable", () => {
    // Único upload permitido bajo _storage/: el resumen meta-r2.json.
    expect(routeCodigo).toContain("STORAGE_R2_META_PATH");
    expect(routeCodigo).toContain('`${STORAGE_PREFIX}/meta-r2.json`');
    // La forma vieja era upload(`${STORAGE_PREFIX}/${key}`) con los bytes del
    // archivo copiado: ya no debe existir.
    expect(routeCodigo).not.toContain("${STORAGE_PREFIX}/${key}");
  });

  it("sigue replicando los 5 buckets a R2 (incluidos marketing y joybees-photos)", () => {
    for (const b of ["reclamo-fotos", "reclamo-facturas", "product-images", "joybees-photos", "marketing"]) {
      expect(routeCodigo).toContain(`"${b}"`);
    }
    expect(routeCodigo).toContain("replicateStorageToR2");
    // reclamo-zips-privado son exports re-derivables: no se replican.
    expect(routeCodigo).not.toContain('"reclamo-zips-privado"');
  });

  it("la respuesta del backup ya no reporta una réplica de Storage en Supabase", () => {
    expect(routeCodigo).not.toMatch(/storage:\s*\{\s*copiados/);
  });
});

describe("restore.mjs: --storage lee de R2", () => {
  it("sin --source explícito, --storage usa r2 en vez de fallar", () => {
    expect(restoreSrc).toContain("sourceExplicito || (storageBucket ? 'r2' : 'supabase')");
  });

  it("--source supabase junto con --storage corta con un mensaje que dice qué hacer", () => {
    expect(restoreSrc).toContain("storageBucket && source === 'supabase'");
    expect(restoreSrc).toContain("--source r2 --storage");
  });

  it("listarReplicaStorage ya no camina el bucket de Supabase", () => {
    expect(restoreSrc).not.toContain("walkStorage");
    expect(restoreSrc).toContain("_storage/${bucket}/");
  });
});
