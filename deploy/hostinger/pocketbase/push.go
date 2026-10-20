package main

import (
	"encoding/json"
	"io"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/dop251/goja"
)

// Funções de notificação (Web Push) oferecidas aos hooks JS em $lr.
// O JS do PocketBase não tem a criptografia exigida pelo Web Push (RFC 8291),
// então o envio é feito aqui, em Go, com a biblioteca webpush-go.
//
//	$lr.gerarChavesVapid()  → { publica, privada }
//	$lr.enviarPush(inscricaoJSON, payload, publica, privada, assunto, ttlSegundos)
//	                        → { status, erro }
//	  status 201 = entregue ao serviço de push; 404/410 = inscrição expirada.
func registrarPush(vm *goja.Runtime) {
	vm.Set("$lr", map[string]any{
		"gerarChavesVapid": func() map[string]string {
			privada, publica, err := webpush.GenerateVAPIDKeys()
			if err != nil {
				return map[string]string{"erro": err.Error()}
			}
			return map[string]string{"publica": publica, "privada": privada}
		},
		"enviarPush": func(inscricaoJSON, payload, publica, privada, assunto string, ttl int) map[string]any {
			var s webpush.Subscription
			if err := json.Unmarshal([]byte(inscricaoJSON), &s); err != nil {
				return map[string]any{"status": 0, "erro": "inscrição inválida: " + err.Error()}
			}
			if ttl <= 0 {
				ttl = 3600
			}
			resp, err := webpush.SendNotification([]byte(payload), &s, &webpush.Options{
				Subscriber:      assunto,
				VAPIDPublicKey:  publica,
				VAPIDPrivateKey: privada,
				TTL:             ttl,
				Urgency:         webpush.UrgencyHigh,
				HTTPClient:      clienteHTTP,
			})
			if err != nil {
				return map[string]any{"status": 0, "erro": err.Error()}
			}
			defer resp.Body.Close()
			corpo, _ := io.ReadAll(io.LimitReader(resp.Body, 500))
			return map[string]any{"status": resp.StatusCode, "erro": string(corpo)}
		},
	})
}

var clienteHTTP = &httpClientComTimeout{timeout: 10 * time.Second}
