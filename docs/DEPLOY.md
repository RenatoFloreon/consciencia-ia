# Documentação de Deploy e Manutenção - Consciênc.IA

## Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura do Sistema](#arquitetura-do-sistema)
3. [Requisitos](#requisitos)
4. [Configuração do Ambiente](#configuração-do-ambiente)
5. [Deploy no GitHub e Vercel](#deploy-no-github-e-vercel)
6. [Configuração do Redis](#configuração-do-redis)
7. [Configuração da API do WhatsApp](#configuração-da-api-do-whatsapp)
8. [Configuração da OpenAI](#configuração-da-openai)
9. [Painel Administrativo](#painel-administrativo)
10. [Manutenção e Atualizações](#manutenção-e-atualizações)
11. [Solução de Problemas](#solução-de-problemas)
12. [Contatos e Suporte](#contatos-e-suporte)

## Visão Geral

O Consciênc.IA é uma aplicação desenvolvida para o evento Mapa do Lucro, que proporciona uma experiência interativa com IA através do WhatsApp. A aplicação analisa perfis de redes sociais dos usuários, coleta informações sobre seus desafios pessoais e profissionais, e gera cartas personalizadas com recomendações e poesias inspiradoras.

### Principais Funcionalidades

- Integração com WhatsApp Business API
- Análise de perfis de Instagram e LinkedIn
- Geração de cartas personalizadas com IA
- Painel administrativo para visualização de dados
- Exportação de dados em formatos CSV e JSON

## Arquitetura do Sistema

O sistema é composto pelos seguintes componentes:

1. **Aplicação Node.js**: Servidor principal que gerencia o fluxo de conversação, integração com APIs e lógica de negócio
2. **Redis**: Banco de dados em memória para armazenamento de estado da conversa e dados dos usuários
3. **WhatsApp Business API**: Para envio e recebimento de mensagens
4. **OpenAI API**: Para geração de conteúdo personalizado e análise de perfis
5. **Vercel**: Plataforma de hospedagem para o servidor Node.js
6. **GitHub**: Repositório de código e controle de versão

### Diagrama de Arquitetura

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  WhatsApp   │◄────┤   Vercel    │◄────┤   GitHub    │
│  Business   │     │  (Node.js)  │     │ Repository  │
│     API     │────►│             │     │             │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    Redis    │
                    │  Database   │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   OpenAI    │
                    │     API     │
                    └─────────────┘
```

## Requisitos

### Software

- Node.js v16.x ou superior
- npm v8.x ou superior
- Git
- Conta no GitHub
- Conta na Vercel
- Conta no Upstash (Redis)
- Conta na Meta for Developers (WhatsApp Business API)
- Conta na OpenAI

### Variáveis de Ambiente

```
# Servidor
PORT=3000
NODE_ENV=production

# Redis
REDIS_URL=redis://...

# WhatsApp
WHATSAPP_TOKEN=seu_token_aqui
WHATSAPP_PHONE_NUMBER_ID=seu_phone_number_id
WHATSAPP_VERIFY_TOKEN=seu_verify_token_personalizado

# OpenAI
OPENAI_API_KEY=sua_api_key
OPENAI_ORGANIZATION=sua_organization_id

# Admin
ADMIN_USERNAME=consciencia
ADMIN_PASSWORD=consciencia2025
SESSION_SECRET=seu_session_secret_personalizado
```

## Configuração do Ambiente

### 1. Clone o Repositório

```bash
git clone https://github.com/seu-usuario/consciencia-ia.git
cd consciencia-ia
```

### 2. Instale as Dependências

```bash
npm install
```

### 3. Configure as Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com as variáveis listadas na seção de Requisitos.

## Deploy no GitHub e Vercel

### 1. Criação do Repositório no GitHub

1. Acesse [GitHub](https://github.com) e faça login
2. Clique em "New repository"
3. Nomeie o repositório como "consciencia-ia"
4. Escolha a visibilidade (público ou privado)
5. Clique em "Create repository"

### 2. Envio do Código para o GitHub

```bash
git init
git add .
git commit -m "Versão inicial"
git branch -M main
git remote add origin https://github.com/seu-usuario/consciencia-ia.git
git push -u origin main
```

### 3. Deploy na Vercel

1. Acesse [Vercel](https://vercel.com) e faça login
2. Clique em "New Project"
3. Importe o repositório do GitHub
4. Configure as variáveis de ambiente na seção "Environment Variables"
5. Clique em "Deploy"

### 4. Configuração de Domínio Personalizado (Opcional)

1. Na dashboard da Vercel, acesse o projeto
2. Vá para "Settings" > "Domains"
3. Adicione seu domínio personalizado
4. Siga as instruções para configurar os registros DNS

## Configuração do Redis

### 1. Criação de uma Instância no Upstash

1. Acesse [Upstash](https://upstash.com) e faça login
2. Crie um novo banco de dados Redis
3. Escolha a região mais próxima do seu público-alvo
4. Copie a URL de conexão Redis

### 2. Configuração no Projeto

Adicione a URL de conexão Redis à variável de ambiente `REDIS_URL` no arquivo `.env` e no painel da Vercel.

## Configuração da API do WhatsApp

### 1. Criação de uma Conta Meta for Developers

1. Acesse [Meta for Developers](https://developers.facebook.com) e faça login
2. Crie um novo aplicativo
3. Adicione o produto "WhatsApp" ao seu aplicativo

### 2. Configuração do Webhook

1. Na seção "WhatsApp" > "Configuration", configure o webhook
2. URL do Webhook: `https://seu-dominio.vercel.app/webhook`
3. Token de Verificação: O mesmo valor definido em `WHATSAPP_VERIFY_TOKEN`
4. Campos de inscrição: `messages`

### 3. Obtenção dos Tokens

1. Na seção "WhatsApp" > "Getting Started", obtenha o Token de Acesso Permanente
2. Copie o Phone Number ID
3. Adicione esses valores às variáveis de ambiente `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`

## Configuração da OpenAI

### 1. Criação de uma Conta OpenAI

1. Acesse [OpenAI](https://platform.openai.com) e faça login
2. Vá para "API Keys" e crie uma nova chave secreta
3. Copie a chave API e adicione à variável de ambiente `OPENAI_API_KEY`
4. Opcionalmente, copie o ID da organização e adicione à variável `OPENAI_ORGANIZATION`

## Painel Administrativo

### Acesso ao Painel

- URL: `https://seu-dominio.vercel.app/admin`
- Usuário: `consciencia`
- Senha: `consciencia2025`

### Funcionalidades do Painel

1. **Dashboard**: Visão geral das estatísticas
2. **Lista de Usuários**: Visualização detalhada das interações
3. **Exportação de Dados**: Formatos CSV e JSON
4. **Visualização de Detalhes**: Informações completas de cada interação

## Manutenção e Atualizações

### Atualização do Código

1. Faça as alterações necessárias no código local
2. Teste as alterações localmente com `npm run dev`
3. Commit e push para o GitHub:

```bash
git add .
git commit -m "Descrição das alterações"
git push origin main
```

4. A Vercel detectará automaticamente as alterações e fará um novo deploy

### Monitoramento de Logs

1. Acesse o dashboard da Vercel
2. Vá para "Deployments" > [último deployment] > "Logs"
3. Monitore os logs em tempo real para identificar possíveis problemas

### Backup de Dados

Recomenda-se exportar regularmente os dados do painel administrativo para garantir que nenhuma informação seja perdida em caso de problemas com o Redis.

## Solução de Problemas

### Problemas com Webhook do WhatsApp

1. Verifique se a URL do webhook está correta
2. Confirme que o token de verificação está configurado corretamente
3. Verifique os logs da Vercel para identificar possíveis erros

### Problemas com Redis

1. Verifique se a URL de conexão está correta
2. Confirme que a instância do Redis está ativa
3. Tente reiniciar a aplicação na Vercel

### Problemas com OpenAI

1. Verifique se a chave API está correta
2. Confirme que há créditos suficientes na conta
3. Verifique os limites de taxa da API

## Contatos e Suporte

Para suporte técnico ou dúvidas sobre a aplicação, entre em contato:

- **Desenvolvedor**: [Seu Nome]
- **Email**: [seu-email@exemplo.com]
- **GitHub**: [https://github.com/seu-usuario](https://github.com/seu-usuario)

---

© 2025 Consciênc.IA - Todos os direitos reservados
