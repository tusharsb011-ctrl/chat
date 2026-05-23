import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function test() {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-pro-latest",
      contents: "Output a simple json with key 'code' and value 'test'",
      config: {
        responseMimeType: "application/json",
      }
    });
    console.log("Success:", response.text);
  } catch (e) {
    console.error("Error:", e);
  }
}

test();
