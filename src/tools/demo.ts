import { tool } from 'ai';
import { z } from 'zod';
import { WorkflowBuilder, OAuthConnect, SecretInput } from 'moeba-sdk';
import type { ToolContext } from './context.js';

export function buildDemoTools(toolCtx: ToolContext) {
  return {
    connect_google: tool({
      description: 'Show a "Connect Google" OAuth button for Gmail and Calendar access. Use when the user asks to connect Gmail, Google, email, or calendar.',
      parameters: z.object({}),
      execute: async () => {
        toolCtx.pendingComponents.push(
          OAuthConnect.gmail({
            description: 'Connect your Google account for Gmail and Calendar access',
            scopes: [
              'https://www.googleapis.com/auth/gmail.readonly',
              'https://www.googleapis.com/auth/gmail.send',
              'https://www.googleapis.com/auth/calendar.readonly',
              'https://www.googleapis.com/auth/calendar.events',
            ],
          }),
        );
        return 'Showing the Google OAuth connect button. The user can tap it to authorize Gmail and Calendar access.';
      },
    }),

    connect_microsoft: tool({
      description: 'Show a "Connect Microsoft 365" OAuth button for Outlook email access. Use when the user asks to connect Microsoft, Outlook, or Office 365.',
      parameters: z.object({}),
      execute: async () => {
        toolCtx.pendingComponents.push(
          OAuthConnect.office365({
            description: 'Connect your Microsoft account for email and calendar access',
            scopes: [
              'https://graph.microsoft.com/Mail.Read',
              'https://graph.microsoft.com/Mail.Send',
              'https://graph.microsoft.com/Calendars.Read',
              'offline_access',
            ],
          }),
        );
        return 'Showing the Microsoft 365 OAuth connect button.';
      },
    }),

    show_feedback_workflow: tool({
      description: 'Show a feedback form demo. Use when the user asks to see a demo, workflow, or form.',
      parameters: z.object({}),
      execute: async () => {
        toolCtx.pendingComponents.push(
          WorkflowBuilder.create('Moeba Feedback', 'DEMO')
            .select('rating', 'How are you finding Moeba?', [
              { label: 'Love it!', value: 'love' },
              { label: 'Pretty good', value: 'good' },
              { label: 'Just exploring', value: 'exploring' },
              { label: 'Needs work', value: 'needs_work' },
            ], { description: 'Rate your experience so far' })
            .select('useCase', 'What would you use Moeba for?', [
              { label: 'Customer support', value: 'support' },
              { label: 'Appointments & booking', value: 'booking' },
              { label: 'Data collection & forms', value: 'forms' },
              { label: 'Internal tools', value: 'internal' },
              { label: 'Just curious', value: 'curious' },
            ])
            .textarea('feedback', 'Any other thoughts?', {
              description: 'Tell us what you think',
              required: false,
              canSkip: true,
              placeholder: 'Your feedback...',
            })
            .build(),
        );
        return 'Showing the feedback workflow. This demonstrates multi-step forms with select options and free text.';
      },
    }),

    show_booking_workflow: tool({
      description: 'Show a restaurant booking form demo with date picker, number input, and time selection.',
      parameters: z.object({}),
      execute: async () => {
        toolCtx.pendingComponents.push(
          WorkflowBuilder.create('Restaurant Booking', 'BOOK')
            .date('date', 'When would you like to dine?')
            .number('guests', 'How many guests?', { placeholder: '2' })
            .select('time', 'Preferred time', [
              { label: '12:00 - Lunch', value: '12:00' },
              { label: '13:00 - Lunch', value: '13:00' },
              { label: '18:00 - Dinner', value: '18:00' },
              { label: '19:00 - Dinner', value: '19:00' },
              { label: '20:00 - Dinner', value: '20:00' },
            ])
            .text('name', 'Name for the reservation', { placeholder: 'Your name' })
            .textarea('dietary', 'Any dietary requirements?', {
              required: false,
              canSkip: true,
              placeholder: 'e.g. vegetarian, allergies...',
            })
            .build(),
        );
        return 'Showing the booking workflow. This demonstrates date pickers, number inputs, and multi-step forms.';
      },
    }),

    show_support_workflow: tool({
      description: 'Show a support ticket form demo with photo upload and location sharing.',
      parameters: z.object({}),
      execute: async () => {
        toolCtx.pendingComponents.push(
          WorkflowBuilder.create('Support Request', 'SUP')
            .select('category', 'What do you need help with?', [
              { label: 'Damaged item', value: 'damaged' },
              { label: 'Missing delivery', value: 'missing' },
              { label: 'Wrong item received', value: 'wrong_item' },
              { label: 'Other', value: 'other' },
            ])
            .textarea('description', 'Describe the issue', { placeholder: 'What happened?' })
            .photo('photo', 'Upload a photo', {
              description: 'Take a photo or choose from your gallery',
              required: false,
              canSkip: true,
              maxCount: 3,
            })
            .location('location', 'Share your location', {
              description: 'This helps us find your nearest service point',
              required: false,
              canSkip: true,
            })
            .email('contactEmail', 'Your email', {
              description: 'So we can follow up with you',
              placeholder: 'you@example.com',
            })
            .build(),
        );
        return 'Showing the support workflow. This demonstrates photo capture, location sharing, and guided data collection.';
      },
    }),

    show_secret_input: tool({
      description: 'Show a secure API key input demo. Demonstrates how agents can collect sensitive data without Moeba seeing it.',
      parameters: z.object({}),
      execute: async () => {
        toolCtx.pendingComponents.push(
          SecretInput.create('demo-api-key', 'API Key', {
            description: 'Enter any value — this is a demo of secure input. The value is encrypted end-to-end.',
          }),
        );
        return 'Showing the secure input widget. This demonstrates how Moeba handles sensitive data collection.';
      },
    }),

    escalate_to_operator: tool({
      description: 'Hand this conversation to a human operator. Use when the user asks to speak with a real person.',
      parameters: z.object({
        reason: z.string().optional().describe('Reason for escalation'),
      }),
      execute: async ({ reason }) => {
        toolCtx.escalateToOperator = true;
        return `Escalating to a human operator${reason ? `: ${reason}` : ''}. In a production agent, an operator would be notified and can take over the conversation.`;
      },
    }),
  };
}
