const http = require('http');
const fs = require('fs');
const https = require('https');
const url = require('url');
const path = require('path');
const { exec, spawn } = require('child_process');

const sessions = new Map();
const PROJETOS_DIR = '/app/projetos';

// Criar diretório de projetos
if (!fs.existsSync(PROJETOS_DIR)) {
  fs.mkdirSync(PROJETOS_DIR, { recursive: true });
}

// Templates de projetos
const TEMPLATES = {
  site: (n) => ({
    'index.html': `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${n}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; background: #f5f5f5; }
    h1 { color: #333; margin-bottom: 1rem; }
    p { color: #666; line-height: 1.6; }
  </style>
</head>
<body>
  <h1>🌐 ${n}</h1>
  <p>Projeto criado com sucesso! Edite este arquivo para personalizar.</p>
</body>
</html>`
  }),

  api: (n) => ({
    'index.js': `const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    projeto: '${n}',
    status: 'online',
    timestamp: new Date().toISOString()
  }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(\`✅ API ${n} rodando na porta \${PORT}\`);
});`,
    'README.md': `# ${n}\n\nAPI REST em Node.js\n\n## Executar:\n\`\`\`bash\nnode index.js\n\`\`\``
  }),

  python: (n) => ({
    'main.py': `#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Projeto: ${n}
Criado automaticamente pelo Shield Warwin
"""

def main():
    print("🐍 Olá do projeto ${n}!")
    print("Python rodando com sucesso!")

if __name__ == "__main__":
    main()`,
    'README.md': `# ${n}\n\nProjeto Python\n\n## Executar:\n\`\`\`bash\npython3 main.py\n\`\`\``
  }),

  cpp: (n) => ({
    'main.cpp': `#include <iostream>
#include <string>

int main() {
    std::cout << "⚡ Olá do projeto ${n}!" << std::endl;
    std::cout << "C++ compilado e executando!" << std::endl;
    return 0;
}`,
    'README.md': `# ${n}\n\nProjeto C++\n\n## Compilar e executar:\n\`\`\`bash\ng++ main.cpp -o main && ./main\n\`\`\``
  }),

  java: (n) => ({
    'Main.java': `public class Main {
    public static void main(String[] args) {
        System.out.println("☕ Olá do projeto ${n}!");
        System.out.println("Java compilado e executando!");
    }
}`,
    'README.md': `# ${n}\n\nProjeto Java\n\n## Compilar e executar:\n\`\`\`bash\njavac Main.java && java Main\n\`\`\``
  }),

  landing: (n) => ({
    'index.html': `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${n}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; min-height: 100vh; }
    .hero { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 2rem; }
    h1 { font-size: clamp(2rem, 8vw, 4rem); margin-bottom: 1rem; font-weight: 700; }
    p { font-size: clamp(1rem, 3vw, 1.25rem); margin-bottom: 2rem; opacity: 0.9; max-width: 600px; }
    .btn { padding: 1rem 2.5rem; background: #fff; color: #667eea; border: none; border-radius: 50px; font-size: 1.1rem; font-weight: 600; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 4px 15px rgba(0,0,0,0.2); }
    .btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
  </style>
</head>
<body>
  <div class="hero">
    <h1>✨ ${n}</h1>
    <p>Sua landing page moderna e responsiva. Customize como quiser!</p>
    <button class="btn" onclick="alert('Botão funcionando!')">Começar Agora</button>
  </div>
</body>
</html>`
  })
};

// Executores de código
const EXECUTORES = {
  '.js':   (f) => `node "${f}"`,
  '.py':   (f) => `python3 "${f}"`,
  '.cpp':  (f) => {
    const bin = `/tmp/prog_${Date.now()}`;
    return `g++ "${f}" -o "${bin}" && "${bin}"`;
  },
  '.java': (f) => `cd "$(dirname "${f}")" && javac "$(basename "${f}")" && java Main`,
  '.sh':   (f) => `bash "${f}"`
};

// Comandos permitidos no terminal
const CMDS_PERMITIDOS = [
  'npm', 'node', 'python3', 'pip3', 'pip',
  'g++', 'gcc', 'javac', 'java',
  'ls', 'cat', 'pwd', 'echo', 'git',
  'bash', 'sh', 'mkdir', 'rm', 'cp',
  'mv', 'chmod', 'touch', 'grep', 'find',
  'curl', 'wget', 'tar', 'unzip', 'nano', 'vim'
];

// Funções auxiliares
function listarProjetos() {
  if (!fs.existsSync(PROJETOS_DIR)) return [];
  return fs.readdirSync(PROJETOS_DIR).filter(f => {
    const fullPath = path.join(PROJETOS_DIR, f);
    return fs.statSync(fullPath).isDirectory();
  });
}

function criarProjeto(nome, tipo) {
  const dir = path.join(PROJETOS_DIR, nome);
  if (fs.existsSync(dir)) return { ok: false, mensagem: 'Projeto já existe' };

  try {
    fs.mkdirSync(dir, { recursive: true });
    const template = TEMPLATES[tipo] || TEMPLATES.site;
    const arquivos = template(nome);

    Object.entries(arquivos).forEach(([arquivo, conteudo]) => {
      fs.writeFileSync(path.join(dir, arquivo), conteudo);
    });

    const meta = {
      nome,
      tipo,
      criado: new Date().toISOString(),
      dominio: null,
      arquivos: Object.keys(arquivos)
    };

    fs.writeFileSync(path.join(dir, '.meta.json'), JSON.stringify(meta, null, 2));
    return { ok: true, mensagem: 'Projeto criado com sucesso!' };
  } catch (e) {
    return { ok: false, mensagem: e.message };
  }
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      projetos: listarProjetos().length,
      sessoes: sessions.size,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  if (pathname === '/publicar') {
    const options = {
      hostname: 'coolify.shieldblock.online',
      path: '/api/v1/deploy?uuid=svlzmst3gkddwpuugkul2076&force=false',
      method: 'GET',
      headers: {
        'Authorization': 'Bearer 1|QsoABJKcWGckBy038ob7AJayZpO9eF5NYRoKjhak8340ec05'
      }
    };

    const request = https.request(options, (response) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('✅ Publicado com sucesso no Coolify!');
    });

    request.on('error', (e) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('❌ Erro ao publicar: ' + e.message);
    });

    request.end();
    return;
  }

  if (pathname === '/arquivo') {
    const nome = query.nome || '';
    const permitidos = ['index.html', 'painel.html', 'servidor.js', 'Dockerfile', 'publicar.sh', 'package.json'];

    if (!permitidos.includes(nome)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('❌ Arquivo não permitido');
      return;
    }

    try {
      const conteudo = fs.readFileSync(path.join('/app', nome), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(conteudo);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('❌ Arquivo não encontrado');
    }
    return;
  }

  if (pathname === '/projetos/listar') {
    const projetos = listarProjetos().map(nome => {
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(PROJETOS_DIR, nome, '.meta.json'), 'utf8'));
        return meta;
      } catch {
        return { nome, tipo: 'site', criado: '', dominio: null };
      }
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(projetos));
    return;
  }

  if (pathname === '/projetos/criar') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { nome, tipo } = JSON.parse(body);
        const resultado = criarProjeto(nome, tipo);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(resultado));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, mensagem: e.message }));
      }
    });
    return;
  }

  if (pathname === '/projetos/arquivo') {
    const projeto = query.projeto;
    const arquivo = query.arquivo;

    if (!projeto || !arquivo || arquivo.includes('..')) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('❌ Parâmetros inválidos');
      return;
    }

    try {
      const conteudo = fs.readFileSync(path.join(PROJETOS_DIR, projeto, arquivo), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(conteudo);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('❌ Arquivo não encontrado');
    }
    return;
  }

  if (pathname === '/projetos/salvar') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { projeto, arquivo, conteudo } = JSON.parse(body);

        if (!projeto || !arquivo || arquivo.includes('..')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, mensagem: 'Parâmetros inválidos' }));
          return;
        }

        fs.writeFileSync(path.join(PROJETOS_DIR, projeto, arquivo), conteudo);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, mensagem: 'Arquivo salvo!' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, mensagem: e.message }));
      }
    });
    return;
  }

  if (pathname === '/projetos/executar') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { projeto, arquivo } = JSON.parse(body);

        if (!projeto || !arquivo || arquivo.includes('..')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, saida: 'Parâmetros inválidos' }));
          return;
        }

        const filePath = path.join(PROJETOS_DIR, projeto, arquivo);
        const ext = path.extname(arquivo);
        const cmd = EXECUTORES[ext];

        if (!cmd) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, saida: 'Tipo de arquivo não suportado para execução' }));
          return;
        }

        exec(cmd(filePath), { timeout: 10000, cwd: path.join(PROJETOS_DIR, projeto) }, (err, stdout, stderr) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: !err,
            saida: stdout || stderr || (err ? err.message : 'Executado com sucesso!')
          }));
        });
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, saida: e.message }));
      }
    });
    return;
  }

  if (pathname === '/cmd') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { cmd, projeto } = JSON.parse(body);
        const primeiraPalavra = cmd.trim().split(/\s+/)[0];

        if (!CMDS_PERMITIDOS.includes(primeiraPalavra)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, saida: `Comando '${primeiraPalavra}' não permitido` }));
          return;
        }

        const cwd = projeto ? path.join(PROJETOS_DIR, projeto) : '/app';

        exec(cmd, { timeout: 15000, cwd }, (err, stdout, stderr) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: !err,
            saida: stdout || stderr || (err ? err.message : 'OK')
          }));
        });
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, saida: e.message }));
      }
    });
    return;
  }

  if (pathname === '/cmd-stream') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { cmd, projeto, sessionId } = JSON.parse(body);
        const primeiraPalavra = cmd.trim().split(/\s+/)[0];

        if (!CMDS_PERMITIDOS.includes(primeiraPalavra)) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });
          res.write('data: ' + JSON.stringify({ type: 'error', text: `Comando '${primeiraPalavra}' não permitido` }) + '\n\n');
          res.write('data: ' + JSON.stringify({ type: 'end', code: 1 }) + '\n\n');
          res.end();
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        });

        const cwd = projeto ? path.join(PROJETOS_DIR, projeto) : '/app';
        const proc = spawn('bash', ['-c', cmd], { cwd, env: process.env });

        sessions.set(sessionId, { proc, status: 'running' });

        proc.stdout.on('data', chunk => {
          chunk.toString().split('\n').forEach(line => {
            if (line.trim()) {
              res.write('data: ' + JSON.stringify({ type: 'stdout', text: line }) + '\n\n');
            }
          });
        });

        proc.stderr.on('data', chunk => {
          chunk.toString().split('\n').forEach(line => {
            if (line.trim()) {
              res.write('data: ' + JSON.stringify({ type: 'stderr', text: line }) + '\n\n');
            }
          });
        });

        proc.on('close', code => {
          res.write('data: ' + JSON.stringify({ type: 'end', code }) + '\n\n');
          res.end();
          sessions.delete(sessionId);
        });

        proc.on('error', err => {
          res.write('data: ' + JSON.stringify({ type: 'error', text: err.message }) + '\n\n');
          res.write('data: ' + JSON.stringify({ type: 'end', code: 1 }) + '\n\n');
          res.end();
          sessions.delete(sessionId);
        });

        req.on('close', () => {
          if (sessions.has(sessionId)) {
            try { proc.kill('SIGTERM'); } catch (e) { }
            sessions.delete(sessionId);
          }
        });
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: ' + JSON.stringify({ type: 'error', text: e.message }) + '\n\n');
        res.end();
      }
    });
    return;
  }

  if (pathname === '/cmd-stdin') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { sessionId, input } = JSON.parse(body);
        const sess = sessions.get(sessionId);

        if (!sess || !sess.proc) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, erro: 'Sessão não encontrada' }));
          return;
        }

        sess.proc.stdin.write(input + '\n');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, erro: e.message }));
      }
    });
    return;
  }

  if (pathname === '/cmd-kill') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { sessionId } = JSON.parse(body);
        const sess = sessions.get(sessionId);

        if (sess && sess.proc) {
          try { sess.proc.kill('SIGTERM'); } catch (e) { }
          sessions.delete(sessionId);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, erro: e.message }));
      }
    });
    return;
  }

  if (pathname.startsWith('/projetos/ver/')) {
    const nome = pathname.replace('/projetos/ver/', '');

    try {
      const html = fs.readFileSync(path.join(PROJETOS_DIR, nome, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>❌ Projeto não encontrado</h1>');
    }
    return;
  }

  try {
    const painel = fs.readFileSync('/app/painel.html', 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(painel);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end('<h1>❌ Erro ao carregar painel</h1><p>' + e.message + '</p>');
  }
});

const PORT = process.env.PORT || 8443;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log('\n🧠 ═══════════════════════════════════════════════════════');
  console.log('   SHIELD WARWIN CÉREBRO - Sistema Inicializado');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`🌐 Servidor rodando em: http://${HOST}:${PORT}`);
  console.log(`📊 Projetos disponíveis: ${listarProjetos().length}`);
  console.log(`⚡ Sessões ativas: ${sessions.size}\n`);
  console.log('✅ Funcionalidades Ativas:');
  console.log('   • Criar projetos (Site, API, Python, C++, Java, Landing)');
  console.log('   • Editor de código em tempo real');
  console.log('   • Executar código (Node.js, Python, C++, Java)');
  console.log('   • Terminal interativo com streaming');
  console.log('   • Deploy automático no Coolify');
  console.log('   • Gerenciamento de sessões\n');
  console.log('═══════════════════════════════════════════════════════\n');
});

process.on('uncaughtException', (err) => {
  console.error('❌ Erro não capturado:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Promise rejeitada:', reason);
});