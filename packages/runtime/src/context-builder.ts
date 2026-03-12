import type { Email, LLMMessage, AgentSpec } from '@kube-agents/core';

const MAX_THREAD_MESSAGES = 20;

export function buildContext(
  spec: AgentSpec,
  email: Email,
  threadHistory: Email[],
): LLMMessage[] {
  const messages: LLMMessage[] = [];

  // System prompt
  messages.push({
    role: 'system',
    content: spec.system,
  });

  // Thread history (oldest first, capped)
  const history = threadHistory.slice(-MAX_THREAD_MESSAGES);
  for (const msg of history) {
    const isFromSelf = msg.from === spec.identity.email;
    messages.push({
      role: isFromSelf ? 'assistant' : 'user',
      content: formatEmailContent(msg),
    });
  }

  // Current email (if not already in history)
  const alreadyInHistory = history.some((m) => m.id === email.id);
  if (!alreadyInHistory) {
    messages.push({
      role: 'user',
      content: formatEmailContent(email),
    });
  }

  return messages;
}

function formatEmailContent(email: Email): string {
  const parts = [
    `From: ${email.from}`,
    `Subject: ${email.subject}`,
    '',
    email.body,
  ];

  if (email.attachments.length > 0) {
    parts.push('', `[${email.attachments.length} attachment(s)]`);
  }

  return parts.join('\n');
}
