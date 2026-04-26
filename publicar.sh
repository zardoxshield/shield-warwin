#!/bin/bash
cd ~/workspace/shield-warwin
git add .
git commit -m "atualização - $(date '+%d/%m/%Y %H:%M')"
git push
echo "✅ Site publicado com sucesso!"
