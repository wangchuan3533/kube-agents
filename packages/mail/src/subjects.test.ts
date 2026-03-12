import { describe, it, expect } from 'vitest';
import { directSubject, groupSubject, subjectsForAgent } from './subjects.js';

describe('subjects', () => {
  it('creates direct mail subject', () => {
    expect(directSubject('code_agent@agents.mycompany.com')).toBe(
      'mail.code_agent.agents.mycompany.com',
    );
  });

  it('creates group mail subject', () => {
    expect(groupSubject('engineering@agents.mycompany.com')).toBe(
      'mail.group.engineering.agents.mycompany.com',
    );
  });

  it('creates all subjects for an agent', () => {
    const subjects = subjectsForAgent('code_agent@agents.mycompany.com', [
      'engineering@agents.mycompany.com',
      'all@agents.mycompany.com',
    ]);

    expect(subjects).toEqual([
      'mail.code_agent.agents.mycompany.com',
      'mail.group.engineering.agents.mycompany.com',
      'mail.group.all.agents.mycompany.com',
    ]);
  });

  it('handles agent with no groups', () => {
    const subjects = subjectsForAgent('solo@agents.mycompany.com', []);
    expect(subjects).toEqual(['mail.solo.agents.mycompany.com']);
  });
});
