import { useState } from 'react';
import { AppConfig } from '../core/config';
import { useTr } from '../l10n/use-tr';
import { isActivationCode } from '../core/text';
import { listName, playlistLoaded, samePlaylist } from '../models/playlist';
import { useNav } from '../nav/navigation';
import { ApiException, useSession } from '../state/session';
import { Icon } from './icons';

export function ListsScreen() {
  const session = useSession();
  const nav = useNav();
  const text = useTr();
  const empty = session.playlists.length === 0;

  function openForm() {
    nav.openDialog((close) => <AddListForm close={close} />);
  }

  function confirmDelete(index: number) {
    nav.openDialog((close) => (
      <div className="dialog-card">
        <h2>Excluir lista</h2>
        <p>A lista será apagada deste aparelho e do cadastro.</p>
        <div className="dialog-actions">
          <button type="button" className="surface-button" data-tv-focusable="true" data-tv-initial="true" onClick={close}>
            {text('Cancelar')}
          </button>
          <button
            type="button"
            className="surface-button"
            data-tv-focusable="true"
            onClick={() => {
              void session
                .removePlaylist(index)
                .then(() => close())
                .catch(() => {
                  session.showToast('Não foi possível excluir a lista');
                  close();
                });
            }}
          >
            Excluir
          </button>
        </div>
      </div>
    ));
  }

  return (
    <main className="screen slim-bg lists-screen">
      <header className="screen-header">
        <button type="button" className="icon-button" data-tv-focusable="true" onClick={nav.pop} aria-label="Voltar">
          <Icon name="back" />
        </button>
        <h1>{text('Listas')}</h1>
        {empty ? null : (
          <button
            type="button"
            className="icon-button surface-button"
            data-tv-focusable="true"
            onClick={openForm}
            aria-label="Adicionar lista"
          >
            <Icon name="add" />
          </button>
        )}
      </header>
      <div className="screen-body">
        {empty ? (
          <AddListForm />
        ) : (
          <div className="playlist-list">
            {session.playlists.map((playlist, index) => {
              const selected = samePlaylist(session.session, playlist);
              const initial = session.playlists.findIndex((item) => samePlaylist(session.session, item));
              return (
                <div className="playlist-row" key={`${playlist.listId}-${playlist.code}-${index}`}>
                  <button
                    type="button"
                    className={selected ? 'playlist-main is-selected' : 'playlist-main'}
                    data-tv-focusable="true"
                    data-tv-initial={index === (initial >= 0 ? initial : 0) ? 'true' : undefined}
            onClick={() => session.selectPlaylist(index)}
                  >
                    <span>{index + 1}</span>
                    <strong>{listName(playlist)}</strong>
                    {selected ? (
                      <span className="playlist-check">
                        <Icon name="check" />
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="icon-button surface-button playlist-delete"
                    data-tv-focusable="true"
                    aria-label={`Excluir ${listName(playlist)}`}
                    onClick={() => confirmDelete(index)}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
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

function AddListForm({ close }: { close?: () => void }) {
  const session = useSession();
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = close != null;

  async function submit() {
    if (busy) return;
    if (!isActivationCode(code.trim())) {
      session.showToast('Informe o código de 6 dígitos.');
      return;
    }
    const wasBlocked = session.blockedMac != null;
    setBusy(true);
    try {
      await session.addPlaylist(code.trim(), username, password);
      const blocked = wasBlocked ? await session.evaluate(true) : session.blockedMac;
      if (!blocked) return;
      close?.();
    } catch (error) {
      session.showToast(error instanceof ApiException ? error.message : AppConfig.invalidAccess);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className={dialog ? 'list-form' : 'list-form list-form-centered'}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h2>Nova lista</h2>
      <label>
        Código
        <input
          value={code}
          inputMode="numeric"
          maxLength={6}
          data-tv-focusable="true"
          data-tv-initial={dialog || !playlistLoaded(session.session) ? 'true' : undefined}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
        />
      </label>
      <label>
        Nome de usuário
        <input value={username} data-tv-focusable="true" onChange={(event) => setUsername(event.target.value)} />
      </label>
      <label>
        Senha
        <input
          type="password"
          value={password}
          data-tv-focusable="true"
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <button type="submit" className="surface-button ok-button" data-tv-focusable="true" disabled={busy}>
        {busy ? 'Aguarde' : 'OK'}
      </button>
    </form>
  );
}
