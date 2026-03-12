import { describe, it, expect } from 'vitest';
import { EmailSchema } from './email.js';

describe('EmailSchema', () => {
  it('validates a minimal email', () => {
    const result = EmailSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      from: 'sender@agents.mycompany.com',
      to: ['receiver@agents.mycompany.com'],
      subject: 'Hello',
      body: 'World',
      timestamp: '2025-01-01T00:00:00Z',
    });

    expect(result.from).toBe('sender@agents.mycompany.com');
    expect(result.attachments).toEqual([]);
    expect(result.inReplyTo).toBeUndefined();
  });

  it('validates an email with threading', () => {
    const result = EmailSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440001',
      from: 'reviewer@agents.mycompany.com',
      to: ['code_agent@agents.mycompany.com'],
      subject: 'Re: Code review',
      body: 'LGTM',
      inReplyTo: '550e8400-e29b-41d4-a716-446655440000',
      threadId: '550e8400-e29b-41d4-a716-446655440000',
      timestamp: new Date(),
    });

    expect(result.inReplyTo).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('rejects email with no recipients', () => {
    expect(() =>
      EmailSchema.parse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        from: 'sender@example.com',
        to: [],
        subject: 'Test',
        body: 'Test',
        timestamp: new Date(),
      }),
    ).toThrow();
  });
});
