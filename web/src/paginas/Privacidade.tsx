import { Link } from "react-router-dom";
import { Moldura } from "../componentes/Moldura";
import { useEmpresa } from "../contexto/Empresa";
import { useSessao } from "../contexto/Sessao";
import { linkWhatsApp } from "../lib/formato";

// Política de privacidade (LGPD). Descreve exatamente o que o app guarda.
// Versão inicial: revisar com um advogado antes de vender para muitos clientes.
export function Privacidade() {
  const { empresa } = useEmpresa();
  const { usuario } = useSessao();
  return (
    <Moldura voltarPara={usuario ? `/${empresa.slug}/conta` : `/${empresa.slug}/cadastro`} titulo="Privacidade">
      <div className="flex flex-col gap-5 text-base leading-relaxed text-tinta">
        <p>
          Este app é usado pelo <strong>{empresa.nome}</strong> para organizar a fila e o atendimento. Aqui explicamos, de forma simples, quais dados
          guardamos e por quê (Lei Geral de Proteção de Dados, Lei 13.709/2018).
        </p>
        <Secao titulo="Quem cuida dos seus dados">
          O <strong>{empresa.nome}</strong> decide como os dados são usados (controlador). A DNM&amp;LTDA fornece o app e guarda os dados em nome dele
          (operadora).
        </Secao>
        <Secao titulo="O que guardamos">
          <ul className="list-disc pl-5">
            <li>Nome e celular (para entrar no app e para o lava rápido falar com você).</li>
            <li>Dados do carro: placa (completa ou os 3 últimos números), modelo e cor.</li>
            <li>Suas lavagens: serviço, horários, produtos pedidos e quem lavou.</li>
            <li>Avaliações que você enviar.</li>
            <li>Se você ativar os avisos, o endereço técnico do seu celular para receber as notificações.</li>
            <li>Se você aceitar, o seu interesse em receber promoções (pode desligar quando quiser em “Minha conta”).</li>
          </ul>
          Não pedimos CPF, endereço, cartão nem dados de pagamento. O pagamento é feito no lava rápido.
        </Secao>
        <Secao titulo="Quem vê o quê">
          <ul className="list-disc pl-5">
            <li>Na fila pública aparecem só o seu primeiro nome e os 3 últimos números da placa.</li>
            <li>A equipe do lava rápido vê o seu nome, o carro e o pedido, para fazer o serviço.</li>
            <li>A equipe vê as avaliações sem o seu nome; só o dono vê quem avaliou.</li>
            <li>Os seus dados não são vendidos nem passados para outras empresas.</li>
          </ul>
        </Secao>
        <Secao titulo="Por quanto tempo">
          Enquanto você usar o app. O histórico de atendimentos fica guardado para controle do lava rápido e cumprimento de obrigações legais.
        </Secao>
        <Secao titulo="Seus direitos">
          Você pode pedir para ver, corrigir ou apagar os seus dados, e desligar promoções a qualquer momento. Nome e senha você muda em “Minha conta”.
          Para os outros pedidos, fale com o lava rápido
          {empresa.whatsapp ? (
            <>
              {" "}
              pelo{" "}
              <a className="font-bold text-marca-forte underline" href={linkWhatsApp(empresa.whatsapp, "Olá! Quero falar sobre os meus dados no app.")} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            </>
          ) : (
            " no balcão"
          )}
          .
        </Secao>
        <Secao titulo="Segurança">
          A conexão é criptografada (https), a senha é guardada de forma protegida e cada pessoa da equipe só acessa o que a função dela permite.
        </Secao>
        <p className="text-sm text-tinta-suave">
          Última atualização: outubro de 2026. ·{" "}
          <Link to={`/${empresa.slug}`} className="underline">
            Voltar ao app
          </Link>
        </p>
      </div>
    </Moldura>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1 text-lg font-extrabold text-tinta">{titulo}</h2>
      <div>{children}</div>
    </section>
  );
}
