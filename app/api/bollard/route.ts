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
    status: slot?.status || "available",
    paid: slot?.paid || false,
    bollardUp: slot?.bollardUp || false,
  })
}