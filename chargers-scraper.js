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

// Principais cidades brasileiras para busca
const MAJOR_CITIES = [
  { name: 'São Paulo', state: 'SP', lat: -23.5505, lng: -46.6333 },
  { name: 'Rio de Janeiro', state: 'RJ', lat: -22.9068, lng: -43.1729 },
  { name: 'Brasília', state: 'DF', lat: -15.7942, lng: -47.8822 },
  { name: 'Belo Horizonte', state: 'MG', lat: -19.9167, lng: -43.9345 },
  { name: 'Curitiba', state: 'PR', lat: -25.4284, lng: -49.2733 },
  { name: 'Porto Alegre', state: 'RS', lat: -30.0346, lng: -51.2177 },
  { name: 'Salvador', state: 'BA', lat: -12.9714, lng: -38.5014 },
  { name: 'Fortaleza', state: 'CE', lat: -3.7172, lng: -38.5433 },
  { name: 'Recife', state: 'PE', lat: -8.0476, lng: -34.8770 },
  { name: 'Campinas', state: 'SP', lat: -22.9056, lng: -47.0608 },
  { name: 'Florianópolis', state: 'SC', lat: -27.5954, lng: -48.5480 },
  { name: 'Goiânia', state: 'GO', lat: -16.6869, lng: -49.2648 }
];

// Termos de busca para carregadores
const SEARCH_QUERIES = [
  'electric vehicle charging station',
  'posto de carregamento elétrico',
  'carregador de carro elétrico',
  'charging station'
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
  console.log('🔌 Iniciando busca de carregadores elétricos...');
  console.log('🌍 Cidades: 12 principais do Brasil');
  console.log('🔍 Queries: 4 termos de busca');
  console.log('');
  
  scrapeAllChargers()
    .then(() => {
      console.log('');
      saveChargersDatabase();
      console.log('');
      console.log('✅ Scraping concluído com sucesso!');
      console.log(`📦 Total de carregadores: ${chargersDatabase.length}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Erro no scraping:', error);
      process.exit(1);
    });
}
