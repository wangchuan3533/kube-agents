FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY dist/ ./dist/

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "dist/server/index.js"]
