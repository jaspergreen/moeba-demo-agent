import { generateText, type CoreMessage } from 'ai';
import { getModel } from './config.js';
import type { StorageAdapter } from './storage/adapter.js';
import { createToolContext } from './tools/context.js';
import { buildGmailTools } from './tools/gmail.js';
import { buildCalendarTools } from './tools/calendar.js';
import { buildDemoTools } from './tools/demo.js';
import { buildOffice365Tools } from './tools/office365.js';
import { SYSTEM_PROMPT } from './system-prompt.js';
import type { Component } from 'moeba-sdk';

export interface AgentResult {
  text: string;
  components: Component[];
  escalateToOperator: boolean;
}

export async function runAgent(
  userMessage: string,
  sessionId: string,
  userId: string,
  connectionId: string,
  storage: StorageAdapter,
): Promise<AgentResult> {
  const toolCtx = createToolContext(userId, connectionId);

  // Load conversation history
  const history = await storage.getHistory(sessionId);
  const messages: CoreMessage[] = [
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userMessage },
  ];

  const allTools = {
    ...buildDemoTools(toolCtx),
    ...buildGmailTools(toolCtx),
    ...buildCalendarTools(toolCtx),
    ...buildOffice365Tools(toolCtx),
  };

  const result = await generateText({
    model: getModel(),
    system: SYSTEM_PROMPT,
    messages,
    tools: allTools,
    maxSteps: 8,
  });

  // Persist conversation
  const now = Date.now();
  await storage.appendHistory(sessionId, [
    { role: 'user', content: userMessage, timestamp: now },
    { role: 'assistant', content: result.text, timestamp: now },
  ]);

  return {
    text: result.text,
    components: toolCtx.pendingComponents,
    escalateToOperator: toolCtx.escalateToOperator,
  };
}
