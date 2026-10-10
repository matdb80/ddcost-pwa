FROM node:20-bullseye

WORKDIR /app

COPY package*.json ./
RUN rm -f package-lock.json && npm install

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
