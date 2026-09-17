import { env } from "@/lib/env";
import { httpFetch } from "@/lib/http";
import { log } from "@/lib/logger";
import { AppError } from "@/lib/errors";

// AI provider abstraction. AI is optional: every feature degrades to a clear
// "configure a provider" state. Never blocks core functionality.
//
// Providers: anthropic, openai, gemini (REST only — no SDK dependencies).

export type AIProviderName = "anthropic" | "openai" | "gemini";

export interface AICompletion {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AIProvider {
  name: AIProviderName;
  model: string;
  complete(system: string, user: string, maxTokens?: number): Promise<AICompletion>;
}

function apiKeyFor(name: AIProviderName): string {
  switch (name) {
    case "anthropic":
      return env.ANTHROPIC_API_KEY;
    case "openai":
      return env.OPENAI_API_KEY;
    case "gemini":
      return env.GEMINI_API_KEY;
  }
}

export function isAIEnabled(): boolean {
  if (!env.AI_PROVIDER) return false;
  return Boolean(apiKeyFor(env.AI_PROVIDER));
}

const MODELS: Record<AIProviderName, string> = {
  anthropic: "claude-3-5-haiku-latest",
  openai: "gpt-4o-mini",
  gemini: "gemini-1.5-flash",
};

function modelFor(name: AIProviderName): string {
  const override =
    name === "anthropic" ? process.env.ANTHROPIC_MODEL : name === "openai" ? process.env.OPENAI_MODEL : process.env.GEMINI_MODEL;
  return override?.trim() || MODELS[name];
}

class AnthropicProvider implements AIProvider {
  name = "anthropic" as const;
  model = modelFor("anthropic");
  async complete(system: string, user: string, maxTokens = 1024): Promise<AICompletion> {
    const res = await httpFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: this.model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) throw new AppError(`Anthropic API error: ${res.status} ${res.body.slice(0, 200)}`, 502, "AI_ERROR");
    const data = JSON.parse(res.body) as {
      content?: { text?: string }[];
      usage?: { input_tokens: number; output_tokens: number };
    };
    return {
      text: data.content?.[0]?.text ?? "",
      model: this.model,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    };
  }
}

class OpenAIProvider implements AIProvider {
  name = "openai" as const;
  model = modelFor("openai");
  async complete(system: string, user: string, maxTokens = 1024): Promise<AICompletion> {
    const res = await httpFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: maxTokens }),
    });
    if (!res.ok) throw new AppError(`OpenAI API error: ${res.status} ${res.body.slice(0, 200)}`, 502, "AI_ERROR");
    const data = JSON.parse(res.body) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    return {
      text: data.choices?.[0]?.message?.content ?? "",
      model: this.model,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };
  }
}

class GeminiProvider implements AIProvider {
  name = "gemini" as const;
  model = modelFor("gemini");
  async complete(system: string, user: string, maxTokens = 1024): Promise<AICompletion> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${env.GEMINI_API_KEY}`;
    const res = await httpFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });
    if (!res.ok) throw new AppError(`Gemini API error: ${res.status} ${res.body.slice(0, 200)}`, 502, "AI_ERROR");
    const data = JSON.parse(res.body) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
    };
    return {
      text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
      model: this.model,
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }
}

export function getAIProvider(): AIProvider {
  if (!isAIEnabled()) {
    throw new AppError("No AI provider configured. Set AI_PROVIDER and the matching API key in .env.", 400, "AI_NOT_CONFIGURED");
  }
  switch (env.AI_PROVIDER) {
    case "anthropic":
      return new AnthropicProvider();
    case "openai":
      return new OpenAIProvider();
    case "gemini":
      return new GeminiProvider();
    default:
      throw new AppError("Unsupported AI provider", 500, "AI_CONFIG");
  }
}