# Estrutura do Projeto Consciênc.IA

Este documento descreve a estrutura de arquivos e diretórios do projeto Consciênc.IA, desenvolvido para o evento Mapa do Lucro.

## Estrutura de Diretórios

```
consciencia-ia/
├── docs/                       # Documentação do projeto
│   ├── DEPLOY.md               # Instruções detalhadas de deploy
│   └── API.md                  # Documentação da API
├── public/                     # Arquivos estáticos
│   ├── css/                    # Folhas de estilo
│   ├── js/                     # Scripts do cliente
│   └── images/                 # Imagens
├── src/                        # Código-fonte da aplicação
│   ├── config/                 # Configurações da aplicação
│   │   └── env.js              # Configuração de variáveis de ambiente
│   ├── controllers/            # Controladores
│   │   └── conversationController.js  # Controlador de fluxo de conversação
│   ├── middleware/             # Middleware Express
│   │   └── authMiddleware.js   # Middleware de autenticação
│   ├── models/                 # Modelos de dados
│   ├── routes/                 # Rotas da aplicação
│   │   ├── adminRoutes.js      # Rotas do painel administrativo
│   │   └── webhookRoutes.js    # Rotas para webhook do WhatsApp
│   ├── services/               # Serviços da aplicação
│   │   ├── contentGenerationService.js  # Serviço de geração de conteúdo
│   │   ├── profileScraperService.js     # Serviço de scraping de perfis
│   │   ├── redisService.js              # Serviço de integração com Redis
│   │   └── whatsappService.js           # Serviço de integração com WhatsApp
│   ├── utils/                  # Utilitários
│   │   └── logger.js           # Utilitário de logging
│   └── views/                  # Templates de visualização
│       ├── admin/              # Views do painel administrativo
│       │   └── dashboard.ejs   # Dashboard principal
│       ├── error.ejs           # Página de erro
│       └── index.ejs           # Página inicial
├── .env.example                # Exemplo de variáveis de ambiente
├── .gitignore                  # Arquivos ignorados pelo Git
├── index.js                    # Ponto de entrada da aplicação
├── package.json                # Dependências e scripts
└── README.md                   # Documentação principal
```

## Principais Componentes

### 1. Serviços

- **contentGenerationService.js**: Responsável pela geração de cartas personalizadas, poesias e respostas a perguntas de acompanhamento usando a API da OpenAI.
- **profileScraperService.js**: Implementa o scraping avançado de perfis do Instagram e LinkedIn, além de análise híbrida com GPT.
- **redisService.js**: Gerencia o armazenamento de estado da conversa, dados dos usuários e interações no Redis.
- **whatsappService.js**: Lida com a integração com a API do WhatsApp para envio e recebimento de mensagens.

### 2. Controladores

- **conversationController.js**: Gerencia o fluxo de conversação, processando mensagens recebidas e coordenando as respostas.

### 3. Rotas

- **adminRoutes.js**: Define as rotas para o painel administrativo, incluindo autenticação e API de dados.
- **webhookRoutes.js**: Implementa as rotas para o webhook do WhatsApp.

### 4. Configuração

- **env.js**: Centraliza a configuração de variáveis de ambiente e validação.

### 5. Utilitários

- **logger.js**: Fornece funções para logging consistente em toda a aplicação.

### 6. Views

- **dashboard.ejs**: Interface do painel administrativo para visualização e exportação de dados.
- **error.ejs**: Página de erro personalizada.
- **index.ejs**: Página inicial da aplicação.

## Fluxo de Dados

1. O usuário envia uma mensagem pelo WhatsApp
2. O webhook recebe a mensagem e a encaminha para o controlador de conversação
3. O controlador consulta o estado atual da conversa no Redis
4. Com base no estado, o controlador decide a próxima ação:
   - Solicitar mais informações do usuário
   - Analisar perfil de rede social
   - Gerar carta personalizada
   - Responder a perguntas de acompanhamento
5. A resposta é enviada de volta ao usuário via WhatsApp
6. Os dados da interação são armazenados no Redis para visualização no painel administrativo

## Dependências Principais

- **express**: Framework web para Node.js
- **redis**: Cliente Redis para armazenamento de dados
- **axios**: Cliente HTTP para requisições externas
- **openai**: SDK oficial da OpenAI
- **cheerio**: Biblioteca para scraping de páginas web
- **ejs**: Engine de templates para as views
- **dotenv**: Carregamento de variáveis de ambiente
