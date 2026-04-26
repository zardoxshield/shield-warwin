const http = require('http');
const fs = require('fs');
const { exec } = require('child_process');

http.createServer((req, res) => {
  if (req.url === '/publicar') {
    exec('cd /config/workspace/shield-warwin && git add . && git commit -m "atualização - $(date)" && git push', (err, stdout, stderr) => {
      res.end(err ? '❌ Erro: ' + stderr : '✅ Site publicado com sucesso!');
    });
  } else {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    res.end(fs.readFileSync('/app/painel.html'));
  }
}).listen(9999, () => console.log('Painel rodando na porta 9999'));
