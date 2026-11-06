import { useEffect, useRef, useState } from 'react';
import { requiresAdultPin } from '../core/adult';
import { useTr } from '../l10n/use-tr';
import type { MediaEntry, MediaKind } from '../models/media';
import { useNav } from '../nav/navigation';
import { useSession } from '../state/session';

const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '←'];

export function useAdultGate() {
  const nav = useNav();
  const session = useSession();
  const text = useTr();
  return async function allow(kind: MediaKind, entry: MediaEntry | null, folderId: string | null) {
    if (!requiresAdultPin(kind, entry, folderId)) return true;
    const accepted = await askAdultPin(nav.openDialog, session.currentPin(), () => {
      session.showToast(text('Código pin incorreto'));
    });
    return accepted;
  };
}

function askAdultPin(
  openDialog: ReturnType<typeof useNav>['openDialog'],
  expected: string,
  onWrong: () => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (accepted: boolean) => {
      if (settled) return;
      settled = true;
      resolve(accepted);
    };
    openDialog((close) => (
      <AdultPinDialog
        expected={expected}
        onWrong={onWrong}
        onAccept={() => {
          finish(true);
          close();
        }}
        onDismiss={() => finish(false)}
      />
    ));
  });
}

function AdultPinDialog({
  expected,
  onWrong,
  onAccept,
  onDismiss,
}: {
  expected: string;
  onWrong: () => void;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const text = useTr();
  const [entry, setEntry] = useState('');
  const settled = useRef(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    return () => {
      if (settled.current) return;
      settled.current = true;
      dismissRef.current();
    };
  }, []);

  function submit(next: string) {
    if (next === expected) {
      settled.current = true;
      onAccept();
      return;
    }
    setEntry('');
    onWrong();
  }

  function press(digit: string) {
    if (digit === '←') {
      setEntry((current) => current.slice(0, -1));
      return;
    }
    const next = (entry + digit).slice(0, 4);
    setEntry(next);
    if (next.length === 4) submit(next);
  }

  return (
    <div className="dialog-card pin-dialog">
      <h2>{text('Conteúdo adulto')}</h2>
      <p className="pin-hint">{text('Digite o código pin')}</p>
      <p className="pin-dots">{'•'.repeat(entry.length).padEnd(4, '○')}</p>
      <div className="pin-keys">
        {digits.map((digit) => (
          <button
            key={digit}
            type="button"
            className="pin-key"
            data-tv-focusable="true"
            data-tv-initial={digit === '0' ? 'true' : undefined}
            aria-label={digit === '←' ? 'Apagar' : digit}
            onClick={() => press(digit)}
          >
            {digit}
          </button>
        ))}
      </div>
    </div>
  );
}
