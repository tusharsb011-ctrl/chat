import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function list() {
  try {
    const response = await ai.models.list();
    const names = [];
    for await (const m of response) {
      names.push(m.name);
    }
    console.log(names.filter(n => n.includes("gemini")));
  } catch (e) {
    console.error(e);
  }
}

list();
