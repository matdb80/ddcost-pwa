FROM node:20-bullseye

WORKDIR /app

COPY package*.json ./
RUN rm -f package-lock.json && npm install

ENV PATH="/app/node_modules/.bin:${PATH}"

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
