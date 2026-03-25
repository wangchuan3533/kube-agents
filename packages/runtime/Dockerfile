FROM node:20-slim

WORKDIR /app

# Standalone package.json without workspace: protocol deps
RUN echo '{ \
  "name": "@kube-agents/runtime", \
  "version": "0.1.0", \
  "type": "module", \
  "dependencies": { \
    "zod": "^3.24.0", \
    "nats": "^2.29.0", \
    "@anthropic-ai/sdk": "^0.39.0", \
    "openai": "^4.82.0" \
  } \
}' > package.json
RUN npm install --omit=dev

COPY dist/ ./dist/

ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "dist/main.js"]
