import 'dotenv/config';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import type { LanguageModelV1 } from 'ai';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  aiProvider: (process.env.AI_PROVIDER || 'google') as 'google' | 'openai' | 'anthropic',
  aiModel: process.env.AI_MODEL || '',
  moeba: {
    webhookSecret: process.env.MOEBA_WEBHOOK_SECRET || '',
    apiKey: process.env.MOEBA_API_KEY || '',
    baseUrl: process.env.MOEBA_BASE_URL || 'https://moeba-api-999642860678.africa-south1.run.app',
  },
};

/** Resolve the AI model based on config. Swap provider with a single env var change. */
export function getModel(): LanguageModelV1 {
  switch (config.aiProvider) {
    case 'openai':
      return openai(config.aiModel || 'gpt-4o');
    case 'anthropic':
      return anthropic(config.aiModel || 'claude-sonnet-4-20250514');
    case 'google':
    default:
      return google(config.aiModel || 'gemini-2.5-flash');
  }
}
