import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // ✅ FIXED TYPE
) {
  try {
    const { id } = await context.params; // ✅ IMPORTANT FIX

    const body = await req.json();

    await db.ref(`slots/${id}`).update({
      ...body,
      updatedAt: Date.now(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API ERROR:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}