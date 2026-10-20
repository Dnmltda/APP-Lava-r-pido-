package main

import (
	"net/http"
	"time"
)

// Cliente HTTP com tempo limite para não travar um hook se o serviço de push demorar.
type httpClientComTimeout struct {
	timeout time.Duration
	cliente *http.Client
}

func (c *httpClientComTimeout) Do(req *http.Request) (*http.Response, error) {
	if c.cliente == nil {
		c.cliente = &http.Client{Timeout: c.timeout}
	}
	return c.cliente.Do(req)
}
