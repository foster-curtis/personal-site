import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      // Check if user is owner
      const ownerEmail = process.env.OWNER_EMAIL;
      const userEmail = data.session.user.email;

      if (
        userEmail &&
        ownerEmail &&
        userEmail.toLowerCase() === ownerEmail.toLowerCase()
      ) {
        // Owner - redirect to dashboard
        return NextResponse.redirect(`${origin}/dashboard`);
      } else {
        // Not owner - redirect to access denied
        return NextResponse.redirect(`${origin}/access-denied`);
      }
    }
  }

  // If there was an error or no code, redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
