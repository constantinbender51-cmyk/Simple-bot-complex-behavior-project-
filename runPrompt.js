import { GoogleGenAI } from "@google/genai";

async function runPrompt() {
  const ai = new GoogleGenAI({}); // Automatically reads GEMINI_API_KEY env var

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "Hello, Gemini! Can you summarize today's weather in one sentence?",
  });

  console.log(response.text);
}

runPrompt().catch(console.error);
