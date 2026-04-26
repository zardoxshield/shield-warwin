cat > ~/workspace/shield-warwin/Dockerfile << 'EOF'
FROM node:18-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY . .
EXPOSE 9999
CMD ["node", "servidor.js"]
EOF

cat > ~/workspace/shield-warwin/servidor.js << 'EOF'
const http = require('http');
const fs = require('fs');
const https = require('https');

http.createServer((req, res) => {
  if (req.url === '/publicar') {
    const options = {
      hostname: 'coolify.shieldblock.online',
      path: '/api/v1/deploy?uuid=svlzmst3gkddwpuugkul2076&force=false',
      method: 'GET',
      headers: {
        'Authorization': 'Bearer 1|QsoABJKcWGckBy038ob7AJayZpO9eF5NYRoKjhak8340ec05'
      }
    };
    const request = https.request(options, (r) => {
      res.end('✅ Site publicado com sucesso!');
    });
    request.on('error', (e) => {
      res.end('❌ Erro: ' + e.message);
    });
    request.end();
  } else {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    res.end(fs.readFileSync('/app/painel.html'));
  }
}).listen(9999, () => console.log('Painel rodando na porta 9999'));
EOF

cd ~/workspace/shield-warwin
git add .
git commit -m "fix servidor.js e Dockerfile"
git push