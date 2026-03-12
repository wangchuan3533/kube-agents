import { NATS_SUBJECTS, STREAM_NAME } from '@kube-agents/core';

export function directSubject(email: string): string {
  return NATS_SUBJECTS.directMail(email);
}

export function groupSubject(groupEmail: string): string {
  return NATS_SUBJECTS.groupMail(groupEmail);
}

export function subjectsForAgent(email: string, groups: string[]): string[] {
  const subjects = [directSubject(email)];
  for (const group of groups) {
    subjects.push(groupSubject(group));
  }
  return subjects;
}

export { STREAM_NAME };

export const STREAM_SUBJECTS = ['mail.>'];
