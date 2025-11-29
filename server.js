/******************************************************************
 *  BACKEND CHECKOUT MERCADO PAGO – MEUEV (PRODUÇÃO)
 ******************************************************************/

const express = require("express");
const cors = require("cors");
const { MercadoPagoConfig, Payment, Preference } = require("mercadopago");

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
 *  6) INICIALIZAÇÃO DO SERVIDOR
 ************************************************************/
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor MeuEV rodando na porta ${PORT}`);
    console.log("🛒 Checkout Pro disponível em: POST /checkout/create");
    console.log("📊 Consulta de status: GET /checkout/status/:preferenceId");
    console.log("🔔 Webhook configurado em: POST /webhook");
    console.log("🔑 Token carregado do ENV:", process.env.MERCADOPAGO_ACCESS_TOKEN ? "SIM" : "NÃO");
});
