FROM node:22-slim

WORKDIR /app

# Standalone package.json without workspace: protocol deps
RUN echo '{ \
  "name": "@kube-agents/sample-langchain-research-team", \
  "version": "0.1.0", \
  "type": "module", \
  "dependencies": { \
    "@langchain/core": "^0.3.0", \
    "@langchain/langgraph": "^0.2.0", \
    "@langchain/openai": "^0.4.0", \
    "nats": "^2.29.0", \
    "zod": "^3.23.0" \
  } \
}' > package.json
RUN npm install --omit=dev

COPY dist/ ./dist/

ENV NODE_ENV=production

CMD ["node", "dist/main.js"]
