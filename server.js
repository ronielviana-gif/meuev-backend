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
 *  2) ROTA: CRIAÇÃO DO CHECKOUT PRO
 ************************************************************/
app.post("/checkout/create", async (req, res) => {
    try {
        console.log("🛒 Criando Checkout Pro...");

        const externalRef = "MEUEV-" + Date.now();
        
        // Pega a URL do frontend do body da requisição ou do ENV
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
                auto_return: "approved",
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
        console.log("🔗 Checkout URL:", result.init_point);
        console.log("🔙 Success URL:", `${frontendUrl}?payment=success&ref=${externalRef}`);
        console.log("🔙 Pending URL:", `${frontendUrl}?payment=pending&ref=${externalRef}`);
        console.log("🔙 Failure URL:", `${frontendUrl}?payment=failure&ref=${externalRef}`);

        // Inicializa status como pendente
        paymentStatus.set(result.id, {
            status: "pending",
            external_reference: externalRef,
            created_at: new Date()
        });

        console.log("💾 Status inicial salvo:", {
            preference_id: result.id,
            external_reference: externalRef,
            status: "pending"
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
app.get("/checkout/status/:preferenceId", async (req, res) => {
    try {
        const preferenceId = req.params.preferenceId;
        
        // Busca status armazenado
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

            // Atualiza status na memória usando external_reference para encontrar a preferência
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

                console.log("✅ Status atualizado:", {
                    preference_id: preferenceId,
                    status: paymentData.status
                });
            }
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
        
        // Busca preferência por external_reference
        let found = null;
        for (const [prefId, data] of paymentStatus.entries()) {
            if (data.external_reference === externalRef) {
                found = { preference_id: prefId, ...data };
                break;
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
            preference_id: found.preference_id
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
