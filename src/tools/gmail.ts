import { tool } from 'ai';
import { z } from 'zod';
import { OAuthConnect, MoebaApiError } from 'moeba-sdk';
import type { ToolContext } from './context.js';
import { getMoebaClient } from './moeba.js';

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

function promptGmailConnect(toolCtx: ToolContext): string {
  toolCtx.pendingComponents.push(
    OAuthConnect.gmail({
      description: 'Connect your Google account for Gmail and Calendar access',
      scopes: GMAIL_SCOPES,
    }),
  );
  return 'I need access to your Google account. Please tap the "Connect Google" button below to authorize.';
}

export function buildGmailTools(toolCtx: ToolContext) {
  const moeba = getMoebaClient();

  return {
    gmail_search: tool({
      description: `Search Gmail messages. Returns subject, sender, date, snippet, and message ID for each result.
Use structured parameters (keywords, from, subject, newer_than) instead of raw query when possible.
IMPORTANT: Use the message ID from results to read full email content with gmail_read.`,
      parameters: z.object({
        keywords: z.array(z.string()).optional().describe('Keywords to search for (combined with OR). E.g. ["invoice", "payment", "receipt"]'),
        from: z.string().optional().describe('Filter by sender email or name'),
        subject: z.string().optional().describe('Filter by subject keywords'),
        newer_than: z.string().optional().describe('How far back to search: "1d" (1 day), "7d" (1 week), "30d" (1 month). Default: 7d if not specified.'),
        after: z.string().optional().describe('Emails after this date (YYYY-MM-DD)'),
        before: z.string().optional().describe('Emails before this date (YYYY-MM-DD)'),
        is_unread: z.boolean().optional().describe('Only unread emails'),
        has_attachment: z.boolean().optional().describe('Only emails with attachments'),
        query: z.string().optional().describe('Raw Gmail search query. Only use if structured params are insufficient.'),
        maxResults: z.number().min(1).max(20).default(5).describe('Number of results (1-20, default 5)'),
      }),
      execute: async ({ keywords, from, subject, newer_than, after, before, is_unread, has_attachment, query, maxResults }) => {
        try {
          const result = await moeba.searchEmail(toolCtx.connectionId, {
            keywords, from, subject, newer_than: newer_than || (query ? undefined : '7d'),
            after, before, is_unread, has_attachment, query, maxResults, platform: 'gmail',
          });
          if ('error' in result) return `Error: ${(result as any).message}`;
          if (!result.messages.length) return `No emails found for "${query}". Try a broader search (e.g. newer_than:7d or newer_than:30d).`;

          const summaries = result.messages.map(
            (m) => `- **${m.subject}** from ${m.from} (${m.date}) [id: ${m.id}]`,
          );
          return `Found ${result.totalResults} results for "${query}":\n\n${summaries.join('\n')}\n\nUse gmail_read with the [id] to read full content.`;
        } catch (err) {
          if (err instanceof MoebaApiError && err.needsOAuth) return promptGmailConnect(toolCtx);
          return `Error: ${(err as any).message || 'Unknown error'}`;
        }
      },
    }),

    gmail_read: tool({
      description: `Read a specific Gmail message in full. REQUIRES a valid message ID from gmail_search results.
DO NOT make up or guess message IDs — always get them from gmail_search first.
Returns subject, from (with email address), to, date, and full body text.`,
      parameters: z.object({
        messageId: z.string().describe('The Gmail message ID from gmail_search results (e.g. "19d3dc40f8143f46"). Never guess this — always use IDs from search results.'),
      }),
      execute: async ({ messageId }) => {
        try {
          const msg = await moeba.readEmail(toolCtx.connectionId, { messageId, platform: 'gmail' });
          if ('error' in msg) return `Error: ${(msg as any).message}`;

          // Extract email address from "Name <email>" format for easy reply
          const emailMatch = msg.from.match(/<([^>]+)>/);
          const fromEmail = emailMatch ? emailMatch[1] : msg.from;

          return `**${msg.subject}**\nFrom: ${msg.from}\nFrom email: ${fromEmail}\nTo: ${msg.to}\nDate: ${msg.date}\n\n${msg.body}`;
        } catch (err) {
          if (err instanceof MoebaApiError && err.needsOAuth) return promptGmailConnect(toolCtx);
          return `Error: ${(err as any).message || 'Unknown error'}`;
        }
      },
    }),

    gmail_contacts: tool({
      description: `Look up contacts by name or email. Extracts real people from the user's sent mail (not spam/noreply).
Use this to resolve names to email addresses before sending email.
E.g. user says "email dana" → use gmail_contacts({ search: "dana" }) to find "Dana Jedrisko <danaj@payinc.co.za>"`,
      parameters: z.object({
        search: z.string().optional().describe('Name or partial email to search for (e.g. "dana", "john", "google")'),
        maxResults: z.number().min(1).max(50).default(10).describe('Number of contacts to return'),
      }),
      execute: async ({ search, maxResults }) => {
        try {
          const result = await moeba.getContacts(toolCtx.connectionId, { search, maxResults, platform: 'gmail' });
          if ('error' in result) return `Error: ${(result as any).message}`;
          if (!result.contacts.length) return `No contacts found${search ? ` matching "${search}"` : ''}.`;

          const list = result.contacts.map(
            (c) => `- ${c.name} <${c.email}>`,
          );
          return `Found ${result.contacts.length} contacts:\n\n${list.join('\n')}`;
        } catch (err) {
          if (err instanceof MoebaApiError && err.needsOAuth) return promptGmailConnect(toolCtx);
          return `Error: ${(err as any).message || 'Unknown error'}`;
        }
      },
    }),

    gmail_send: tool({
      description: `Send an email via Gmail.
IMPORTANT: "to" must be a valid email address (e.g. user@example.com), NOT a display name.
If you only have a name, use gmail_contacts first to find the email address.
If replying to an email, use gmail_read to get the sender's email address.`,
      parameters: z.object({
        to: z.string().describe('Recipient email address (must be valid, e.g. user@example.com). Get this from gmail_read results if replying.'),
        subject: z.string().describe('Email subject line. For replies, prefix with "Re: "'),
        body: z.string().describe('Email body in plain text'),
      }),
      execute: async ({ to, subject, body }) => {
        try {
          const result = await moeba.sendEmail(toolCtx.connectionId, { to, subject, body, platform: 'gmail' });
          if ('error' in result) return `Error: ${(result as any).message}`;
          return `Email sent to ${to} with subject "${subject}".`;
        } catch (err) {
          if (err instanceof MoebaApiError && err.needsOAuth) return promptGmailConnect(toolCtx);
          return `Error: ${(err as any).message || 'Unknown error'}`;
        }
      },
    }),
  };
}
