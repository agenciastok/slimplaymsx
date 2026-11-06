import { useSession } from '../state/session';
import { tr } from './app-text';

export function useTr(): (portuguese: string) => string {
  const { language } = useSession();
  return (portuguese: string) => tr(language, portuguese);
}
