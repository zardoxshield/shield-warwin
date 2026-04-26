FROM node:18-alpine
RUN apk add --no-cache git python3 py3-pip g++ openjdk17-jre bash
WORKDIR /app
COPY . .
EXPOSE 9999
CMD ["node", "servidor.js"]
