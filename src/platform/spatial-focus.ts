export type FocusDirection = 'left' | 'right' | 'up' | 'down';

let returnIndex = 0;

export function moveFocus(direction: FocusDirection): void {
  const nodes = focusables();
  if (nodes.length === 0) return;
  const current = currentFocusable(nodes);
  if (!current) {
    const first = nodes[0];
    if (first) placeFocus(first);
    return;
  }

  const row = current.dataset.tvRow;
  if (row === 'menu' && (direction === 'left' || direction === 'right')) {
    const index = Number(current.dataset.tvIndex ?? '0');
    const next = index + (direction === 'right' ? 1 : -1);
    const target = findRowIndex(nodes, 'menu', next);
    if (!target) return;
    returnIndex = next;
    placeFocus(target);
    return;
  }
  if (row === 'menu' && direction === 'down') {
    returnIndex = Number(current.dataset.tvIndex ?? '0');
    const reload = findRow(nodes, 'reload');
    if (reload) placeFocus(reload);
    return;
  }
  if (row === 'reload' && direction === 'up') {
    const target = findRowIndex(nodes, 'menu', returnIndex) ?? findRow(nodes, 'menu');
    if (target) placeFocus(target);
    return;
  }
  if (row === 'reload' && direction === 'right') {
    const exit = findRow(nodes, 'exit');
    if (exit) placeFocus(exit);
    return;
  }
  if (row === 'exit' && direction === 'left') {
    const reload = findRow(nodes, 'reload');
    if (reload) placeFocus(reload);
    return;
  }
  if (row === 'exit' && direction === 'up') {
    const target = findRowIndex(nodes, 'menu', returnIndex) ?? findRow(nodes, 'menu');
    if (target) placeFocus(target);
    return;
  }
  if (row === 'menu' && direction === 'up') return;
  if (row === 'reload' && direction !== 'up') return;
  if (row === 'exit') return;

  const target = nearest(current, nodes, direction);
  if (target) placeFocus(target);
}

function focusables(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-tv-focusable="true"]')].filter(
    (node) =>
      !node.hasAttribute('disabled') &&
      !node.closest('[inert]') &&
      node.getClientRects().length > 0,
  );
}

function placeFocus(node: HTMLElement): void {
  const scrolled = reveal(node);
  node.focus({ preventScroll: true });
  for (const step of scrolled) {
    if (step.parent.scrollTop !== step.top) step.parent.scrollTop = step.top;
    if (step.parent.scrollLeft !== step.left) step.parent.scrollLeft = step.left;
  }
}

function reveal(node: HTMLElement): { parent: HTMLElement; top: number; left: number }[] {
  const scrolled: { parent: HTMLElement; top: number; left: number }[] = [];
  let parent = node.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    if (canScroll(style.overflowY, parent.scrollHeight, parent.clientHeight)) nudge(parent, node, 'y', style);
    if (canScroll(style.overflowX, parent.scrollWidth, parent.clientWidth)) nudge(parent, node, 'x', style);
    if (parent.scrollHeight > parent.clientHeight + 1 || parent.scrollWidth > parent.clientWidth + 1) {
      scrolled.push({ parent, top: parent.scrollTop, left: parent.scrollLeft });
    }
    parent = parent.parentElement;
  }
  return scrolled;
}

function canScroll(overflow: string, size: number, visible: number): boolean {
  return (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') && size > visible + 1;
}

function nudge(parent: HTMLElement, node: HTMLElement, axis: 'x' | 'y', style: CSSStyleDeclaration): void {
  const rect = node.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  const vertical = axis === 'y';
  const padStart = parseFloat(vertical ? style.paddingTop : style.paddingLeft) || 0;
  const padEnd = parseFloat(vertical ? style.paddingBottom : style.paddingRight) || 0;
  const edge = vertical ? parent.clientTop : parent.clientLeft;
  const visibleStart = (vertical ? parentRect.top : parentRect.left) + edge + padStart;
  const visibleSize = vertical ? parent.clientHeight : parent.clientWidth;
  const visibleEnd = (vertical ? parentRect.top : parentRect.left) + edge + visibleSize - padEnd;
  const start = vertical ? rect.top : rect.left;
  const end = vertical ? rect.bottom : rect.right;
  const size = vertical ? rect.height : rect.width;
  const room = visibleEnd - visibleStart;
  let delta = 0;
  if (size > room) {
    if (Math.abs(start - visibleStart) > 0.5) delta = start - visibleStart;
  } else if (start < visibleStart - 0.5) {
    delta = start - visibleStart;
  } else if (end > visibleEnd + 0.5) {
    delta = end - visibleEnd;
  }
  if (delta === 0) return;
  if (vertical) parent.scrollTop += delta;
  else parent.scrollLeft += delta;
}

function currentFocusable(nodes: HTMLElement[]): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  return nodes.includes(active) ? active : null;
}

function findRow(nodes: HTMLElement[], row: string): HTMLElement | undefined {
  return nodes.find((node) => node.dataset.tvRow === row);
}

function findRowIndex(nodes: HTMLElement[], row: string, index: number): HTMLElement | undefined {
  return nodes.find(
    (node) => node.dataset.tvRow === row && node.dataset.tvIndex === String(index),
  );
}

function nearest(
  current: HTMLElement,
  nodes: HTMLElement[],
  direction: FocusDirection,
): HTMLElement | null {
  const from = center(current.getBoundingClientRect());
  let best: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const node of nodes) {
    if (node === current) continue;
    const to = center(node.getBoundingClientRect());
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const primary =
      direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
    if (primary <= 1) continue;
    const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = primary * primary + secondary * secondary;
    if (score < bestScore) {
      bestScore = score;
      best = node;
    }
  }
  return best;
}

function center(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
