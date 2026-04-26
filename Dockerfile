FROM node:18-alpine
WORKDIR /app
COPY . .
EXPOSE 9999
CMD ["node", "servidor.js"]
