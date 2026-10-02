# Grimório de Missões no VPS da Hostinger (Docker + Traefik)

Guia do dono. Feito para ser seguido de cima para baixo, sem pressa, na ordem.
No fim o Grimório estará em **https://grimorio.michelfernandes.adv.br**, com
banco próprio no VPS, **sem mexer no que está no Render**.

> **Ideia geral:** o Render continua no ar exatamente como está. O VPS ganha uma
> cópia independente do Grimório (imagem Docker construída a partir do GitHub),
> com o banco em um volume próprio. Os dois **não** compartilham banco: um usa o
> Supabase (Render) e o outro usa um arquivo JSON no VPS. Enquanto os dois
> estiverem no ar, cada um tem a sua própria cópia dos dados.

---

## 1. Antes de começar (pré-requisitos)

| Item | Como conferir |
| --- | --- |
| Projeto do Traefik já instalado no VPS | Docker Manager → **Projects**: deve existir um projeto com Traefik (com a rede `traefik-proxy`, entrypoint `websecure` e certresolver `letsencrypt`). Este guia **não** instala Traefik. |
| DNS apontando para o VPS | No seu provedor de domínio, registro **A** de `grimorio.michelfernandes.adv.br` → IP do VPS. Já está feito, segundo você. |
| Repositório público | `https://github.com/MichelFRibeiro/grimorio` está **público** (conferido). É o que permite usar o "Compose from URL" sem chave de acesso. |
| Acesso ao Google Cloud Console | Para liberar o novo endereço no cliente OAuth que já existe. |

Nada precisa ser instalado na sua máquina: o VPS constrói a imagem.

---

## 2. Liberar o novo endereço no Google (login)

O login usa o botão oficial do Google, que só funciona em endereços cadastrados.

1. Abra <https://console.cloud.google.com> e escolha o projeto onde está o
   cliente OAuth do Grimório.
2. Menu **APIs e serviços** → **Credenciais**.
3. Em **IDs do cliente OAuth 2.0**, clique no cliente que você já usa (tipo
   *Aplicativo da Web*).
4. Em **Origens JavaScript autorizadas**, clique em **ADICIONAR URI** e inclua:

   ```
   https://grimorio.michelfernandes.adv.br
   ```

   Não apague as origens que já existem (a do Render, a de `localhost`) — elas
   continuam sendo usadas.
5. **Salvar**. (Não é preciso criar cliente novo, nem mexer em "URIs de
   redirecionamento": o Grimório usa o fluxo de ID token do Google, que depende
   só das origens JavaScript.)
6. Guarde o **ID do cliente** (termina com `.apps.googleusercontent.com`):
   ele vai ser a variável `GOOGLE_CLIENT_ID` no passo 4.

Se você ainda não tiver o ID do cliente, ele também aparece no Grimório do
Render: o próprio app mostra as instruções na tela de login.

---

## 3. Criar o projeto no Docker Manager (Compose from URL)

1. Docker Manager → **Projects** → **Create / Add project** (ou **Compose**).
2. Escolha a opção **Compose from URL** (ou "Git repository", dependendo da
   versão) e informe:

   ```
   https://raw.githubusercontent.com/MichelFRibeiro/grimorio/main/docker-compose.yml
   ```

   Esse arquivo já traz tudo: build da imagem, volume de dados, as labels do
   Traefik, o limite de memória (512 MB) e a rotação de logs.

   > **Alternativa (se preferir não usar a URL):** abra o arquivo
   > `docker-compose.yml` do repositório, copie o conteúdo inteiro e cole no
   > campo "Compose file / YAML" do Docker Manager. O resultado é idêntico.

3. Dê ao projeto um nome fácil de lembrar, por exemplo **grimorio**.
4. **Não** altere nenhuma porta: o arquivo não publica portas de propósito. O
   Traefik entra pela rede interna `traefik-proxy`.

---

## 4. Preencher as variáveis de ambiente

No próprio projeto (aba **Environment variables** / **Variáveis de ambiente**),
cadastre:

| Variável | Obrigatória | O que colocar |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | **Sim** | O ID do cliente OAuth do passo 2 (`...apps.googleusercontent.com`). Sem ele o botão de login do Google não aparece. |
| `OWNER_EMAILS` | **Sim** | O(s) e-mail(s) que podem entrar, separados por vírgula. Use exatamente o mesmo e-mail da conta Google com que você entra hoje. |
| `OPENROUTER_API_KEY` | Opcional | Só se você usa o Oráculo/Jev com IA. Também pode ser cadastrada depois pelo próprio app. |
| `MCP_BEARER_TOKEN` | Opcional | Só se você quer fixar o token do MCP em vez de deixar o app gerar. |

As demais variáveis (`APP_URL`, `ALLOWED_ORIGINS`, `HOST`, `PORT`,
`GRIMORIO_DATA_DIR`, `GRIMORIO_DAILY_BACKUPS` etc.) já estão escritas dentro do
`docker-compose.yml` — não precisa criar.

> **Importante:** **não** cadastre `DATABASE_URL`. É justamente a ausência dela
> que faz o app usar o banco JSON do volume, em vez do Supabase. Se alguém
> cadastrar, o app volta a apontar para Postgres.

---

## 5. Subir e conferir

1. Clique em **Deploy** / **Start**. A primeira subida é a mais lenta: o VPS
   baixa as dependências, compila o site e só então inicia. Conte de **5 a 15
   minutos** (depende da força do VPS); acompanhe pelos **Logs** do projeto. É
   normal ver várias linhas de `npm install`/`vite build` antes de aparecer
   `Servidor iniciado com sucesso`.
2. O certificado HTTPS costuma sair em **1 a 3 minutos** depois que o container
   fica saudável. Enquanto isso, o navegador pode avisar de certificado — é
   normal, espere e recarregue.
3. Teste no navegador:

   ```
   https://grimorio.michelfernandes.adv.br/api/auth/config
   ```

   A resposta esperada é um JSON parecido com:

   ```json
   { "googleClientId": "....apps.googleusercontent.com", "guestEnabled": false, "emailLoginEnabled": false }
   ```

   Se `googleClientId` vier vazio, a variável `GOOGLE_CLIENT_ID` não chegou ao
   container: confira o passo 4 e faça um novo deploy.
4. Abra <https://grimorio.michelfernandes.adv.br> e entre com o Google. Neste
   primeiro momento o app estará **vazio** (banco novo) — os dados vão no passo
   seguinte.

---

## 6. Trazer os seus dados do Render (uma única vez)

O Grimório tem exportação e importação de backup prontas na tela. Faça na
ordem:

### 6.1 Exportar do app antigo (Render)

1. Abra o Grimório do Render e faça login.
2. No menu superior, clique na aba **Oráculo** (ícone de bússola 🧭).
3. No canto superior direito do painel do Oráculo, clique em
   **⬇ Exportar Backup JSON**.
4. O navegador baixa um arquivo com nome tipo
   `grimorio-backup-2026-10-02.json`. Guarde-o em lugar seguro.

   > Esse arquivo **não** leva senhas nem sessões (o app remove de propósito
   > `integrations`, o token do MCP e as sessões de login). Ou seja: você entra
   > de novo pelo Google e, se usa o MCP com algum agente de IA, o token é
   > refeito depois (aba do MCP no app).

### 6.2 Importar no app novo (VPS)

1. Abra <https://grimorio.michelfernandes.adv.br> e entre com o **mesmo**
   e-mail Google.
2. Vá na aba **Oráculo** (🧭) de novo.
3. No mesmo canto superior direito, clique em **⬆ Importar** (botão ao lado do
   "Exportar Backup JSON") e escolha o arquivo baixado no passo anterior.
4. Aparece o aviso **"Backup restaurado com sucesso!"**. Recarregue a página:
   missões, hábitos, livros, mapas mentais, XP e moedas devem estar todos lá.
5. Antes de sobrescrever, o app guarda uma cópia de segurança do estado anterior
   dentro do volume, com o nome `backup-pre-import-<data>.json` — se algo der
   errado, é só reimportar esse arquivo do mesmo jeito.

> Confira os números principais (nível, XP, moedas, sequência de dias) nos dois
> apps lado a lado. Se algo não bater, **não** continue: reimporte o arquivo.

---

## 7. Parar de usar o Render (opcional, mas recomendado)

A partir do momento em que você usa o app do VPS no dia a dia, **pare de usar o
do Render**, senão você passa a ter dois bancos diferentes e vai perder o que
registrar no lado errado.

- **Forma suave:** simplesmente pare de abrir o endereço do Render e use só o
  novo.
- **Forma definitiva:** no Render, suspenda o serviço (Suspender/Delete). O
  código e as configurações continuam no GitHub — o Render não é mais
  necessário.
- Se você **não** suspender, tudo bem: só lembre que os dois não se sincronizam.

---

## 8. Atualizar depois de um `git push`

Quando o código novo for enviado para a branch `main` do GitHub:

1. Docker Manager → **Projects** → projeto **grimorio**.
2. Use a ação **Update / Redeploy / Rebuild** do projeto (o nome varia um
   pouco conforme a versão do painel).
3. Espere o rebuild (**2 a 10 minutos**; as camadas de dependências ficam em
   cache, então costuma ser bem mais rápido que a primeira subida). Os dados
   **não** são afetados: eles vivem no volume `grimorio-data`, que o rebuild não
   toca.

Se preferir, apague e recrie o projeto — o volume continua existindo e os dados
seguem lá.

---

## 9. Voltar atrás (rollback)

- O Render continua no ar e intocado: é o seu plano B.
- Para desfazer no VPS: no Docker Manager, use **Stop** (pausa) ou **Delete**
  (remove o projeto). Em qualquer um dos casos o volume `grimorio-data`
  permanece, então nada de dados é perdido.
- Nada neste guia alterou o Render: nem variáveis, nem banco, nem código de
  deploy. As novidades do VPS são todas desligadas por variável de ambiente e
  ficam inativas lá.

---

## 10. Onde ficam os backups e como baixá-los

O app grava **um retrato por dia** do banco dentro do volume:

```
/data/backups/database-AAAA-MM-DD.json     (mantém os 30 mais recentes)
/data/database.json                        (banco em uso)
/data/database.json.bak                    (versão anterior boa)
/data/backup-pre-import-<data>.json        (cópia feita antes de uma importação)
```

O que você monta no VPS (volume `grimorio-data`) é o `/data` do container. Para
ver ou baixar os arquivos, use o **terminal do Docker Manager** (ou SSH no VPS) e
rode:

```bash
# listar os backups
docker exec grimorio ls -l /data/backups

# copiar um backup para a pasta atual do VPS (depois baixe por SFTP/painel)
docker cp grimorio:/data/backups/database-2026-10-02.json .
```

Dentro do app, o caminho continua sendo a aba **Oráculo** → **Exportar Backup
JSON** (baixa direto pelo navegador, sem precisar de terminal) — é o jeito mais
simples para uma cópia manual.

---

## 11. Se algo der errado

| Sintoma | Provável causa e o que fazer |
| --- | --- |
| Página "404 page not found" do Traefik | O container não está na rede `traefik-proxy` ou o projeto do Traefik está parado. Confira em Docker Manager se o projeto do Traefik está **Running** e se o projeto `grimorio` mostra a rede `traefik-proxy`. |
| Certificado ainda "não seguro" | Espere 1–3 minutos e recarregue. Se passar de 10 minutos: confira se o DNS **A** de `grimorio.michelfernandes.adv.br` aponta para o IP do VPS (a emissão do certificado usa a porta 80). |
| **502 Bad Gateway** | O container subiu e caiu, ou ainda está construindo. Veja os **Logs** do projeto. Build que falhou aparece como erro do npm/vite no log. |
| Botão do Google não aparece | `GOOGLE_CLIENT_ID` vazio. Confira em `/api/auth/config` e reveja o passo 4. |
| "Origem não permitida" / login recusado pelo Google | Falta a origem `https://grimorio.michelfernandes.adv.br` no cliente OAuth (passo 2). |
| "Não autorizado" ao entrar | O e-mail usado não está em `OWNER_EMAILS`. |
| Áudio do foco mudo | Abra `https://grimorio.michelfernandes.adv.br/api/focus/track`: deve responder `"sizeBytes": 42963426`. Se responder erro, a imagem foi construída sem a pasta `data/audio` (refaça o build). |
| Alterei algo e o app "não mudou" | Só um **Update/Redeploy** do projeto reconstrói a imagem. |
| Apareceu "Backup diário" nos logs | É normal e desejado: uma linha por dia, gravando `/data/backups/database-AAAA-MM-DD.json`. |
| Log de `KeepAlive` a cada 10 min | Normal: o app se auto-verifica pela URL pública. Não faz mal (era obrigatório no Render; aqui é só um teste de vida). |

---

## 12. Checklist final

- [ ] Origem `https://grimorio.michelfernandes.adv.br` adicionada no Google Cloud
      Console (sem apagar as antigas).
- [ ] Projeto criado no Docker Manager a partir do compose do GitHub.
- [ ] `GOOGLE_CLIENT_ID` e `OWNER_EMAILS` preenchidos; **sem** `DATABASE_URL`.
- [ ] `/api/auth/config` mostra o `googleClientId`.
- [ ] Login Google funcionando no endereço novo.
- [ ] Backup exportado do Render e importado no VPS ("Backup restaurado com
      sucesso!").
- [ ] Números conferidos (nível, XP, moedas, sequência).
- [ ] Decidido o que fazer com o Render (parar de usar ou suspender).
- [ ] Confirmado que `docker exec grimorio ls /data/backups` mostra o arquivo do
      dia.

---

## 13. Detalhes técnicos (para quem for mexer depois)

- **Imagem:** `Dockerfile` na raiz, multi-stage `node:22-bookworm-slim`
  (glibc, porque o build do Vite usa binários de esbuild/rollup compatíveis com
  o `package-lock.json`). Roda como usuário **node** (não root), `EXPOSE 3000`,
  `HEALTHCHECK` chamando `http://127.0.0.1:3000/api/health`.
- **Estrutura dentro da imagem:** `/app/server`, `/app/src`, `/app/dist`,
  `/app/data/audio/focus_mp3.mp3`, `/app/package*.json`. O banco **não** entra
  na imagem.
- **Volume:** `grimorio-data` montado em `/data` (com `/data/backups` já criado
  e pertencente ao usuário `node`).
- **Áudio de foco:** resolvido primeiro por `FOCUS_AUDIO_PATH`
  (`/app/data/audio/focus_mp3.mp3`, definido no compose), depois pelo caminho
  empacotado na imagem e depois por `/data/audio/focus_mp3.mp3` — ou seja, você
  pode trocar o áudio colocando um arquivo no volume, sem reconstruir a imagem.
- **Backup diário:** `GRIMORIO_DAILY_BACKUPS=1` grava
  `/data/backups/database-AAAA-MM-DD.json` na primeira gravação do dia (e no
  boot), sem sobrescrever o retrato do dia, mantendo
  `GRIMORIO_BACKUP_RETENTION=30` arquivos. Desligado por padrão (é o que mantém
  o Render igual).
- **Proxy:** `TRUST_PROXY=1` faz o Express confiar no primeiro hop, para
  `req.protocol` devolver `https` (links do MCP) atrás do Traefik.
- **Banco:** sem `DATABASE_URL`, o app usa `GRIMORIO_DATA_DIR/database.json`.
  Com `DATABASE_URL`, voltaria a usar Postgres — por isso ela não existe no
  compose.
- **Recursos:** `mem_limit: 512m` e logs com rotação (10 MB × 3) para não
  atrapalhar os outros serviços do VPS.
