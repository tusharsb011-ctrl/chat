import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import mongoose from "mongoose";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Parse JSON request bodies
app.use(express.json());

// Initialize Google Gen AI
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Setup MongoDB connection
const mongoUri = process.env.MONGODB_URI;
if (mongoUri) {
  mongoose.connect(mongoUri)
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch(err => console.error('Error connecting to MongoDB:', err));
} else {
  console.error("MONGODB_URI not found in environment.");
}

// Define Schemas
const messageSchema = new mongoose.Schema({
  id: String,
  role: { type: String, enum: ['user', 'assistant'] },
  content: String,
  videoUrl: String,
  manimJobId: String,
  createdAt: String
});

const chatSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  title: String,
  createdAt: String,
  updatedAt: String,
  messages: [messageSchema]
});

const Chat = mongoose.model('Chat', chatSchema);

// --- REST API OVER THE DATABASE ---

// Get all chats in database
app.get("/api/chats", async (req, res) => {
  try {
    const db = await Chat.find().sort({ updatedAt: -1 });
    const metaList = db.map((chat: any) => ({
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      lastSnippet: chat.messages[chat.messages.length - 1]?.content.substring(0, 60) || ""
    }));
    res.json(metaList);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch chats" });
  }
});

// Get a specific chat with full message details
app.get("/api/chats/:id", async (req, res) => {
  try {
    const chat = await Chat.findOne({ id: req.params.id });
    if (!chat) {
      return res.status(404).json({ error: "Chat session not found in database" });
    }
    res.json(chat);
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// Start a new chat, write to database, and return newest chat state immediately
app.post("/api/chats", async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Message content cannot be blank" });
  }

  const chatId = `chat-${Date.now()}`;
  const now = new Date().toISOString();
  
  const userMessage = {
    id: `msg-${Date.now()}-user`,
    role: "user",
    content: message,
    createdAt: now
  };

  const newChat = new Chat({
    id: chatId,
    title: message.trim().substring(0, 45) + (message.trim().length > 45 ? "..." : ""),
    createdAt: now,
    updatedAt: now,
    messages: [userMessage]
  });

  try {
    await newChat.save();
    res.status(201).json(newChat);
  } catch (error) {
    console.error("Failed to create chat:", error);
    res.status(500).json({ error: "Failed to create chat" });
  }
});

// Generate AI response for a chat
app.post("/api/chats/:id/generate", async (req, res) => {
  const { id } = req.params;
  const aiModel = req.body.model || "gemini-2.5-flash";

  try {
    const activeChat = await Chat.findOne({ id });
    if (!activeChat) {
      return res.status(404).json({ error: "Chat session not found in database" });
    }

    const history = activeChat.messages.map((m: any) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    const response = await ai.models.generateContent({
      model: aiModel,
      contents: history,
      config: {
        responseMimeType: "application/json",
        systemInstruction: "You are Claude, a helpful AI assistant. You MUST respond with a JSON object containing exactly two keys: 'explain' (for your explanation/markdown) and 'code' (for any code snippets. If no code, leave empty). Output valid JSON only."
      }
    });

    const aiText = response.text || "I apologize, but I could not formulate a clear response.";

    if (activeChat.messages.length === 1) {
      try {
        const firstMessage = activeChat.messages[0].content;
        const titleGenResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `Create a brief 3 to 5 word description title for this chat based on the following opening message. Output ONLY the short title. No quotes, no markdown: "${firstMessage}"`,
        });
        if (titleGenResponse.text && titleGenResponse.text.trim()) {
          activeChat.title = titleGenResponse.text.trim();
        }
      } catch (titleErr) {
        console.warn("Failed to generate custom title via AI: ", titleErr);
      }
    }

    const assistantMessage: any = {
      id: `msg-${Date.now()}-ai`,
      role: "assistant",
      content: aiText,
      videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
      createdAt: new Date().toISOString()
    };

    try {
      const parsedAi = JSON.parse(aiText);
      if (parsedAi.code) {
        const manimRes = await fetch("https://manim-api.redcoast-fbe4b1e0.centralindia.azurecontainerapps.io/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: parsedAi.code, quality: 'medium' })
        });
        if (manimRes.ok) {
          const manimData = await manimRes.json();
          assistantMessage.manimJobId = manimData.job_id;
        }
      }
    } catch (e) {
      console.warn("Could not parse AI response as JSON for Manim trigger.");
    }

    activeChat.messages.push(assistantMessage as any);
    activeChat.updatedAt = new Date().toISOString();
    activeChat.markModified('messages');
    await activeChat.save();

    res.json(activeChat);

  } catch (error: any) {
    console.error("Gemini AI API execution failed:", error);
    
    try {
      const activeChat = await Chat.findOne({ id });
      if (activeChat) {
        const assistErrorMsg = {
          id: `msg-${Date.now()}-ai`,
          role: "assistant",
          content: `⚠️ Failed to get AI response: ${error.message || "An issue occurred connecting to Gemini."}`,
          createdAt: new Date().toISOString()
        };
        activeChat.messages.push(assistErrorMsg as any);
        activeChat.updatedAt = new Date().toISOString();
        await activeChat.save();
        return res.status(200).json(activeChat);
      }
    } catch (e) { }
    
    res.status(500).json({ error: "Error processing request" });
  }
});

// Add message to an existing chat, query Gemini, write BOTH, and return updated chat
app.post("/api/chats/:id/messages", async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;
  const aiModel = req.body.model || "gemini-2.5-flash";

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Message content cannot be blank" });
  }

  try {
    const activeChat = await Chat.findOne({ id });
    if (!activeChat) {
      return res.status(404).json({ error: "Chat session not found in database" });
    }

    const now = new Date().toISOString();
    const userMessage = {
      id: `msg-${Date.now()}-user`,
      role: "user",
      content: message,
      createdAt: now
    };

    activeChat.messages.push(userMessage as any);
    activeChat.updatedAt = now;
    await activeChat.save();

    const history = activeChat.messages.map((m: any) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    const response = await ai.models.generateContent({
      model: aiModel,
      contents: history,
      config: {
        responseMimeType: "application/json",
        systemInstruction: "You are Claude, a helpful AI assistant. You MUST respond with a JSON object containing exactly two keys: 'explain' (for your explanation/markdown) and 'code' (for any code snippets. If no code, leave empty). Output valid JSON only."
      }
    });

    const aiText = response.text || "I apologize, but I could not formulate a clear response.";

    const assistantMessage: any = {
      id: `msg-${Date.now()}-ai`,
      role: "assistant",
      content: aiText,
      videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
      createdAt: new Date().toISOString()
    };

    try {
      const parsedAi = JSON.parse(aiText);
      if (parsedAi.code) {
        const manimRes = await fetch("https://manim-api.redcoast-fbe4b1e0.centralindia.azurecontainerapps.io/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: parsedAi.code, quality: 'medium' })
        });
        if (manimRes.ok) {
          const manimData = await manimRes.json();
          assistantMessage.manimJobId = manimData.job_id;
        }
      }
    } catch (e) {
      console.warn("Could not parse AI response as JSON for Manim trigger.");
    }

    activeChat.messages.push(assistantMessage as any);
    activeChat.updatedAt = new Date().toISOString();
    await activeChat.save();

    res.json(activeChat);

  } catch (error: any) {
    console.error("Gemini AI API execution failed:", error);
    
    try {
      const activeChat = await Chat.findOne({ id });
      if (activeChat) {
        const assistErrorMsg = {
          id: `msg-${Date.now()}-ai`,
          role: "assistant",
          content: `⚠️ Error fetching next turn response: ${error.message || "Unable to contact Gemini AI API."}`,
          createdAt: new Date().toISOString()
        };
        activeChat.messages.push(assistErrorMsg as any);
        activeChat.updatedAt = new Date().toISOString();
        await activeChat.save();
        return res.status(200).json(activeChat);
      }
    } catch (e) { }
    res.status(500).json({ error: "Error processing request" });
  }
});

// Delete a chat session
app.delete("/api/chats/:id", async (req, res) => {
  try {
    await Chat.deleteOne({ id: req.params.id });
    res.json({ success: true, message: `Chat session ${req.params.id} deleted` });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete chat" });
  }
});

// Update a specific message (e.g. replacing placeholder videoUrl)
app.patch("/api/chats/:id/messages/:messageId", async (req, res) => {
  const { id, messageId } = req.params;
  const { videoUrl } = req.body;
  
  if (!videoUrl) {
    return res.status(400).json({ error: "Missing videoUrl field" });
  }

  try {
    const activeChat = await Chat.findOne({ id });
    if (!activeChat) {
      return res.status(404).json({ error: "Chat session not found" });
    }

    const messageIndex = activeChat.messages.findIndex((m: any) => m.id === messageId);
    if (messageIndex === -1) {
      return res.status(404).json({ error: "Message not found in chat" });
    }

    activeChat.messages[messageIndex].videoUrl = videoUrl;
    activeChat.updatedAt = new Date().toISOString();
    activeChat.markModified('messages');
    await activeChat.save();
    console.log(`Updated video URL for message ${messageId} to ${videoUrl}`);

    res.json(activeChat);
  } catch (error) {
    res.status(500).json({ error: "Failed to update message" });
  }
});

// Stateless polling endpoint for Manim video status
app.get("/api/chats/:id/messages/:messageId/video-status", async (req, res) => {
  const { id, messageId } = req.params;
  
  try {
    const activeChat = await Chat.findOne({ id });
    if (!activeChat) return res.status(404).json({ error: "Chat not found" });

    const message = activeChat.messages.find((m: any) => m.id === messageId);
    if (!message || !message.manimJobId) {
      return res.status(404).json({ error: "Message or Manim job not found" });
    }

    const MANIM_API_BASE = "https://manim-api.redcoast-fbe4b1e0.centralindia.azurecontainerapps.io";
    const statusRes = await fetch(`${MANIM_API_BASE}/status/${message.manimJobId}`);
    
    if (!statusRes.ok) {
      return res.status(500).json({ error: "Failed to check Azure status" });
    }
    
    const statusData = await statusRes.json();
    
    if (statusData.status === 'completed') {
      const videoRes = await fetch(`${MANIM_API_BASE}/download/${message.manimJobId}`);
      if (videoRes.ok) {
        const arrayBuffer = await videoRes.arrayBuffer();
        const base64Video = Buffer.from(arrayBuffer).toString('base64');
        const dataUri = `data:video/mp4;base64,${base64Video}`;
        
        message.videoUrl = dataUri;
        activeChat.updatedAt = new Date().toISOString();
        activeChat.markModified('messages');
        await activeChat.save();
        
        return res.json({ status: 'completed', chat: activeChat });
      }
    }
    
    return res.json({ status: statusData.status || 'processing' });
  } catch (err) {
    console.error("Polling error:", err);
    return res.status(500).json({ error: "Internal server error during polling" });
  }
});

// --- INTEGRATE VITE FOR DEV / STANDALONE FRONTEND ASSETS FOR PROD ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Claude AI Chat server listening at http://0.0.0.0:${PORT}`);
  });
}

// Only start the server if not imported as a module (e.g. Vercel)
if (process.env.VERCEL !== "1") {
  startServer();
}

export default app;
