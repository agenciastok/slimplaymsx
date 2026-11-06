import { Navigation } from './nav/navigation';
import { SessionProvider } from './state/session';
import './screens/screens.css';

export function App() {
  return (
    <SessionProvider>
      <Navigation />
    </SessionProvider>
  );
}
