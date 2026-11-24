# Zoom Tech — implantação do diagnóstico vinculado à OS

## O que foi alterado
- O link de diagnóstico agora é gerado a partir do detalhe de uma OS existente.
- O link usa token aleatório de 256 bits, armazenado somente como SHA-256 no banco, expira em 24 horas e aceita um único envio.
- O navegador não faz mais INSERT direto em `hardware_diagnostics`; o recebimento é validado pela Edge Function com a chave `service_role` somente no servidor.
- O laudo fica em `hardware_diagnostics` e o resumo é incorporado ao objeto da OS em `pdv_data.data.serviceOrders[].hardwareDiagnostics`.
- A interface do teste recebeu refinamento visual escuro, cartões, progresso e indicadores coerentes com os exemplos apresentados.

## Aplicação no Supabase
1. Faça backup do projeto/banco.
2. No Supabase SQL Editor, execute `supabase/migrations/202611240001_hardware_diagnostics_secure.sql` (ou execute o `supabase-schema.sql` completo em um ambiente novo).
3. Publique a função: `supabase functions deploy hardware-diagnostics --no-verify-jwt`.
4. Confirme que as secrets padrão `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` estão disponíveis para Edge Functions. Nunca coloque `service_role` no frontend.
5. Publique os arquivos web atualizados, incluindo `hardware-test.html`, `hardware-test.js`, `css-diagnostico/diagnostico.css`, `app.js`, `index.html` e `supabase-config.js`.

## Como usar
1. Entre na plataforma com usuário técnico autorizado e MFA AAL2, conforme as políticas atuais do PDV.
2. Abra uma ordem de serviço e clique em **Gerar link de diagnóstico**.
3. Envie o QR Code/link ao cliente. A sessão expira em 24 horas e só pode enviar um relatório.
4. Após o envio, reabra/atualize a OS para visualizar o resumo de hardware no bloco Diagnóstico. O relatório completo está na tabela `hardware_diagnostics`.

## Limites técnicos
Os testes web existentes continuam dependentes das permissões e capacidades do navegador. Flash, vibração, sensores e identificação detalhada variam por aparelho/navegador. Esta entrega corrige o vínculo, o fluxo de envio e a segurança do backend; ela não transforma automaticamente APIs web em acesso nativo completo Android/iOS.

## Instalação como aplicativo

### PWA (sem loja de aplicativos)
- Publique a página em HTTPS.
- Android/Chrome: abra `hardware-test.html` e use **Instalar aplicativo** ou **Adicionar à tela inicial**.
- iPhone/Safari: abra `hardware-test.html`, toque em Compartilhar e escolha **Adicionar à Tela de Início**.
- Se abrir o app instalado sem um link, cole o código de 64 caracteres fornecido pelo técnico.

### Gerar o projeto Android/iOS com Capacitor
O projeto inclui um wrapper Capacitor separado em `mobile-www/`, apontado para a interface de diagnóstico.

```bash
npm install
npx cap add android
npx cap add ios
npx cap sync
npx cap open android
# no macOS, para iOS:
npx cap open ios
```

O APK/AAB e o pacote iOS ainda precisam ser compilados e assinados no Android Studio/Xcode. A geração de binários não foi executada neste ambiente. O wrapper preserva a mesma interface web; o acesso a APIs nativas adicionais (por exemplo, sensores e lanterna em todos os modelos) exige plugins/implementações nativas específicas e validação em aparelhos reais.
