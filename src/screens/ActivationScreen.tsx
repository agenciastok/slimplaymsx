import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { exitApplication, isTizen } from '../platform/runtime';
import { useNav } from '../nav/navigation';
import { useSession } from '../state/session';

const activationUrl = 'https://slimplay.com';

export function ActivationScreen() {
  const session = useSession();
  const nav = useNav();
  const [qr, setQr] = useState('');

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(activationUrl, { margin: 1, width: 360 }).then((url) => {
      if (!cancelled) setQr(url);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function closeApp() {
    if (isTizen()) {
      exitApplication();
      return;
    }
    session.showToast('Na TV, Fechar encerra o aplicativo.');
  }

  return (
    <main className="activation slim-bg">
      <h1>SLIM PLAY</h1>
      <p className="activation-lead">Seu teste gratuito expirou. Ative o aplicativo para usá-lo.</p>
      <h2>Como ativar?</h2>
      <div className="activation-body">
        <ol>
          <li>
            <span>1</span>
            <p>Digitalize o código QR ou visite slimplay.com</p>
          </li>
          <li>
            <span>2</span>
            <p>Escolha seu método de pagamento preferido e faça o pagamento</p>
          </li>
          <li>
            <span>3</span>
            <p>Verifique sua tela de TV, pode levar de 1 a 2 minutos para ser ativada</p>
          </li>
        </ol>
        {qr ? <img className="activation-qr" src={qr} alt="QR code de ativação" /> : <div className="activation-qr" />}
      </div>
      <p className="activation-id">MAC: {session.identity.id.toLowerCase()}</p>
      {session.identity.deviceKey ? <p className="activation-id">Chave: {session.identity.deviceKey}</p> : null}
      <div className="activation-actions">
        <button
          type="button"
          className="surface-button"
          data-tv-focusable="true"
          data-tv-initial="true"
          onClick={() => nav.push('lists')}
        >
          Adicionar lista
        </button>
        <button type="button" className="surface-button" data-tv-focusable="true" onClick={closeApp}>
          Fechar
        </button>
      </div>
    </main>
  );
}
