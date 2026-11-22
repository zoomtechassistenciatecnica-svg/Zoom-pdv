# Configuração do Supabase e Netlify

O projeto usa o Supabase Auth para autenticar e uma linha protegida no PostgreSQL para compartilhar os dados do PDV entre os usuários autorizados. As alterações usam controle de versão para evitar sobrescrever silenciosamente uma sessão concorrente. As contas não são criadas pela tela de login. O acesso aceita e-mail (compatibilidade com contas antigas), CPF ou telefone, sempre com a senha já cadastrada no Supabase Auth.

## 1. Criar e configurar o Supabase

1. Crie um projeto no [Supabase](https://supabase.com/).
2. No **SQL Editor**, execute o arquivo [`supabase-schema.sql`](./supabase-schema.sql).
3. Em **Authentication → Providers → Email**, mantenha o provedor de e-mail ativo.
4. Em **Authentication → Settings**, desative **Allow new users to sign up**. Crie ou convide cada usuário em **Authentication → Users**. Para login por CPF, preencha o CPF em User Metadata com a chave `cpf` (somente números, de preferência). Para login por telefone nativo, habilite o provedor Phone e cadastre/verifique o telefone no formato internacional `+55...`. O login por telefone também tenta localizar os campos `phone`/`cpf`/`document` dos metadados por meio da função SQL.
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

Edite [`supabase-config.js`](./supabase-config.js) com a Project URL e a chave pública do projeto. Esse arquivo contém apenas configuração pública; não coloque nele senhas ou chaves secretas. Sirva os arquivos por um servidor local e use o e-mail, CPF ou telefone e a senha da conta criada pelo administrador. Contas existentes continuam podendo entrar pelo e-mail.

Sem configuração válida, o botão de login permanece desabilitado. Nenhum cadastro ou autenticação demonstrativa é permitido.

## Dados locais existentes

Os dados antigos guardados no `localStorage` do navegador não são enviados automaticamente ao banco. Antes de usar o novo deploy com dados existentes, faça uma cópia e planeje a migração; não sobrescreva dados de produção sem um backup.


## Etapa de segurança: login por CPF/telefone via Edge Function

A resolução de CPF/telefone não deve ser feita por uma função SQL pública que devolve o e-mail. A implementação atualizada usa `supabase/functions/login-by-identifier/index.ts`: o navegador envia identificador e senha por HTTPS; a função consulta uma rotina SQL restrita ao `service_role` que retorna somente o UUID da conta, autentica a senha no Supabase Auth e devolve somente a sessão. O e-mail associado nunca é enviado ao navegador.

### Aplicar no projeto Supabase

1. Faça backup do projeto e confirme que a autenticação por e-mail continua habilitada.
2. No SQL Editor do mesmo projeto Supabase, execute novamente o arquivo `supabase-schema.sql`. Ele remove a antiga `resolve_login_identifier`, cria a tabela interna de limitação de tentativas e concede a função de controle somente a `service_role`. Não apague `auth.users` nem `public.pdv_data`.
3. Instale o Supabase CLI e autentique: `supabase login`.
4. Vincule este diretório ao projeto correto usando o Project Reference ID exibido em Project Settings → General: `supabase link --project-ref SEU_PROJECT_REF`.
5. Publique a função: `supabase functions deploy login-by-identifier`.
6. Confira em Edge Functions se `login-by-identifier` está ativa. A configuração `verify_jwt = false` é necessária porque a tela de login ainda não tem uma sessão; a função aplica validação de entrada, autenticação de senha no Auth e limite por IP.
7. Confirme que os segredos padrão `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY` estão disponíveis no ambiente da Edge Function. Se não estiverem, configure-os pelo painel/CLI. A chave `service_role` fica exclusivamente no servidor e nunca no JavaScript do site.
8. Publique o frontend atualizado (web) e gere novamente o app Android a partir dos arquivos web sincronizados.

### Como os identificadores são associados

- CPF: `user_metadata.cpf` ou `user_metadata.document`, somente dígitos.
- Telefone: campo Phone do Auth ou `user_metadata.phone` / `user_metadata.telefone`, com DDD brasileiro. Contas que já usam telefone nativo continuam sendo autenticadas pelo telefone no Auth.
- E-mail: continua usando diretamente `signInWithPassword({ email, password })`, sem passar pela Edge Function.

Se mais de uma conta corresponder ao mesmo CPF/telefone, o login é recusado de forma genérica. Corrija o cadastro duplicado no painel Auth antes de testar novamente.

### Testes obrigatórios antes de produção

- Login de conta antiga por e-mail e senha.
- Login por CPF com senha existente.
- Login por telefone com DDD.
- MFA/TOTP após cada autenticação.
- Leitura e gravação de produtos, clientes, vendas e ordens de serviço.
- Teste em dois dispositivos e no Android.
- Tentativas repetidas: após 10 chamadas por minuto por IP, a função deve responder HTTP 429.

A alteração não cria usuários, não redefine senhas e não altera os IDs de `auth.users` nem o conteúdo de `pdv_data`. A migração de login é independente dos dados comerciais. A limitação de tentativas é uma proteção básica; para ambientes de alto volume, complemente com monitoramento e proteção anti-abuso no gateway.
