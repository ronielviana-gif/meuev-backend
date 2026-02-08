#!/usr/bin/env node

/******************************************************************
 *  SCRIPT DE INICIALIZAÇÃO - MEUEV BACKEND
 *  
 *  Verifica configuração e prepara o sistema para primeira execução
 ******************************************************************/

const fs = require('fs');
const path = require('path');

console.log('\n🚀 ===== INICIALIZAÇÃO DO BACKEND MEUEV =====\n');

// 1. Verificar variáveis de ambiente
console.log('📋 Verificando configuração...\n');

const requiredEnvVars = [
  'GOOGLE_PLACES_API_KEY',
  'MERCADOPAGO_ACCESS_TOKEN',
  'MERCADOPAGO_PUBLIC_KEY'
];

const envPath = path.join(__dirname, '.env');
const hasEnvFile = fs.existsSync(envPath);

if (!hasEnvFile) {
  console.log('⚠️  Arquivo .env não encontrado!');
  console.log('📝 Criando .env de exemplo...\n');
  
  const envTemplate = `# Google Places API (para buscar concessionárias)
# Obtenha em: https://console.cloud.google.com/
GOOGLE_PLACES_API_KEY=YOUR_GOOGLE_API_KEY

# Mercado Pago (para pagamentos)
# Obtenha em: https://www.mercadopago.com.br/developers/
MERCADOPAGO_ACCESS_TOKEN=YOUR_ACCESS_TOKEN
MERCADOPAGO_PUBLIC_KEY=YOUR_PUBLIC_KEY

# URLs
BACKEND_URL=http://localhost:4000
FRONTEND_URL=http://localhost:3000

# Porta do servidor
PORT=4000
`;
  
  fs.writeFileSync(envPath, envTemplate, 'utf-8');
  console.log('✅ Arquivo .env criado!');
  console.log('⚠️  IMPORTANTE: Configure as variáveis no arquivo .env antes de continuar\n');
  console.log('📖 Veja o guia: GUIA_CONFIGURACAO_DADOS_REAIS.md\n');
}

// 2. Verificar estrutura de diretórios
console.log('📁 Verificando estrutura de diretórios...\n');

const directories = [
  path.join(__dirname, 'database'),
  path.join(__dirname, 'database', 'backups'),
  path.join(__dirname, 'database', 'reports')
];

directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Criado: ${path.relative(__dirname, dir)}`);
  } else {
    console.log(`✓  Existe: ${path.relative(__dirname, dir)}`);
  }
});

// 3. Verificar databases
console.log('\n📊 Verificando databases...\n');

const vehiclesPath = path.join(__dirname, 'database', 'vehicles.json');
const dealershipsPath = path.join(__dirname, 'database', 'dealerships.json');

const hasVehicles = fs.existsSync(vehiclesPath);
const hasDealerships = fs.existsSync(dealershipsPath);

if (!hasVehicles) {
  console.log('⚠️  Database de veículos não encontrado');
  console.log('   Execute: node scraper.js\n');
} else {
  const vehiclesData = JSON.parse(fs.readFileSync(vehiclesPath, 'utf-8'));
  console.log(`✅ Veículos: ${vehiclesData.totalVehicles || 0} veículos`);
  console.log(`   Última atualização: ${new Date(vehiclesData.lastUpdate).toLocaleString('pt-BR')}\n`);
}

if (!hasDealerships) {
  console.log('⚠️  Database de concessionárias não encontrado');
  console.log('   Execute: node dealership-scraper.js\n');
} else {
  const dealershipsData = JSON.parse(fs.readFileSync(dealershipsPath, 'utf-8'));
  console.log(`✅ Concessionárias: ${dealershipsData.totalDealerships || 0} concessionárias`);
  console.log(`   Última atualização: ${new Date(dealershipsData.lastUpdate).toLocaleString('pt-BR')}\n`);
}

// 4. Status e próximos passos
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (!hasEnvFile || (!hasVehicles && !hasDealerships)) {
  console.log('📋 PRÓXIMOS PASSOS:\n');
  
  if (!hasEnvFile) {
    console.log('1. Configure o arquivo .env com suas chaves de API');
    console.log('   - Google Places API Key');
    console.log('   - Mercado Pago Access Token');
    console.log('   - Mercado Pago Public Key\n');
  }
  
  if (!hasVehicles) {
    console.log('2. Execute o scraper de veículos:');
    console.log('   npm run scraper\n');
  }
  
  if (!hasDealerships) {
    console.log('3. Execute o scraper de concessionárias:');
    console.log('   node dealership-scraper.js\n');
  }
  
  console.log('4. Inicie o servidor:');
  console.log('   npm start\n');
  
  console.log('📖 Documentação completa: GUIA_CONFIGURACAO_DADOS_REAIS.md\n');
  
} else {
  console.log('✅ SISTEMA PRONTO PARA USO!\n');
  console.log('Inicie o servidor com: npm start\n');
  console.log('APIs disponíveis:');
  console.log('  - GET  /api/vehicles');
  console.log('  - GET  /api/vehicles/:brand');
  console.log('  - GET  /api/dealerships');
  console.log('  - GET  /api/dealerships/:brand');
  console.log('  - GET  /api/status');
  console.log('  - POST /api/dealerships/force-update\n');
  
  console.log('⏰ Atualizações automáticas:');
  console.log('  - Veículos: Diariamente às 03:00 AM');
  console.log('  - Concessionárias: Semanalmente (segunda 04:00 AM)\n');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
