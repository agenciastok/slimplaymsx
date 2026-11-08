import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ensureIdentity } from './platform/device-identity';
import { startMsxPlugin } from './platform/msx-plugin';
import { installRemoteKeys } from './platform/remote-keys';
import { isTizen } from './platform/runtime';
import './theme/tokens.css';

const rootElement = document.getElementById('root');

function showStartupError(error: unknown) {
  if (!rootElement) return;
  const message = error instanceof Error ? error.message : String(error);
  while (rootElement.firstChild) rootElement.removeChild(rootElement.firstChild);
  const panel = document.createElement('div');
  panel.className = 'startup-error';
  panel.textContent = `Falha ao iniciar\n${message}`;
  rootElement.append(panel);
}

try {
  if (!rootElement) throw new Error('Elemento #root ausente');
  document.documentElement.classList.toggle('is-tizen', isTizen());
  startMsxPlugin();
  installRemoteKeys();
  ensureIdentity();
  createRoot(rootElement).render(<App />);
} catch (error) {
  showStartupError(error);
}
