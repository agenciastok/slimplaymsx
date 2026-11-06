import { useEffect, useState } from 'react';
import { AppConfig } from '../core/config';
import { formatDottedDate, fromIso } from '../core/format';
import { tr } from '../l10n/app-text';
import { useTr } from '../l10n/use-tr';
import { playlistLoaded, listScope } from '../models/playlist';
import { useNav } from '../nav/navigation';
import { loadAccount, type AccountSnapshot } from '../services/xtream';
import { clearFavoritesKind, clearScopeLibrary, clearWatchedKind } from '../storage/library';
import { useSession } from '../state/session';
import { Icon } from './icons';

const languages = [
  ['en', 'English', '🇺🇸'],
  ['hy', 'Հայերեն', '🇦🇲'],
  ['ar', 'العربية', '🇸🇦'],
  ['de', 'Deutsch', '🇩🇪'],
  ['fr', 'Français', '🇫🇷'],
  ['pt', 'Português - Brasil', '🇧🇷'],
  ['es', 'Español', '🇪🇸'],
  ['tr', 'Türkçe', '🇹🇷'],
] as const;

const menu = ['Informação Geral', 'Mudar Idioma', 'Alterar Código Pin', 'Limpar Armazenamento'];

export function SettingsScreen() {
  const session = useSession();
  const nav = useNav();
  const text = useTr();
  const [section, setSection] = useState(0);
  const [account, setAccount] = useState<AccountSnapshot | null>(null);

  useEffect(() => {
    const credentials = session.session;
    if (!credentials || !playlistLoaded(credentials)) return;
    let cancelled = false;
    void loadAccount(credentials)
      .then((snapshot) => {
        if (!cancelled) setAccount(snapshot);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session.session]);

  return (
    <main className="screen slim-bg settings-screen">
      <header className="screen-header">
        <button type="button" className="icon-button" data-tv-focusable="true" onClick={nav.pop} aria-label="Voltar">
          <Icon name="back" />
        </button>
        <h1>{text('Configurações')}</h1>
      </header>
      <div className="settings-layout">
        <div className="settings-menu">
          {menu.map((label, index) => (
            <button
              key={label}
              type="button"
              className={section === index ? 'settings-item is-selected' : 'settings-item'}
              data-tv-focusable="true"
              data-tv-initial={index === 0 ? 'true' : undefined}
              onFocus={() => setSection(index)}
              onClick={() => setSection(index)}
            >
              {text(label)}
            </button>
          ))}
        </div>
        <div className="settings-panel">
          {section === 0 ? <GeneralPanel account={account} /> : null}
          {section === 1 ? <LanguagePanel /> : null}
          {section === 2 ? <PinPanel /> : null}
          {section === 3 ? <StoragePanel /> : null}
        </div>
      </div>
    </main>
  );
}

function GeneralPanel({ account }: { account: AccountSnapshot | null }) {
  const session = useSession();
  const text = useTr();
  const expiration = account?.expiration ?? session.session?.expiration ?? null;
  const createdAt = account?.createdAt ?? null;
  const status = account?.status ?? session.session?.status ?? null;
  return (
    <div className="info-panel">
      <h2>{text('Informações da Conta')}</h2>
      <InfoRow label={text('Status')} value={statusLabel(status, text)} />
      <InfoRow label={text('Data de registro')} value={formatDottedDate(fromIso(createdAt))} />
      <InfoRow label={text('Data de validade')} value={formatDottedDate(fromIso(expiration))} />
      <h2>{text('Informação do dispositivo')}</h2>
      <InfoRow label={text('Endereço Mac')} value={session.identity.id} />
      <InfoRow label={text('Versão do aplicativo')} value={AppConfig.version} />
      <InfoRow label={text('Chave do dispositivo')} value={session.identity.deviceKey} />
    </div>
  );
}

function LanguagePanel() {
  const session = useSession();
  return (
    <div className="choice-list">
      {languages.map(([code, label, flag]) => (
        <button
          key={code}
          type="button"
          className={session.language === code ? 'choice is-selected' : 'choice'}
          data-tv-focusable="true"
          onClick={() => {
            session.setLanguage(code);
            session.showToast(tr(code, 'Idioma salvo'));
          }}
        >
          <span>{label}</span>
          <span>{flag}</span>
        </button>
      ))}
    </div>
  );
}

function PinPanel() {
  const session = useSession();
  const text = useTr();
  const [entry, setEntry] = useState('');
  const [stage, setStage] = useState<'old' | 'next'>('old');
  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

  async function submit(next: string) {
    if (stage === 'old') {
      if (next === session.currentPin()) {
        setStage('next');
        setEntry('');
      } else {
        setEntry('');
        session.showToast(text('Código pin incorreto'));
      }
      return;
    }
    try {
      await session.updatePin(next);
      setStage('old');
      setEntry('');
      session.showToast(text('Código pin alterado'));
    } catch {
      setEntry('');
      session.showToast('Não foi possível salvar o código pin');
    }
  }

  function press(digit: string) {
    if (digit === '←') {
      setEntry((current) => current.slice(0, -1));
      return;
    }
    const next = (entry + digit).slice(0, 4);
    setEntry(next);
    if (next.length === 4) void submit(next);
  }

  return (
    <div className="pin-panel">
      <div className="pin-stage">
        <h2>{text(stage === 'old' ? 'Digite o código pin antigo' : 'Digite o código pin novo')}</h2>
        <div className="pin-boxes">
          {[0, 1, 2, 3].map((index) => (
            <span key={index} className="pin-box">
              {entry[index] ?? ''}
            </span>
          ))}
        </div>
        <div className="pin-pad">
          {digits.map((digit) => (
            <button key={digit} type="button" className="pin-key" data-tv-focusable="true" onClick={() => press(digit)}>
              {digit}
            </button>
          ))}
          <button type="button" className="pin-key" data-tv-focusable="true" aria-label="Apagar" onClick={() => press('←')}>
            <Icon name="backspace" />
          </button>
        </div>
      </div>
      <p className="pin-hint">{text('Código pin padrão: 0000')}</p>
    </div>
  );
}

function StoragePanel() {
  const session = useSession();
  const nav = useNav();
  const text = useTr();
  const scope = session.session ? listScope(session.session) : '';
  const rows: { label: string; message: string; run: () => void }[] = [
    { label: 'Canais favoritos', message: 'Canais favoritos limpos', run: () => clearFavoritesKind(scope, 'live') },
    { label: 'Filmes favoritos', message: 'Filmes favoritos limpos', run: () => clearFavoritesKind(scope, 'movie') },
    { label: 'Séries favoritas', message: 'Séries favoritas limpas', run: () => clearFavoritesKind(scope, 'series') },
    { label: 'Filmes assistidos', message: 'Filmes assistidos limpos', run: () => clearWatchedKind(scope, false) },
    { label: 'Séries assistidas', message: 'Séries assistidas limpas', run: () => clearWatchedKind(scope, true) },
  ];

  return (
    <div className="storage-panel">
      {rows.map((row) => (
        <div key={row.label} className="storage-row">
          <span>{text(row.label)}</span>
          <button
            type="button"
            className="storage-clear"
            data-tv-focusable="true"
            onClick={() => {
              row.run();
              session.showToast(row.message);
            }}
          >
            {text('Limpar')}
          </button>
        </div>
      ))}
      <div className="storage-row">
        <span>{text('Limpar tudo')}</span>
        <button
          type="button"
          className="storage-clear"
          data-tv-focusable="true"
          onClick={() =>
            nav.openDialog((close) => (
              <div className="dialog-card">
                <h2>{text('Limpar tudo')}</h2>
                <p>{text('Favoritos e o histórico de assistência saem deste aparelho.')}</p>
                <div className="dialog-actions">
                  <button type="button" className="surface-button" data-tv-focusable="true" data-tv-initial="true" onClick={close}>
                    {text('Cancelar')}
                  </button>
                  <button
                    type="button"
                    className="surface-button"
                    data-tv-focusable="true"
                    onClick={() => {
                      clearScopeLibrary(scope);
                      session.showToast('Armazenamento limpo');
                      close();
                    }}
                  >
                    {text('Limpar')}
                  </button>
                </div>
              </div>
            ))
          }
        >
          {text('Limpar')}
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="info-row">
      <span>{label}</span>
      <span>{value}</span>
    </p>
  );
}

function statusLabel(status: string | null, text: (portuguese: string) => string): string {
  switch (status?.toLowerCase()) {
    case 'active':
    case 'ativo':
      return text('Ativo');
    case 'expired':
    case 'expirado':
      return text('Expirado');
    case 'banned':
    case 'banido':
      return text('Banido');
    case 'disabled':
    case 'desativado':
      return text('Desativado');
    default:
      return status?.trim() ? status : '—';
  }
}
