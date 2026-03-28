import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const expected = process.env.REEBOK_ADMIN_PASSWORD
  const isValid = !!expected && !!password && password === expected
  return NextResponse.json({ authenticated: isValid })
}
