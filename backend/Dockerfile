FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY backend/package.json ./backend/package.json

WORKDIR /app/backend

RUN npm install

COPY backend ./

RUN npm run build

EXPOSE 4000

CMD ["npm", "run", "start"]
