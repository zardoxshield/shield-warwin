const http = require('http');
const fs = require('fs');
const https = require('https');
const url = require('url');
const path = require('path');
const { exec } = require('child_process');

const PROJETOS_DIR = '/app/projetos';
if (!fs.existsSync(PROJETOS_DIR)) fs.mkdirSync(PROJETOS_DIR, { recursive: true });

const TEMPLATES = {
  site: (nome) => ({
    'index.html': `<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n<meta charset="UTF-8">\n<title>${nome}</title>\n<style>\nbody{font-family:sans-serif;max-width:900px;margin:0 auto;padding:2rem;background:#f9f9f9}\nh1{color:#333}\n</style>\n</head>\n<body>\n<h1>🌐 ${nome}</h1>\n<p>Seu site está pronto! Edite este arquivo para personalizar.</p>\n</body>\n</html>`
  }),
  api: (nome) => ({
    'index.js': `const http = require('http');\n\nhttp.createServer((req, res) => {\n  res.writeHead(200, {'Content-Type': 'application/json'});\n  res.end(JSON.stringify({ projeto: '${nome}', status: 'online' }));\n}).listen(3000, () => console.log('API ${nome} rodando na porta 3000'));`,
    'README.md': `# ${nome}\nAPI REST em Node.js\n\n## Rotas\n- GET / → status da API`
  }),
  python: (nome) => ({
    'main.py': `# ${nome}\nprint("Olá do projeto ${nome}!")\n\ndef main():\n    print("Projeto rodando!")\n\nif __name__ == "__main__":\n    main()`,
    'README.md': `# ${nome}\nProjeto Python`
  }),
  cpp: (nome) => ({
    'main.cpp': `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Olá do projeto ${nome}!" << endl;\n    return 0;\n}`,
    'README.md': `# ${nome}\nProjeto C++\n\n## Compilar\ng++ main.cpp -o main && ./main`
  }),
  java: (nome) => ({
    'Main.java': `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Olá do projeto ${nome}!");\n    }\n}`,
    'README.md': `# ${nome}\nProjeto Java\n\n## Compilar\njavac Main.java && java Main`
  }),
  landing: (nome) => ({
    'index.html': `<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n<meta charset="UTF-8">\n<title>${nome}</title>\n<style>\n*{margin:0;padding:0;box-sizing:border-box}\nbody{font-family:sans-serif;background:#0f0f0f;color:#fff}\n.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:2rem}\nh1{font-size:3rem;margin-bottom:1rem;color:#5DCAA5}\np{font-size:1.2rem;color:#aaa;margin-bottom:2rem}\n.btn{padding:1rem 2rem;background:#1D9E75;color:#fff;border:none;border-radius:8px;font-size:1rem;cursor:pointer;text-decoration:none}\n</style>\n</head>\n<body>\n<div class="hero">\n<h1>${nome}</h1>\n<p>Sua landing page profissional</p>\n<a class="btn" href="#">Começar agora</a>\n</div>\n</body>\n</html>`
  })
};

function listarProjetos() {
  if (!fs.existsSync(PROJETOS_DIR)) return [];
  return fs.readdirSync(PROJETOS_DIR).filter(f => fs.statSync(path.join(PROJETOS_DIR, f)).isDirectory());
}

function criarProjeto(nome, tipo) {
  const dir = path.join(PROJETOS_DIR, nome);
  if (fs.existsSync(dir)) return false;
  fs.mkdirSync(dir, { recursive: true });
  const template = TEMPLATES[tipo] ? TEMPLATES[tipo](nome) : TEMPLATES.site(nome);
  Object.entries(template).forEach(([arquivo, conteudo]) => {
    fs.writeFileSync(path.join(dir, arquivo), conteudo);
  });
  const meta = { nome, tipo, criado: new Date().toISOString(), dominio: null };
  fs.writeFileSync(path.join(dir, '.meta.json'), JSON.stringify(meta, null, 2));
  return true;
}

http.createServer((req, res) => {
  const p = url.parse(req.url, true);
  const pathname = p.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (pathname === '/publicar') {
    const options = {
      hostname: 'coolify.shieldblock.online',
      path: '/api/v1/deploy?uuid=svlzmst3gkddwpuugkul2076&force=false',
      method: 'GET',
      headers: { 'Authorization': 'Bearer 1|QsoABJKcWGckBy038ob7AJayZpO9eF5NYRoKjhak8340ec05' }
    };
    const request = https.request(options, (r) => { res.end('Publicado com sucesso!'); });
    request.on('error', (e) => { res.end('Erro: ' + e.message); });
    request.end();

  } else if (pathname === '/arquivo') {
    const nome = p.query.nome || '';
    const permitidos = ['index.html','painel.html','servidor.js','Dockerfile','publicar.sh'];
    if (!permitidos.includes(nome)) { res.end('Arquivo não permitido'); return; }
    try {
      res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
      res.end(fs.readFileSync('/app/' + nome, 'utf8'));
    } catch(e) { res.end('Arquivo não encontrado'); }

  } else if (pathname === '/projetos/listar') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    const projetos = listarProjetos().map(nome => {
      try { return JSON.parse(fs.readFileSync(path.join(PROJETOS_DIR, nome, '.meta.json'), 'utf8')); }
      catch { return { nome, tipo: 'site', criado: '', dominio: null }; }
    });
    res.end(JSON.stringify(projetos));

  } else if (pathname === '/projetos/criar') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { nome, tipo } = JSON.parse(body);
        const ok = criarProjeto(nome, tipo);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ ok, mensagem: ok ? 'Projeto criado!' : 'Projeto já existe' }));
      } catch(e) { res.end(JSON.stringify({ ok: false, mensagem: e.message })); }
    });

  } else if (pathname.startsWith('/projetos/arquivo')) {
    const projeto = p.query.projeto;
    const arquivo = p.query.arquivo;
    if (!projeto || !arquivo || arquivo.includes('..')) { res.end('Inválido'); return; }
    try {
      res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
      res.end(fs.readFileSync(path.join(PROJETOS_DIR, projeto, arquivo), 'utf8'));
    } catch(e) { res.end('Arquivo não encontrado'); }

  } else if (pathname.startsWith('/projetos/salvar')) {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { projeto, arquivo, conteudo } = JSON.parse(body);
        if (!projeto || !arquivo || arquivo.includes('..')) { res.end(JSON.stringify({ ok: false })); return; }
        fs.writeFileSync(path.join(PROJETOS_DIR, projeto, arquivo), conteudo);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ ok: true }));
      } catch(e) { res.end(JSON.stringify({ ok: false, mensagem: e.message })); }
    });

  } else if (pathname.startsWith('/projetos/ver/')) {
    const nome = pathname.replace('/projetos/ver/', '');
    const indexPath = path.join(PROJETOS_DIR, nome, 'index.html');
    try {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      res.end(fs.readFileSync(indexPath, 'utf8'));
    } catch { res.end('<h1>Projeto não encontrado</h1>'); }

  } else {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    res.end(fs.readFileSync('/app/painel.html'));
  }
}).listen(9999, () => console.log('Shield Warwin rodando na porta 9999'));
