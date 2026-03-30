FROM node:20-slim

WORKDIR /app

# Install build tools for better-sqlite3 native module
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

RUN echo '{ "name": "@kube-agents/dashboard", "version": "0.1.0", "type": "module", "dependencies": { "@hono/node-server": "^1.13.0", "@kubernetes/client-node": "^1.0.0", "better-sqlite3": "^12.0.0", "hono": "^4.7.0", "nats": "^2.28.0" } }' > package.json
RUN npm install --omit=dev

COPY dist/ ./dist/

# Create data directory for SQLite
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/data/kube-agents.db
EXPOSE 3001

CMD ["node", "dist/server/index.js"]
