import { describe, it, expect } from 'vitest';
import { encodeEmail, decodeEmail } from './serialization.js';
import type { Email } from '@kube-agents/core';

describe('serialization', () => {
  const sampleEmail: Email = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    from: 'sender@agents.mycompany.com',
    to: ['receiver@agents.mycompany.com'],
    subject: 'Test',
    body: 'Hello World',
    attachments: [],
    timestamp: new Date('2025-01-01T00:00:00Z'),
  };

  it('roundtrips email through encode/decode', () => {
    const encoded = encodeEmail(sampleEmail);
    const decoded = decodeEmail(encoded);

    expect(decoded.id).toBe(sampleEmail.id);
    expect(decoded.from).toBe(sampleEmail.from);
    expect(decoded.to).toEqual(sampleEmail.to);
    expect(decoded.subject).toBe(sampleEmail.subject);
    expect(decoded.body).toBe(sampleEmail.body);
  });

  it('throws MailError on invalid data', () => {
    const invalid = new TextEncoder().encode('not json');
    expect(() => decodeEmail(invalid)).toThrow('Failed to decode email message');
  });
});
