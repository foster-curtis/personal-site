"use client";

import { useState, useMemo } from "react";
import ChatMessage from "@/components/chat/ChatMessage";
import PromptMarquee from "@/components/chat/PromptMarquee";
import { getPromptsForMarquee } from "@/lib/chat/prompts";
import { trackChatMessage, trackChatResponse } from "@/lib/analytics";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Get prompts for the marquee
  const promptRows = useMemo(() => getPromptsForMarquee(), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const messageText = input;
    const userMessage: Message = { role: "user", content: messageText };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Track chat message sent
    trackChatMessage(messageText.length);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: messageText }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();
      const assistantMessage: Message = {
        role: "assistant",
        content: data.response,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Track chat response received
      trackChatResponse(data.response.length, data.sources?.length || 0);
    } catch (error) {
      console.error("Error:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePromptClick = (prompt: string) => {
    setInput(prompt);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          Chat with AI
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Ask questions about Foster&apos;s experience, skills, and background.
        </p>
      </div>

      {/* Prompt marquee - show when no messages */}
      {messages.length === 0 && (
        <div className="mb-6">
          <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center mb-2">
            Click a suggestion or type your own question
          </p>
          <PromptMarquee
            promptRows={promptRows}
            onPromptClick={handlePromptClick}
          />
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800">
        {/* Chat messages area */}
        <div className="h-[500px] overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-zinc-400 dark:text-zinc-500 text-center">
                Select a prompt above or type your question below to get started
              </p>
            </div>
          ) : (
            messages.map((message, index) => (
              <ChatMessage key={index} message={message} />
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg px-4 py-2">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Thinking...
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <form
          onSubmit={handleSubmit}
          className="p-4 border-t border-zinc-200 dark:border-zinc-800"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
