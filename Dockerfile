cat > ~/workspace/shield-warwin/Dockerfile << 'EOF'
FROM node:18-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY . .
EXPOSE 9999
CMD ["node", "servidor.js"]
EOF

cd ~/workspace/shield-warwin
git add Dockerfile
git commit -m "restore Dockerfile"
git push