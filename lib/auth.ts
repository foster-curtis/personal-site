import { createClient } from "@/lib/supabase/server";
import { User } from "@supabase/supabase-js";

export async function getSession() {
  const supabase = await createClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.error("Error getting session:", error);
    return null;
  }

  return session;
}

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.error("Error getting user:", error);
    return null;
  }

  return user;
}

export function isOwner(user: User | null): boolean {
  if (!user?.email) return false;
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) {
    console.warn("OWNER_EMAIL environment variable is not set");
    return false;
  }
  return user.email.toLowerCase() === ownerEmail.toLowerCase();
}
