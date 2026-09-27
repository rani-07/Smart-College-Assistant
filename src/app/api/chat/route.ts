import {
  streamText,
  UIMessage,
  convertToModelMessages,
  tool,
  InferUITools,
  UIDataTypes,
  stepCountIs,
} from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { searchDocuments } from "@/lib/search";
import { searchLocation } from "@/lib/location-search";

const tools = {
  searchKnowledgeBase: tool({
    description:
      "Search the institution's admissions knowledge base (policies, courses, eligibility, fees, deadlines, FAQs) for information relevant to the student's question.",
    inputSchema: z.object({
      query: z.string().describe("The search query to find relevant documents"),
    }),
    execute: async ({ query }) => {
      try {
        const results = await searchDocuments(query, 3, 0.5);

        if (results.length === 0) {
          return "No relevant information found in the knowledge base.";
        }

        const formattedResults = results
          .map((r, i) => `[${i + 1}] ${r.content}`)
          .join("\n\n");

        return formattedResults;
      } catch (error) {
        console.error("Search error:", error);
        return "Error searching the knowledge base.";
      }
    },
  }),

  getLocationInfo: tool({
    description:
      "Look up the physical location (building, floor, landmark) of a department, office, or cabin on campus, along with a reference photo. Use this whenever a student asks where something is located on campus.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "What place the student is asking about, e.g. 'computer department HOD cabin', 'library'"
        ),
    }),
    execute: async ({ query }) => {
      const result = searchLocation(query);

      if (!result) {
        return {
          found: false,
          message:
            "No location information is on file for this. Tell the student you don't have this location saved and suggest asking at the admissions/enquiry desk.",
        };
      }

      return {
        found: true,
        department: result.department,
        description: result.description,
        imageUrl: result.imageUrl ?? null,
      };
    },
  }),
};

export type ChatTools = InferUITools<typeof tools>;
export type ChatMessage = UIMessage<never, UIDataTypes, ChatTools>;

export async function POST(req: Request) {
  try {
    const { messages }: { messages: ChatMessage[] } = await req.json();

    // Only send the most recent messages to keep every request's input small,
    // instead of resending the entire growing conversation each time.
    const recentMessages = messages.slice(-10);

    const result = streamText({
      model: google("gemini-3.5-flash-lite"),

      messages: convertToModelMessages(recentMessages),

      tools,

      system: `You are an admissions counselling assistant for prospective and current students. You help with programs, courses, engineering branches, eligibility, fees, admission procedures, application steps, deadlines, college information, campus locations, general institution policies, and FAQs.

LANGUAGE: Reply in the same language the student's latest message is written in.
- Marathi in → Marathi out. English in → English out. Hindi in → Hindi out.
- Marathi mixed with English → answer primarily in Marathi, keeping course/branch/official names in English.
- Marathi written in Roman letters (e.g. "college kuthe aahe?", "fees kiti aahe?") → treat as Marathi and answer in Marathi.
- The language of retrieved knowledge-base text is irrelevant — always translate/explain in the student's language, never switch to English just because a source was in English.
- Keep official names, course/branch names, and technical terms unchanged.
- If the question is unclear, ask for clarification in the same language.

KNOWLEDGE BASE: Always call searchKnowledgeBase before answering about policies, courses, fees, deadlines, eligibility, admission/application procedures, cutoffs, required documents, or other institution-specific facts. Never answer these from assumption or general knowledge. Never invent or estimate fees, dates, cutoffs, eligibility criteria, documents, seat numbers, or contact details. If information is missing or only partial, say so plainly and point to the official admissions/enquiry office. Flag it if sources conflict or a policy may have changed.

LOCATIONS: For "where is X" questions about a department/office/cabin/facility, call getLocationInfo. Never guess a location. On a match, describe it using only the returned info — no invented buildings/floors/directions, and don't embed or link the image yourself (the app shows it automatically). On no match, say it's not on file and suggest the admissions/enquiry desk.

STYLE: Warm, friendly, clear, concise. Simple language for students. Bullet points when useful. Summarize in your own words rather than dumping raw knowledge-base text. Match answer length to question complexity.

HIGH-STAKES QUESTIONS (e.g. "will I definitely get admission", "am I eligible", financial aid amounts, legal/visa eligibility): give only the factual information available, never guarantee outcomes, and recommend confirming with the official admissions office when certainty is required.

OUT OF SCOPE: If unrelated to admissions/college/courses/campus, politely clarify you're an admissions assistant, connect back to their context where possible, and point to the right resource otherwise.`,

      stopWhen: stepCountIs(3),
      maxOutputTokens: 500,
      maxRetries: 1,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Error streaming chat completion:", error);

    return new Response("Failed to stream chat completion", {
      status: 500,
    });
  }
}