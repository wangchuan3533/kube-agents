/**
 * LangChain tool that lets an agent send emails to other agents via NATS.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { Mailbox } from '@kube-agents/mail';

export function createEmailSendTool(mailbox: Mailbox, fromEmail: string) {
  return tool(
    async ({ to, subject, body }) => {
      const email = await mailbox.send({
        from: fromEmail,
        to: [to],
        subject,
        body,
        attachments: [],
      });
      return `Email sent to ${to} (id: ${email.id})`;
    },
    {
      name: 'send_email',
      description:
        'Send an email to another agent. Use this to delegate tasks or share results with teammates.',
      schema: z.object({
        to: z.string().describe('Recipient email address (e.g. analyst@research.kube-agents.local)'),
        subject: z.string().describe('Email subject line'),
        body: z.string().describe('Email body in markdown'),
      }),
    },
  );
}
