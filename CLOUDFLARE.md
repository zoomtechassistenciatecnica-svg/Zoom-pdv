# Hospedagem independente na Cloudflare Pages

Esta branch `cloudflare-pages` foi criada para preparar a publicação na Cloudflare sem alterar a branch `main`, utilizada pela hospedagem atual na Netlify.

## Configuração do projeto Cloudflare Pages

- Repositório: `zoomtechassistenciatecnica-svg/Zoom-pdv`
- Branch de produção: `cloudflare-pages`
- Framework preset: `None`
- Build command: `node scripts/write-cloudflare-config.js`
- Build output directory: `.` (raiz do repositório)
- Root directory: `/`

## Variáveis de ambiente

No painel do Cloudflare Pages, em Settings → Environment variables, configure para Production (e Preview, se desejar):

- `SUPABASE_URL`: URL do projeto Supabase.
- `SUPABASE_PUBLISHABLE_KEY`: chave pública Publishable do Supabase. Também é aceito `SUPABASE_ANON_KEY` se o projeto usar a chave legada.

O build gera `supabase-config.js` automaticamente. Não use `service_role`, `sb_secret_`, senha ou qualquer chave privada no frontend.

## Criar a hospedagem

1. Acesse https://dash.cloudflare.com/ e entre na sua conta.
2. Abra Workers & Pages → Create application → Pages → Connect to Git.
3. Autorize o GitHub e selecione `zoomtechassistenciatecnica-svg/Zoom-pdv`.
4. Defina o nome do projeto, por exemplo `zoomtech-pdv`.
5. Configure os valores de build indicados acima e escolha `cloudflare-pages` como Production branch.
6. Adicione as duas variáveis do Supabase e clique em Save and Deploy.

O endereço será `https://NOME-DO-PROJETO.pages.dev`.

## Supabase Auth

No Supabase → Authentication → URL Configuration, adicione o novo domínio `.pages.dev` em Site URL / Redirect URLs, mantendo também os endereços atuais da Netlify. Não remova as URLs existentes.

## Importante

- Esta branch não altera os arquivos da branch `main`.
- A configuração e os dados do Supabase não são criados por este deploy; é necessário usar o mesmo projeto Supabase já configurado e suas políticas RLS.
- Antes de liberar a nova URL para uso real, valide login, leitura, gravação e sincronização em dois dispositivos.
