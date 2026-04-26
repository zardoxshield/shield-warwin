const http = require('http');
const fs = require('fs');
const https = require('https');
const url = require('url');
const path = require('path');

// === AUTH_SISTEMA_V1 ===
const crypto = require('crypto');
const AUTH_FILE = path.join(__dirname, '.auth.json');
function carregarAuth(){
  return {
    usuario: process.env.USUARIO_AUTH || 'admin',
    senhaHash: process.env.SENHA_HASH_AUTH || '',
    sessoes: {}
  };
} catch(e) { return {usuario:'admin',senhaHash:'',sessoes:{}}; } }
function salvarAuth(a){
  // sessoes sao salvas apenas em memoria (reset ao redeploy)
  // para persistencia, configurar volumes no Docker
}
function hashSenha(s){ return crypto.createHash('sha256').update(s).digest('hex'); }
function novoToken(){ return crypto.randomBytes(32).toString('hex'); }
function pegarCookie(req, nome){
  const c = req.headers.cookie || '';
  const m = c.match(new RegExp('(?:^|; )' + nome + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function autenticado(req){
  const tok = pegarCookie(req, 'sw_session');
  if (!tok) return false;
  const auth = carregarAuth();
  const sess = auth.sessoes[tok];
  if (!sess) return false;
  if (Date.now() > sess.expira) { delete auth.sessoes[tok]; salvarAuth(auth); return false; }
  return true;
}
// === FIM AUTH_SISTEMA_V1 ===
const { exec, spawn } = require('child_process');
const sessions = new Map(); // sessionId -> { proc, output, status }

const PROJETOS_DIR = '/app/projetos';
if (!fs.existsSync(PROJETOS_DIR)) fs.mkdirSync(PROJETOS_DIR, { recursive: true });

const TEMPLATES = {
  site: (n) => ({'index.html':`<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n<meta charset="UTF-8">\n<title>${n}</title>\n<style>body{font-family:sans-serif;max-width:900px;margin:0 auto;padding:2rem}h1{color:#333}</style>\n</head>\n<body>\n<h1>🌐 ${n}</h1>\n<p>Edite este arquivo.</p>\n</body>\n</html>`}),
  api: (n) => ({'index.js':`const http=require('http');\nhttp.createServer((req,res)=>{\n  res.writeHead(200,{'Content-Type':'application/json'});\n  res.end(JSON.stringify({projeto:'${n}',status:'online'}));\n}).listen(3000,()=>console.log('API rodando'));`,'README.md':`# ${n}\nAPI REST Node.js`}),
  python: (n) => ({'main.py':`# ${n}\nprint("Olá do projeto ${n}!")\n\ndef main():\n    print("Rodando!")\n\nif __name__ == "__main__":\n    main()`,'README.md':`# ${n}\nProjeto Python`}),
  cpp: (n) => ({'main.cpp':`#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Olá do projeto ${n}!" << endl;\n    return 0;\n}`,'README.md':`# ${n}\nC++\n\ng++ main.cpp -o main && ./main`}),
  java: (n) => ({'Main.java':`public class Main {\n    public static void main(String[] args) {\n        System.out.println("Olá do projeto ${n}!");\n    }\n}`,'README.md':`# ${n}\nJava`}),
  landing: (n) => ({'index.html':`<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n<meta charset="UTF-8">\n<title>${n}</title>\n<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#0f0f0f;color:#fff}.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:2rem}h1{font-size:3rem;margin-bottom:1rem;color:#5DCAA5}.btn{padding:1rem 2rem;background:#1D9E75;color:#fff;border:none;border-radius:8px;font-size:1rem;cursor:pointer}</style>\n</head>\n<body>\n<div class="hero">\n<h1>${n}</h1>\n<p style="color:#aaa;margin-bottom:2rem">Sua landing page</p>\n<button class="btn">Começar</button>\n</div>\n</body>\n</html>`})
};

const EXECUTORES = {
  '.js':   (f) => `node "${f}"`,
  '.py':   (f) => `python3 "${f}"`,
  '.cpp':  (f) => `g++ "${f}" -o /tmp/prog && /tmp/prog`,
  '.java': (f) => `cd $(dirname "${f}") && javac $(basename "${f}") && java Main`,
  '.sh':   (f) => `bash "${f}"`
};

const CMDS_PERMITIDOS = ['npm','node','python3','pip3','g++','javac','java','ls','cat','pwd','echo','git','bash','sh'];

function listarProjetos() {
  if (!fs.existsSync(PROJETOS_DIR)) return [];
  return fs.readdirSync(PROJETOS_DIR).filter(f => fs.statSync(path.join(PROJETOS_DIR,f)).isDirectory());
}

function criarProjeto(nome, tipo) {
  const dir = path.join(PROJETOS_DIR, nome);
  if (fs.existsSync(dir)) return false;
  fs.mkdirSync(dir, { recursive: true });
  const template = TEMPLATES[tipo] ? TEMPLATES[tipo](nome) : TEMPLATES.site(nome);
  Object.entries(template).forEach(([a,c]) => fs.writeFileSync(path.join(dir,a), c));
  fs.writeFileSync(path.join(dir,'.meta.json'), JSON.stringify({nome,tipo,criado:new Date().toISOString(),dominio:null},null,2));
  return true;
}

http.createServer((req, res) => {
  const p = url.parse(req.url, true);
  const pathname = p.pathname;
  res.setHeader('Access-Control-Allow-Origin','*');

  // --- LOGIN MIDDLEWARE ---
  if (pathname === '/api/login') {
    let body='';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { usuario, senha } = JSON.parse(body);
        const auth = carregarAuth();
        if (usuario !== auth.usuario || hashSenha(senha) !== auth.senhaHash) {
          res.writeHead(401, {'Content-Type':'application/json'});
          return res.end(JSON.stringify({ok:false, erro:'Usuario ou senha incorretos'}));
        }
        const tok = novoToken();
        auth.sessoes[tok] = { usuario, expira: Date.now() + 7*24*60*60*1000 };
        Object.keys(auth.sessoes).forEach(k => { if(Date.now() > auth.sessoes[k].expira) delete auth.sessoes[k]; });
        salvarAuth(auth);
        res.writeHead(200, {
          'Content-Type':'application/json',
          'Set-Cookie': 'sw_session='+tok+'; Path=/; Max-Age='+(7*24*60*60)+'; HttpOnly; SameSite=Lax'
        });
        res.end(JSON.stringify({ok:true}));
      } catch(e) { res.writeHead(400); res.end(JSON.stringify({ok:false,erro:e.message})); }
    });
    return;
  }
  if (pathname === '/api/logout') {
    const tok = pegarCookie(req, 'sw_session');
    if (tok) { const a = carregarAuth(); delete a.sessoes[tok]; salvarAuth(a); }
    res.writeHead(302, {'Location':'/login', 'Set-Cookie':'sw_session=; Path=/; Max-Age=0'});
    return res.end();
  }
  if (pathname === '/login' || pathname === '/login.html') {
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
    return res.end(fs.readFileSync(path.join(__dirname,'login.html'),'utf8'));
  }
  if (!autenticado(req)) {
    res.writeHead(302, {'Location':'/login'});
    return res.end();
  }
  // --- FIM LOGIN MIDDLEWARE ---

  if (pathname === '/publicar') {
    const options = {hostname:'coolify.shieldblock.online',path:'/api/v1/deploy?uuid=svlzmst3gkddwpuugkul2076&force=false',method:'GET',headers:{'Authorization':'Bearer 1|QsoABJKcWGckBy038ob7AJayZpO9eF5NYRoKjhak8340ec05'}};
    const r = https.request(options, () => res.end('Publicado com sucesso!'));
    r.on('error', (e) => res.end('Erro: '+e.message));
    r.end();

  } else if (pathname === '/arquivo') {
    const nome = p.query.nome || '';
    const permitidos = ['index.html','painel.html','servidor.js','Dockerfile','publicar.sh'];
    if (!permitidos.includes(nome)) { res.end('Arquivo não permitido'); return; }
    try { res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'}); res.end(fs.readFileSync('/app/'+nome,'utf8')); }
    catch { res.end('Arquivo não encontrado'); }

  } else if (pathname === '/projetos/listar') {
    res.writeHead(200,{'Content-Type':'application/json'});
    const projetos = listarProjetos().map(nome => {
      try { return JSON.parse(fs.readFileSync(path.join(PROJETOS_DIR,nome,'.meta.json'),'utf8')); }
      catch { return {nome,tipo:'site',criado:'',dominio:null}; }
    });
    res.end(JSON.stringify(projetos));

  } else if (pathname === '/projetos/criar') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const {nome,tipo} = JSON.parse(body);
        const ok = criarProjeto(nome, tipo);
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok, mensagem: ok ? 'Projeto criado!' : 'Projeto já existe'}));
      } catch(e) { res.end(JSON.stringify({ok:false,mensagem:e.message})); }
    });

  } else if (pathname === '/projetos/arquivo') {
    const projeto = p.query.projeto, arquivo = p.query.arquivo;
    if (!projeto||!arquivo||arquivo.includes('..')) { res.end('Inválido'); return; }
    try { res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'}); res.end(fs.readFileSync(path.join(PROJETOS_DIR,projeto,arquivo),'utf8')); }
    catch { res.end('Arquivo não encontrado'); }

  } else if (pathname === '/projetos/salvar') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const {projeto,arquivo,conteudo} = JSON.parse(body);
        if (!projeto||!arquivo||arquivo.includes('..')) { res.end(JSON.stringify({ok:false})); return; }
        fs.writeFileSync(path.join(PROJETOS_DIR,projeto,arquivo), conteudo);
        res.writeHead(200,{'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true}));
      } catch(e) { res.end(JSON.stringify({ok:false,mensagem:e.message})); }
    });

  } else if (pathname === '/projetos/executar') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const {projeto,arquivo} = JSON.parse(body);
        if (!projeto||!arquivo||arquivo.includes('..')) { res.end(JSON.stringify({ok:false,saida:'Inválido'})); return; }
        const filePath = path.join(PROJETOS_DIR,projeto,arquivo);
        const ext = path.extname(arquivo);
        const cmd = EXECUTORES[ext];
        if (!cmd) { res.end(JSON.stringify({ok:false,saida:'Tipo de arquivo não suportado para execução'})); return; }
        exec(cmd(filePath), {timeout:10000, cwd:path.join(PROJETOS_DIR,projeto)}, (err,stdout,stderr) => {
          res.writeHead(200,{'Content-Type':'application/json'});
          res.end(JSON.stringify({ok:!err, saida:stdout||stderr||(err?err.message:'Sem saída')}));
        });
      } catch(e) { res.end(JSON.stringify({ok:false,saida:e.message})); }
    });

  } else if (pathname === '/cmd') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const {cmd, projeto} = JSON.parse(body);
        const primeiroPalavra = cmd.trim().split(' ')[0];
        if (!CMDS_PERMITIDOS.includes(primeiroPalavra)) {
          res.writeHead(200,{'Content-Type':'application/json'});
          res.end(JSON.stringify({ok:false, saida:`Comando '${primeiroPalavra}' não permitido`}));
          return;
        }
        const cwd = projeto ? path.join(PROJETOS_DIR,projeto) : '/app';
        exec(cmd, {timeout:15000, cwd}, (err,stdout,stderr) => {
          res.writeHead(200,{'Content-Type':'application/json'});
          res.end(JSON.stringify({ok:!err, saida:stdout||stderr||(err?err.message:'OK')}));
        });
      } catch(e) { res.end(JSON.stringify({ok:false,saida:e.message})); }
    });

  } else if (pathname.startsWith('/projetos/ver/')) {
    const nome = pathname.replace('/projetos/ver/','');
    try { res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); res.end(fs.readFileSync(path.join(PROJETOS_DIR,nome,'index.html'),'utf8')); }
    catch { res.end('<h1>Projeto não encontrado</h1>'); }


  } else if (pathname === '/cmd-stream') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { cmd, projeto, sessionId } = JSON.parse(body);
        const partes = cmd.trim().split(/\s+/);
        const primeiraPalavra = partes[0];
        if (!CMDS_PERMITIDOS.includes(primeiraPalavra)) {
          res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
          res.write('data: ' + JSON.stringify({type:'error', text:"Comando '"+primeiraPalavra+"' nao permitido"}) + '\n\n');
          res.write('data: ' + JSON.stringify({type:'end', code:1}) + '\n\n');
          res.end();
          return;
        }
        res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
        const cwd = projeto ? path.join(PROJETOS_DIR, projeto) : '/app';
        const proc = spawn('bash', ['-c', cmd], { cwd, env: process.env });
        sessions.set(sessionId, { proc, status: 'running' });

        proc.stdout.on('data', chunk => {
          chunk.toString().split('\n').forEach(line => {
            if (line.length) res.write('data: ' + JSON.stringify({type:'stdout', text:line}) + '\n\n');
          });
        });
        proc.stderr.on('data', chunk => {
          chunk.toString().split('\n').forEach(line => {
            if (line.length) res.write('data: ' + JSON.stringify({type:'stderr', text:line}) + '\n\n');
          });
        });
        proc.on('close', code => {
          res.write('data: ' + JSON.stringify({type:'end', code}) + '\n\n');
          res.end();
          sessions.delete(sessionId);
        });
        proc.on('error', err => {
          res.write('data: ' + JSON.stringify({type:'error', text:err.message}) + '\n\n');
          res.write('data: ' + JSON.stringify({type:'end', code:1}) + '\n\n');
          res.end();
          sessions.delete(sessionId);
        });

        req.on('close', () => {
          if (sessions.has(sessionId)) {
            try { proc.kill('SIGTERM'); } catch(e) {}
            sessions.delete(sessionId);
          }
        });
      } catch(e) {
        res.writeHead(200, {'Content-Type':'text/event-stream'});
        res.write('data: ' + JSON.stringify({type:'error', text:e.message}) + '\n\n');
        res.end();
      }
    });

  } else if (pathname === '/cmd-stdin') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { sessionId, input } = JSON.parse(body);
        const sess = sessions.get(sessionId);
        if (!sess || !sess.proc) { res.end(JSON.stringify({ok:false,erro:'sessao nao encontrada'})); return; }
        sess.proc.stdin.write(input + '\n');
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true}));
      } catch(e) { res.end(JSON.stringify({ok:false,erro:e.message})); }
    });

  } else if (pathname === '/cmd-kill') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { sessionId } = JSON.parse(body);
        const sess = sessions.get(sessionId);
        if (sess && sess.proc) {
          try { sess.proc.kill('SIGTERM'); } catch(e) {}
          sessions.delete(sessionId);
        }
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ok:true}));
      } catch(e) { res.end(JSON.stringify({ok:false,erro:e.message})); }
    });

  } else {
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end(fs.readFileSync('/app/painel.html'));
  }
}).listen(9999, () => console.log('Shield Warwin rodando na porta 9999'));
