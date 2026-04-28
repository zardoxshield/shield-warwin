#!/bin/bash
# Garante que painel.html e outros arquivos estáticos existem em /app/
ln -sf /config/workspace/shield-warwin/painel.html /app/painel.html
ln -sf /config/workspace/shield-warwin/login.html  /app/login.html
ln -sf /config/workspace/shield-warwin/index.html  /app/index.html
ln -sf /config/workspace/shield-warwin/publicar.sh /app/publicar.sh

# Inicia o servidor na porta 9999 (em foreground para o systemd monitorar)
PORT=9999 exec node /config/workspace/shield-warwin/servidor.js
