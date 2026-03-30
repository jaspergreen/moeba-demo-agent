import type { Component } from 'moeba-sdk';

/**
 * Shared context passed to all tools during a single agent invocation.
 *
 * Tools can't directly attach SDUI components (workflows, OAuth buttons) to the
 * Vercel AI SDK response — they return text strings to the LLM. Instead, tools
 * push components onto `pendingComponents`, and the handler attaches them to the
 * final JSON-RPC response after generateText() completes.
 */
export interface ToolContext {
  /** Components to attach to the response (workflows, OAuth buttons, secret inputs) */
  pendingComponents: Component[];
  /** Whether to escalate this conversation to a human operator */
  escalateToOperator: boolean;
  /** The user's email (from Moeba context) */
  userId: string;
  /** Moeba connection ID — used for proxy API calls */
  connectionId: string;
}

export function createToolContext(userId: string, connectionId: string): ToolContext {
  return {
    pendingComponents: [],
    escalateToOperator: false,
    userId,
    connectionId,
  };
}
