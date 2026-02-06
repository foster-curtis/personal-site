import { createClient } from "@/lib/supabase/server";
import { getUser, isOwner } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { generateContent } from "@/lib/gemini/client";

const PROMPT_TEMPLATES = [
  "Describe a challenging project you worked on and how you overcame obstacles.",
  "What's a skill you've developed recently and how have you applied it?",
  "Tell me about a time you led a team or mentored someone.",
  "What's your approach to learning new technologies or frameworks?",
  "Describe a situation where you had to make a difficult technical decision.",
  "What accomplishment are you most proud of in your career?",
  "How do you handle tight deadlines and competing priorities?",
  "Tell me about a time you received constructive feedback and how you responded.",
  "What's a problem you solved that had significant business impact?",
  "Describe your experience collaborating with cross-functional teams.",
  "What motivates you in your work?",
  "Tell me about a failure and what you learned from it.",
  "How do you stay current with industry trends and best practices?",
  "Describe a time you improved a process or system.",
  "What's your experience with agile methodologies or project management?",
];

// POST /api/prompts/refresh - Delete pending prompts and generate new ones
export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user || !isOwner(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const count = Math.min(body.count || 3, 5);

    const supabase = await createClient();

    // 1. Delete all pending prompts for this user
    const { error: deleteError } = await supabase
      .from("prompts")
      .delete()
      .eq("owner_id", user.id)
      .eq("status", "pending");

    if (deleteError) {
      console.error("Error deleting pending prompts:", deleteError);
      return NextResponse.json(
        { error: "Failed to clear existing prompts" },
        { status: 500 }
      );
    }

    // 2. Get answered prompts to avoid duplicates (we keep these in the set)
    const { data: answered } = await supabase
      .from("prompts")
      .select("prompt_text")
      .eq("owner_id", user.id)
      .eq("status", "answered");

    const existingTexts = new Set(
      answered?.map((p) => p.prompt_text.toLowerCase()) || []
    );

    // 3. Get user's content to personalize prompts
    const { data: blocks } = await supabase
      .from("content_blocks")
      .select("title, type")
      .eq("owner_id", user.id)
      .limit(10);

    const hasContent = blocks && blocks.length > 0;
    const prompts: string[] = [];

    if (hasContent) {
      // Generate personalized prompts using Gemini
      const contentSummary = blocks
        .map((b) => `- ${b.title} (${b.type})`)
        .join("\n");

      try {
        const aiPrompt = `Based on this person's existing resume content, generate ${count} unique interview-style questions that would help them expand their profile. Questions should dig deeper into their experience or explore areas not yet covered.

Existing content:
${contentSummary}

Generate exactly ${count} questions, one per line. Questions should be professional, specific, and encourage detailed responses. Do not number them or add any other text.`;

        const response = await generateContent(aiPrompt);
        const lines = response.split("\n").filter((l) => l.trim().length > 10);

        for (const line of lines) {
          const cleaned = line.replace(/^\d+[\.\)]\s*/, "").trim();
          if (cleaned && !existingTexts.has(cleaned.toLowerCase())) {
            prompts.push(cleaned);
            existingTexts.add(cleaned.toLowerCase());
            if (prompts.length >= count) break;
          }
        }
      } catch (aiError) {
        console.error("AI prompt generation failed:", aiError);
      }
    }

    // 4. Fall back to templates if needed
    while (prompts.length < count) {
      const available = PROMPT_TEMPLATES.filter(
        (t) => !existingTexts.has(t.toLowerCase())
      );
      if (available.length === 0) break;
      const random = available[Math.floor(Math.random() * available.length)];
      prompts.push(random);
      existingTexts.add(random.toLowerCase());
    }

    if (prompts.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No new prompts to generate (all templates used)",
        deleted: true,
        created: 0,
      });
    }

    // 5. Insert new prompts
    const { data, error } = await supabase
      .from("prompts")
      .insert(
        prompts.map((text) => ({
          owner_id: user.id,
          prompt_text: text,
          status: "pending",
        }))
      )
      .select();

    if (error) {
      console.error("Error inserting prompts:", error);
      return NextResponse.json(
        { error: "Failed to create new prompts" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      created: data?.length || 0,
      prompts: data,
    });
  } catch (error) {
    console.error("Error in POST /api/prompts/refresh:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
