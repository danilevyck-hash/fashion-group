import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const isValid = password === process.env.REEBOK_ADMIN_PASSWORD
  return NextResponse.json({ authenticated: isValid })
}
