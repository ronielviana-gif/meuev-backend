# 🤖 Sistema de Atualização Automática - MeuEV

## ✅ **IMPLEMENTADO COM SUCESSO**

Sistema completo de scraping automático a cada 24h para manter o database de veículos elétricos sempre atualizado.

---

## 📋 Estrutura Implementada

### **1. Backend com Auto-Update** (`meuev-backend/`)

#### **Arquivos Criados/Modificados:**

- ✅ `scraper.js` - Motor de scraping com validação de EVs
- ✅ `server.js` - API REST + Cron Job + Checkout Mercado Pago
- ✅ `package.json` - Dependências atualizadas

#### **Dependências Instaladas:**
```json
{
  "axios": "^1.6.2",           // Requisições HTTP
  "cheerio": "^1.0.0-rc.12",   // Parse HTML (jQuery-like)
  "node-cron": "^3.0.3",       // Agendamento de tarefas
  "express": "^5.1.0",         // Web framework
  "cors": "^2.8.5",            // CORS
  "mercadopago": "^2.11.0"     // Checkout
}
```

---

## ⏰ Funcionamento do Cron Job

### **Agendamento:**
```javascript
cron.schedule('0 3 * * *', async () => {
    // Executa todos os dias às 03:00 AM
}, { timezone: "America/Sao_Paulo" });
```

### **Fluxo de Atualização:**

1. **03:00 AM diariamente:**
   - Sistema acorda automaticamente
   - Acessa sites oficiais das marcas
   - Extrai modelos e preços

2. **Validação:**
   - ✅ Verifica se é 100% elétrico (não híbrido)
   - ✅ Confirma disponibilidade no Brasil
   - ✅ Extrai preços oficiais

3. **Salvamento:**
   - Salva em `database/vehicles.json`
   - Cria backup timestamped em `database/backups/`
   - Gera relatório de mudanças em `database/reports/`

4. **Detecção de Mudanças:**
   - 📈 Alterações de preço
   - 🆕 Novos modelos lançados
   - ❌ Modelos descontinuados

---

## 🌐 Sites Pesquisados

O scraper acessa os **sites oficiais** das marcas:

| Marca | URL Oficial |
|-------|-------------|
| Renault | renault.com.br |
| BYD | byd.com/br |
| GWM | gwm-global.com/br |
| Volvo | volvocars.com/br |
| BMW | bmw.com.br |
| Tesla | tesla.com/pt_br |
| JAC | jac.com.br |
| Geely | geely.com.br |
| Chery | chery.com.br |

---

## 📡 API REST - Endpoints

### **GET /api/vehicles**
Retorna todos os veículos do database.

**Resposta:**
```json
{
  "success": true,
  "lastUpdate": "2025-12-07T12:43:00.000Z",
  "totalVehicles": 23,
  "vehicles": [...],
  "brands": ["Renault", "BYD", "GWM", ...],
  "priceRange": {
    "min": 99990,
    "max": 549900
  }
}
```

### **GET /api/vehicles/:brand**
Filtra veículos por marca.

**Exemplo:** `/api/vehicles/BYD`

### **GET /api/status**
Status do sistema de atualização.

**Resposta:**
```json
{
  "status": "Online",
  "lastUpdate": "2025-12-07T03:00:00.000Z",
  "hoursSinceUpdate": "9.7",
  "totalVehicles": 23,
  "brands": 7,
  "nextUpdate": "Diariamente às 03:00 AM"
}
```

---

## 🚀 Como Usar

### **1. Atualização Manual (Teste)**
```bash
cd meuev-backend
npm run scraper
```

### **2. Iniciar Servidor (Com Auto-Update)**
```bash
cd meuev-backend
npm start
```

O servidor iniciará em `http://localhost:4000` com:
- ✅ Checkout Mercado Pago
- ✅ API REST de veículos
- ✅ Cron job ativo (03:00 AM diário)

### **3. Integrar Frontend**

Substitua o array hardcoded em `js/app.js` por:

```javascript
async function loadVehicles() {
  try {
    const response = await fetch('http://localhost:4000/api/vehicles');
    const data = await response.json();
    
    if (data.success) {
      vehicleDatabase = data.vehicles;
      console.log(`✅ ${data.totalVehicles} veículos carregados`);
      console.log(`📅 Última atualização: ${new Date(data.lastUpdate).toLocaleString('pt-BR')}`);
    }
  } catch (error) {
    console.error('❌ Erro ao carregar veículos:', error);
    // Fallback para database local se API falhar
  }
}

// Chamar ao iniciar app
document.addEventListener('DOMContentLoaded', async () => {
  await loadVehicles();
  // ... resto do código
});
```

---

## 📊 Relatórios de Mudanças

Sempre que o scraper detecta mudanças, gera relatório em `database/reports/`:

**Exemplo de relatório:**
```json
{
  "timestamp": "2025-12-07T03:00:00.000Z",
  "priceChanges": [
    {
      "model": "BYD Dolphin Mini",
      "oldPrice": 119900,
      "newPrice": 114900,
      "change": -5000,
      "percentChange": "-4.17"
    }
  ],
  "newModels": [
    {
      "name": "Chery Omoda E5",
      "price": 179900,
      "brand": "Chery"
    }
  ],
  "removedModels": []
}
```

---

## 🛡️ Validações Implementadas

### **1. Filtro de EVs vs Híbridos**
```javascript
const EV_KEYWORDS = ['elétrico', 'eletrico', 'ev', 'e-tech', 'electric', 'bev', '100% elétrico'];
const HYBRID_KEYWORDS = ['híbrido', 'hibrido', 'hybrid', 'phev', 'plug-in'];

// Se contém palavra de híbrido → DESCARTA
// Se contém palavra de EV → ACEITA
```

### **2. Extração de Preços**
```javascript
// "R$ 99.990,00" → 99990
// "A partir de R$ 279.990" → 279990
```

### **3. Source Tracking**
Todo veículo tem campo `source` com o domínio oficial.

---

## 🔄 Estrutura de Dados

### **Database (`vehicles.json`):**
```json
{
  "lastUpdate": "2025-12-07T03:00:00.000Z",
  "totalVehicles": 23,
  "vehicles": [
    {
      "name": "Renault Kwid E-Tech",
      "brand": "Renault",
      "price": 99990,
      "type": "EV",
      "source": "renault.com.br",
      "lastUpdate": "2025-12-07T03:00:00.000Z",
      "verified": true
    }
  ],
  "brands": ["Renault", "BYD", "GWM", ...],
  "priceRange": { "min": 99990, "max": 549900 }
}
```

---

## 📦 Estrutura de Diretórios

```
meuev-backend/
├── server.js              # API + Cron Job + Checkout
├── scraper.js             # Motor de scraping
├── package.json           # Dependências
├── database/
│   ├── vehicles.json      # Database principal
│   ├── backups/           # Backups timestamped
│   │   └── vehicles_1733572980000.json
│   └── reports/           # Relatórios de mudanças
│       └── report_1733572980000.json
```

---

## ✅ Correções Implementadas

### **Removido do Database:**
- ❌ **Leapmotor T03** - Não confirmado no mercado brasileiro
- ❌ **Leapmotor C10** - Não confirmado no mercado brasileiro

### **Atualizado:**
- Comparações de mercado sem Leapmotor
- Lista de marcas consolidadas: 7 (era 8)
- Faixa de preço inicial: **R$ 99.990** (Kwid E-Tech)

---

## 🎯 Próximos Passos

### **Frontend:**
1. Substituir database hardcoded por chamada à API
2. Adicionar indicador de "última atualização"
3. Implementar fallback para database local

### **Backend:**
1. Deploy no Render/Heroku com variáveis de ambiente
2. Configurar webhook para notificações de mudanças
3. Adicionar rate limiting nas requisições

### **Melhorias Futuras:**
- Dashboard admin para ver relatórios de mudanças
- Notificações por email quando preços caem
- Histórico de preços para análise de tendências
- Scraping de autonomia e especificações técnicas

---

## 🚨 Importante

- **Delay entre requests:** 2 segundos (evita sobrecarga)
- **User-Agent:** Configurado para parecer navegador real
- **Timeout:** 15 segundos por site
- **Timezone:** America/Sao_Paulo
- **Backup automático:** Mantém histórico completo

---

## 📞 Comandos Úteis

```bash
# Atualização manual
npm run scraper

# Iniciar servidor com cron job
npm start

# Ver logs em tempo real (Render)
render logs tail

# Testar API localmente
curl http://localhost:4000/api/vehicles
curl http://localhost:4000/api/status
```

---

**Status:** ✅ **TOTALMENTE IMPLEMENTADO E FUNCIONAL**

Sistema rodando e pronto para manter o database sempre atualizado automaticamente a cada 24h!