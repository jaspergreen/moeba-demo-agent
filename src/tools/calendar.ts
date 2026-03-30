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

function promptGoogleConnect(toolCtx: ToolContext): string {
  toolCtx.pendingComponents.push(
    OAuthConnect.gmail({
      description: 'Connect your Google account for Gmail and Calendar access',
      scopes: GMAIL_SCOPES,
    }),
  );
  return 'I need access to your Google account. Please tap the "Connect Google" button below to authorize.';
}

export function buildCalendarTools(toolCtx: ToolContext) {
  const moeba = getMoebaClient();

  return {
    calendar_list_events: tool({
      description: `List upcoming Google Calendar events. Returns event title, start/end times, location, attendees, and event ID.
Defaults to events from now onwards. Use timeMin/timeMax to filter by date range.`,
      parameters: z.object({
        maxResults: z.number().min(1).max(20).default(10).describe('Number of events (1-20, default 10)'),
        timeMin: z.string().optional().describe('Start of time range in ISO 8601 (e.g. "2026-03-30T00:00:00Z"). Defaults to now.'),
        timeMax: z.string().optional().describe('End of time range in ISO 8601 (e.g. "2026-04-06T23:59:59Z"). Omit for no upper bound.'),
      }),
      execute: async ({ maxResults, timeMin, timeMax }) => {
        try {
          const result = await moeba.getCalendar(toolCtx.connectionId, {
            maxResults, timeMin, timeMax, platform: 'google',
          });
          if ('error' in result) return `Error: ${(result as any).message}`;
          if (!result.events.length) return 'No upcoming events found.';

          const events = result.events.map((e) => {
            const location = e.location ? ` (${e.location})` : '';
            const attendees = e.attendees?.length ? ` — ${e.attendees.length} attendees` : '';
            return `- **${e.summary}** — ${formatDateTime(e.start)}${e.end ? ' to ' + formatTime(e.end) : ''}${location}${attendees} [id: ${e.id}]`;
          });

          return `Upcoming events:\n\n${events.join('\n')}`;
        } catch (err) {
          if (err instanceof MoebaApiError && err.needsOAuth) return promptGoogleConnect(toolCtx);
          return `Error: ${(err as any).message || 'Unknown error'}`;
        }
      },
    }),

    calendar_create_event: tool({
      description: `Create a new Google Calendar event.
Times must be ISO 8601 format with timezone (e.g. "2026-04-01T10:00:00+02:00").
Attendee emails must be valid email addresses.`,
      parameters: z.object({
        summary: z.string().describe('Event title'),
        startTime: z.string().describe('Start time in ISO 8601 with timezone (e.g. "2026-04-01T10:00:00+02:00")'),
        endTime: z.string().describe('End time in ISO 8601 with timezone'),
        description: z.string().optional().describe('Event description/notes'),
        location: z.string().optional().describe('Event location (address or place name)'),
        attendees: z.array(z.string()).optional().describe('Email addresses of attendees (must be valid emails)'),
      }),
      execute: async ({ summary, startTime, endTime, description, location, attendees }) => {
        try {
          const result = await moeba.createCalendarEvent(toolCtx.connectionId, {
            summary, startTime, endTime, description, location, attendees, platform: 'google',
          });
          if ('error' in result) return `Error: ${(result as any).message}`;
          return `Event created: "${summary}" on ${formatDateTime(startTime)}${result.htmlLink ? ` — ${result.htmlLink}` : ''}`;
        } catch (err) {
          if (err instanceof MoebaApiError && err.needsOAuth) return promptGoogleConnect(toolCtx);
          return `Error: ${(err as any).message || 'Unknown error'}`;
        }
      },
    }),
  };
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-ZA', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}
