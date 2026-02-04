import { getUser, isOwner } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const user = await getUser();

    if (!user) {
      return NextResponse.json({ user: null, isOwner: false });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
      },
      isOwner: isOwner(user),
    });
  } catch (error) {
    console.error("Error getting session:", error);
    return NextResponse.json(
      { error: "Failed to get session" },
      { status: 500 }
    );
  }
}
