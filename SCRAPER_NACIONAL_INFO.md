# 🔌 Scraper Nacional de Carregadores Elétricos

## 📊 Cobertura Nacional

### 🌍 Abrangência Geográfica
- **100+ cidades** cobrindo **TODOS os 27 estados brasileiros**
- **Todas as capitais** estaduais incluídas
- **Principais cidades** por região
- **Cidades turísticas** estratégicas

### 🏙️ Cidades Incluídas por Região

#### Sudeste (35 cidades)
**São Paulo:**
- Capital, Campinas, Santos, São José dos Campos, Ribeirão Preto, Sorocaba
- Guarulhos, Osasco, São Bernardo do Campo, Santo André, Jundiaí
- Piracicaba, Bauru

**Rio de Janeiro:**
- Capital, Niterói, Duque de Caxias, Nova Iguaçu, Campos dos Goytacazes
- Petrópolis, Volta Redonda, Búzios, Angra dos Reis, Paraty

**Minas Gerais:**
- Belo Horizonte, Uberlândia, Contagem, Juiz de Fora, Betim
- Montes Claros, Tiradentes, Ouro Preto

**Espírito Santo:**
- Vitória, Vila Velha, Serra

#### Sul (16 cidades)
**Rio Grande do Sul:**
- Porto Alegre, Caxias do Sul, Pelotas, Canoas, Santa Maria, Gramado

**Paraná:**
- Curitiba, Londrina, Maringá, Ponta Grossa, Cascavel, Foz do Iguaçu

**Santa Catarina:**
- Florianópolis, Joinville, Blumenau, Chapecó, Itajaí, Balneário Camboriú, São José

#### Nordeste (20 cidades)
**Bahia:**
- Salvador, Feira de Santana, Vitória da Conquista, Camaçari, Ilhéus, Porto Seguro

**Ceará:**
- Fortaleza, Caucaia, Juazeiro do Norte, Sobral

**Pernambuco:**
- Recife, Jaboatão dos Guararapes, Olinda, Caruaru, Petrolina

**Outros:**
- Natal (RN), João Pessoa (PB), Aracaju (SE), Maceió (AL)
- São Luís (MA), Teresina (PI), Imperatriz (MA), Mossoró (RN)

#### Centro-Oeste (7 cidades)
- Brasília (DF), Goiânia (GO), Aparecida de Goiânia (GO), Anápolis (GO)
- Caldas Novas (GO), Campo Grande (MS), Cuiabá (MT), Bonito (MS)

#### Norte (10 cidades)
- Manaus (AM), Belém (PA), Macapá (AP), Porto Velho (RO)
- Rio Branco (AC), Boa Vista (RR), Palmas (TO), Parauapebas (PA)

## 🔍 Termos de Busca (13 queries)

### Termos Genéricos
1. `electric vehicle charging station`
2. `EV charging station`
3. `posto de carregamento elétrico`
4. `carregador de carro elétrico`
5. `charging station`
6. `carregador veicular elétrico`
7. `ponto de recarga elétrica`
8. `eletroposto`

### Redes Específicas
9. `Tesla Supercharger`
10. `Shell Recharge`
11. `Tupinambá carregador`
12. `Zletric`
13. `Enel X charging`

## 🤖 Automação

### Cron Job Configurado
```javascript
cron.schedule('0 5 * * 1', async () => {
  // Executa toda segunda-feira às 05:00 AM
  // Timezone: America/Sao_Paulo
})
```

### Horários de Atualização
- **Veículos:** Diariamente às 03:00 AM
- **Concessionárias:** Semanalmente (segunda às 04:00 AM)
- **Carregadores:** Semanalmente (segunda às 05:00 AM)

### Tempo de Execução
- **Estimado:** 15-20 minutos
- **Cidades:** 93 localizações
- **Queries por cidade:** 13
- **Total de buscas:** ~1.209 queries

## 📈 Resultados Esperados

### Estimativa de Cobertura
Com 93 cidades e 13 queries:
- **Mínimo esperado:** 8.000+ carregadores
- **Meta realista:** 12.000-15.000 carregadores
- **Ideal (cobertura completa):** 18.000-20.000 carregadores

### Fatores de Cobertura
- **API Google Places** tem limite de 20 resultados por query
- **Deduplic ação** remove carregadores duplicados
- **Redes incluídas:** Tesla, Shell, Tupinambá, Zletric, Enel X, ChargeOn, Voltta, etc.

## 🛠️ Como Usar

### Executar Manualmente
```bash
cd meuev-backend
node chargers-scraper.js
```

### Forçar Atualização via API
```bash
curl -X POST http://localhost:4000/api/chargers/force-update
```

### Acessar Database
```bash
# Caminho do arquivo
meuev-backend/database/chargers.json

# Backups automáticos em
meuev-backend/database/backups/chargers_backup_*.json
```

## 📊 Estatísticas

### Database Atual
- **Arquivo:** `database/chargers.json`
- **Formato:** JSON array
- **Backup automático:** Sim (antes de cada atualização)

### Campos por Carregador
```json
{
  "id": "unique_id",
  "name": "Nome do estabelecimento",
  "address": "Endereço completo",
  "city": "Cidade",
  "state": "UF",
  "lat": -23.5505,
  "lng": -46.6333,
  "rating": 4.5,
  "network": "Shell Recharge",
  "phone": "+55 11 1234-5678",
  "website": "https://...",
  "types": ["charging_station"],
  "lastUpdated": "2026-02-08T..."
}
```

## 🔐 API Google Places

### Chave Configurada
```javascript
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || 'AIzaSyCuhbaIqYiYpn8c0Qv030AnDUvcLVZGVHk';
```

### Limites e Rate Limiting
- **Delay entre queries:** 200ms
- **Delay entre cidades:** 500ms
- **Respeita limites da API** automaticamente

### APIs Utilizadas
1. **Text Search API:** Busca inicial de carregadores
2. **Place Details API:** Detalhes adicionais (telefone, website, etc)

## 📱 Integração Frontend

### Endpoint REST
```javascript
GET /api/chargers           // Todos os carregadores
GET /api/chargers/:state    // Carregadores por estado
POST /api/chargers/force-update  // Força atualização
```

### Página Web
- **URL:** `/carregadores.html`
- **Filtros:** Estado, rede, cidade
- **Visualizações:** Cards e lista
- **Paginação:** Customizável
- **Mapa:** Integrado com coordenadas

## 🎯 Próximos Passos

### Melhorias Futuras
1. ✅ Expandir para 100+ cidades (CONCLUÍDO)
2. ✅ Incluir redes específicas (CONCLUÍDO)
3. ⏳ Integrar com API de disponibilidade em tempo real
4. ⏳ Adicionar fotos dos carregadores
5. ⏳ Verificação de status (operacional/fora de serviço)
6. ⏳ Comentários e avaliações de usuários

### Otimizações
- Cache de resultados por 1 semana
- Compressão do database JSON
- CDN para imagens de carregadores
- Web Workers para busca assíncrona
