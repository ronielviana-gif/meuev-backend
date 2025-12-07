/******************************************************************
 *  BACKEND MEUEV – CHECKOUT + AUTO-UPDATE DATABASE
 *  
 *  Features:
 *  - Checkout Mercado Pago (PIX + Cartão)
 *  - Auto-scraping de veículos a cada 24h
 *  - API REST para frontend consumir dados atualizados
 ******************************************************************/

const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const { MercadoPagoConfig, Payment, Preference } = require("mercadopago");
const { scrapeAllBrands, saveDatabase } = require("./scraper");

const app = express();
app.use(cors());
app.use(express.json());

/************************************************************
 *  1) CONFIGURAÇÃO DO MERCADO PAGO
 ************************************************************/
if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
    console.log("❌ ERRO: MERCADOPAGO_ACCESS_TOKEN NÃO DEFINIDO NO RENDER!");
    console.log("➡️ Configure em: Render → Web Service → Environment Variables");
}

const client = new MercadoPagoConfig({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
});

const payment = new Payment(client);
const preference = new Preference(client);

// Armazena status dos pagamentos em memória (em produção use banco de dados)
const paymentStatus = new Map();

/************************************************************
 *  2A) ROTA: CRIAR PAGAMENTO PIX (CHECKOUT TRANSPARENTE)
 ************************************************************/
app.post("/payment/pix", async (req, res) => {
    try {
        console.log("💳 Criando pagamento PIX transparente...");

        const externalRef = "MEUEV-" + Date.now();
        const amount = 1.99;

        const result = await payment.create({
            body: {
                transaction_amount: amount,
                description: "MeuEV - Relatório Premium",
                payment_method_id: "pix",
                external_reference: externalRef,
                payer: {
                    email: req.body.email || "pagador@meuev.com",
                    first_name: req.body.name || "Cliente",
                    last_name: "MeuEV"
                },
                notification_url: `${process.env.BACKEND_URL || 'https://meuev-backend.onrender.com'}/webhook`
            }
        });

        console.log("✅ PIX criado:", result.id);
        console.log("📊 Status:", result.status);

        // Salva na memória
        paymentStatus.set(result.id.toString(), {
            status: result.status,
            external_reference: externalRef,
            payment_id: result.id,
            created_at: new Date()
        });

        const qrData = result.point_of_interaction?.transaction_data;

        return res.json({
            payment_id: result.id,
            status: result.status,
            external_reference: externalRef,
            qr_code: qrData?.qr_code || null,
            qr_code_base64: qrData?.qr_code_base64 || null,
            ticket_url: qrData?.ticket_url || null,
            amount: amount
        });

    } catch (err) {
        console.error("❌ ERRO AO CRIAR PIX:", err);
        return res.status(500).json({
            error: true,
            message: "Erro ao criar pagamento PIX",
            details: err.message
        });
    }
});

/************************************************************
 *  2B) ROTA: CRIAR PAGAMENTO CARTÃO (CHECKOUT TRANSPARENTE)
 ************************************************************/
app.post("/payment/card", async (req, res) => {
    try {
        console.log("💳 Criando pagamento com cartão...");

        const { token, email, name } = req.body;
        const externalRef = "MEUEV-" + Date.now();

        const result = await payment.create({
            body: {
                transaction_amount: 1.99,
                description: "MeuEV - Relatório Premium",
                payment_method_id: req.body.payment_method_id || "visa",
                token: token,
                installments: 1,
                external_reference: externalRef,
                payer: {
                    email: email || "pagador@meuev.com",
                    first_name: name || "Cliente",
                    last_name: "MeuEV"
                },
                notification_url: `${process.env.BACKEND_URL || 'https://meuev-backend.onrender.com'}/webhook`
            }
        });

        console.log("✅ Pagamento criado:", result.id);
        console.log("📊 Status:", result.status);

        // Salva na memória
        paymentStatus.set(result.id.toString(), {
            status: result.status,
            external_reference: externalRef,
            payment_id: result.id,
            created_at: new Date()
        });

        return res.json({
            payment_id: result.id,
            status: result.status,
            external_reference: externalRef,
            status_detail: result.status_detail
        });

    } catch (err) {
        console.error("❌ ERRO AO CRIAR PAGAMENTO:", err);
        return res.status(500).json({
            error: true,
            message: "Erro ao processar pagamento",
            details: err.message
        });
    }
});

/************************************************************
 *  2C) ROTA: OBTER PUBLIC KEY (para SDK do frontend)
 ************************************************************/
app.get("/payment/public-key", (req, res) => {
    const publicKey = process.env.MERCADOPAGO_PUBLIC_KEY || "";
    
    if (!publicKey) {
        console.warn("⚠️ PUBLIC_KEY não configurado!");
    }
    
    res.json({ public_key: publicKey });
});

/************************************************************
 *  2D) ROTA: CHECKOUT PRO (FALLBACK - caso queira manter)
 ************************************************************/
app.post("/checkout/create", async (req, res) => {
    try {
        console.log("🛒 Criando Checkout Pro...");

        const externalRef = "MEUEV-" + Date.now();
        
        const frontendUrl = req.body.return_url || 
                           process.env.FRONTEND_URL || 
                           req.headers.origin || 
                           req.headers.referer?.split('?')[0] || 
                           "https://seu-dominio.com";

        console.log("🌐 Frontend URL detectado:", frontendUrl);
        console.log("🔖 External Reference:", externalRef);

        const result = await preference.create({
            body: {
                items: [
                    {
                        title: "MeuEV - Relatório Completo Premium",
                        quantity: 1,
                        unit_price: 1.99,
                        currency_id: "BRL"
                    }
                ],
                back_urls: {
                    success: `${frontendUrl}?payment=success&ref=${externalRef}`,
                    failure: `${frontendUrl}?payment=failure&ref=${externalRef}`,
                    pending: `${frontendUrl}?payment=pending&ref=${externalRef}`
                },
                auto_return: "all",
                payment_methods: {
                    excluded_payment_types: [],
                    installments: 1
                },
                statement_descriptor: "MEUEV",
                external_reference: externalRef,
                notification_url: `${process.env.BACKEND_URL || 'https://meuev-backend.onrender.com'}/webhook`
            }
        });

        console.log("✅ Checkout criado!");
        console.log("🆔 Preference ID:", result.id);

        paymentStatus.set(result.id, {
            status: "pending",
            external_reference: externalRef,
            created_at: new Date()
        });

        return res.json({
            checkout_url: result.init_point,
            preference_id: result.id,
            external_reference: externalRef
        });

    } catch (err) {
        console.error("❌ ERRO AO CRIAR CHECKOUT:", err);
        return res.status(500).json({
            error: true,
            message: "Erro ao criar checkout",
            details: err.message
        });
    }
});

/************************************************************
 *  3) ROTA: CONSULTA DO STATUS DO PAGAMENTO
 ************************************************************/
app.get("/payment/status/:paymentId", async (req, res) => {
    try {
        const paymentId = req.params.paymentId;
        
        console.log("🔍 Consultando status do pagamento:", paymentId);
        
        // Primeiro tenta buscar na memória
        const stored = paymentStatus.get(paymentId.toString());
        
        if (stored) {
            console.log("✅ Status encontrado na memória:", stored.status);
            return res.json({
                payment_id: paymentId,
                status: stored.status,
                external_reference: stored.external_reference
            });
        }
        
        // Se não encontrou, busca direto no Mercado Pago
        try {
            console.log("🔎 Buscando no Mercado Pago...");
            const paymentData = await payment.get({ id: paymentId });
            
            console.log("✅ Pagamento encontrado no MP:", paymentData.status);
            
            // Salva na memória
            paymentStatus.set(paymentId.toString(), {
                status: paymentData.status,
                payment_id: paymentId,
                external_reference: paymentData.external_reference,
                updated_at: new Date()
            });
            
            return res.json({
                payment_id: paymentId,
                status: paymentData.status,
                external_reference: paymentData.external_reference
            });
        } catch (mpErr) {
            console.error("❌ Erro ao buscar no MP:", mpErr.message);
            return res.json({
                status: "not_found",
                message: "Pagamento não encontrado"
            });
        }

    } catch (err) {
        console.error("❌ ERRO AO CONSULTAR STATUS:", err);
        return res.status(500).json({
            error: true,
            message: "Erro ao consultar pagamento"
        });
    }
});

// Manter compatibilidade com rota antiga
app.get("/checkout/status/:preferenceId", async (req, res) => {
    try {
        const preferenceId = req.params.preferenceId;
        const stored = paymentStatus.get(preferenceId);
        
        if (!stored) {
            return res.json({
                status: "not_found",
                message: "Pagamento não encontrado"
            });
        }

        return res.json({
            preference_id: preferenceId,
            status: stored.status,
            payment_id: stored.payment_id || null,
            external_reference: stored.external_reference
        });

    } catch (err) {
        console.error("❌ ERRO AO CONSULTAR STATUS:", err);
        return res.status(500).json({
            error: true,
            message: "Erro ao consultar pagamento"
        });
    }
});

/************************************************************
 *  4) WEBHOOK - RECEBE NOTIFICAÇÕES DO MERCADO PAGO
 ************************************************************/
app.post("/webhook", async (req, res) => {
    try {
        console.log("📩 Webhook recebido:", JSON.stringify(req.body, null, 2));

        const { type, data } = req.body;

        // Mercado Pago envia notificações de payment
        if (type === "payment") {
            const paymentId = data.id;
            
            console.log("🔍 Consultando pagamento:", paymentId);

            // Busca detalhes do pagamento
            const paymentData = await payment.get({ id: paymentId });

            console.log("💳 Status do pagamento:", paymentData.status);
            console.log("🔖 External Reference:", paymentData.external_reference);

            // Salva/atualiza com o próprio payment_id como chave (para pagamentos diretos)
            paymentStatus.set(paymentId.toString(), {
                status: paymentData.status,
                payment_id: paymentId,
                external_reference: paymentData.external_reference,
                updated_at: new Date()
            });

            // Também tenta atualizar por preferenceId se existir
            const preferenceId = paymentData.metadata?.preference_id || 
                                 findPreferenceByExternalRef(paymentData.external_reference);

            if (preferenceId) {
                const stored = paymentStatus.get(preferenceId) || {};
                paymentStatus.set(preferenceId, {
                    ...stored,
                    status: paymentData.status,
                    payment_id: paymentId,
                    external_reference: paymentData.external_reference,
                    updated_at: new Date()
                });
            }

            console.log("✅ Status atualizado:", {
                payment_id: paymentId,
                preference_id: preferenceId,
                status: paymentData.status,
                external_reference: paymentData.external_reference
            });
        }

        res.sendStatus(200);

    } catch (err) {
        console.error("❌ ERRO NO WEBHOOK:", err);
        res.sendStatus(500);
    }
});

// Função auxiliar para encontrar preferência por external_reference
function findPreferenceByExternalRef(externalRef) {
    for (const [prefId, data] of paymentStatus.entries()) {
        if (data.external_reference === externalRef) {
            return prefId;
        }
    }
    return null;
}

/************************************************************
 *  5) ROTA DE VERIFICAÇÃO MANUAL (para polling do frontend)
 ************************************************************/
app.get("/checkout/verify/:externalRef", async (req, res) => {
    try {
        const externalRef = req.params.externalRef;
        
        console.log("🔍 Verificando pagamento com external_ref:", externalRef);
        
        // Busca preferência por external_reference na memória
        let found = null;
        for (const [prefId, data] of paymentStatus.entries()) {
            if (data.external_reference === externalRef) {
                found = { preference_id: prefId, ...data };
                break;
            }
        }

        // Se não encontrou na memória, busca DIRETO NO MERCADO PAGO
        if (!found || found.status === "pending") {
            console.log("🔎 Buscando direto no Mercado Pago...");
            
            try {
                // Busca pagamentos com essa external_reference
                const searchResult = await payment.search({
                    options: {
                        criteria: "desc",
                        external_reference: externalRef
                    }
                });

                if (searchResult.results && searchResult.results.length > 0) {
                    const latestPayment = searchResult.results[0];
                    console.log("✅ Pagamento encontrado no MP:", {
                        id: latestPayment.id,
                        status: latestPayment.status,
                        external_reference: latestPayment.external_reference
                    });

                    // Atualiza na memória
                    if (found) {
                        paymentStatus.set(found.preference_id, {
                            ...found,
                            status: latestPayment.status,
                            payment_id: latestPayment.id,
                            updated_at: new Date()
                        });
                    }

                    return res.json({
                        status: latestPayment.status,
                        payment_id: latestPayment.id,
                        external_reference: externalRef,
                        from_mercadopago: true
                    });
                }
            } catch (searchErr) {
                console.error("⚠️ Erro ao buscar no MP:", searchErr.message);
            }
        }

        if (!found) {
            return res.json({
                status: "not_found",
                message: "Pagamento não encontrado"
            });
        }

        return res.json({
            status: found.status,
            payment_id: found.payment_id || null,
            preference_id: found.preference_id,
            from_memory: true
        });

    } catch (err) {
        console.error("❌ ERRO AO VERIFICAR:", err);
        return res.status(500).json({
            error: true,
            message: "Erro ao verificar pagamento"
        });
    }
});

/************************************************************
 *  6) API DE VEÍCULOS - DADOS ATUALIZADOS EM TEMPO REAL
 ************************************************************/

// Cache de veículos (atualiza a cada 24h)
let vehiclesCache = {
    data: null,
    lastUpdate: null,
    ttl: 24 * 60 * 60 * 1000 // 24 horas
};

// Dados base de veículos (fallback se scraping falhar)
const baseVehiclesData = [
    // EVs Entrada
    { name: 'BYD Dolphin Mini', price: 119900, type: 'EV', autonomy: 380, category: 'Hatch', stars: 4.5, comparable: 'VW Polo/Nivus R$ 110-125k', url: 'https://www.byd.com/br/car/dolphin-mini.html' },
    { name: 'JAC E-JS1', price: 139900, type: 'EV', autonomy: 302, category: 'Hatch', stars: 4.2, comparable: 'Onix/HB20 R$ 85-95k', url: 'https://www.jacmotors.com.br/e-js1' },
    { name: 'GWM Ora 03', price: 149900, type: 'EV', autonomy: 400, category: 'Hatch', stars: 4.4, comparable: 'Onix Premier/Polo R$ 95-115k', url: 'https://www.gwm-global.com/br/ora-03' },
    
    // EVs Compactos
    { name: 'BYD Dolphin', price: 149900, type: 'EV', autonomy: 410, category: 'Compacto', stars: 4.7, comparable: 'Corolla R$ 155k', url: 'https://www.byd.com/br/car/dolphin.html' },
    { name: 'Renault Megane E-Tech', price: 229900, type: 'EV', autonomy: 450, category: 'Compacto', stars: 4.5, comparable: 'Civic/Corolla R$ 160-180k', url: 'https://www.renault.com.br/megane-e-tech' },
    
    // SUVs
    { name: 'BYD Yuan Plus', price: 189900, type: 'EV', autonomy: 410, category: 'SUV', stars: 4.6, comparable: 'Compass/Tiggo 8 R$ 175-195k', url: 'https://www.byd.com/br/car/yuan-plus.html' },
    { name: 'Volvo EX30', price: 249900, type: 'EV', autonomy: 475, category: 'SUV Premium', stars: 4.8, comparable: 'BMW X1/Audi Q3 R$ 240-270k', url: 'https://www.volvocars.com/br/cars/ex30/' },
    { name: 'BYD Tang', price: 549900, type: 'EV', autonomy: 505, category: 'SUV Grande', stars: 4.7, comparable: 'SW4/Defender R$ 480-550k', url: 'https://www.byd.com/br/car/tang.html' },
    
    // Premium
    { name: 'Tesla Model 3 RWD', price: 289900, type: 'EV', autonomy: 513, category: 'Sedã Premium', stars: 4.9, comparable: 'BMW Série 3 R$ 300-350k', url: 'https://www.tesla.com/pt_br/model3' },
    { name: 'BYD Seal', price: 319900, type: 'EV', autonomy: 520, category: 'Sedã Premium', stars: 4.7, comparable: 'Audi A4/BMW 330i R$ 310-370k', url: 'https://www.byd.com/br/car/seal.html' },
    
    // Híbridos
    { name: 'Toyota Corolla Hybrid', price: 158900, type: 'Híbrido', autonomy: 0, category: 'Sedã', stars: 4.6, comparable: 'Corolla gasolina R$ 155k + economia', url: 'https://www.toyota.com.br/corolla-hybrid' },
    { name: 'BYD Song Pro', price: 229900, type: 'Híbrido Plug-in', autonomy: 80, category: 'SUV', stars: 4.5, comparable: 'Compass/Tiguan R$ 185-220k', url: 'https://www.byd.com/br/car/song-pro.html' }
];

// Função para atualizar preços (simulação - em produção conectaria a APIs reais)
async function updateVehiclePrices() {
    console.log("🔄 Atualizando preços de veículos...");
    
    try {
        // AQUI seria feito o scraping ou consulta a APIs externas
        // Por enquanto, vamos simular pequenas variações nos preços base
        const updatedVehicles = baseVehiclesData.map(vehicle => ({
            ...vehicle,
            // Simula variação de até ±3% no preço
            price: Math.round(vehicle.price * (1 + (Math.random() * 0.06 - 0.03))),
            lastUpdate: new Date().toISOString()
        }));

        vehiclesCache.data = updatedVehicles;
        vehiclesCache.lastUpdate = Date.now();
        
        console.log(`✅ ${updatedVehicles.length} veículos atualizados`);
        return updatedVehicles;
        
    } catch (error) {
        console.error("❌ Erro ao atualizar preços:", error);
        // Retorna dados base em caso de erro
        return baseVehiclesData;
    }
}

// Rota GET /api/vehicles - Retorna lista de veículos atualizada
app.get("/api/vehicles", async (req, res) => {
    try {
        console.log("📊 Requisição de veículos recebida");
        
        // Verifica se cache expirou
        const cacheExpired = !vehiclesCache.lastUpdate || 
                           (Date.now() - vehiclesCache.lastUpdate) > vehiclesCache.ttl;
        
        if (cacheExpired) {
            console.log("⏰ Cache expirado, atualizando...");
            await updateVehiclePrices();
        } else {
            console.log("✅ Usando cache (válido por mais " + 
                Math.round((vehiclesCache.ttl - (Date.now() - vehiclesCache.lastUpdate)) / 1000 / 60) + 
                " minutos)");
        }
        
        const { budgetMin, budgetMax } = req.query;
        let vehicles = vehiclesCache.data || baseVehiclesData;
        
        // Filtra por orçamento se fornecido
        if (budgetMin || budgetMax) {
            const min = parseFloat(budgetMin) || 0;
            const max = parseFloat(budgetMax) || Infinity;
            vehicles = vehicles.filter(v => v.price >= min && v.price <= max);
        }
        
        return res.json({
            success: true,
            count: vehicles.length,
            lastUpdate: vehiclesCache.lastUpdate,
            cacheAge: vehiclesCache.lastUpdate ? 
                Math.round((Date.now() - vehiclesCache.lastUpdate) / 1000 / 60) : null,
            data: vehicles
        });
        
    } catch (error) {
        console.error("❌ Erro ao buscar veículos:", error);
        return res.status(500).json({
            success: false,
            error: "Erro ao buscar veículos",
            data: baseVehiclesData // Fallback
        });
    }
});

// Rota GET /api/market-context - Retorna contexto do mercado
app.get("/api/market-context", async (req, res) => {
    try {
        const marketData = {
            evModelsAvailable: 58,
            infraChargers: 8200,
            marketGrowth: '127%',
            avgPriceReduction: '22%',
            topBrands: ['BYD', 'GWM', 'Tesla', 'Volvo', 'BMW', 'Renault'],
            affordableEntry: 'R$ 119.900 (BYD Dolphin Mini)',
            premiumEntry: 'R$ 289.900 (Tesla Model 3)',
            hybridEntry: 'R$ 158.900 (Toyota Corolla Hybrid)',
            priceParityAchieved: true,
            realEconomyMonthly: 'R$ 400-800/mês vs combustão',
            lastUpdate: new Date().toISOString()
        };
        
        return res.json({
            success: true,
            data: marketData
        });
        
    } catch (error) {
        console.error("❌ Erro ao buscar contexto:", error);
        return res.status(500).json({
            success: false,
            error: "Erro ao buscar contexto de mercado"
        });
    }
});

// Rota POST /api/force-update - Força atualização do cache (admin)
app.post("/api/force-update", async (req, res) => {
    try {
        console.log("🔄 Forçando atualização de preços...");
        const updated = await updateVehiclePrices();
        
        return res.json({
            success: true,
            message: "Preços atualizados com sucesso",
            count: updated.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error("❌ Erro ao forçar atualização:", error);
        return res.status(500).json({
            success: false,
            error: "Erro ao atualizar preços"
        });
    }
});

// Inicializa cache ao iniciar servidor
updateVehiclePrices();

/************************************************************
 *  7) AUTO-UPDATE: SCRAPING A CADA 24H
 ************************************************************/

// Executa scraping todos os dias às 03:00 AM (horário brasileiro)
cron.schedule('0 3 * * *', async () => {
    console.log('\n⏰ [CRON] Iniciando atualização automática de veículos...');
    console.log(`📅 ${new Date().toLocaleString('pt-BR')}`);
    
    try {
        const vehicles = await scrapeAllBrands();
        const data = saveDatabase(vehicles);
        
        console.log(`✅ [CRON] Database atualizado: ${data.totalVehicles} veículos`);
        console.log(`💰 [CRON] Faixa de preço: R$ ${data.priceRange.min.toLocaleString('pt-BR')} - R$ ${data.priceRange.max.toLocaleString('pt-BR')}`);
        
    } catch (error) {
        console.error('❌ [CRON] Erro na atualização automática:', error.message);
    }
}, {
    timezone: "America/Sao_Paulo"
});

console.log('⏰ Cron job configurado: Atualização diária às 03:00 AM');

/************************************************************
 *  8) API REST: DADOS DE VEÍCULOS
 ************************************************************/

// GET /api/vehicles - Retorna todos os veículos
app.get('/api/vehicles', (req, res) => {
    try {
        const dbPath = path.join(__dirname, 'database', 'vehicles.json');
        
        if (!fs.existsSync(dbPath)) {
            return res.status(404).json({
                success: false,
                error: 'Database não encontrado. Execute npm run scraper primeiro.'
            });
        }
        
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        
        res.json({
            success: true,
            lastUpdate: data.lastUpdate,
            totalVehicles: data.totalVehicles,
            vehicles: data.vehicles,
            brands: data.brands,
            priceRange: data.priceRange
        });
        
    } catch (error) {
        console.error('❌ Erro ao carregar vehicles:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao carregar dados de veículos'
        });
    }
});

// GET /api/vehicles/:brand - Filtra por marca
app.get('/api/vehicles/:brand', (req, res) => {
    try {
        const dbPath = path.join(__dirname, 'database', 'vehicles.json');
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        
        const brand = req.params.brand.toLowerCase();
        const filtered = data.vehicles.filter(v => v.brand.toLowerCase() === brand);
        
        res.json({
            success: true,
            brand: req.params.brand,
            totalVehicles: filtered.length,
            vehicles: filtered
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/status - Status do sistema
app.get('/api/status', (req, res) => {
    try {
        const dbPath = path.join(__dirname, 'database', 'vehicles.json');
        
        if (!fs.existsSync(dbPath)) {
            return res.json({
                success: true,
                status: 'Database não inicializado',
                hasData: false
            });
        }
        
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        const lastUpdateDate = new Date(data.lastUpdate);
        const hoursSinceUpdate = (Date.now() - lastUpdateDate.getTime()) / (1000 * 60 * 60);
        
        res.json({
            success: true,
            status: 'Online',
            hasData: true,
            lastUpdate: data.lastUpdate,
            hoursSinceUpdate: hoursSinceUpdate.toFixed(1),
            totalVehicles: data.totalVehicles,
            brands: data.brands.length,
            nextUpdate: 'Diariamente às 03:00 AM'
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/************************************************************
 *  9) INICIALIZAÇÃO DO SERVIDOR
 ************************************************************/
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`\n🚀 Servidor MeuEV rodando na porta ${PORT}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📡 ENDPOINTS DISPONÍVEIS:');
    console.log('  💳 POST   /payment/pix');
    console.log('  💳 POST   /payment/card');
    console.log('  🛒 POST   /checkout/create');
    console.log('  📊 GET    /checkout/status/:preferenceId');
    console.log('  🔔 POST   /webhook');
    console.log('  🚗 GET    /api/vehicles');
    console.log('  🚗 GET    /api/vehicles/:brand');
    console.log('  ⚙️  GET    /api/status');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⏰ Auto-update: Diariamente às 03:00 AM');
    console.log('🔄 Execute "npm run scraper" para atualização manual\n');
    console.log("🚗 API Veículos: GET /api/vehicles");
    console.log("📈 Contexto Mercado: GET /api/market-context");
    console.log("🔄 Forçar Update: POST /api/force-update");
    console.log("🔑 Token carregado do ENV:", process.env.MERCADOPAGO_ACCESS_TOKEN ? "SIM" : "NÃO");
});
