import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  const roles: Record<string, string> = {
    [process.env.ADMIN_PASSWORD!]: "admin",
    [process.env.DIRECTOR_PASSWORD!]: "director",
    [process.env.DAVID_PASSWORD!]: "david",
    [process.env.UPLOAD_PASSWORD!]: "upload",
  };

  const role = roles[password];
  if (!role) {
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }

  return NextResponse.json({ role });
}
