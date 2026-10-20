/*
 * Módulo nativo mínimo (N-API) que expõe execve() para o Node.
 *
 * Na Hostinger (LiteSpeed/lsnode) o listen() do Node é redirecionado para um
 * socket de arquivo e só ali chega o tráfego. O server.js abre esse socket,
 * marca para ser herdado (herdar) e chama execve(): o MESMO processo vira o
 * PocketBase, que atende no socket herdado (PB_LISTEN_FD).
 *
 * Uso: require('./execve.node').execve('/caminho/pocketbase', ['pocketbase', 'serve', ...], '/caminho/log?')
 * O terceiro argumento (opcional) manda a saída do programa para esse arquivo.
 * Em caso de sucesso não retorna; em caso de erro lança exceção com o errno.
 */
#include <errno.h>
#include <fcntl.h>
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
  size_t argc = 3;
  napi_value argv[3];
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

  /* Saída opcional para arquivo (a Hostinger só mostra o que o Node escreve). */
  if (argc >= 3) {
    napi_valuetype tipo;
    napi_typeof(env, argv[2], &tipo);
    if (tipo == napi_string) {
      char *log = texto(env, argv[2]);
      int fd = log ? open(log, O_WRONLY | O_CREAT | O_APPEND, 0640) : -1;
      if (fd >= 0) {
        dup2(fd, 1);
        dup2(fd, 2);
        close(fd);
      }
      free(log);
    }
  }

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

/* herdar(fd): tira o FD_CLOEXEC para o socket continuar aberto depois do execve. */
static napi_value Herdar(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  int32_t fd = -1;
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  if (argc < 1 || napi_get_value_int32(env, argv[0], &fd) != napi_ok || fd < 0) {
    napi_throw_type_error(env, NULL, "herdar(fd)");
    return NULL;
  }
  int flags = fcntl(fd, F_GETFD);
  if (flags < 0 || fcntl(fd, F_SETFD, flags & ~FD_CLOEXEC) < 0) {
    napi_throw_error(env, NULL, strerror(errno));
    return NULL;
  }
  return NULL;
}

static napi_value Iniciar(napi_env env, napi_value exports) {
  napi_value fn;
  napi_create_function(env, "execve", NAPI_AUTO_LENGTH, Execve, NULL, &fn);
  napi_set_named_property(env, exports, "execve", fn);
  napi_create_function(env, "herdar", NAPI_AUTO_LENGTH, Herdar, NULL, &fn);
  napi_set_named_property(env, exports, "herdar", fn);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Iniciar)
