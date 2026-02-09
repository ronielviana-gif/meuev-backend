/******************************************************************
 *  BACKEND MEUEV – CHECKOUT + AUTO-UPDATE DATABASE
 *  
 *  Features:
 *  - Checkout Mercado Pago (PIX + Cartão)
 *  - Auto-scraping de veículos a cada 24h
 *  - API REST para frontend consumir dados atualizados
 ******************************************************************/

// Carregar variáveis de ambiente
require('dotenv').config();

const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const { MercadoPagoConfig, Payment, Preference } = require("mercadopago");
const { scrapeAllBrands, saveDatabase } = require("./scraper");
const { scrapeAllDealerships, saveDealershipDatabase } = require("./dealership-scraper");
const { scrapeAllChargers, saveChargersDatabase, loadChargersDatabase, getAllChargers } = require("./chargers-scraper");

const app = express();
app.use(cors());
app.use(express.json());

// Servir arquivos estáticos da pasta raiz do projeto
app.use(express.static(path.join(__dirname, '..')));

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
        const amount = 29.90;

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
                transaction_amount: 29.90,
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
                        unit_price: 29.90,
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
    // === AUDI ===
    { name: 'Audi Q4 e-tron', price: 429900, type: 'EV', autonomy: 520, category: 'SUV Premium', stars: 4.7, comparable: 'BMW X3 R$ 380k / Audi Q5 R$ 400k', url: 'https://www.audi.com.br' },
    { name: 'Audi Q8 e-tron', price: 649900, type: 'EV', autonomy: 491, category: 'SUV Premium', stars: 4.7, comparable: 'BMW X5 R$ 580k / GLE R$ 620k', url: 'https://www.audi.com.br' },
    { name: 'Audi e-tron GT', price: 829900, type: 'EV', autonomy: 488, category: 'Esportivo', stars: 4.9, comparable: 'Panamera R$ 750k / Taycan R$ 690k', url: 'https://www.audi.com.br' },
    
    // === BMW ===
    { name: 'BMW iX1', price: 383950, type: 'EV', autonomy: 439, category: 'SUV Premium', stars: 4.7, comparable: 'X1 gasolina R$ 280k + economia', url: 'https://www.bmw.com.br' },
    { name: 'BMW iX3', price: 449900, type: 'EV', autonomy: 460, category: 'SUV Premium', stars: 4.7, comparable: 'X3 gasolina R$ 380k + economia', url: 'https://www.bmw.com.br' },
    { name: 'BMW i4', price: 449900, type: 'EV', autonomy: 590, category: 'Sedã Premium', stars: 4.8, comparable: 'Série 4 R$ 420k + economia', url: 'https://www.bmw.com.br' },
    { name: 'BMW iX', price: 689900, type: 'EV', autonomy: 630, category: 'SUV Premium', stars: 4.8, comparable: 'X5 R$ 580k + economia', url: 'https://www.bmw.com.br' },
    { name: 'BMW i7', price: 989900, type: 'EV', autonomy: 625, category: 'Sedã Luxo', stars: 4.9, comparable: 'Série 7 R$ 850k + economia', url: 'https://www.bmw.com.br' },
    
    // === BYD ===
    { name: 'BYD Dolphin Mini GL', price: 109900, type: 'EV', autonomy: 280, category: 'Hatch', stars: 4.4, comparable: 'VW Polo R$ 85k / HB20 R$ 95k', url: 'https://www.byd.com/br' },
    { name: 'BYD Dolphin Mini 5L', price: 119900, type: 'EV', autonomy: 380, category: 'Hatch', stars: 4.5, comparable: 'VW Polo/Nivus R$ 110-125k', url: 'https://www.byd.com/br' },
    { name: 'BYD Dolphin GS', price: 149900, type: 'EV', autonomy: 410, category: 'Compacto', stars: 4.7, comparable: 'Corolla R$ 155k', url: 'https://www.byd.com/br' },
    { name: 'BYD Yuan Plus', price: 189900, type: 'EV', autonomy: 410, category: 'SUV', stars: 4.6, comparable: 'Compass/Tiggo 8 R$ 175-195k', url: 'https://www.byd.com/br' },
    { name: 'BYD Seal', price: 319900, type: 'EV', autonomy: 520, category: 'Sedã Premium', stars: 4.7, comparable: 'Audi A4/BMW 330i R$ 310-370k', url: 'https://www.byd.com/br' },
    { name: 'BYD Tang', price: 549900, type: 'EV', autonomy: 505, category: 'SUV Grande', stars: 4.7, comparable: 'SW4/Defender R$ 480-550k', url: 'https://www.byd.com/br' },
    { name: 'BYD Han', price: 399900, type: 'EV', autonomy: 521, category: 'Sedã Premium', stars: 4.7, comparable: 'BMW Série 5 R$ 450k', url: 'https://www.byd.com/br' },
    
    // === CADILLAC ===
    { name: 'Cadillac Lyriq', price: 589900, type: 'EV', autonomy: 530, category: 'SUV Premium', stars: 4.7, comparable: 'BMW X5 R$ 580k / Audi Q7 R$ 620k', url: 'https://www.cadillac.com.br' },
    { name: 'Cadillac Optiq', price: 489900, type: 'EV', autonomy: 480, category: 'SUV Premium', stars: 4.6, comparable: 'BMW X3 R$ 380k / GLC R$ 450k', url: 'https://www.cadillac.com.br' },
    
    // === CHEVROLET ===
    { name: 'Chevrolet Spark EUV', price: 189900, type: 'EV', autonomy: 380, category: 'SUV Compacto', stars: 4.3, comparable: 'Tracker R$ 140k / Creta R$ 160k', url: 'https://www.chevrolet.com.br' },
    { name: 'Chevrolet Blazer EV', price: 449900, type: 'EV', autonomy: 515, category: 'SUV', stars: 4.6, comparable: 'X3 R$ 380k / Q5 R$ 400k', url: 'https://www.chevrolet.com.br' },
    { name: 'Chevrolet Equinox EV', price: 389900, type: 'EV', autonomy: 485, category: 'SUV', stars: 4.5, comparable: 'Compass R$ 165k / Tiguan R$ 210k', url: 'https://www.chevrolet.com.br' },
    
    // === GAC AION ===
    { name: 'GAC Aion ES', price: 149900, type: 'EV', autonomy: 410, category: 'Sedã', stars: 4.4, comparable: 'Civic R$ 160k / Corolla R$ 155k', url: 'https://www.gac-aion.com.br' },
    { name: 'GAC Aion UT', price: 139900, type: 'EV', autonomy: 380, category: 'Hatch', stars: 4.3, comparable: 'Onix Premier R$ 90k / Polo R$ 85k', url: 'https://www.gac-aion.com.br' },
    
    // === GEELY ===
    { name: 'Geely EX2 Pro', price: 129900, type: 'EV', autonomy: 350, category: 'Hatch', stars: 4.3, comparable: 'Onix R$ 80k / HB20 R$ 88k', url: 'https://www.geely.com.br' },
    { name: 'Geely EX5', price: 169900, type: 'EV', autonomy: 420, category: 'SUV Compacto', stars: 4.4, comparable: 'Creta R$ 160k / Pulse R$ 130k', url: 'https://www.geely.com.br' },
    
    // === GWM ===
    { name: 'GWM Ora 03 Skin', price: 139900, type: 'EV', autonomy: 380, category: 'Hatch', stars: 4.4, comparable: 'Onix Premier R$ 90k / Polo R$ 85k', url: 'https://www.gwm-global.com/br' },
    { name: 'GWM Ora 03 GT', price: 149900, type: 'EV', autonomy: 400, category: 'Hatch', stars: 4.5, comparable: 'Onix Premier/Polo R$ 95-115k', url: 'https://www.gwm-global.com/br' },
    
    // === HYUNDAI ===
    { name: 'Hyundai Ioniq 5', price: 329900, type: 'EV', autonomy: 507, category: 'SUV Premium', stars: 4.8, comparable: 'X3 R$ 380k / Q5 R$ 400k', url: 'https://www.hyundai.com.br' },
    { name: 'Hyundai Ioniq 9', price: 489900, type: 'EV', autonomy: 550, category: 'SUV Grande', stars: 4.7, comparable: 'X5 R$ 580k / Q7 R$ 620k', url: 'https://www.hyundai.com.br' },
    
    // === JAC ===
    { name: 'JAC E-JS1', price: 139900, type: 'EV', autonomy: 302, category: 'Hatch', stars: 4.2, comparable: 'Onix/HB20 R$ 85-95k', url: 'https://www.jac.com.br' },
    { name: 'JAC E-JS3', price: 159900, type: 'EV', autonomy: 350, category: 'Sedã Compacto', stars: 4.3, comparable: 'Onix Plus R$ 95k / HB20S R$ 100k', url: 'https://www.jac.com.br' },
    { name: 'JAC E-JS4', price: 179900, type: 'EV', autonomy: 380, category: 'SUV', stars: 4.3, comparable: 'Creta R$ 140k / Pulse R$ 130k', url: 'https://www.jac.com.br' },
    { name: 'JAC E-J7', price: 219900, type: 'EV', autonomy: 450, category: 'SUV', stars: 4.4, comparable: 'Compass R$ 165k / Tiggo 8 R$ 190k', url: 'https://www.jac.com.br' },
    
    // === KIA ===
    { name: 'Kia EV3', price: 249900, type: 'EV', autonomy: 450, category: 'SUV Compacto', stars: 4.6, comparable: 'Creta R$ 160k / Compass R$ 165k', url: 'https://www.kia.com/br' },
    { name: 'Kia EV5', price: 289900, type: 'EV', autonomy: 490, category: 'SUV', stars: 4.7, comparable: 'Sportage R$ 230k / Tiguan R$ 210k', url: 'https://www.kia.com/br' },
    { name: 'Kia EV6', price: 379900, type: 'EV', autonomy: 528, category: 'SUV Premium', stars: 4.8, comparable: 'X3 R$ 380k / Q5 R$ 400k', url: 'https://www.kia.com/br' },
    { name: 'Kia EV9', price: 549900, type: 'EV', autonomy: 560, category: 'SUV Grande', stars: 4.8, comparable: 'X5 R$ 580k / Q7 R$ 620k', url: 'https://www.kia.com/br' },
    
    // === LEAPMOTOR ===
    { name: 'Leapmotor B10', price: 189900, type: 'EV', autonomy: 420, category: 'SUV', stars: 4.4, comparable: 'Compass R$ 165k / Tiggo 8 R$ 190k', url: 'https://www.leapmotor.com.br' },
    { name: 'Leapmotor C10', price: 229900, type: 'EV', autonomy: 460, category: 'SUV', stars: 4.5, comparable: 'Tiguan R$ 210k / Taos R$ 170k', url: 'https://www.leapmotor.com.br' },
    
    // === MERCEDES-BENZ ===
    { name: 'Mercedes-Benz EQA', price: 489900, type: 'EV', autonomy: 426, category: 'SUV Premium', stars: 4.7, comparable: 'GLA R$ 320k / X1 R$ 280k', url: 'https://www.mercedes-benz.com.br' },
    { name: 'Mercedes-Benz EQB', price: 529900, type: 'EV', autonomy: 419, category: 'SUV Premium', stars: 4.7, comparable: 'GLB R$ 360k / X3 R$ 380k', url: 'https://www.mercedes-benz.com.br' },
    { name: 'Mercedes-Benz EQE', price: 789900, type: 'EV', autonomy: 639, category: 'Sedã Luxo', stars: 4.8, comparable: 'Classe E R$ 550k / Série 5 R$ 450k', url: 'https://www.mercedes-benz.com.br' },
    { name: 'Mercedes-Benz EQS', price: 989900, type: 'EV', autonomy: 784, category: 'Sedã Luxo', stars: 4.9, comparable: 'Classe S R$ 850k / i7 R$ 990k', url: 'https://www.mercedes-benz.com.br' },
    { name: 'Mercedes-Benz G-Class EQ', price: 1489900, type: 'EV', autonomy: 480, category: 'SUV Luxo', stars: 4.9, comparable: 'G-Class R$ 1.3M + economia', url: 'https://www.mercedes-benz.com.br' },
    
    // === MG ===
    { name: 'MG MG4 Comfort', price: 159900, type: 'EV', autonomy: 350, category: 'Hatch', stars: 4.4, comparable: 'Polo R$ 85k / Onix Premier R$ 90k', url: 'https://www.mgmotor.com.br' },
    
    // === PEUGEOT ===
    { name: 'Peugeot e-208', price: 179900, type: 'EV', autonomy: 362, category: 'Hatch', stars: 4.5, comparable: '208 R$ 95k / Polo R$ 85k', url: 'https://www.peugeot.com.br' },
    { name: 'Peugeot e-2008', price: 249900, type: 'EV', autonomy: 340, category: 'SUV Compacto', stars: 4.5, comparable: '2008 R$ 140k / Creta R$ 160k', url: 'https://www.peugeot.com.br' },
    
    // === PORSCHE ===
    { name: 'Porsche Taycan', price: 689900, type: 'EV', autonomy: 484, category: 'Esportivo', stars: 4.9, comparable: 'Panamera R$ 750k / 911 R$ 850k', url: 'https://www.porsche.com/brazil' },
    { name: 'Porsche Macan Electric', price: 579900, type: 'EV', autonomy: 500, category: 'SUV Premium', stars: 4.8, comparable: 'Macan R$ 480k / Cayenne R$ 650k', url: 'https://www.porsche.com/brazil' },
    
    // === RENAULT ===
    { name: 'Renault Kwid E-Tech', price: 99990, type: 'EV', autonomy: 180, category: 'Hatch urbano', stars: 4.2, comparable: 'Kwid gasolina R$ 68k + economia', url: 'https://www.renault.com.br' },
    { name: 'Renault Megane E-Tech', price: 279990, type: 'EV', autonomy: 337, category: 'Crossover', stars: 4.5, comparable: 'Taos R$ 170k / Compass R$ 165k', url: 'https://www.renault.com.br' },
    
    // === VOLVO ===
    { name: 'Volvo EX30', price: 229950, type: 'EV', autonomy: 344, category: 'SUV Premium', stars: 4.8, comparable: 'BMW X1 R$ 280k / Audi Q3 R$ 270k', url: 'https://www.volvocars.com/br' },
    { name: 'Volvo XC40 Recharge', price: 349900, type: 'EV', autonomy: 418, category: 'SUV', stars: 4.7, comparable: 'BMW X3 R$ 380k / Audi Q5 R$ 400k', url: 'https://www.volvocars.com/br' },
    { name: 'Volvo C40 Recharge', price: 389900, type: 'EV', autonomy: 540, category: 'SUV Coupé', stars: 4.7, comparable: 'BMW X4 R$ 450k / GLE Coupé R$ 580k', url: 'https://www.volvocars.com/br' },
    { name: 'Volvo EX90', price: 689900, type: 'EV', autonomy: 600, category: 'SUV Grande', stars: 4.8, comparable: 'X5 R$ 580k / Q7 R$ 620k', url: 'https://www.volvocars.com/br' },
    { name: 'Volvo ES90', price: 589900, type: 'EV', autonomy: 580, category: 'Sedã Premium', stars: 4.8, comparable: 'Série 5 R$ 450k / Classe E R$ 550k', url: 'https://www.volvocars.com/br' }
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
        
        // Ler diretamente do arquivo vehicles.json
        const dbPath = path.join(__dirname, 'database', 'vehicles.json');
        
        if (!fs.existsSync(dbPath)) {
            console.log("⚠️ Database não encontrado, usando fallback");
            const { budgetMin, budgetMax } = req.query;
            let vehicles = baseVehiclesData;
            
            if (budgetMin || budgetMax) {
                const min = parseFloat(budgetMin) || 0;
                const max = parseFloat(budgetMax) || Infinity;
                vehicles = vehicles.filter(v => v.price >= min && v.price <= max);
            }
            
            return res.json({
                success: true,
                count: vehicles.length,
                lastUpdate: new Date().toISOString(),
                data: vehicles
            });
        }
        
        const fileData = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        const { budgetMin, budgetMax } = req.query;
        let vehicles = fileData.vehicles || [];
        
        // Filtra por orçamento se fornecido
        if (budgetMin || budgetMax) {
            const min = parseFloat(budgetMin) || 0;
            const max = parseFloat(budgetMax) || Infinity;
            vehicles = vehicles.filter(v => v.price >= min && v.price <= max);
        }
        
        return res.json({
            success: true,
            count: vehicles.length,
            totalVehicles: fileData.totalVehicles,
            lastUpdate: fileData.lastUpdate,
            data: vehicles,
            brands: fileData.brands,
            priceRange: fileData.priceRange
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

// Executa scraping de VEÍCULOS todos os dias às 03:00 AM
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

// Executa scraping de CONCESSIONÁRIAS toda segunda-feira às 04:00 AM
cron.schedule('0 4 * * 1', async () => {
    console.log('\n⏰ [CRON] Iniciando atualização automática de concessionárias...');
    console.log(`📅 ${new Date().toLocaleString('pt-BR')}`);
    
    try {
        await scrapeAllDealerships();
        saveDealershipDatabase();
        
        const dbPath = path.join(__dirname, 'database', 'dealerships.json');
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        
        console.log(`✅ [CRON] Concessionárias atualizadas: ${data.totalDealerships} concessionárias`);
        console.log(`🏢 [CRON] Marcas com concessionárias: ${data.brands.length}`);
        
    } catch (error) {
        console.error('❌ [CRON] Erro na atualização de concessionárias:', error.message);
    }
}, {
    timezone: "America/Sao_Paulo"
});

// Executa scraping de CARREGADORES toda segunda-feira às 05:00 AM
cron.schedule('0 5 * * 1', async () => {
    console.log('\n⏰ [CRON] Iniciando atualização automática de carregadores...');
    console.log(`📅 ${new Date().toLocaleString('pt-BR')}`);
    
    try {
        const chargers = await scrapeAllChargers();
        saveChargersDatabase();
        
        console.log(`✅ [CRON] Carregadores atualizados: ${chargers.length} postos de carregamento`);
        
    } catch (error) {
        console.error('❌ [CRON] Erro na atualização de carregadores:', error.message);
    }
}, {
    timezone: "America/Sao_Paulo"
});

console.log('⏰ Cron jobs configurados:');
console.log('  - Veículos: Diariamente às 03:00 AM');
console.log('  - Concessionárias: Semanalmente (segunda às 04:00 AM');
console.log('  - Carregadores: Semanalmente (segunda às 05:00 AM)');

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
            count: data.totalVehicles,
            data: data.vehicles,  // Frontend espera 'data' em vez de 'vehicles'
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
        const vehiclesPath = path.join(__dirname, 'database', 'vehicles.json');
        const dealershipsPath = path.join(__dirname, 'database', 'dealerships.json');
        
        if (!fs.existsSync(vehiclesPath)) {
            return res.json({
                success: true,
                status: 'Database não inicializado',
                hasData: false
            });
        }
        
        const vehicleData = JSON.parse(fs.readFileSync(vehiclesPath, 'utf-8'));
        const lastUpdateDate = new Date(vehicleData.lastUpdate);
        const hoursSinceUpdate = (Date.now() - lastUpdateDate.getTime()) / (1000 * 60 * 60);
        
        let dealershipInfo = { hasDealerships: false };
        if (fs.existsSync(dealershipsPath)) {
            const dealershipData = JSON.parse(fs.readFileSync(dealershipsPath, 'utf-8'));
            dealershipInfo = {
                hasDealerships: true,
                totalDealerships: dealershipData.totalDealerships,
                lastUpdate: dealershipData.lastUpdate
            };
        }
        
        res.json({
            success: true,
            status: 'Online',
            hasData: true,
            vehicles: {
                lastUpdate: vehicleData.lastUpdate,
                hoursSinceUpdate: hoursSinceUpdate.toFixed(1),
                totalVehicles: vehicleData.totalVehicles,
                brands: vehicleData.brands.length,
                nextUpdate: 'Diariamente às 03:00 AM'
            },
            dealerships: dealershipInfo
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/dealerships - Retorna todas as concessionárias
app.get('/api/dealerships', (req, res) => {
    try {
        const dbPath = path.join(__dirname, 'database', 'dealerships.json');
        
        if (!fs.existsSync(dbPath)) {
            return res.status(404).json({
                success: false,
                error: 'Database de concessionárias não encontrado. Execute: node dealership-scraper.js'
            });
        }
        
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        
        res.json({
            success: true,
            data: {
                lastUpdate: data.lastUpdate,
                totalDealerships: data.totalDealerships,
                brands: data.brands
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao carregar dealerships:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao carregar dados de concessionárias'
        });
    }
});

// GET /api/dealerships/:brand - Filtra por marca
app.get('/api/dealerships/:brand', (req, res) => {
    try {
        const dbPath = path.join(__dirname, 'database', 'dealerships.json');
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        
        const brand = req.params.brand;
        const brandData = data.brands.find(b => b.brand.toLowerCase() === brand.toLowerCase());
        
        if (!brandData) {
            return res.status(404).json({
                success: false,
                error: `Nenhuma concessionária encontrada para a marca: ${brand}`
            });
        }
        
        res.json({
            success: true,
            brand: brandData.brand,
            totalDealerships: brandData.count,
            dealerships: brandData.dealerships
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/dealerships/force-update - Força atualização manual
app.post('/api/dealerships/force-update', async (req, res) => {
    try {
        console.log('🔄 Iniciando atualização manual de concessionárias...');
        
        await scrapeAllDealerships();
        saveDealershipDatabase();
        
        const dbPath = path.join(__dirname, 'database', 'dealerships.json');
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        
        res.json({
            success: true,
            message: 'Concessionárias atualizadas com sucesso',
            totalDealerships: data.totalDealerships,
            brands: data.brands.length,
            lastUpdate: data.lastUpdate
        });
        
    } catch (error) {
        console.error("❌ Erro ao forçar atualização de concessionárias:", error);
        return res.status(500).json({
            success: false,
            error: "Erro ao atualizar concessionárias"
        });
    }
});

/************************************************************
 *  API REST: DADOS DE CARREGADORES
 ************************************************************/

// Carrega database de carregadores na inicialização
loadChargersDatabase();

// GET /api/chargers - Retorna todos os carregadores
app.get('/api/chargers', (req, res) => {
    try {
        const dbPath = path.join(__dirname, 'database', 'chargers.json');
        
        if (!fs.existsSync(dbPath)) {
            return res.status(404).json({
                success: false,
                error: 'Database de carregadores não encontrado'
            });
        }
        
        const chargers = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        
        res.json({
            success: true,
            totalChargers: chargers.length,
            data: chargers
        });
        
    } catch (error) {
        console.error('❌ Erro ao carregar carregadores:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao carregar dados de carregadores'
        });
    }
});

// GET /api/chargers/:state - Filtra carregadores por estado
app.get('/api/chargers/:state', (req, res) => {
    try {
        const dbPath = path.join(__dirname, 'database', 'chargers.json');
        const chargers = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        
        const state = req.params.state.toUpperCase();
        const filtered = chargers.filter(c => c.state === state);
        
        res.json({
            success: true,
            state: state,
            totalChargers: filtered.length,
            chargers: filtered
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/chargers/force-update - Força atualização de carregadores (admin)
app.post('/api/chargers/force-update', async (req, res) => {
    try {
        console.log("🔄 Forçando atualização de carregadores...");
        
        const chargers = await scrapeAllChargers();
        saveChargersDatabase();
        
        return res.json({
            success: true,
            message: 'Carregadores atualizados com sucesso',
            totalChargers: chargers.length,
            lastUpdate: new Date().toISOString()
        });
        
    } catch (error) {
        console.error("❌ Erro ao forçar atualização de carregadores:", error);
        return res.status(500).json({
            success: false,
            error: "Erro ao atualizar carregadores"
        });
    }
});

/************************************************************
 *  9) INICIALIZAÇÃO DO SERVIDOR
 ************************************************************/
console.log('\n🔧 Iniciando servidor...');
const PORT = process.env.PORT || 4000;

console.log(`📡 Tentando escutar na porta ${PORT}...`);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Servidor MeuEV REALMENTE rodando na porta ${PORT}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📡 ENDPOINTS DISPONÍVEIS:');
    console.log('  💳 POST   /payment/pix');
    console.log('  💳 POST   /payment/card');
    console.log('  🛒 POST   /checkout/create');
    console.log('  📊 GET    /checkout/status/:preferenceId');
    console.log('  🔔 POST   /webhook');
    console.log('  🚗 GET    /api/vehicles');
    console.log('  🚗 GET    /api/vehicles/:brand');
    console.log('  🏢 GET    /api/dealerships');
    console.log('  🏢 GET    /api/dealerships/:brand');
    console.log('  🔄 POST   /api/dealerships/force-update');
    console.log('  ⚙️  GET    /api/status');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⏰ Auto-update:');
    console.log('  - Veículos: Diariamente às 03:00 AM');
    console.log('  - Concessionárias: Semanalmente (segunda 04:00 AM)');
    console.log('🔄 Execute "npm run scraper" para atualização manual\n');
    console.log("🚗 API Veículos: GET /api/vehicles");
    console.log("📈 Contexto Mercado: GET /api/market-context");
    console.log("🔄 Forçar Update: POST /api/force-update");
    console.log("🔑 Token carregado do ENV:", process.env.MERCADOPAGO_ACCESS_TOKEN ? "SIM" : "NÃO");
});
