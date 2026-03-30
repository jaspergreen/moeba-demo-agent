import type { StorageAdapter } from './adapter.js';
import type { ConversationMessage } from './types.js';

/**
 * In-memory storage adapter. Works out of the box — no database needed.
 * Data is lost on restart. Perfect for demos and development.
 */
export class InMemoryAdapter implements StorageAdapter {
  private history = new Map<string, ConversationMessage[]>();
  private kv = new Map<string, string>();

  // --- History ---

  async getHistory(sessionId: string): Promise<ConversationMessage[]> {
    return this.history.get(sessionId) ?? [];
  }

  async appendHistory(sessionId: string, messages: ConversationMessage[]): Promise<void> {
    const existing = this.history.get(sessionId) ?? [];
    existing.push(...messages);
    // Keep last 50 messages to avoid unbounded growth
    if (existing.length > 50) {
      this.history.set(sessionId, existing.slice(-50));
    } else {
      this.history.set(sessionId, existing);
    }
  }

  async clearHistory(sessionId: string): Promise<void> {
    this.history.delete(sessionId);
  }

  // --- Key-Value ---

  async get(key: string): Promise<string | null> {
    return this.kv.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.kv.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.kv.delete(key);
  }
}
