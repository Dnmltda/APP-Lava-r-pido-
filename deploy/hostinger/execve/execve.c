/*
 * Módulo nativo mínimo (N-API) que expõe execve() para o Node.
 *
 * Na Hostinger o tráfego fica preso ao processo que a plataforma iniciou e a
 * conexão interna entre processos é bloqueada. Então o server.js abre a porta,
 * fecha e chama execve(): o MESMO processo (mesmo PID) vira o PocketBase.
 *
 * Uso: require('./execve.node').execve('/caminho/pocketbase', ['pocketbase', 'serve', ...])
 * Em caso de sucesso não retorna; em caso de erro lança exceção com o errno.
 */
#include <errno.h>
#include <node_api.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

extern char **environ;

static char *texto(napi_env env, napi_value v) {
  size_t n = 0;
  if (napi_get_value_string_utf8(env, v, NULL, 0, &n) != napi_ok) return NULL;
  char *s = malloc(n + 1);
  if (!s) return NULL;
  napi_get_value_string_utf8(env, v, s, n + 1, &n);
  return s;
}

static napi_value Execve(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (argc < 2) {
    napi_throw_type_error(env, NULL, "execve(caminho, argumentos[])");
    return NULL;
  }
  char *caminho = texto(env, argv[0]);
  uint32_t total = 0;
  napi_get_array_length(env, argv[1], &total);
  char **args = calloc(total + 1, sizeof(char *));
  if (!caminho || !args) {
    napi_throw_error(env, NULL, "sem memória");
    return NULL;
  }
  for (uint32_t i = 0; i < total; i++) {
    napi_value item;
    napi_get_element(env, argv[1], i, &item);
    args[i] = texto(env, item);
  }
  args[total] = NULL;

  execve(caminho, args, environ);

  /* Só chega aqui se o execve falhou. */
  char msg[256];
  strncpy(msg, strerror(errno), sizeof(msg) - 1);
  msg[sizeof(msg) - 1] = '\0';
  for (uint32_t i = 0; i < total; i++) free(args[i]);
  free(args);
  free(caminho);
  napi_throw_error(env, NULL, msg);
  return NULL;
}

static napi_value Iniciar(napi_env env, napi_value exports) {
  napi_value fn;
  napi_create_function(env, "execve", NAPI_AUTO_LENGTH, Execve, NULL, &fn);
  napi_set_named_property(env, exports, "execve", fn);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Iniciar)
