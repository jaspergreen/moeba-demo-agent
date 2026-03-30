import type { ConversationMessage } from './types.js';

/**
 * Database-agnostic storage interface.
 *
 * Ship with InMemoryAdapter (zero deps, works out of the box).
 * Swap to Firebase, Postgres, MongoDB, SQLite, etc. by implementing this interface.
 *
 * Note: OAuth tokens are managed by Moeba's proxy — the agent doesn't store them.
 */
export interface StorageAdapter {
  // --- Conversation history (keyed by sessionId) ---
  getHistory(sessionId: string): Promise<ConversationMessage[]>;
  appendHistory(sessionId: string, messages: ConversationMessage[]): Promise<void>;
  clearHistory(sessionId: string): Promise<void>;

  // --- Generic key-value (for secrets, user prefs, etc.) ---
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}
