import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { seedJoybeesProducts } from "@/lib/joybees-seed";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const results = await seedJoybeesProducts();
    return NextResponse.json(results);
  } catch (err) {
    console.error("Joybees seed error:", err);
    return NextResponse.json(
      { error: "Error al ejecutar seed" },
      { status: 500 }
    );
  }
}
