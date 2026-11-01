# Configuração do Supabase e Netlify

O projeto usa o Supabase Auth para autenticar e uma linha protegida no PostgreSQL para compartilhar os dados do PDV entre os usuários autorizados. As alterações usam controle de versão para evitar sobrescrever silenciosamente uma sessão concorrente. As contas não são criadas pela tela de login.

## 1. Criar e configurar o Supabase

1. Crie um projeto no [Supabase](https://supabase.com/).
2. No **SQL Editor**, execute o arquivo [`supabase-schema.sql`](./supabase-schema.sql).
3. Em **Authentication → Providers → Email**, mantenha o provedor de e-mail ativo.
4. Em **Authentication → Settings**, desative **Allow new users to sign up**. Crie ou convide cada usuário pelo painel administrativo do Supabase.
5. Em **Authentication → URL Configuration**, adicione o endereço de produção do Netlify à lista de URLs permitidas.
6. Copie a **Project URL** e a chave pública **Publishable** (`sb_publishable_...`) ou a chave pública legada **anon**. Nunca use `service_role` ou outra chave secreta no navegador.

Todos os usuários criados pelo administrador compartilham os mesmos dados desta loja. A política RLS só permite acesso a usuários autenticados; a chave pública no site não substitui essa proteção.

## 2. Configurar o Netlify

1. Importe este projeto no Netlify e configure as variáveis de ambiente do site:
   - `SUPABASE_URL`: Project URL do Supabase.
   - `SUPABASE_PUBLISHABLE_KEY`: chave pública Publishable; ou `SUPABASE_ANON_KEY`: chave pública legada anon.
2. Faça o deploy. O `netlify.toml` executa o script que gera `supabase-config.js` durante o build. O build falha intencionalmente quando as variáveis não estão configuradas.
3. Em **Supabase → Authentication → URL Configuration**, configure também a URL do site publicada pelo Netlify e a URL de redirecionamento autorizada.

As chaves públicas podem ser enviadas ao navegador; a segurança depende das políticas RLS e da configuração do Auth. Nunca configure uma chave `service_role` nas variáveis destinadas ao frontend.

## 3. Desenvolvimento local

Edite [`supabase-config.js`](./supabase-config.js) com a Project URL e a chave pública do projeto. Esse arquivo contém apenas configuração pública; não coloque nele senhas ou chaves secretas. Sirva os arquivos por um servidor local e use o e-mail e a senha da conta criada pelo administrador.

Sem configuração válida, o botão de login permanece desabilitado. Nenhum cadastro ou autenticação demonstrativa é permitido.

## Dados locais existentes

Os dados antigos guardados no `localStorage` do navegador não são enviados automaticamente ao banco. Antes de usar o novo deploy com dados existentes, faça uma cópia e planeje a migração; não sobrescreva dados de produção sem um backup.
