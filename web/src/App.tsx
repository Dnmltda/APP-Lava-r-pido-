import { BrowserRouter, Link, Outlet, Route, Routes, useParams } from "react-router-dom";
import { BannerSemInternet, Carregando, EstadoErro } from "./componentes/ui";
import { EmpresaProvider } from "./contexto/Empresa";
import { SessaoProvider } from "./contexto/Sessao";
import { Cadastro, Entrar } from "./paginas/Acesso";
import { Configuracoes } from "./paginas/Configuracoes";
import { Conta } from "./paginas/Conta";
import { Equipe } from "./paginas/Equipe";
import { Inicio } from "./paginas/Inicio";
import { Painel } from "./paginas/Painel";

function RotasDaEmpresa() {
  const { slug = "" } = useParams();
  return (
    <EmpresaProvider
      key={slug}
      slug={slug}
      carregando={
        <div className="min-h-dvh bg-fundo">
          <Carregando />
        </div>
      }
      naoEncontrada={
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-fundo px-6 text-center">
          <p className="text-xl font-extrabold text-tinta">Lava rápido não encontrado</p>
          <p className="text-base text-tinta-suave">Confira o link ou leia de novo o QR Code do balcão.</p>
          <Link to="/" className="mt-2 inline-flex min-h-12 items-center rounded-xl px-5 font-bold text-marca-forte">
            Ir para o início
          </Link>
        </div>
      }
      erro={(mensagem, tentar) => (
        <div className="min-h-dvh bg-fundo">
          <EstadoErro texto={mensagem} tentar={tentar} />
        </div>
      )}
    >
      <Outlet />
    </EmpresaProvider>
  );
}

export default function App() {
  return (
    <SessaoProvider>
      <BrowserRouter>
        <BannerSemInternet />
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/:slug" element={<RotasDaEmpresa />}>
            <Route index element={<Painel />} />
            <Route path="entrar" element={<Entrar />} />
            <Route path="cadastro" element={<Cadastro />} />
            <Route path="conta" element={<Conta />} />
            <Route path="equipe" element={<Equipe />} />
            <Route path="configuracoes" element={<Configuracoes />} />
            <Route path="*" element={<Painel />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SessaoProvider>
  );
}
