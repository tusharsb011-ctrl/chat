import React, { useState, useEffect, useRef } from "react";
import { 
  MessageSquare, 
  Search, 
  Plus, 
  PanelLeftClose, 
  PanelLeft, 
  MoreHorizontal, 
  Terminal, 
  Layers, 
  Folder, 
  Settings, 
  Sparkles, 
  Trash2, 
  RotateCcw, 
  Paperclip, 
  Mic, 
  ArrowUp, 
  ChevronDown, 
  Star, 
  Share2, 
  HelpCircle,
  Clock,
  LogOut,
  Sliders
} from "lucide-react";
import { renderMarkdown, getGreeting } from "./utils";
import { Chat, Message } from "./types";

export default function App() {
  // State variables synchronized with the server's db
  const [chats, setChats] = useState<any[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [currentChatDetail, setCurrentChatDetail] = useState<Chat | null>(null);
  
  // Sidebar expansion status
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(true);
  
  // Quick Search state
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // Chat input box values
  const [inputValue, setInputValue] = useState<string>("");
  
  // Global loading and error states
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  
  // Model selector state
  const [activeModel, setActiveModel] = useState<string>("gemini-2.5-flash");
  const [showModelDropdown, setShowModelDropdown] = useState<boolean>(false);
  
  // UI greetings
  const greeting = getGreeting();

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Fetch all chats on component mount
  const fetchChats = async () => {
    try {
      const res = await fetch("/api/chats");
      if (res.ok) {
        const data = await res.json();
        setChats(data);
      } else {
        console.error("Failed to fetch chats from server");
      }
    } catch (err) {
      console.error("Connection error loading chats:", err);
    }
  };

  useEffect(() => {
    fetchChats();
  }, []);

  // Fetch specific chat when selected
  useEffect(() => {
    const fetchChatDetail = async () => {
      if (!currentChatId) {
        setCurrentChatDetail(null);
        return;
      }
      try {
        const res = await fetch(`/api/chats/${currentChatId}`);
        if (res.ok) {
          const data = await res.json();
          setCurrentChatDetail(data);
          // Scroll immediately
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
          }, 100);
        } else {
          console.error("Error loading chat details");
        }
      } catch (err) {
        console.error("Connection issue loading chat session:", err);
      }
    };

    fetchChatDetail();
  }, [currentChatId]);

  // Polling for video completion from Manim Orchestrator
  useEffect(() => {
    if (!currentChatDetail) return;
    
    const PLACEHOLDER_URL = "https://www.w3schools.com/html/mov_bbb.mp4";
    
    // Find all messages in the current chat that are still processing (have placeholder)
    const pendingMessages = currentChatDetail.messages.filter(
      (m) => m.role === "assistant" && m.videoUrl === PLACEHOLDER_URL
    );

    if (pendingMessages.length === 0) return;

    const intervalId = setInterval(async () => {
      for (const msg of pendingMessages) {
        try {
          const res = await fetch(`/api/chats/${currentChatDetail.id}/messages/${msg.id}/video-status`);
          if (res.ok) {
            const statusData = await res.json();
            if (statusData.status === 'completed' && statusData.chat) {
              // The backend has already saved the video to MongoDB and returned the updated chat
              setCurrentChatDetail(statusData.chat);
            }
          }
        } catch (e) {
          // Ignore network errors during polling
        }
      }
    }, 3000);
    
    return () => clearInterval(intervalId);
  }, [currentChatDetail]);

  // Handle textarea autosizing
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 240)}px`;
    }
  }, [inputValue, currentChatId]);



  // Delete a specific chat
  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this chat thread from the database?")) {
      try {
        const res = await fetch(`/api/chats/${id}`, { method: "DELETE" });
        if (res.ok) {
          await fetchChats();
          if (currentChatId === id) {
            setCurrentChatId(null);
            setCurrentChatDetail(null);
          }
        }
      } catch (err) {
        console.error("Error deleting chat:", err);
      }
    }
  };

  // Submit prompt handling
  const handleSubmitMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const prompt = inputValue.trim();
    if (!prompt || isLoading) return;

    setInputValue("");
    setApiError(null);
    setIsLoading(true);

    try {
      if (!currentChatId) {
        // --- 1. START A NEW CHAT SESSION ---
        const res = await fetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: prompt })
        });
        
        if (res.ok) {
          const newChat = await res.json();
          // Update chats sidebar database view
          await fetchChats();
          // Set current status so UI shifts to the chat view instantly
          setCurrentChatId(newChat.id);
          setCurrentChatDetail(newChat);

          // Trigger AI Generation immediately after
          const genRes = await fetch(`/api/chats/${newChat.id}/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: activeModel })
          });

          if (genRes.ok) {
            const updatedChat = await genRes.json();
            setCurrentChatDetail(updatedChat);
            await fetchChats();
          } else {
            setApiError("Error generating AI response.");
          }
        } else {
          setApiError("Unable to initialize new chat metadata.");
        }
      } else {
        // --- 2. APPEND MESSAGE TO AN EXISTING CHAT ---
        // Optimistically add user message to UI first for lightning-fast responsiveness
        const tempUserMessage: Message = {
          id: `temp-${Date.now()}`,
          role: "user",
          content: prompt,
          createdAt: new Date().toISOString()
        };
        
        if (currentChatDetail) {
          setCurrentChatDetail({
            ...currentChatDetail,
            messages: [...currentChatDetail.messages, tempUserMessage]
          });
        }
        
        // Post message to backend database
        const res = await fetch(`/api/chats/${currentChatId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: prompt, model: activeModel })
        });

        if (res.ok) {
          const updatedChat = await res.json();
          setCurrentChatDetail(updatedChat);
          await fetchChats();
        } else {
          setApiError("Error syncing messages with database.");
        }
      }
    } catch (err: any) {
      console.error("Submit routine failed:", err);
      setApiError(err.message || "Failed to contact chat server API.");
    } finally {
      setIsLoading(false);
      // Ensure bottom positioning
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  };

  // Keyboard shortcut: Submit on Enter keys (unless Shift held)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmitMessage();
    }
  };

  // Quick fill preset prompts
  const fillPresetPrompt = (type: string) => {
    let promptText = "";
    switch(type) {
      case "Write":
        promptText = "Write a comprehensive code audit checklist for production microservices detailing security, tracing, logging, and environment configuration.";
        break;
      case "Learn":
        promptText = "Explain the difference between optimistic concurrency control and pessimistic locking with a real-life analogy and transactional diagrams.";
        break;
      case "Code":
        promptText = "Write a custom TypeScript utility function to cache async API request responses using a LRU (Least Recently Used) strategy with max age timeouts.";
        break;
      case "Life stuff":
        promptText = "Structure a highly actionable 15-minute morning mental warmup routine designed to maximize deep flow work for a software engineer.";
        break;
      case "Claude's choice":
        promptText = "Let's explore the philosophical correlation between human language structure and deep learning transformer architectures. What are your thoughts?";
        break;
    }
    setInputValue(promptText);
    textareaRef.current?.focus();
  };

  // Filtering chats for live sidebar search
  const filteredChats = chats.filter(chat => 
    (chat.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (chat.lastSnippet || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div id="claude-chat-app" className="flex h-screen bg-[#191919] text-[#e3e3e3] overflow-hidden font-sans">
      
      {/* SIDEBAR CONTAINER */}
      <aside 
        id="app-sidebar"
        className={`bg-[#131313] border-r border-[#2c2c2c] flex flex-col transition-all duration-300 select-none ${
          sidebarExpanded ? "w-72" : "w-16"
        }`}
      >
        {/* SIDEBAR HEADER */}
        <div className="p-4 flex items-center justify-between border-b border-[#212121] h-16">
          {sidebarExpanded ? (
            <div className="flex items-center gap-2">
              <span className="text-[#cc7d5c] font-bold text-xl leading-none font-serif">Claude</span>
              <span className="text-[10px] bg-[#cc7d5c]/20 text-[#cc7d5c] px-1.5 py-0.5 rounded-full font-medium">Sonnet</span>
            </div>
          ) : (
            <span className="text-[#cc7d5c] font-serif font-bold text-lg mx-auto">C</span>
          ) }

          <button 
            id="sidebar-toggle-btn"
            onClick={() => setSidebarExpanded(!sidebarExpanded)} 
            className="p-1.5 hover:bg-[#202020] rounded-lg text-gray-400 hover:text-white transition-colors"
            title={sidebarExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
          >
            {sidebarExpanded ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </button>
        </div>

        {/* NEW CHAT BUTTON */}
        <div className="p-3">
          {sidebarExpanded ? (
            <button 
              id="new-chat-btn-wide"
              onClick={() => {
                setCurrentChatId(null);
                setCurrentChatDetail(null);
                setInputValue("");
              }}
              className="w-full flex items-center justify-between px-4 py-2 bg-[#1d1d1d] hover:bg-[#242424] border border-[#2c2c2c] rounded-xl text-sm font-medium transition-colors"
            >
              <span className="text-gray-200">New chat</span>
              <Plus size={16} className="text-[#cc7d5c]" />
            </button>
          ) : (
            <button 
              id="new-chat-btn-narrow"
              onClick={() => {
                setCurrentChatId(null);
                setCurrentChatDetail(null);
                setInputValue("");
              }}
              className="w-10 h-10 flex items-center justify-center bg-[#1d1d1d] hover:bg-[#242424] border border-[#2c2c2c] rounded-xl text-sm font-medium mx-auto transition-colors"
              title="New Chat"
            >
              <Plus size={18} className="text-[#cc7d5c]" />
            </button>
          )}
        </div>

        {/* SEARCH AND NAVIGATION CARDS */}
        {sidebarExpanded && (
          <div className="px-3 mb-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-gray-500" />
              <input 
                id="chats-search-input"
                type="text" 
                placeholder="Search database chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-[#1a1a1a] border border-[#262626] rounded-lg text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#444] transition-colors"
              />
            </div>
          </div>
        )}

        {/* STATIC SYSTEM LABELS */}
        <div className="px-2 space-y-0.5">
          {[
            { label: "Search", icon: <Search size={16} /> },
            { label: "Chats", icon: <MessageSquare size={16} />, active: true },
            { label: "Projects", icon: <Folder size={16} /> },
            { label: "Artifacts", icon: <Layers size={16} /> },
            { label: "Code", icon: <Terminal size={16} />, badge: "Upgrade" },
            { label: "Customize", icon: <Sliders size={16} /> },
          ].map((item, idx) => {
            // Hide if narrow sidebar except standard bubbles
            if (!sidebarExpanded && idx > 2) return null;
            return (
              <div 
                key={item.label}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs leading-none transition-colors cursor-pointer ${
                  item.active ? "bg-[#1d1d1d]/60 text-white font-medium" : "text-gray-400 hover:bg-[#181818] hover:text-gray-200"
                }`}
                title={item.label}
              >
                <span className="text-gray-400">{item.icon}</span>
                {sidebarExpanded && (
                  <span className="flex-1 truncate">{item.label}</span>
                )}
                {sidebarExpanded && item.badge && (
                  <span className="text-[9px] bg-[#cc7d5c]/15 text-[#cc7d5c] border border-[#cc7d5c]/25 px-1.5 py-0.5 rounded-full font-medium tracking-wide">
                    {item.badge}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* RECENT CONVERSATIONS SUBSECTION */}
        <div className="flex-1 overflow-y-auto mt-4 px-2 space-y-1">
          {sidebarExpanded && (
            <div className="text-[10px] text-gray-550 font-semibold tracking-wider uppercase px-3 py-1 mb-1 font-mono text-gray-500">
              Recents Database
            </div>
          )}

          {filteredChats.length > 0 ? (
            filteredChats.map((chat) => {
              const isActive = currentChatId === chat.id;
              return (
                <div 
                  id={`chat-item-${chat.id}`}
                  key={chat.id}
                  onClick={() => setCurrentChatId(chat.id)}
                  className={`group relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs cursor-pointer transition-all ${
                    isActive 
                      ? "bg-[#202020] text-white border-l-2 border-[#cc7d5c]" 
                      : "text-gray-400 hover:bg-[#181818] hover:text-gray-200"
                  }`}
                  title={chat.title}
                >
                  <MessageSquare size={14} className={isActive ? "text-[#cc7d5c]" : "text-gray-500"} />
                  
                  {sidebarExpanded ? (
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="font-medium truncate leading-none text-gray-200">{chat.title}</div>
                      <div className="text-[10px] text-gray-500 mt-1 truncate leading-none font-mono">
                        {chat.lastSnippet || "No messages yet"}
                      </div>
                    </div>
                  ) : null}

                  {sidebarExpanded && (
                    <button 
                      onClick={(e) => handleDeleteChat(chat.id, e)}
                      className="absolute right-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#333] text-gray-500 hover:text-red-400 transition-all"
                      title="Delete chat session"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            sidebarExpanded && (
              <div className="text-[10px] text-gray-500 italic px-3 py-4">
                No matching chats found
              </div>
            )
          )}
        </div>

        {/* USER PROFILE INFO AND DATABASE RESET */}
        <div className="p-3 border-t border-[#212121] bg-[#0c0c0c]/40 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#cc7d5c] text-white flex items-center justify-center font-bold font-serif text-sm relative border border-white/10 shrink-0">
              T
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-[#131111] rounded-full"></span>
            </div>

            {sidebarExpanded && (
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white truncate leading-none">Tushar</div>
                <div className="text-[10px] text-gray-450 mt-1 uppercase tracking-wider font-mono font-bold text-[#cc7d5c] leading-none">Free plan</div>
              </div>
            )}
            
            {sidebarExpanded && (
              <HelpCircle size={14} className="text-gray-500 hover:text-gray-200 cursor-pointer" />
            )}
          </div>
        </div>
      </aside>

      {/* CORE CONTENT CONTAINER */}
      <main id="chat-viewport" className="flex-1 flex flex-col h-full bg-[#191919] overflow-hidden relative">
        
        {/* TOP STATUS BAR CONTAINER */}
        <header className="h-16 border-b border-[#2c2c2c] flex items-center justify-between px-6 bg-[#191919]/60 backdrop-blur-sm shrink-0 z-10 select-none">
          <div className="flex items-center gap-3 min-w-0">
            {currentChatDetail ? (
              <>
                <MessageSquare size={16} className="text-[#cc7d5c] shrink-0" />
                <h1 className="text-sm font-semibold text-white truncate font-sans pr-2">
                  {currentChatDetail.title}
                </h1>
                <div 
                  id="header-model-badge"
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                  className="flex items-center gap-1.5 bg-[#252525] border border-[#333] px-2.5 py-1 rounded-lg text-xs text-gray-300 font-mono cursor-pointer hover:bg-[#2b2b2b] transition-all select-none shrink-0"
                >
                  <span>{activeModel}</span>
                  <ChevronDown size={11} className="text-gray-500" />
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 font-mono text-xs text-gray-500">
                <Clock size={12} />
                <span>New workspace session active</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {currentChatDetail && (
              <>
                <button className="p-2 hover:bg-[#242424] rounded-lg text-gray-400 hover:text-white transition-colors" title="Star this session">
                  <Star size={16} />
                </button>
                <button className="p-2 hover:bg-[#242424] rounded-lg text-gray-400 hover:text-white transition-colors" title="Share discussion">
                  <Share2 size={16} />
                </button>
              </>
            )}
            <div className="text-[10px] text-gray-500 font-mono px-2 py-1 bg-[#151515] rounded-md border border-[#222]">
              UTC: 2026-05-22
            </div>
          </div>
        </header>

        {/* CHAT MAIN LAYOUT AREA */}
        <div className="flex-1 overflow-y-auto min-h-0 relative">
          
          {/* SHOW WELCOME / INTRO LANDING SCREEN IF CHAT NOT INITIATED */}
          {!currentChatDetail ? (
            <div id="landing-screen" className="max-w-2xl mx-auto px-4 pt-20 pb-32 flex flex-col items-center justify-center min-h-[80%]">
              
              {/* ORANGE CLAUDE-MODE ASTERISK STARBURST */}
              <div id="claude-flower-icon" className="mb-6 animate-pulse">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Distinct Flower representation of Claude icon */}
                  <path d="M12 2C12.5523 2 13 4.5 13 7.5C13 10.5 12.5523 11.5 12 11.5C11.4477 11.5 11 10.5 11 7.5C11 4.5 11.4477 2 12 2Z" fill="#cc7d5c" />
                  <path d="M12 22C11.4477 22 11 19.5 11 16.5C11 13.5 11.4477 12.5 12 12.5C12.5523 12.5 13 13.5 13 16.5C13 19.5 12.5523 22 12 22Z" fill="#cc7d5c" />
                  <path d="M22 12C22 11.4477 19.5 11 16.5 11C13.5 11 12.5 11.4477 12.5 12C12.5 12.5523 13.5 13 16.5 13C19.5 13 22 12.5523 22 12Z" fill="#cc7d5c" />
                  <path d="M2 12C2 12.5523 4.5 13 7.5 13C10.5 13 11.5 12.5523 11.5 12C11.5 11.4477 10.5 11 7.5 11C4.5 11 2 11.4477 2 12Z" fill="#cc7d5c" />
                  <path d="M4.92896 4.92896C5.31948 4.53843 7.21444 6.21444 9.33576 8.33576C11.4571 10.4571 11.728 11.2358 11.3374 11.6263C10.9469 12.0169 10.1682 11.746 8.04692 9.62468C5.9256 7.50336 4.53843 5.31948 4.92896 4.92896Z" fill="#cc7d5c" />
                  <path d="M19.071 19.071C18.6805 19.4616 16.7856 17.7856 14.6642 15.6642C12.5429 13.5429 12.272 12.7642 12.6626 12.3737C13.0531 11.9831 13.8318 12.254 15.9531 14.3753C18.0744 16.4966 19.4616 18.6805 19.071 19.071Z" fill="#cc7d5c" />
                  <path d="M19.071 4.92896C19.4616 5.31948 17.7856 7.21444 15.6642 9.33576C13.5429 11.4571 12.7642 11.728 12.3737 11.3374C11.9831 10.9469 12.254 10.1682 14.3753 8.04692C16.4966 5.9256 18.6805 4.53843 19.071 4.92896Z" fill="#cc7d5c" />
                  <path d="M4.92896 19.071C4.53843 18.6805 6.21444 16.7856 8.33576 14.6642C10.4571 12.5429 11.2358 12.272 11.6263 12.6626C12.0169 13.0531 11.746 13.8318 9.62468 15.9531C7.50336 18.0744 5.31948 19.4616 4.92896 19.071Z" fill="#cc7d5c" />
                </svg>
              </div>

              {/* SERIF HEADING */}
              <h2 id="welcome-message-header" className="text-3xl md:text-4xl font-serif text-white font-medium mb-8 text-center flex items-center gap-3">
                {greeting.text}
              </h2>

              {/* CORE CHATBOX CARD - EXACT PORTRAIT AS IMAGE */}
              <div className="w-full bg-[#222] border border-[#2c2c2c] rounded-2xl p-4 shadow-xl mb-4 transition-all focus-within:border-[#444]">
                <textarea 
                  id="welcome-prompt-textarea"
                  ref={textareaRef}
                  placeholder={greeting.subtext}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  className="w-full bg-transparent border-0 text-white placeholder-gray-500 focus:outline-none resize-none font-sans text-sm md:text-base leading-relaxed"
                />

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#2d2d2d] text-gray-500">
                  <div className="flex items-center gap-3">
                    <button className="p-1.5 hover:bg-[#2d2d2d] rounded-lg hover:text-white transition-colors" title="Attach Files">
                      <Paperclip size={16} />
                    </button>
                    
                    {/* MODEL DROPDOWN ACCENT SELECTION */}
                    <div className="relative">
                      <button 
                        id="welcome-model-selector"
                        onClick={() => setShowModelDropdown(!showModelDropdown)}
                        className="flex items-center gap-1 px-2 py-1 hover:bg-[#2d2d2d] rounded-lg hover:text-white transition-colors text-xs font-mono font-medium text-gray-400"
                        title="Change model variant"
                      >
                        <span>{activeModel}</span>
                        <ChevronDown size={12} />
                      </button>

                      {showModelDropdown && (
                        <div className="absolute left-0 bottom-full mb-1 bg-[#1a1a1a] border border-[#2c2c2c] rounded-lg py-1 w-44 z-50 text-xs font-mono shadow-2xl">
                          {["gemini-2.5-flash", "gemini-3.5-flash", "gemini-1.5-pro", "gemini-1.5-flash"].map((model) => (
                            <button
                              key={model}
                              onClick={() => {
                                setActiveModel(model);
                                setShowModelDropdown(false);
                              }}
                              className={`w-full text-left px-3 py-1.5 hover:bg-[#262626] transition-colors ${
                                activeModel === model ? "text-[#cc7d5c] font-semibold" : "text-gray-300"
                              }`}
                            >
                              {model}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <button className="p-1.5 hover:bg-[#2d2d2d] rounded-lg hover:text-white transition-colors" title="Voice Input">
                      <Mic size={16} />
                    </button>

                    {/* DECORATIVE AUDIO WAVEFEEDBACK SYMBOL */}
                    <div className="flex items-center gap-0.5 px-2 py-1 bg-[#cc7d5c]/10 text-[#cc7d5c] rounded-md text-[10px] font-semibold font-mono uppercase">
                      <span className="w-1 h-3 bg-[#cc7d5c] animate-pulse"></span>
                      <span className="w-1 h-2 h-4 bg-[#cc7d5c] animate-pulse delay-75"></span>
                      <span className="w-1 h-2 bg-[#cc7d5c]"></span>
                      <span className="text-[9px] ml-1 select-none">Live UI</span>
                    </div>
                  </div>

                  <button 
                    id="welcome-prompt-submit-btn"
                    onClick={() => handleSubmitMessage()}
                    disabled={!inputValue.trim() || isLoading}
                    className={`p-2 rounded-xl text-white transition-all ${
                      inputValue.trim() ? "bg-[#cc7d5c] hover:bg-[#b86e4e] cursor-pointer scale-100" : "bg-[#2c2c2c] text-gray-600 scale-95 cursor-not-allowed"
                    }`}
                  >
                    <ArrowUp size={16} />
                  </button>
                </div>
              </div>

              {/* PILLS UNDERNEATH THE PROMPT AREA FOR PRESETS */}
              <div id="quick-presets-container" className="flex flex-wrap items-center justify-center gap-2 max-w-xl">
                {[
                  { type: "Write", label: "Write a task list" },
                  { type: "Learn", label: "Learn async lock dynamics" },
                  { type: "Code", label: "Code cache utilities" },
                  { type: "Life stuff", label: "Plan 15min warmups" },
                  { type: "Claude's choice", label: "Claude's design philosophy" }
                ].map((pill) => (
                  <button
                    key={pill.type}
                    onClick={() => fillPresetPrompt(pill.type)}
                    className="px-3.5 py-1.5 bg-[#202020] hover:bg-[#282828] border border-[#2c2c2c] rounded-full text-xs text-gray-300 hover:text-white transition-all shadow-sm font-medium hover:-translate-y-0.5 active:translate-y-0 select-none cursor-pointer"
                  >
                    <span className="text-[#cc7d5c] font-semibold mr-1 font-mono">{pill.type}</span>
                    {pill.label.substring(pill.type.length)}
                  </button>
                ))}
              </div>

              {isLoading && (
                <div className="mt-8 flex items-center gap-3 bg-[#202020] border border-[#cc7d5c]/30 px-4 py-2.5 rounded-xl font-mono text-xs text-gray-300">
                  <div className="w-3.5 h-3.5 border-2 border-t-transparent border-[#cc7d5c] rounded-full animate-spin"></div>
                  <span>Saving statement in database, consulting Gemini ...</span>
                </div>
              )}

              {apiError && (
                <div className="mt-6 p-4 bg-red-950/20 border border-red-900/50 rounded-xl text-xs text-red-300 font-mono text-center max-w-md">
                  ⚠️ {apiError}
                </div>
              )}

            </div>
          ) : (
            
            // OTHERWISE SHOW THE CONVERSATION PORTRAIT RENDERED LIVE FROM THE DATABASE!
            <div id="chat-messages-container" className="max-w-3xl mx-auto px-4 md:px-6 py-4 space-y-4 min-h-all">
              
              {currentChatDetail.messages.map((msg, index) => {
                const isUser = msg.role === "user";
                return (
                  <div 
                    id={`message-block-${msg.id}`}
                    key={msg.id} 
                    className={`flex gap-3 items-start ${isUser ? "flex-row-reverse" : ""}`}
                  >
                    {/* AVATAR OR ASTERISK FLOWER CONTAINER */}
                    <div className="shrink-0">
                      {isUser ? (
                        <div className="w-6 h-6 rounded-full bg-[#3a3a3a] border border-[#444] text-[#cc7d5c] flex items-center justify-center font-bold text-[10px] select-none">
                          U
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-[#cc7d5c]/15 text-[#cc7d5c] flex items-center justify-center relative border border-[#cc7d5c]/20 select-none">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2C12.5523 2 13 4.5 13 7.5C13 10.5 12.5523 11.5 12 11.5C11.4477 11.5 11 10.5 11 7.5C11 4.5 11.4477 2 12 2Z" fill="#cc7d5c" />
                            <path d="M12 22C11.4477 22 11 19.5 11 16.5C11 13.5 11.4477 12.5 12 12.5C12.5523 12.5 13 13.5 13 16.5C13 19.5 12.5523 22 12 22Z" fill="#cc7d5c" />
                            <path d="M22 12C22 11.4477 19.5 11 16.5 11C13.5 11 12.5 11.4477 12.5 12C12.5 12.5523 13.5 13 16.5 13C19.5 13 22 12.5523 22 12Z" fill="#cc7d5c" />
                            <path d="M2 12C2 12.5523 4.5 13 7.5 13C10.5 13 11.5 12.5523 11.5 12C11.5 11.4477 10.5 11 7.5 11C4.5 11 2 11.4477 2 12Z" fill="#cc7d5c" />
                            <path d="M4.92896 4.92896C5.31948 4.53843 7.21444 6.21444 9.33576 8.33576C11.4571 10.4571 11.728 11.2358 11.3374 11.6263C10.9469 12.0169 10.1682 11.746 8.04692 9.62468C5.9256 7.50336 4.53843 5.31948 4.92896 4.92896Z" fill="#cc7d5c" />
                            <path d="M19.071 19.071C18.6805 19.4616 16.7856 17.7856 14.6642 15.6642C12.5429 13.5429 12.272 12.7642 12.6626 12.3737C13.0531 11.9831 13.8318 12.254 15.9531 14.3753C18.0744 16.4966 19.4616 18.6805 19.071 19.071Z" fill="#cc7d5c" />
                            <path d="M19.071 4.92896C19.4616 5.31948 17.7856 7.21444 15.6642 9.33576C13.5429 11.4571 12.7642 11.728 12.3737 11.3374C11.9831 10.9469 12.254 10.1682 14.3753 8.04692C16.4966 5.9256 18.6805 4.53843 19.071 4.92896Z" fill="#cc7d5c" />
                            <path d="M4.92896 19.071C4.53843 18.6805 6.21444 16.7856 8.33576 14.6642C10.4571 12.5429 11.2358 12.272 11.6263 12.6626C12.0169 13.0531 11.746 13.8318 9.62468 15.9531C7.50336 18.0744 5.31948 19.4616 4.92896 19.071Z" fill="#cc7d5c" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* MESSAGE BUBBLE - RENDERS DATABASE VALUE FIRST */}
                    <div className="flex-1 min-w-0">
                      <div className={`px-3 py-2.5 rounded-xl ${
                        isUser 
                          ? "bg-[#262626] border border-[#303030] text-gray-100 float-right text-right" 
                          : "text-gray-250 text-left bg-transparent"
                      }`}>
                        
                        {/* Render parsed HTML markdown cleanly and interactively */}
                        {isUser ? (
                          <p className="whitespace-pre-wrap text-xs md:text-sm leading-relaxed select-text">{msg.content}</p>
                        ) : (
                          (() => {
                            let textContent = msg.content;
                            try {
                              const parsed = JSON.parse(msg.content);
                              if (parsed.explain) {
                                textContent = parsed.explain;
                              }
                            } catch (e) {
                              // Not JSON, fallback to standard markdown rendering
                            }
                            
                            return (
                              <div className="space-y-4">
                                <div className="text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(textContent) }} />
                                {msg.videoUrl && (
                                  <div className="mt-2 rounded-lg overflow-hidden border border-[#333] bg-black">
                                    <video 
                                      src={msg.videoUrl} 
                                      loop
                                      autoPlay
                                      muted
                                      playsInline
                                      className="w-full max-h-80 object-contain"
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })()
                        )}

                        <div className="text-[9px] text-gray-550 mt-1.5 font-mono opacity-60">
                          {new Date(msg.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* SAVING IN DATABASE AND QUERYING VISUAL STATE */}
              {isLoading && (
                <div id="ai-typing-indicator" className="flex gap-3 items-start">
                  <div className="shrink-0">
                    <div className="w-6 h-6 rounded-full bg-[#cc7d5c]/15 text-[#cc7d5c] flex items-center justify-center border border-[#cc7d5c]/20">
                      <div className="w-3 h-3 border-2 border-t-transparent border-[#cc7d5c] rounded-full animate-spin"></div>
                    </div>
                  </div>
                  <div className="flex-1 mt-1.5">
                    <div className="flex items-center gap-1.5 font-mono text-xs text-gray-500">
                      <span>Writing statement in JSON database, querying Gemini API ...</span>
                    </div>
                    <div className="flex gap-1.5 mt-3">
                      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"></span>
                      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce delay-75"></span>
                      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce delay-150"></span>
                    </div>
                  </div>
                </div>
              )}

              {apiError && (
                <div className="p-4 bg-red-950/20 border border-red-900/50 rounded-xl text-xs text-red-300 font-mono">
                  ⚠️ {apiError}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* PERSISTENT FLOATING SEARCH INPUT ON ACTIVE CONVERSATIONS CHAT BOX */}
        {currentChatDetail && (
          <div className="p-4 md:p-6 border-t border-[#2c2c2c] bg-[#191919] shrink-0 z-10">
            <div className="max-w-3xl mx-auto">
              <div className="w-full bg-[#222] border border-[#2c2c2c] rounded-2xl p-3 shadow-xl transition-all focus-within:border-[#444]">
                <textarea 
                  id="active-prompt-textarea"
                  ref={textareaRef}
                  placeholder="Reply to Claude..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  className="w-full bg-transparent border-0 text-white placeholder-gray-500 focus:outline-none resize-none font-sans text-sm md:text-base leading-relaxed"
                />

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#2d2d2d] text-gray-550">
                  <div className="flex items-center gap-3 text-gray-500">
                    <button className="p-1 hover:bg-[#2c2c2c] rounded hover:text-white transition-colors" title="Attach Files">
                      <Paperclip size={14} />
                    </button>
                    <span className="text-[10px] font-mono text-gray-550 select-none">
                      Active Session: {activeModel}
                    </span>
                  </div>

                  <button 
                    id="active-prompt-submit-btn"
                    onClick={() => handleSubmitMessage()}
                    disabled={!inputValue.trim() || isLoading}
                    className={`p-1.5 rounded-lg text-white transition-all ${
                      inputValue.trim() ? "bg-[#cc7d5c] hover:bg-[#b86e4e] cursor-pointer" : "bg-[#2c2c2c] text-gray-600 cursor-not-allowed"
                    }`}
                  >
                    <ArrowUp size={14} />
                  </button>
                </div>
              </div>
              <div className="text-center text-[10px] mt-2.5 text-gray-500">
                Claude can make mistakes. Please verify important information in the server database.
              </div>
            </div>
          </div>
        )}

      </main>

    </div>
  );
}
