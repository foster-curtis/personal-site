import { NextRequest, NextResponse } from "next/server";
import { generateContent } from "@/lib/gemini/client";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const { jobDescription } = await request.json();

    if (!jobDescription || jobDescription.trim().length === 0) {
      return NextResponse.json(
        { error: "Job description is required" },
        { status: 400 }
      );
    }

    // Get owner's content for comparison
    const supabase = createAdminClient();
    const ownerEmail = process.env.OWNER_EMAIL;

    if (!ownerEmail) {
      return NextResponse.json(
        { error: "Owner not configured" },
        { status: 500 }
      );
    }

    // Get owner's user ID
    const { data: users } = await supabase.auth.admin.listUsers();
    const owner = users?.users?.find(
      (u) => u.email?.toLowerCase() === ownerEmail.toLowerCase()
    );

    if (!owner) {
      return NextResponse.json(
        { error: "No candidate profile found" },
        { status: 404 }
      );
    }

    // Get all content blocks for the owner
    const { data: blocks, error } = await supabase
      .from("content_blocks")
      .select("type, title, body_text")
      .eq("owner_id", owner.id)
      .in("type", ["resume", "story", "qa"]);

    if (error) {
      console.error("Error fetching content:", error);
      return NextResponse.json(
        { error: "Failed to fetch candidate profile" },
        { status: 500 }
      );
    }

    if (!blocks || blocks.length === 0) {
      return NextResponse.json(
        {
          error:
            "No candidate profile data available. Please add resume content first.",
        },
        { status: 404 }
      );
    }

    // Format candidate profile
    const candidateProfile = blocks
      .map((b) => `### ${b.title}\n${b.body_text}`)
      .join("\n\n");

    // Build comparison prompt
    const prompt = `You are an expert recruiter and career advisor. Compare the following candidate's background with the job description provided.

## CANDIDATE PROFILE:
${candidateProfile}

## JOB DESCRIPTION:
${jobDescription}

## YOUR TASK:
Analyze how well this candidate matches the job requirements. Provide your analysis in the following JSON format (and ONLY this JSON, no other text):

{
  "overallMatch": "strong" | "moderate" | "developing",
  "matchScore": <number 1-100>,
  "summary": "<2-3 sentence executive summary>",
  "strengths": [
    {
      "area": "<skill or qualification>",
      "evidence": "<specific evidence from candidate profile>",
      "relevance": "<how this applies to the job>"
    }
  ],
  "partialMatches": [
    {
      "requirement": "<job requirement>",
      "candidateExperience": "<related but not exact experience>",
      "gap": "<what's missing or different>",
      "transferability": "<how skills might transfer>"
    }
  ],
  "gaps": [
    {
      "requirement": "<job requirement>",
      "assessment": "<honest assessment of the gap>",
      "mitigation": "<how candidate might address this>"
    }
  ],
  "recommendation": {
    "hire": true | false,
    "confidence": "high" | "medium" | "low",
    "reasoning": "<detailed reasoning for the recommendation>",
    "interviewFocus": ["<area to explore in interview>"]
  }
}

Be thorough but fair. Focus on substantive skills and experience, not superficial keyword matching. If the candidate has strong transferable skills, highlight them even if not an exact match.`;

    // Generate comparison
    const response = await generateContent(prompt);

    // Try to parse JSON from response
    let analysis;
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse analysis:", parseError);
      // Return raw response if JSON parsing fails
      return NextResponse.json({
        analysis: null,
        rawResponse: response,
        error: "Failed to parse structured analysis",
      });
    }

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error("Error in job comparison:", error);
    return NextResponse.json(
      { error: "Failed to analyze job fit" },
      { status: 500 }
    );
  }
}
