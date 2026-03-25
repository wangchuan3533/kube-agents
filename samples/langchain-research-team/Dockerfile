FROM node:22-slim AS builder

WORKDIR /app

# Copy workspace root files for pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./

# Copy packages needed by the sample
COPY packages/core/package.json packages/core/
COPY packages/mail/package.json packages/mail/
COPY samples/langchain-research-team/package.json samples/langchain-research-team/

RUN corepack enable && pnpm install --frozen-lockfile

# Copy source
COPY packages/core/ packages/core/
COPY packages/mail/ packages/mail/
COPY samples/langchain-research-team/ samples/langchain-research-team/

# Build dependencies then the sample
RUN pnpm --filter @kube-agents/core build && \
    pnpm --filter @kube-agents/mail build && \
    pnpm --filter @kube-agents/sample-langchain-research-team build

# --- Production stage ---
FROM node:22-slim

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/mail/dist ./packages/mail/dist
COPY --from=builder /app/packages/mail/package.json ./packages/mail/
COPY --from=builder /app/samples/langchain-research-team/dist ./dist
COPY --from=builder /app/samples/langchain-research-team/package.json ./

ENV NODE_ENV=production

CMD ["node", "dist/main.js"]
