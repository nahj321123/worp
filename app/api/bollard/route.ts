export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slotId = searchParams.get("slotId");

    if (!slotId) return NextResponse.json({ ok: false }, { status: 400 });

    // Use a Promise race to ensure the function doesn't just hang forever
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Firebase Timeout")), 8000)
    );

    const dataPromise = db.ref(`slots/${slotId}`).once("value");

    const snapshot: any = await Promise.race([dataPromise, timeoutPromise]);
    const slot = snapshot.val();

    return NextResponse.json({
      ok: true,
      bollardUp: slot?.bollardUp ?? true,
      status: slot?.status || "available"
    });

  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ ok: false, error: "Timed out" }, { status: 504 });
  }
}