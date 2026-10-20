# Estudo de concorrentes — Lava Rápido (método Replica adaptado)

Pesquisa de 20/10/2026, só com fontes públicas (sites, Google Play, App Store, GitHub, Odoo Apps).
Nenhum código, texto, logo ou print de concorrente entra no app: copiamos **funções e ideias**, nunca o que é deles.
Reclame Aqui e Capterra bloquearam acesso automatizado (403) e ficaram de fora.
Foram lidas 174 avaliações reais (Google Play e App Store, Brasil e EUA).

## Resumo
1. O mercado brasileiro é fragmentado: dezenas de apps pequenos, quase todos só para o **dono** (O.S., caixa, comissão).
   Fila ao vivo para o cliente que chega sem hora marcada: só uma rede própria (Wow Lava Car) tem, e só nas unidades dela.
2. O que mais dói nos usuários: app que trava depois de atualização; código de login que não chega e sessão que expira;
   cobrança depois de cancelar; carro mal lavado ou danificado sem prova; placa rígida demais; preço do app diferente do balcão.
3. Onde ganhamos: fila pública ao vivo, previsão e "já pode vir", câmeras com sensor, auditoria imutável, vales e holerite,
   equipe e cliente no mesmo app.
4. Onde falta: **preço por porte do veículo**, vistoria de entrada com fotos, WhatsApp automático, fidelidade/pacotes,
   orçamento, NFS-e.
5. Placar de paridade (essencial 3, importante 2, futuro 1, parcial = metade): **32 de 59 (54%)**.
   Falta 1 essencial pela régua do método: preço por porte.

## Concorrentes analisados
| Nome | Público | Preço público | Destaques |
|---|---|---|---|
| Jump Car (jumpcar.com.br) | lava-rápido a rede | R$ 49–99/mês | checklist de avarias, orçamento PDF, WhatsApp, maquininhas POS, OCR de placa, NFS-e |
| GestãoClick (módulo lava jato) | perfil ERP | não informado | fila em colunas, painel na TV, **preço por porte**, condições de chegada, NF, DRE |
| MiniOS (minios.app) | lava-jato com bar/barbearia | R$ 299–499/mês | painel do pátio na TV, fechamento cego de caixa, WhatsApp, reativar inativos, fidelidade |
| Lavacar Fácil (App Store) | lava jato e estética | R$ 59,90/mês | comissão por categoria de veículo, fidelidade, fotos de avarias, offline |
| Lavacar (lavacar.app) | marketplace | R$ 69–199/mês + 5% | agenda, delivery, créditos pagos no app |
| Wow App (rede Wow) | clientes da rede | planos | **fila e status das máquinas ao vivo**, histórico, "dias desde a última lavagem" |
| myQQ / EverWash (EUA) | assinatura de lavagem | assinatura | lavagem ilimitada, código na entrada |

Código aberto: nenhum projeto maduro de fila para lava-rápido. Quase todos acadêmicos e **sem licença** (não podem ser usados).
Ideias anotadas: alerta piscando para pedido de retorno; rotina que detecta não comparecimento; cronômetro por carro;
número de fila do dia; "vale a pena lavar hoje?" pela previsão de chuva.

## O que os usuários odeiam (forte = 3+ avaliações em 2+ fontes)
| Tema | Força | O que já fizemos |
|---|---|---|
| App trava/não abre depois de atualização | forte | testes automáticos em cada versão (Etapa 8), teste no navegador por perfil |
| Código de login não chega, sessão expira, troca de celular | forte | login por celular+senha, **sessão de 60 dias** (sem código por SMS) |
| Cobrança depois de cancelar | forte | sem pagamento no app (decisão do planejamento) |
| Carro mal lavado/danificado sem prova | forte | avaliação por estrelas; câmeras. **Falta: fotos na entrada** |
| Placa rígida, não deixa trocar | médio | aceita placa antiga e Mercosul, ou só 3 últimos; cliente cadastra outro veículo |
| Preço do app diferente do balcão | médio | **Falta: preço por porte** |

## Matriz resumida
| Funcionalidade | Prioridade | Nosso app |
|---|---|---|
| Fila/pátio em tempo real | essencial | sim |
| Aviso "carro pronto" | essencial | sim (push; WhatsApp manual) |
| Cliente e veículo com histórico | essencial | sim (**Meu histórico**) |
| Preço por porte do veículo | essencial | **não** |
| Caixa, comissão, permissões, relatórios | essencial | sim |
| Agendamento | essencial | parcial (reservas pela equipe) |
| WhatsApp automático | importante | não (fase 2) |
| Vistoria de entrada com fotos | importante | não |
| Fidelidade / pacotes | importante | não (fase 2) |
| Orçamento | importante | não |
| Painel na TV da recepção | importante | parcial (fila pública) |
| Reativar clientes inativos | importante | não |
| NFS-e, maquininha integrada, OCR de placa | futuro | não |

## O que não dá para copiar
NFS-e (certificado e homologação por prefeitura → usar parceiro), integração com maquininhas (SDK e contrato),
consulta de placa (base paga), rede/marketplace (efeito de rede), cobrança recorrente (gateway/PCI, fora do escopo),
suporte humano (processo, não software).

## Melhorias recomendadas (evidência × custo: P dias, M semanas)
1. **Preço por porte** (hatch, sedã, SUV, caminhonete) e "preço do app = preço do balcão" — P a M. *Precisa da regra do Diego.*
2. **Vistoria de entrada com fotos** (avarias marcadas, cliente vê no celular) — M. Antecipa a foto da fase 2.
3. **Botões de WhatsApp com mensagem pronta** para "vez confirmada" e "carro pronto" (sem custo) — P.
4. **Modo TV** da fila para a recepção — P.
5. **Fechamento do mês e gasto fixo recorrente** no caixa — P.
6. **Pacotes pagos no balcão** com aviso antes de vencer e sem renovação automática — M (junto da fidelidade).
7. Manter: sessão longa, reposicionar atrasado, entrada manual sempre possível pela equipe, suporte visível para o dono.
