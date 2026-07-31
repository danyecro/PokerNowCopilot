import type { ActionOption } from '../shared/types';
import type { AfkMode } from '../shared/types';

// The ONLY place in this extension that clicks a table button.
//
// Scope is deliberately narrow: it check/folds while you are away, which is what
// PokerNow's own timeout would do anyway — just without making the table wait.
// It never calls, bets or raises, so it cannot play a hand for profit and gains
// no edge. Anything strategic stays a recommendation you click yourself.

const AFK_GRACE_MS = 1500;
const BADGE_ID = 'copilot-afk-badge';

/**
 * Picks the action to take while AFK, or null when nothing should be clicked.
 *
 * `check-fold` keeps you in the hand for free whenever checking is possible and
 * only folds when facing a bet. `fold` leaves the hand immediately, falling back
 * to check when the table offers no fold button so the game never stalls on a
 * timer. Disabled buttons are never eligible.
 */
export function planAfkAction(
  mode: AfkMode,
  actions: readonly ActionOption[] | undefined,
): ActionOption | null {
  if (mode === 'off' || !actions) return null;
  const enabled = actions.filter(a => !a.disabled);
  const check = enabled.find(a => a.kind === 'check') ?? null;
  const fold  = enabled.find(a => a.kind === 'fold')  ?? null;
  return mode === 'check-fold'
    ? (check ?? fold)
    : (fold ?? check);
}

// ── Scheduling ───────────────────────────────────────────────────────────────

let pending: ReturnType<typeof setTimeout> | null = null;
let detachCancel: (() => void) | null = null;

function cleanup(): void {
  if (pending) { clearTimeout(pending); pending = null; }
  detachCancel?.();
  detachCancel = null;
  document.getElementById(BADGE_ID)?.remove();
}

export function cancelAfkAction(): void {
  cleanup();
}

/**
 * Clicks the planned action after a short, visible grace period. Any real input
 * from you (key or pointer) aborts it and reports back so AFK mode can be turned
 * off — coming back to the table should never leave it folding on your behalf.
 */
export function scheduleAfkAction(
  mode: AfkMode,
  actions: readonly ActionOption[] | undefined,
  onUserReturned: () => void,
  findButton: (kind: ActionOption['kind']) => HTMLButtonElement | null,
): void {
  cleanup();

  const plan = planAfkAction(mode, actions);
  if (!plan) return;

  showBadge(plan.label);

  const abort = (): void => {
    cleanup();
    console.log('[Copilot] AFK cancelled — you are back. Auto-action disabled.');
    onUserReturned();
  };
  window.addEventListener('keydown', abort, { once: true, capture: true });
  window.addEventListener('pointerdown', abort, { once: true, capture: true });
  detachCancel = () => {
    window.removeEventListener('keydown', abort, { capture: true });
    window.removeEventListener('pointerdown', abort, { capture: true });
  };

  pending = setTimeout(() => {
    pending = null;
    const btn = findButton(plan.kind);
    // Re-check: the turn may have ended (or been auto-folded by the server)
    // while the grace period ran.
    if (!btn || btn.disabled) { cleanup(); return; }
    console.log(`[Copilot] AFK: clicking "${plan.label}"`);
    btn.click();
    cleanup();
  }, AFK_GRACE_MS);
}

// ── On-table badge ───────────────────────────────────────────────────────────
// You are not looking at the side panel while away, so the state has to be
// visible on the table itself.

function showBadge(label: string): void {
  document.getElementById(BADGE_ID)?.remove();
  const badge = document.createElement('div');
  badge.id = BADGE_ID;
  badge.textContent = `AFK — "${label}" in ${(AFK_GRACE_MS / 1000).toFixed(1)}s · press any key to cancel`;
  badge.style.cssText = [
    'position:fixed', 'top:12px', 'left:50%', 'transform:translateX(-50%)',
    'z-index:2147483647', 'padding:7px 14px', 'border-radius:6px',
    'background:#7c2d12', 'color:#fed7aa', 'border:1px solid #ea580c',
    'font:600 12px/1.2 system-ui,sans-serif', 'letter-spacing:0.3px',
    'box-shadow:0 2px 12px rgba(0,0,0,0.5)', 'pointer-events:none',
  ].join(';');
  document.body.appendChild(badge);
}
