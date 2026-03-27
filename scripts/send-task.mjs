/**
 * Send a demo task email to an agent via NATS.
 * Usage: node scripts/send-task.mjs
 */
import { createNatsConnection, Mailbox } from '../packages/mail/dist/index.js';

const NATS_URL = process.env['NATS_URL'] ?? 'nats://localhost:4222';

const nc = await createNatsConnection({ servers: NATS_URL, name: 'task-sender' });

const mailbox = new Mailbox({
  identity: {
    name: 'user',
    email: 'user@agents.mycompany.com',
    groups: [],
  },
  nc,
});

await mailbox.init();

const email = await mailbox.send({
  from: 'user@agents.mycompany.com',
  to: ['orchestrator@agents.mycompany.com'],
  subject: 'Task: Write a fizzbuzz utility',
  body: `Please coordinate the engineering team to:

1. Have the code agent write a TypeScript fizzbuzz function in /workspace/src/fizzbuzz.ts
   - The function should take a number n and return an array of strings for 1..n
   - Numbers divisible by 3 → "Fizz", by 5 → "Buzz", by both → "FizzBuzz", otherwise the number as string

2. Have the reviewer agent review the code for correctness and best practices

3. If the reviewer has feedback, send it back to the code agent for fixes

Report back to me when the task is complete.`,
  attachments: [],
});

console.log(`Sent task email: ${email.id}`);
console.log(`Subject: ${email.subject}`);
console.log(`To: ${email.to.join(', ')}`);

await mailbox.close();
await nc.close();
