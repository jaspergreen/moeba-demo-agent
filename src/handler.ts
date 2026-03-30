import { WebhookHandler, MoebaClient, type HandlerContext, type AgentAction } from 'moeba-sdk';
import { config } from './config.js';
import { runAgent } from './agent.js';
import type { StorageAdapter } from './storage/adapter.js';

const moeba = new MoebaClient({
  apiKey: config.moeba.apiKey,
  baseUrl: config.moeba.baseUrl,
});

export function createHandler(storage: StorageAdapter): WebhookHandler {
  return new WebhookHandler({
    webhookSecret: config.moeba.webhookSecret,

    onMessage: async (message, ctx) => {
      const userId = ctx.email;
      const connectionId = ctx.connectionId || '';
      const sessionId = ctx.sessionId || connectionId || userId;
      let userText = message.text || 'Hello';

      // Append location context if shared
      if (message.location) {
        userText += `\n[User shared their location: ${message.location.latitude}, ${message.location.longitude}]`;
      }

      // Append attachment info
      if (message.attachments?.length) {
        const attachmentInfo = message.attachments
          .map((a) => `${a.type}: ${a.name || a.url || 'unnamed'}`)
          .join(', ');
        userText += `\n[User attached: ${attachmentInfo}]`;
      }

      try {
        const result = await runAgent(userText, sessionId, userId, connectionId, storage);

        const builder = ctx.reply(result.text);
        for (const component of result.components) {
          builder.withComponent(component);
        }
        if (result.escalateToOperator) {
          builder.escalateToOperator();
        }
        return builder;
      } catch (err: any) {
        console.error('Agent error:', err);
        return ctx.reply("I'm having trouble right now. Please try again in a moment!");
      }
    },

    onAction: async (action: AgentAction, ctx: HandlerContext) => {
      const userId = ctx.email;
      const connectionId = ctx.connectionId || '';
      const sessionId = ctx.sessionId || connectionId || userId;

      // OAuth completion — provider is now connected, continue the user's task
      if ('actionId' in action && action.actionId === 'oauth_complete') {
        const provider = (action as any).data?.provider || 'unknown';

        // Run agent in background — the A2A response goes to the OAuth callback, not the chat
        // So we send the result proactively via moeba.send()
        console.log(`[oauth_complete] Starting background agent for ${provider}, connectionId=${connectionId}, sessionId=${sessionId}`);
        runAgent(
          `[System: User just connected ${provider}. You now have access to their account via the proxy tools. Continue with whatever the user was asking for before the OAuth prompt.]`,
          sessionId,
          userId,
          connectionId,
          storage,
        ).then(async (result) => {
          console.log(`[oauth_complete] Agent result: ${result.text.substring(0, 100)}...`);
          try {
            await moeba.send(connectionId, {
              text: result.text,
              components: result.components,
            });
            console.log('[oauth_complete] Proactive message sent successfully');
          } catch (err) {
            console.error('[oauth_complete] Failed to send proactive message:', err);
          }
        }).catch((err) => {
          console.error('[oauth_complete] Agent error:', err);
        });

        // Return immediately — the real response comes via moeba.send()
        return ctx.reply('');
      }

      // Workflow completion
      if ('type' in action && action.type === 'workflow_completed') {
        const workflowData = (action as any).data || {};
        const workflowName = (action as any).workflowName || 'Unknown';
        const summary = Object.entries(workflowData)
          .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
          .join(', ');

        const result = await runAgent(
          `[System: User completed the "${workflowName}" form with: ${summary}. Acknowledge their submission and explain how Moeba workflows work.]`,
          sessionId,
          userId,
          connectionId,
          storage,
        );
        return ctx.reply(result.text);
      }

      // Secret submission
      if ('actionId' in action && action.actionId === 'secret_submitted') {
        const secretName = (action as any).data?.name || 'unknown';
        return ctx
          .reply(`Got it! Your "${secretName}" has been stored securely. This is Moeba's secure input — it lets agents collect sensitive data without Moeba ever seeing or storing the value.`)
          .secretRef(`secret_${Date.now()}`);
      }

      // Generic action
      return ctx.reply('Action received.');
    },

    onPing: async () => ({ status: 'ok', agent: 'Moeba Demo Agent', version: '2.0' }),
  });
}
