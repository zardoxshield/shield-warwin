FROM node:18-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY . .
EXPOSE 9999
CMD ["node", "servidor.js"]
