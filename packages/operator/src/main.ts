import { AgentOperator } from './operator.js';

const namespace = process.env['WATCH_NAMESPACE'] || undefined;

const operator = new AgentOperator({ namespace });

process.on('SIGTERM', () => {
  operator.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  operator.stop();
  process.exit(0);
});

await operator.start();
