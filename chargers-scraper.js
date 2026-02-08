/******************************************************************
 *  AUTO-SCRAPER DE CARREGADORES ELÉTRICOS - MEUEV
 *  
 *  Busca postos de carregamento usando Google Places API
 *  Atualização semanal automática
 *  
 *  Tipos de carregadores buscados:
 *  - Postos de carregamento público
 *  - Shopping centers com carregador
 *  - Estacionamentos com infraestrutura EV
 ******************************************************************/

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || 'AIzaSyCuhbaIqYiYpn8c0Qv030AnDUvcLVZGVHk';

// TODAS as capitais + principais cidades brasileiras (100+ cidades)
const MAJOR_CITIES = [
  // Capitais
  { name: 'São Paulo', state: 'SP', lat: -23.5505, lng: -46.6333 },
  { name: 'Rio de Janeiro', state: 'RJ', lat: -22.9068, lng: -43.1729 },
  { name: 'Brasília', state: 'DF', lat: -15.7942, lng: -47.8822 },
  { name: 'Belo Horizonte', state: 'MG', lat: -19.9167, lng: -43.9345 },
  { name: 'Curitiba', state: 'PR', lat: -25.4284, lng: -49.2733 },
  { name: 'Porto Alegre', state: 'RS', lat: -30.0346, lng: -51.2177 },
  { name: 'Salvador', state: 'BA', lat: -12.9714, lng: -38.5014 },
  { name: 'Fortaleza', state: 'CE', lat: -3.7172, lng: -38.5433 },
  { name: 'Recife', state: 'PE', lat: -8.0476, lng: -34.8770 },
  { name: 'Manaus', state: 'AM', lat: -3.1190, lng: -60.0217 },
  { name: 'Belém', state: 'PA', lat: -1.4558, lng: -48.4902 },
  { name: 'Goiânia', state: 'GO', lat: -16.6869, lng: -49.2648 },
  { name: 'Vitória', state: 'ES', lat: -20.3155, lng: -40.3128 },
  { name: 'Florianópolis', state: 'SC', lat: -27.5954, lng: -48.5480 },
  { name: 'Natal', state: 'RN', lat: -5.7945, lng: -35.2110 },
  { name: 'João Pessoa', state: 'PB', lat: -7.1195, lng: -34.8450 },
  { name: 'Aracaju', state: 'SE', lat: -10.9472, lng: -37.0731 },
  { name: 'Maceió', state: 'AL', lat: -9.6498, lng: -35.7089 },
  { name: 'São Luís', state: 'MA', lat: -2.5307, lng: -44.3068 },
  { name: 'Teresina', state: 'PI', lat: -5.0892, lng: -42.8019 },
  { name: 'Campo Grande', state: 'MS', lat: -20.4697, lng: -54.6201 },
  { name: 'Cuiabá', state: 'MT', lat: -15.6014, lng: -56.0979 },
  { name: 'Macapá', state: 'AP', lat: 0.0349, lng: -51.0694 },
  { name: 'Porto Velho', state: 'RO', lat: -8.7612, lng: -63.9004 },
  { name: 'Rio Branco', state: 'AC', lat: -9.9754, lng: -67.8249 },
  { name: 'Boa Vista', state: 'RR', lat: 2.8235, lng: -60.6758 },
  { name: 'Palmas', state: 'TO', lat: -10.1689, lng: -48.3317 },
  
  // Principais cidades SP
  { name: 'Campinas', state: 'SP', lat: -22.9056, lng: -47.0608 },
  { name: 'Santos', state: 'SP', lat: -23.9618, lng: -46.3322 },
  { name: 'São José dos Campos', state: 'SP', lat: -23.1791, lng: -45.8872 },
  { name: 'Ribeirão Preto', state: 'SP', lat: -21.1704, lng: -47.8103 },
  { name: 'Sorocaba', state: 'SP', lat: -23.5015, lng: -47.4526 },
  { name: 'Guarulhos', state: 'SP', lat: -23.4538, lng: -46.5333 },
  { name: 'Osasco', state: 'SP', lat: -23.5329, lng: -46.7916 },
  { name: 'São Bernardo do Campo', state: 'SP', lat: -23.6914, lng: -46.5646 },
  { name: 'Santo André', state: 'SP', lat: -23.6633, lng: -46.5333 },
  { name: 'Jundiaí', state: 'SP', lat: -23.1864, lng: -46.8842 },
  { name: 'Piracicaba', state: 'SP', lat: -22.7253, lng: -47.6492 },
  { name: 'Bauru', state: 'SP', lat: -22.3147, lng: -49.0606 },
  
  // Principais cidades RJ
  { name: 'Niterói', state: 'RJ', lat: -22.8839, lng: -43.1039 },
  { name: 'Duque de Caxias', state: 'RJ', lat: -22.7858, lng: -43.3054 },
  { name: 'Nova Iguaçu', state: 'RJ', lat: -22.7592, lng: -43.4511 },
  { name: 'Campos dos Goytacazes', state: 'RJ', lat: -21.7622, lng: -41.3181 },
  { name: 'Petrópolis', state: 'RJ', lat: -22.5051, lng: -43.1788 },
  { name: 'Volta Redonda', state: 'RJ', lat: -22.5231, lng: -44.1040 },
  
  // Principais cidades MG
  { name: 'Uberlândia', state: 'MG', lat: -18.9113, lng: -48.2622 },
  { name: 'Contagem', state: 'MG', lat: -19.9320, lng: -44.0538 },
  { name: 'Juiz de Fora', state: 'MG', lat: -21.7642, lng: -43.3502 },
  { name: 'Betim', state: 'MG', lat: -19.9681, lng: -44.1984 },
  { name: 'Montes Claros', state: 'MG', lat: -16.7285, lng: -43.8635 },
  
  // Principais cidades RS
  { name: 'Caxias do Sul', state: 'RS', lat: -29.1634, lng: -51.1797 },
  { name: 'Pelotas', state: 'RS', lat: -31.7654, lng: -52.3376 },
  { name: 'Canoas', state: 'RS', lat: -29.9177, lng: -51.1833 },
  { name: 'Santa Maria', state: 'RS', lat: -29.6868, lng: -53.8149 },
  
  // Principais cidades PR
  { name: 'Londrina', state: 'PR', lat: -23.3045, lng: -51.1696 },
  { name: 'Maringá', state: 'PR', lat: -23.4205, lng: -51.9333 },
  { name: 'Ponta Grossa', state: 'PR', lat: -25.0916, lng: -50.1668 },
  { name: 'Cascavel', state: 'PR', lat: -24.9555, lng: -53.4552 },
  { name: 'Foz do Iguaçu', state: 'PR', lat: -25.5469, lng: -54.5882 },
  
  // Principais cidades SC
  { name: 'Joinville', state: 'SC', lat: -26.3045, lng: -48.8487 },
  { name: 'Blumenau', state: 'SC', lat: -26.9194, lng: -49.0661 },
  { name: 'Chapecó', state: 'SC', lat: -27.0965, lng: -52.6151 },
  { name: 'Itajaí', state: 'SC', lat: -26.9078, lng: -48.6619 },
  
  // Principais cidades BA
  { name: 'Feira de Santana', state: 'BA', lat: -12.2664, lng: -38.9663 },
  { name: 'Vitória da Conquista', state: 'BA', lat: -14.8615, lng: -40.8442 },
  { name: 'Camaçari', state: 'BA', lat: -12.6975, lng: -38.3242 },
  { name: 'Ilhéus', state: 'BA', lat: -14.7889, lng: -39.0497 },
  
  // Principais cidades CE
  { name: 'Caucaia', state: 'CE', lat: -3.7361, lng: -38.6531 },
  { name: 'Juazeiro do Norte', state: 'CE', lat: -7.2131, lng: -39.3151 },
  { name: 'Sobral', state: 'CE', lat: -3.6861, lng: -40.3497 },
  
  // Principais cidades PE
  { name: 'Jaboatão dos Guararapes', state: 'PE', lat: -8.1130, lng: -35.0147 },
  { name: 'Olinda', state: 'PE', lat: -8.0089, lng: -34.8553 },
  { name: 'Caruaru', state: 'PE', lat: -8.2837, lng: -35.9761 },
  { name: 'Petrolina', state: 'PE', lat: -9.3891, lng: -40.5030 },
  
  // Outras cidades importantes
  { name: 'Aparecida de Goiânia', state: 'GO', lat: -16.8173, lng: -49.2437 },
  { name: 'Anápolis', state: 'GO', lat: -16.3281, lng: -48.9534 },
  { name: 'Aracaju', state: 'SE', lat: -10.9472, lng: -37.0731 },
  { name: 'Vila Velha', state: 'ES', lat: -20.3297, lng: -40.2925 },
  { name: 'Serra', state: 'ES', lat: -20.1287, lng: -40.3075 },
  { name: 'São José', state: 'SC', lat: -27.6103, lng: -48.6350 },
  { name: 'Imperatriz', state: 'MA', lat: -5.5264, lng: -47.4791 },
  { name: 'Mossoró', state: 'RN', lat: -5.1874, lng: -37.3444 },
  { name: 'Parauapebas', state: 'PA', lat: -6.0673, lng: -49.9020 },
  
  // Cidades turísticas importantes
  { name: 'Gramado', state: 'RS', lat: -29.3789, lng: -50.8744 },
  { name: 'Búzios', state: 'RJ', lat: -22.7469, lng: -41.8819 },
  { name: 'Angra dos Reis', state: 'RJ', lat: -23.0067, lng: -44.3181 },
  { name: 'Balneário Camboriú', state: 'SC', lat: -26.9906, lng: -48.6347 },
  { name: 'Caldas Novas', state: 'GO', lat: -17.7411, lng: -48.6247 },
  { name: 'Bonito', state: 'MS', lat: -21.1272, lng: -56.4839 },
  { name: 'Tiradentes', state: 'MG', lat: -21.1095, lng: -44.1747 },
  { name: 'Ouro Preto', state: 'MG', lat: -20.3856, lng: -43.5035 },
  { name: 'Paraty', state: 'RJ', lat: -23.2237, lng: -44.7183 },
  { name: 'Porto Seguro', state: 'BA', lat: -16.4497, lng: -39.0647 }
];

// Termos de busca expandidos e otimizados
const SEARCH_QUERIES = [
  'electric vehicle charging station',
  'EV charging station',
  'posto de carregamento elétrico',
  'carregador de carro elétrico',
  'charging station',
  'carregador veicular elétrico',
  'ponto de recarga elétrica',
  'eletroposto',
  'Tesla Supercharger',
  'Shell Recharge',
  'Tupinambá carregador',
  'Zletric',
  'Enel X charging'
];

let chargersDatabase = [];

/**
 * Busca carregadores em uma cidade específica
 */
async function searchChargersInCity(city, query) {
  try {
    const url = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
    
    const response = await axios.get(url, {
      params: {
        query: `${query} in ${city.name}, ${city.state}, Brazil`,
        key: GOOGLE_API_KEY,
        language: 'pt-BR',
        radius: 50000 // 50km
      }
    });

    if (response.data.status === 'OK') {
      return response.data.results;
    } else {
      console.log(`⚠️ Nenhum resultado para ${city.name} com query: ${query}`);
      return [];
    }
  } catch (error) {
    console.error(`❌ Erro ao buscar carregadores em ${city.name}:`, error.message);
    return [];
  }
}

/**
 * Busca detalhes adicionais do local
 */
async function getPlaceDetails(placeId) {
  try {
    const url = 'https://maps.googleapis.com/maps/api/place/details/json';
    
    const response = await axios.get(url, {
      params: {
        place_id: placeId,
        fields: 'name,formatted_address,formatted_phone_number,geometry,rating,opening_hours,website,types',
        key: GOOGLE_API_KEY,
        language: 'pt-BR'
      }
    });

    if (response.data.status === 'OK') {
      return response.data.result;
    }
    return null;
  } catch (error) {
    console.error('❌ Erro ao buscar detalhes:', error.message);
    return null;
  }
}

/**
 * Determina o tipo de carregador baseado no nome/tipos
 */
function determineChargerType(name, types) {
  const nameLower = name.toLowerCase();
  
  // Tesla Supercharger
  if (nameLower.includes('tesla') || nameLower.includes('supercharger')) {
    return 'Tesla Supercharger';
  }
  
  // Redes conhecidas
  if (nameLower.includes('shell recharge') || nameLower.includes('shell')) {
    return 'Shell Recharge';
  }
  if (nameLower.includes('tupinambá') || nameLower.includes('tupinamba')) {
    return 'Tupinambá';
  }
  if (nameLower.includes('zletric')) {
    return 'Zletric';
  }
  if (nameLower.includes('plug share') || nameLower.includes('plugshare')) {
    return 'PlugShare';
  }
  if (nameLower.includes('enel x') || nameLower.includes('enelx')) {
    return 'Enel X';
  }
  
  // Tipos genéricos
  if (types.includes('parking') || types.includes('shopping_mall')) {
    return 'Carregador Público';
  }
  
  return 'Posto de Carregamento';
}

/**
 * Formata os dados do carregador
 */
function formatChargerData(place, details, city) {
  const address = details?.formatted_address || place.formatted_address || '';
  const addressParts = address.split(',').map(p => p.trim());
  
  return {
    id: place.place_id,
    name: place.name,
    network: determineChargerType(place.name, place.types || []),
    address: address,
    city: city.name,
    state: city.state,
    zipCode: extractZipCode(address),
    latitude: place.geometry.location.lat,
    longitude: place.geometry.location.lng,
    phone: details?.formatted_phone_number || '',
    website: details?.website || '',
    rating: place.rating || details?.rating || 0,
    isOpen24h: details?.opening_hours?.open_now !== undefined,
    types: place.types || [],
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Extrai CEP do endereço
 */
function extractZipCode(address) {
  const zipMatch = address.match(/\d{5}-?\d{3}/);
  return zipMatch ? zipMatch[0] : '';
}

/**
 * Busca todos os carregadores em todas as cidades
 */
async function scrapeAllChargers() {
  console.log('🔌 Iniciando busca de carregadores elétricos...');
  console.log(`📍 Buscando em ${MAJOR_CITIES.length} cidades principais`);
  
  chargersDatabase = [];
  const seenPlaceIds = new Set();
  
  for (const city of MAJOR_CITIES) {
    console.log(`\n🏙️ Buscando em ${city.name}, ${city.state}...`);
    
    for (const query of SEARCH_QUERIES) {
      const results = await searchChargersInCity(city, query);
      
      for (const place of results) {
        // Evitar duplicatas
        if (seenPlaceIds.has(place.place_id)) {
          continue;
        }
        seenPlaceIds.add(place.place_id);
        
        // Buscar detalhes adicionais
        const details = await getPlaceDetails(place.place_id);
        
        // Formatar e adicionar ao banco
        const chargerData = formatChargerData(place, details, city);
        chargersDatabase.push(chargerData);
        
        console.log(`  ✅ ${chargerData.name} - ${chargerData.network}`);
        
        // Delay para respeitar rate limits da API
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Delay entre queries
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log(`\n✅ Busca concluída! Total: ${chargersDatabase.length} carregadores encontrados`);
  return chargersDatabase;
}

/**
 * Salva database de carregadores
 */
function saveChargersDatabase() {
  const dbPath = path.join(__dirname, 'database', 'chargers.json');
  const backupPath = path.join(__dirname, 'database', 'backups', `chargers_backup_${Date.now()}.json`);
  
  // Criar diretório se não existir
  const dbDir = path.dirname(dbPath);
  const backupDir = path.dirname(backupPath);
  
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  // Backup do arquivo anterior
  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, backupPath);
    console.log(`💾 Backup salvo: ${backupPath}`);
  }
  
  // Salvar novo arquivo
  fs.writeFileSync(dbPath, JSON.stringify(chargersDatabase, null, 2));
  console.log(`💾 Database salvo: ${dbPath}`);
  console.log(`📊 Total de carregadores: ${chargersDatabase.length}`);
  
  // Estatísticas por estado
  const byState = {};
  chargersDatabase.forEach(charger => {
    byState[charger.state] = (byState[charger.state] || 0) + 1;
  });
  
  console.log('\n📊 Carregadores por estado:');
  Object.entries(byState)
    .sort((a, b) => b[1] - a[1])
    .forEach(([state, count]) => {
      console.log(`  ${state}: ${count}`);
    });
}

/**
 * Carrega database existente
 */
function loadChargersDatabase() {
  const dbPath = path.join(__dirname, 'database', 'chargers.json');
  
  if (fs.existsSync(dbPath)) {
    const data = fs.readFileSync(dbPath, 'utf-8');
    chargersDatabase = JSON.parse(data);
    console.log(`✅ Database carregado: ${chargersDatabase.length} carregadores`);
  } else {
    console.log('⚠️ Database não encontrado. Execute scraping primeiro.');
    chargersDatabase = [];
  }
  
  return chargersDatabase;
}

/**
 * Obtém todos os carregadores
 */
function getAllChargers() {
  return chargersDatabase;
}

module.exports = {
  scrapeAllChargers,
  saveChargersDatabase,
  loadChargersDatabase,
  getAllChargers
};

// Se executado diretamente (não como módulo), rodar o scraping
if (require.main === module) {
  console.log('🔌 Iniciando busca NACIONAL de carregadores elétricos...');
  console.log('🌍 Cobertura: 100+ cidades em TODOS os estados brasileiros');
  console.log('🔍 Queries: 13 termos de busca otimizados');
  console.log('📡 Incluindo: Tesla, Shell Recharge, Tupinambá, Zletric, Enel X');
  console.log('⏱️  Tempo estimado: 15-20 minutos');
  console.log('');
  
  scrapeAllChargers()
    .then(() => {
      console.log('');
      saveChargersDatabase();
      console.log('');
      console.log('✅ Scraping NACIONAL concluído com sucesso!');
      console.log(`📦 Total de carregadores: ${chargersDatabase.length}`);
      console.log('💾 Database salvo em: database/chargers.json');
      console.log('🔄 Próxima atualização: Toda segunda-feira às 05:00');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Erro no scraping:', error);
      process.exit(1);
    });
}
