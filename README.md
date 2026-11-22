# Zoom Tech -- Plataforma PDV

**Sistema de gestão de vendas, estoque, clientes e assistência técnica**

A Zoom Tech Plataforma PDV é um sistema destinado a apoiar a rotina de
lojas de tecnologia e assistência técnica, reunindo operações
comerciais, cadastro de clientes, controle de estoque e acompanhamento
de ordens de serviço.

> **Observação:** este README apresenta as funcionalidades descritas
> para o projeto. A disponibilidade de cada recurso depende da
> implementação e da configuração atuais da aplicação.

## Funcionalidades

### Vendas (PDV)

-   Registro e gerenciamento de vendas.
-   Pesquisa e seleção de produtos.
-   Associação de clientes às vendas.
-   Registro de formas de pagamento, como Pix, dinheiro e cartões.
-   Cálculo de valores pagos e troco.
-   Cancelamento de vendas.
-   Abertura e fechamento de caixa.
-   Histórico e relatórios de vendas por período.

### Controle de estoque

-   Cadastro e consulta de produtos.
-   Registro de preços de compra e venda.
-   Controle de quantidades.
-   Entrada, saída e reposição de produtos.
-   Pesquisa de itens e cadastro de imagens, quando disponível.

### Clientes

-   Cadastro e gerenciamento de clientes.
-   Nome completo, CPF, telefone/WhatsApp e endereço.
-   Pesquisa de clientes para utilização nas vendas e ordens de serviço.

### Ordens de Serviço (OS)

-   Abertura e acompanhamento de ordens de serviço.
-   Cadastro de aparelho e IMEI.
-   Registro do problema relatado e do diagnóstico técnico.
-   Registro dos serviços e peças utilizados.
-   Controle de valores e observações.
-   Acompanhamento do status do reparo.
-   Armazenamento de fotos, quando habilitado.
-   Compartilhamento de informações e geração de documentos, conforme os
    recursos disponíveis na versão instalada.

### Financeiro e relatórios

-   Registro de entradas e saídas financeiras.
-   Consulta ao histórico de movimentações.
-   Relatórios diários, semanais, mensais e trimestrais, conforme a
    implementação.

### Configurações e acesso

-   Autenticação de usuários.
-   Configurações da loja e do perfil.
-   Integração com serviços de backend, quando configurada.

## Tecnologias e serviços

As tecnologias exatas devem ser confirmadas nos arquivos de configuração
do repositório. A arquitetura descrita para o projeto inclui:

-   **Git e GitHub Desktop** --- controle de versão e envio de
    alterações.
-   **Cloudflare Pages** --- hospedagem/publicação da aplicação web.
-   **Supabase** --- autenticação e banco de dados, conforme a
    configuração do projeto.
-   **Node.js e npm** --- ambiente de execução e gerenciamento de
    dependências, caso utilizados pelo projeto.

## Executar o projeto localmente

Os comandos abaixo são um fluxo comum para projetos JavaScript/Node.js.
Confira o `package.json` e as instruções específicas do projeto antes de
executar.

1.  Clone o repositório:

    ``` bash
    git clone URL_DO_REPOSITORIO
    ```

2.  Acesse a pasta do projeto:

    ``` bash
    cd "plataforma pdv"
    ```

3.  Instale as dependências:

    ``` bash
    npm install
    ```

4.  Configure as variáveis de ambiente exigidas pela aplicação. Consulte
    os arquivos de exemplo e a documentação do projeto. **Não coloque
    senhas, tokens ou chaves privadas no repositório.**

5.  Inicie a aplicação usando o script apropriado definido em
    `package.json` (por exemplo, `npm run dev`, se esse script existir).

## Publicação no Cloudflare Pages

1.  Faça as alterações nos arquivos do projeto.
2.  Revise as alterações no GitHub Desktop.
3.  Crie um commit na branch configurada para publicação (por exemplo,
    `cloudflare`).
4.  Envie o commit com **Push origin**.
5.  O Cloudflare Pages iniciará uma nova implantação se estiver
    conectado ao repositório e configurado para acompanhar essa branch.

No painel do Cloudflare Pages, confirme: - A branch definida como branch
de produção. - O comando de build. - A pasta de saída (build output
directory). - As variáveis de ambiente necessárias.

Os valores corretos dependem do framework e da configuração deste
repositório.

## Segurança

-   Não envie arquivos `.env` com credenciais para o GitHub.
-   Não exponha chaves privadas, senhas ou tokens.
-   Configure as políticas de segurança do Supabase (RLS) para proteger
    os dados.
-   Restrinja permissões de acesso conforme os usuários e funções do
    sistema.
-   Utilize variáveis de ambiente no ambiente de desenvolvimento e na
    hospedagem.

## Sobre

**Zoom Tech -- Assistência Técnica**

Plataforma voltada à gestão de vendas, produtos, clientes e serviços de
assistência técnica.

-   **Projeto:** Zoom Tech -- Plataforma PDV
-   **Idioma:** Português (Brasil)
-   **Publicação web:** Cloudflare Pages, quando configurado

------------------------------------------------------------------------

© Zoom Tech. Todos os direitos reservados.
