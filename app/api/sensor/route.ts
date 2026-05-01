export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebaseAdmin"

// ================= POST =================
// ESP32 hardware calls this when the ultrasonic sensor detects a change
export async function POST(req: NextRequest) {
  try {
    // 1. Check if db initialized successfully to prevent build-time crashes
    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Database not initialized" },
        { status: 500 }
      );
    }

    const { slotId, carPresent, status } = await req.json()

    // Validate the incoming request
    if (!slotId || typeof carPresent !== "boolean" || !status) {
      return NextResponse.json(
        { ok: false, error: "slotId, carPresent, and status are required" },
        { status: 400 }
      )
    }

    // Prepare the exact updates for Firebase
    const updates: Record<string, any> = {
      status: status, // Will be "occupied" or "available" based on ESP32
    }

    if (carPresent === true) {
      // 🚗 CAR PARKED: Update specific fields
      updates.checkedIn = true;
    } else {
      // 💨 CAR LEFT: Fully reset the slot to a clean slate
      updates.checkedIn = false;
      updates.bollardUp = true;   // Keep bollard UP to protect the slot
      updates.paid = false;       // Reset payment
      updates.reservedBy = null;  // Clear the user
      updates.reservedAt = null;  // Clear the timer
    }

    // Push the updates to the specific slot in Firebase
    await db.ref(`slots/${slotId}`).update(updates)

    return NextResponse.json({
      ok: true,
      slotId,
      carPresent,
      updatedStatus: status
    })

  } catch (error) {
    console.error("POST /api/sensor error:", error)

    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 }
    )
  }
}