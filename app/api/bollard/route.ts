import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebaseAdmin"

export async function GET(req: NextRequest) {
  const slotId = Number(req.nextUrl.searchParams.get("slotId"))

  if (!slotId) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const snapshot = await db.ref(`slots/${slotId}`).once("value")
  const slot = snapshot.val()

  return NextResponse.json({
    ok: true,
    slotId,
    bollardUp: slot?.bollardUp || false,
  })
}

export async function POST(req: NextRequest) {
  const { slotId, bollardUp } = await req.json()

  await db.ref(`slots/${slotId}`).update({ bollardUp })

  return NextResponse.json({ ok: true })
}