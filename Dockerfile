# DDCost PWA — Dockerfile per Fly.io

FROM node:20-alpine

WORKDIR /app

# Copia file dipendenze
COPY package*.json ./

# Installa dipendenze
RUN npm ci --omit=dev

# Copia codice sorgente
COPY . .

# Build produzione (frontend + backend)
RUN npm run build

# Espone la porta (Fly.io la sovrascrive con $PORT)
EXPOSE 3000

# Comando di avvio
CMD ["npm", "start"]
