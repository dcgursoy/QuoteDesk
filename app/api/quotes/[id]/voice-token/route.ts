import { GoogleGenAI, Modality } from "@google/genai";
import type { QuoteRow } from "@/lib/types";
import { createServerSupabase } from "@/lib/supabaseServer";
import { buildInstruction } from "@/lib/voicePrompt";
import { voiceTools } from "@/lib/voiceTools";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { joinToken } = await request.json();
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", id)
    .single();

  const row = data as QuoteRow | null;
  if (error || !row || row.join_token !== joinToken) {
    return Response.json({ error: "Invalid demo link" }, { status: 403 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return Response.json(
      { error: "GEMINI_API_KEY is not configured on the server" },
      { status: 500 },
    );
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = "gemini-3.8-live";
  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(Date.now() + 60 * 1000).toISOString(),
      liveConnectConstraints: {
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: buildInstruction(row),
          tools: voiceTools,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      },
    },
  });

  return Response.json({ token: token.name, model });
}
