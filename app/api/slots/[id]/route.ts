import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// ✅ THIS EXPORT MAKES IT A VALID MODULE
export async function PATCH(
  req: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const slotId = context.params.id;
    const body = await req.json();

    await db.ref(`slots/${slotId}`).update({
      ...body,
      updatedAt: Date.now(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API ERROR:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}