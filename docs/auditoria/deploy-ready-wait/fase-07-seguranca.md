# Fase 7 — Segurança

O script passa a falhar fechado quando o container não sobe ou o ready não chega. Antes, `|| true` transformava essa falha em sucesso.

Não há payload novo, não há chamada à VM, não há Kali. O alvo seria o host de produção, e isso está bloqueado.

A mensagem de erro lista comandos de inspeção. Não imprime `.env`, senha nem token. Não reverte sozinha, para um humano decidir.

## V2.50

- Fase: 7
- Estado: VERIFICADO no texto do script e nos testes de falha. Kali não rodou.
- Mudanças: nenhuma sonda nova.
- Evidências: o teste "ready never becomes true" exige ALERTA e a frase de não reversão, e recusa `git reset` nesse stderr.
- Pendências: o container real da VM.
- Commit: este doc.
