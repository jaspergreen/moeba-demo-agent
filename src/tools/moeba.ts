import { MoebaClient } from 'moeba-sdk';
import { config } from '../config.js';

let client: MoebaClient | null = null;

export function getMoebaClient(): MoebaClient {
  if (!client) {
    client = new MoebaClient({
      apiKey: config.moeba.apiKey,
      baseUrl: config.moeba.baseUrl,
    });
  }
  return client;
}
