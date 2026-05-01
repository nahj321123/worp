export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// ================= GET =================
// ESP32 calls this to read slot state
export async function GET(req: NextRequest) {
  try {
    // 1. Database Connection Check
    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Database not initialized" },
        { status: 500 }
      );
    }

    // 2. Extract slotId from the URL query string
    const { searchParams } = new URL(req.url);
    const slotIdStr = searchParams.get("slotId");
    
    if (!slotIdStr) {
      return NextResponse.json(
        { ok: false, error: "slotId query parameter is required" },
        { status: 400 }
      );
    }

    const slotId = Number(slotIdStr);

    // 3. Fetch from Firebase Realtime Database
    const snapshot = await db.ref(`slots/${slotId}`).once("value");
    const slot = snapshot.val();

    // 4. Return Data to ESP32
    return NextResponse.json(
      {
        ok: true,
        slotId,
        status: slot?.status || "available",
        paid: slot?.paid || false,
        bollardUp: slot?.bollardUp ?? true, 
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0", 
        },
      }
    );
  } catch (error) {
    console.error("GET /api/bollard error:", error);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 }
    );
  }
}

// ================= POST =================
// Mobile App calls this to control the bollard
export async function POST(req: NextRequest) {
  try {
    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Database not initialized" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { slotId, bollardUp } = body;

    if (slotId === undefined || bollardUp === undefined) {
      return NextResponse.json(
        { ok: false, error: "slotId and bollardUp are required in body" },
        { status: 400 }
      );
    }

    // Update Firebase
    await db.ref(`slots/${slotId}`).update({
      bollardUp: bollardUp,
    });

    return NextResponse.json({
      ok: true,
      slotId,
      bollardUp,
    });
  } catch (error) {
    console.error("POST /api/bollard error:", error);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 }
    );
  }
}