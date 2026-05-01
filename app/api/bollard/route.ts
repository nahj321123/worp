export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebaseAdmin"

// ================= GET =================
// ESP32 calls this to read slot state
export async function GET(req: NextRequest) {
  try {
    const slotId = Number(req.nextUrl.searchParams.get("slotId"))

    if (!slotId) {
      return NextResponse.json(
        { ok: false, error: "slotId required" },
        { status: 400 }
      )
    }

    const snapshot = await db.ref(`slots/${slotId}`).once("value")
    const slot = snapshot.val()

    return NextResponse.json(
      {
        ok: true,
        slotId,
        status: slot?.status || "available",
        paid: slot?.paid || false,
        // 🔥 FIX: Use ?? instead of || so it doesn't accidentally override 'false'
        bollardUp: slot?.bollardUp ?? true, 
      },
      {
        headers: {
          "Cache-Control": "no-store", 
        },
      }
    )
  } catch (error) {
    console.error("GET /api/bollard error:", error)
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 }
    )
  }
}

// ================= POST =================
// App calls this to control bollard
export async function POST(req: NextRequest) {
  try {
    const { slotId, bollardUp } = await req.json()

    // 🔥 FIX: Check for undefined so we can safely pass 'false'
    if (!slotId || bollardUp === undefined) {
      return NextResponse.json(
        { ok: false, error: "slotId + bollardUp required" },
        { status: 400 }
      )
    }

    // Update Firebase directly
    await db.ref(`slots/${slotId}`).update({
      bollardUp: bollardUp,
    })

    return NextResponse.json({
      ok: true,
      slotId,
      bollardUp,
    })
  } catch (error) {
    console.error("POST /api/bollard error:", error)
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 }
    )
  }
}