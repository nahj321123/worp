import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const slotId = req.nextUrl.searchParams.get("slotId");

    if (!slotId) {
      return NextResponse.json({ ok: false, error: "Missing slotId" });
    }

    const snap = await db.ref(`slots/${slotId}`).get();

    if (!snap.exists()) {
      return NextResponse.json({ ok: false, error: "Slot not found" });
    }

    const slot = snap.val();

    return NextResponse.json({
      ok: true,
      status: slot.status || "available",
      bollardUp: slot.bollardUp ?? true,
    });

  } catch (error) {
    console.error("SLOT API ERROR:", error);
    return NextResponse.json({ ok: false });
  }
}