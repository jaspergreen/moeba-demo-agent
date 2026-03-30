import { tool } from 'ai';
import { z } from 'zod';
import { OAuthConnect, MoebaApiError } from 'moeba-sdk';
import type { ToolContext } from './context.js';
import { getMoebaClient } from './moeba.js';

const OFFICE365_SCOPES = [
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/Calendars.Read',
  'offline_access',
];

function promptMicrosoftConnect(toolCtx: ToolContext): string {
  toolCtx.pendingComponents.push(
    OAuthConnect.office365({
      description: 'Connect your Microsoft account for email and calendar access',
      scopes: OFFICE365_SCOPES,
    }),
  );
  return 'I need access to your Microsoft account. Please tap the "Connect Microsoft 365" button below to authorize.';
}

export function buildOffice365Tools(toolCtx: ToolContext) {
  const moeba = getMoebaClient();

  return {
    office365_search: tool({
      description: `Search Outlook/Office 365 emails. Returns subject, sender, date, snippet, and message ID.
Use structured parameters (keywords, from, subject) when possible.
Use the message ID from results to read full email content with office365_read.`,
      parameters: z.object({
        keywords: z.array(z.string()).optional().describe('Keywords to search for (combined with OR)'),
        from: z.string().optional().describe('Filter by sender email or name'),
        subject: z.string().optional().describe('Filter by subject keywords'),
        query: z.string().optional().describe('Raw search query. Only use if structured params are insufficient.'),
        maxResults: z.number().min(1).max(20).default(5).describe('Number of results (1-20, default 5)'),
      }),
      execute: async ({ keywords, from, subject, query, maxResults }) => {
        try {
          const result = await moeba.searchEmail(toolCtx.connectionId, {
            keywords, from, subject, query, maxResults, platform: 'outlook',
          });
          if ('error' in result) return `Error: ${(result as any).message}`;
          if (!result.messages.length) return `No emails found for "${query}".`;

          const summaries = result.messages.map(
            (m) => `- **${m.subject}** from ${m.from} (${m.date}) [id: ${m.id}]`,
          );
          return `Found ${result.totalResults} results:\n\n${summaries.join('\n')}\n\nUse office365_read with the [id] to read full content.`;
        } catch (err) {
          if (err instanceof MoebaApiError && err.needsOAuth) return promptMicrosoftConnect(toolCtx);
          return `Error: ${(err as any).message || 'Unknown error'}`;
        }
      },
    }),

    office365_read: tool({
      description: `Read a specific Outlook/Office 365 email in full. REQUIRES a valid message ID from office365_search.
DO NOT guess message IDs — always get them from search results first.`,
      parameters: z.object({
        messageId: z.string().describe('The message ID from office365_search results. Never guess this.'),
      }),
      execute: async ({ messageId }) => {
        try {
          const msg = await moeba.readEmail(toolCtx.connectionId, { messageId, platform: 'outlook' });
          if ('error' in msg) return `Error: ${(msg as any).message}`;

          return `**${msg.subject}**\nFrom: ${msg.from}\nTo: ${msg.to}\nDate: ${msg.date}\n\n${msg.body}`;
        } catch (err) {
          if (err instanceof MoebaApiError && err.needsOAuth) return promptMicrosoftConnect(toolCtx);
          return `Error: ${(err as any).message || 'Unknown error'}`;
        }
      },
    }),

    office365_send: tool({
      description: `Send an email via Outlook/Office 365.
IMPORTANT: "to" must be a valid email address (e.g. user@example.com), NOT a display name.`,
      parameters: z.object({
        to: z.string().describe('Recipient email address (must be valid, e.g. user@example.com)'),
        subject: z.string().describe('Email subject line. For replies, prefix with "Re: "'),
        body: z.string().describe('Email body in plain text'),
      }),
      execute: async ({ to, subject, body }) => {
        try {
          const result = await moeba.sendEmail(toolCtx.connectionId, { to, subject, body, platform: 'outlook' });
          if ('error' in result) return `Error: ${(result as any).message}`;
          return `Email sent to ${to} with subject "${subject}".`;
        } catch (err) {
          if (err instanceof MoebaApiError && err.needsOAuth) return promptMicrosoftConnect(toolCtx);
          return `Error: ${(err as any).message || 'Unknown error'}`;
        }
      },
    }),
  };
}
