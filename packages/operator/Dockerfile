FROM node:20-slim

WORKDIR /app

# Create a standalone package.json without workspace: protocol deps
RUN echo '{ "name": "@kube-agents/operator", "version": "0.1.0", "type": "module", "dependencies": { "@kubernetes/client-node": "^1.0.0" } }' > package.json
RUN npm install --omit=dev

COPY dist/ ./dist/

ENV NODE_ENV=production

CMD ["node", "dist/main.js"]
