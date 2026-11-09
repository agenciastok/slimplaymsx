import logo from '../assets/logo.png';
import { AppConfig } from '../core/config';
import { useTr } from '../l10n/use-tr';
import { playlistLoaded } from '../models/playlist';
import { useNav, type RouteName } from '../nav/navigation';
import { exitStandalone } from '../platform/msx-plugin';
import { useSession } from '../state/session';
import { Icon } from './icons';
import './home.css';
import { useState } from 'react';

const menu: {
  label: string;
  icon: 'live' | 'movies' | 'series' | 'lists' | 'settings';
  route: Exclude<RouteName, 'player'>;
}[] = [
  { label: 'TV ao vivo', icon: 'live', route: 'live' },
  { label: 'Filmes', icon: 'movies', route: 'movies' },
  { label: 'Séries', icon: 'series', route: 'series' },
  { label: 'Listas', icon: 'lists', route: 'lists' },
  { label: 'Configurações', icon: 'settings', route: 'settings' },
];

export function HomeScreen() {
  const session = useSession();
  const nav = useNav();
  const text = useTr();
  const [reloading, setReloading] = useState(false);
  const standalone = document.documentElement.classList.contains('is-standalone');

  function open(index: number) {
    const item = menu[index];
    if (!item) return;
    if (index < 3 && !playlistLoaded(session.session)) {
      nav.push('lists');
      return;
    }
    nav.push(item.route);
  }

  async function reload() {
    if (reloading) return;
    setReloading(true);
    try {
      const blocked = await session.refreshMacLists();
      if (blocked) return;
      session.showToast(text('Conteúdo atualizado'));
    } catch {
      session.showToast(text('Não foi possível atualizar a lista'));
    } finally {
      setReloading(false);
    }
  }

  return (
    <main className="home slim-bg">
      <div className="home-stage">
        <img className="home-logo" src={logo} alt="SLIM PLAY" />
      </div>
      <div className="home-menu">
        <div className="home-tiles">
          {menu.map((item, index) => (
            <button
              key={item.label}
              type="button"
              className="home-tile"
              data-tv-focusable="true"
              data-tv-row="menu"
              data-tv-index={index}
              data-tv-initial={index === 0 ? 'true' : undefined}
              onClick={() => open(index)}
            >
              <Icon name={item.icon} />
              <span>{text(item.label)}</span>
            </button>
          ))}
        </div>
        <div className="home-actions">
          <button
            type="button"
            className="home-reload"
            data-tv-focusable="true"
            data-tv-row="reload"
            disabled={reloading}
            onClick={() => void reload()}
          >
            <Icon name="reload" />
            <span>{text('Recarregar')}</span>
          </button>
          {standalone ? (
            <button
              type="button"
              className="home-reload"
              data-tv-focusable="true"
              data-tv-row="exit"
              onClick={() => exitStandalone()}
            >
              <span>{text('Sair')}</span>
            </button>
          ) : null}
        </div>
      </div>
      <footer className="home-meta">
        <div>
          <p>
            {text('Versão')}: {AppConfig.version}
          </p>
          <p>
            {text('Licença')}: {session.licenseLabel}
          </p>
        </div>
        <div>
          <p>
            {text('Endereço MAC')}: {session.identity.id}
          </p>
          <p>
            {text('Chave do dispositivo')}: {session.identity.deviceKey}
          </p>
          <p>
            {text('Página da web')}: {session.webPage}
          </p>
        </div>
      </footer>
    </main>
  );
}
