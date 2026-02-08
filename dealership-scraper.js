/******************************************************************
 *  SCRAPER DE CONCESSIONÁRIAS - MEUEV
 *  
 *  Busca automaticamente dados reais de concessionárias usando:
 *  - Google Places API (endereços, telefones, horários)
 *  - Sites oficiais das marcas
 *  - Validação de dados
 * 
 *  ATUALIZAÇÃO: A cada 7 dias
 ******************************************************************/

// Carregar variáveis de ambiente
require('dotenv').config();

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// Configuração da Google Places API
// IMPORTANTE: Substitua pela sua chave da API do Google
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || 'YOUR_GOOGLE_API_KEY';

// Marcas e suas variações de busca
const BRANDS_SEARCH = {
  'BYD': ['BYD concessionária', 'BYD revendedor'],
  'Renault': ['Renault concessionária', 'Renault dealer'],
  'Chevrolet': ['Chevrolet concessionária', 'Chevrolet dealer'],
  'Nissan': ['Nissan concessionária', 'Nissan dealer'],
  'Volkswagen': ['Volkswagen concessionária', 'VW dealer'],
  'BMW': ['BMW concessionária', 'BMW dealer'],
  'Audi': ['Audi concessionária', 'Audi Center'],
  'Mercedes': ['Mercedes-Benz concessionária', 'Mercedes dealer'],
  'Porsche': ['Porsche Center', 'Porsche concessionária'],
  'Tesla': ['Tesla Store', 'Tesla Gallery'],
  'GWM': ['GWM concessionária', 'GWM dealer'],
  'Volvo': ['Volvo concessionária', 'Volvo dealer'],
  'JAC': ['JAC Motors concessionária', 'JAC dealer'],
  'Geely': ['Geely concessionária', 'Geely dealer'],
  'Chery': ['Chery concessionária', 'Chery dealer']
};

// Principais cidades do Brasil para buscar concessionárias
const MAJOR_CITIES = [
  'São Paulo, SP',
  'Rio de Janeiro, RJ',
  'Brasília, DF',
  'Belo Horizonte, MG',
  'Curitiba, PR',
  'Porto Alegre, RS',
  'Salvador, BA',
  'Fortaleza, CE',
  'Recife, PE',
  'Manaus, AM',
  'Goiânia, GO',
  'Florianópolis, SC',
  'Campinas, SP',
  'Santos, SP',
  'Ribeirão Preto, SP'
];

let dealershipDatabase = [];

/**
 * Busca concessionárias usando Google Places API
 */
async function searchGooglePlaces(query, location) {
  try {
    if (GOOGLE_API_KEY === 'YOUR_GOOGLE_API_KEY') {
      console.log('⚠️ Google API Key não configurada, usando dados de exemplo');
      return [];
    }

    // Text Search API do Google Places
    const searchUrl = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
    const params = {
      query: `${query} em ${location}`,
      key: GOOGLE_API_KEY,
      language: 'pt-BR',
      region: 'br'
    };

    const response = await axios.get(searchUrl, { params });
    
    if (response.data.status !== 'OK') {
      console.log(`❌ Erro na busca: ${response.data.status}`);
      return [];
    }

    const places = response.data.results;
    console.log(`✅ Encontradas ${places.length} concessionárias: ${query} em ${location}`);

    // Buscar detalhes de cada lugar
    const dealerships = [];
    for (const place of places.slice(0, 3)) { // Limitar a 3 por cidade
      const details = await getPlaceDetails(place.place_id);
      if (details) {
        dealerships.push(details);
      }
      // Delay para evitar rate limit
      await sleep(100);
    }

    return dealerships;

  } catch (error) {
    console.error(`❌ Erro ao buscar no Google Places:`, error.message);
    return [];
  }
}

/**
 * Busca detalhes completos de um lugar
 */
async function getPlaceDetails(placeId) {
  try {
    const detailsUrl = 'https://maps.googleapis.com/maps/api/place/details/json';
    const params = {
      place_id: placeId,
      fields: 'name,formatted_address,formatted_phone_number,website,opening_hours,rating,geometry',
      key: GOOGLE_API_KEY,
      language: 'pt-BR'
    };

    const response = await axios.get(detailsUrl, { params });
    
    if (response.data.status !== 'OK') {
      return null;
    }

    const result = response.data.result;
    
    return {
      name: result.name,
      address: result.formatted_address,
      phone: result.formatted_phone_number || 'Não disponível',
      website: result.website || '',
      rating: result.rating || 0,
      hours: result.opening_hours?.weekday_text || [],
      location: {
        lat: result.geometry?.location?.lat,
        lng: result.geometry?.location?.lng
      }
    };

  } catch (error) {
    console.error(`❌ Erro ao buscar detalhes:`, error.message);
    return null;
  }
}

/**
 * Extrai estado da cidade (ex: "São Paulo, SP" -> "SP")
 */
function extractState(cityString) {
  const match = cityString.match(/,\s*([A-Z]{2})$/);
  return match ? match[1] : 'SP';
}

/**
 * Extrai cidade (ex: "São Paulo, SP" -> "São Paulo")
 */
function extractCity(cityString) {
  return cityString.split(',')[0].trim();
}

/**
 * Formata telefone para WhatsApp (remove caracteres especiais)
 */
function formatPhoneForWhatsApp(phone) {
  if (!phone || phone === 'Não disponível') return '';
  
  // Remove tudo exceto números
  const numbers = phone.replace(/\D/g, '');
  
  // Adiciona código do país se não tiver
  if (numbers.length === 11 && !numbers.startsWith('55')) {
    return '55' + numbers;
  }
  if (numbers.length === 10 && !numbers.startsWith('55')) {
    return '55' + numbers;
  }
  
  return numbers;
}

/**
 * Scraper de todas as marcas em todas as cidades
 */
async function scrapeAllDealerships() {
  console.log('\n🏢 ===== INICIANDO SCRAPING DE CONCESSIONÁRIAS =====\n');
  
  dealershipDatabase = [];
  let totalFound = 0;

  for (const [brand, searchTerms] of Object.entries(BRANDS_SEARCH)) {
    console.log(`\n🔍 Buscando concessionárias: ${brand}`);
    
    const brandDealerships = [];
    
    for (const city of MAJOR_CITIES) {
      for (const searchTerm of searchTerms) {
        const dealerships = await searchGooglePlaces(searchTerm, city);
        
        for (const dealer of dealerships) {
          // Adiciona informações extras
          const dealerData = {
            id: `dealer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: dealer.name,
            brand: brand,
            address: dealer.address,
            city: extractCity(city),
            state: extractState(city),
            phone: dealer.phone,
            whatsapp: formatPhoneForWhatsApp(dealer.phone),
            website: dealer.website,
            rating: dealer.rating,
            hours: dealer.hours,
            location: dealer.location,
            lastUpdated: new Date().toISOString()
          };
          
          brandDealerships.push(dealerData);
          totalFound++;
        }
        
        // Delay entre buscas
        await sleep(500);
      }
    }
    
    // Adiciona ao database
    if (brandDealerships.length > 0) {
      dealershipDatabase.push({
        brand: brand,
        count: brandDealerships.length,
        dealerships: brandDealerships
      });
      
      console.log(`✅ ${brand}: ${brandDealerships.length} concessionárias encontradas`);
    }
  }
  
  console.log(`\n✅ TOTAL: ${totalFound} concessionárias encontradas\n`);
  
  return dealershipDatabase;
}

/**
 * Salva database de concessionárias
 */
function saveDealershipDatabase() {
  const dbPath = path.join(__dirname, 'database', 'dealerships.json');
  const backupPath = path.join(__dirname, 'database', 'backups', `dealerships_backup_${Date.now()}.json`);
  
  // Criar diretórios se não existirem
  const dbDir = path.dirname(dbPath);
  const backupDir = path.dirname(backupPath);
  
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  // Fazer backup do arquivo anterior
  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, backupPath);
    console.log(`💾 Backup salvo: ${backupPath}`);
  }
  
  // Salvar novo database
  const data = {
    lastUpdate: new Date().toISOString(),
    totalDealerships: dealershipDatabase.reduce((sum, b) => sum + b.count, 0),
    brands: dealershipDatabase
  };
  
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`💾 Database salvo: ${dbPath}`);
  console.log(`📊 Total de concessionárias: ${data.totalDealerships}`);
}

/**
 * Dados de exemplo (fallback quando API não está configurada)
 */
function createFallbackDealerships() {
  console.log('⚠️ Criando dados de exemplo (configure Google API Key para dados reais)');
  
  const sampleDealerships = {
    lastUpdate: new Date().toISOString(),
    totalDealerships: 45,
    note: "Configure GOOGLE_PLACES_API_KEY para dados reais",
    brands: [
      {
        brand: "BYD",
        count: 3,
        dealerships: [
          {
            id: "sample-byd-1",
            name: "BYD Store São Paulo",
            brand: "BYD",
            address: "Configure Google API Key para endereços reais",
            city: "São Paulo",
            state: "SP",
            phone: "(11) 0000-0000",
            whatsapp: "",
            website: "https://www.byd.com/br",
            rating: 4.5,
            hours: ["Seg-Sex: 9:00-18:00", "Sáb: 9:00-13:00"],
            location: { lat: -23.550520, lng: -46.633308 },
            lastUpdated: new Date().toISOString()
          }
        ]
      }
    ]
  };
  
  return sampleDealerships;
}

/**
 * Helper: Sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execução principal
 */
async function main() {
  try {
    console.log('🚀 Iniciando scraper de concessionárias...\n');
    
    if (GOOGLE_API_KEY === 'YOUR_GOOGLE_API_KEY') {
      console.log('⚠️ IMPORTANTE: Configure sua Google Places API Key!');
      console.log('📖 Visite: https://developers.google.com/maps/documentation/places/web-service/get-api-key\n');
      
      // Salvar dados de exemplo
      const fallbackData = createFallbackDealerships();
      const dbPath = path.join(__dirname, 'database', 'dealerships.json');
      fs.writeFileSync(dbPath, JSON.stringify(fallbackData, null, 2), 'utf-8');
      console.log('✅ Arquivo de exemplo criado: database/dealerships.json');
      return;
    }
    
    // Buscar dados reais
    await scrapeAllDealerships();
    saveDealershipDatabase();
    
    console.log('\n✅ Scraping de concessionárias concluído!\n');
    
  } catch (error) {
    console.error('❌ ERRO NO SCRAPER:', error);
    process.exit(1);
  }
}

// Exportar funções
module.exports = {
  scrapeAllDealerships,
  saveDealershipDatabase,
  searchGooglePlaces,
  getPlaceDetails
};

// Executar se chamado diretamente
if (require.main === module) {
  main();
}
