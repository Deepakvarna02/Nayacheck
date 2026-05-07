import Anthropic from '@anthropic-ai/sdk';
import { retry } from '../../utils/retry';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';

const client = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;

export interface ClaudeCallOptions {
  systemPrompt: string;
  userMessage: string;
  imageBase64?: string;
  maxTokens?: number;
  sessionId: string;
  callType: 'criteria' | 'evidence' | 'decision' | 'audit';
}

export async function callClaude(options: ClaudeCallOptions): Promise<string> {
  const { systemPrompt, userMessage, imageBase64, maxTokens = 4096, sessionId, callType } = options;

  if (!client) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const content: Anthropic.MessageParam['content'] = imageBase64
    ? [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 }
        },
        { type: 'text', text: userMessage }
      ]
    : userMessage;

  logger.info({ sessionId, callType, stage: 'claude_call_start' });

  const response = await retry(
    () =>
      client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content }]
      }),
    { retries: 3, backoffMs: 1000 }
  );

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as Anthropic.TextBlock).text)
    .join('');

  logger.info({
    sessionId,
    callType,
    stage: 'claude_call_complete',
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens
  });

  return text;
}

export function parseJsonResponse<T>(raw: string, schema: { parse: (value: unknown) => T }): T {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
  return schema.parse(JSON.parse(cleaned));
}
