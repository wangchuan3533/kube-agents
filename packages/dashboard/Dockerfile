FROM node:20-slim

WORKDIR /app

RUN echo '{ "name": "@kube-agents/dashboard", "version": "0.1.0", "type": "module", "dependencies": { "@hono/node-server": "^1.13.0", "@kubernetes/client-node": "^1.0.0", "hono": "^4.7.0", "nats": "^2.28.0" } }' > package.json
RUN npm install --omit=dev

COPY dist/ ./dist/

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "dist/server/index.js"]
