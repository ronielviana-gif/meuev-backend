/******************************************************************
 *  BACKEND PIX – MEUEV (SDK NOVO 2024)
 ******************************************************************/

const express = require("express");
const cors = require("cors");
const { MercadoPagoConfig, Payment } = require("mercadopago");

const app = express();
app.use(cors());
app.use(express.json());

/************************************************************
 *  1) CONFIGURAÇÃO DO MERCADO PAGO
 ************************************************************/
const client = new MercadoPagoConfig({
    accessToken: "TEST-2250943186751030-112820-259b2b622edb572a91268084ad414fdf-76371686"
});

const payment = new Payment(client);

/************************************************************
 *  2) ROTAS
 ************************************************************/

/**
 * POST /pix/create
 * Cria cobrança PIX dinâmica
 */
app.post("/pix/create", async (req, res) => {
    try {
        const amount = 1.99;

        const result = await payment.create({
            body: {
                transaction_amount: amount,
                description: "MeuEV - Acesso ao Relatório Completo",
                payment_method_id: "pix",
                payer: {
                    email: "pagador_teste@meuev.com",
                }
            }
        });

        const trx = result.point_of_interaction.transaction_data;

        return res.json({
            id: result.id,
            status: result.status,
            qr_code: trx.qr_code,
            qr_base64: trx.qr_code_base64
        });

    } catch (err) {
        console.error("Erro ao criar PIX:", err);
        return res.status(500).json({
            error: true,
            message: "Erro ao criar cobrança PIX"
        });
    }
});


/**
 * GET /pix/status/:id
 * Consulta status do pagamento
 */
app.get("/pix/status/:id", async (req, res) => {
    try {
        const id = req.params.id;

        const result = await payment.get({ id });

        return res.json({
            id: result.id,
            status: result.status
        });

    } catch (err) {
        console.error("Erro ao consultar pagamento:", err);
        return res.status(500).json({
            error: true,
            message: "Erro ao consultar pagamento"
        });
    }
});


/**
 * POST /pix/webhook
 * Recebe notificações do Mercado Pago
 */
app.post("/pix/webhook", async (req, res) => {
    console.log("📩 Webhook recebido:", req.body);
    res.sendStatus(200);
});


/************************************************************
 *  3) INICIALIZAÇÃO DO SERVIDOR
 ************************************************************/
const PORT = 4000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor PIX rodando na porta ${PORT}`);
});
