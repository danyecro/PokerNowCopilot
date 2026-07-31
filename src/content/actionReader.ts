import { SEL } from './selectors';
import type { ActionOption } from '../shared/types';

// PokerNow renders the hero action bar only while it is hero's turn:
//
//   <div class="action-buttons">
//     <p class="action-signal suspended">Your Turn</p>
//     <button class="button-1 action-button call with-tip call green">Call 20</button>
//     <button class="button-1 action-button with-tip raise green">Raise</button>
//     <button class="button-1 action-button with-tip check green" disabled>Check</button>
//     <button class="button-1 action-button with-tip fold red">Fold</button>
//   </div>
//
// The action kind lives in the class list, the sizing in the label. Both are
// read-only here — nothing in this module clicks anything.

const KIND_CLASSES: ReadonlyArray<ActionOption['kind']> =
  ['fold', 'check', 'call', 'raise', 'bet', 'allin'];

export function isHeroTurn(root: ParentNode = document): boolean {
  return root.querySelector(SEL.HERO_DECISION) !== null;
}

function classifyButton(btn: Element): ActionOption['kind'] | null {
  for (const kind of KIND_CLASSES) {
    if (btn.classList.contains(kind)) return kind;
  }
  // "All in" has no dedicated class on every build — fall back to the label.
  const text = btn.textContent?.toLowerCase() ?? '';
  if (/all\s*-?\s*in/.test(text)) return 'allin';
  return null;
}

/** Chip amount named by the button, e.g. "Call 20" → 20, "Raise to 1,250" → 1250. */
function parseAmount(label: string): number | undefined {
  const match = label.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const n = parseFloat(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Reads the legal actions currently offered to hero. Empty array when the
 * action bar is absent, i.e. when it is not hero's turn.
 */
export function readAvailableActions(root: ParentNode = document): ActionOption[] {
  const options: ActionOption[] = [];
  root.querySelectorAll(SEL.ACTION_BUTTON).forEach(btn => {
    const kind = classifyButton(btn);
    if (!kind) return;
    const label = btn.textContent?.trim() ?? '';
    const amount = parseAmount(label);
    options.push({
      kind,
      label,
      ...(amount !== undefined ? { amount } : {}),
      disabled: (btn as HTMLButtonElement).disabled,
    });
  });
  return options;
}

// ── Recommendation highlight ─────────────────────────────────────────────────
// Marks the button the model recommended so it is obvious where to click. The
// click itself stays with the player — this only draws a ring.

const HIGHLIGHT_CLASS = 'copilot-suggested';
const STYLE_ID = 'copilot-action-style';

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      outline: 3px solid #34d399 !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 12px rgba(52, 211, 153, 0.9) !important;
      animation: copilot-pulse 1.2s ease-in-out infinite;
    }
    @keyframes copilot-pulse {
      0%, 100% { outline-color: #34d399; }
      50%      { outline-color: #a7f3d0; }
    }
  `;
  document.head.appendChild(style);
}

export function clearActionHighlight(root: ParentNode = document): void {
  root.querySelectorAll(`.${HIGHLIGHT_CLASS}`)
    .forEach(el => el.classList.remove(HIGHLIGHT_CLASS));
}

/** The enabled button for `kind`, or null when the table is not offering it. */
export function findActionButton(
  kind: ActionOption['kind'],
  root: ParentNode = document,
): HTMLButtonElement | null {
  const match = Array.from(root.querySelectorAll(SEL.ACTION_BUTTON)).find(
    btn => !(btn as HTMLButtonElement).disabled && classifyButton(btn) === kind,
  );
  return (match as HTMLButtonElement | undefined) ?? null;
}

/**
 * Rings the enabled button matching `kind`. Returns true when a button was
 * found — false means the advice no longer applies to the current action bar
 * (action already taken, or the model named an action that is not offered).
 */
export function highlightAction(
  kind: ActionOption['kind'],
  root: ParentNode = document,
): boolean {
  ensureStyle();
  clearActionHighlight(root);
  const match = findActionButton(kind, root);
  if (!match) return false;
  match.classList.add(HIGHLIGHT_CLASS);
  return true;
}

/**
 * Maps the model's `ACTION:` line onto an action kind.
 *
 * Picks the action word that appears EARLIEST, not one from a fixed priority
 * list: the primary action is always named first and later words belong to
 * conditional clauses. Fixed-order matching got these wrong —
 * "raise/fold — prefer raise here" resolved to fold, and
 * "check-raise if he bets" to raise when the button to press is Check.
 */
export function parseRecommendedKind(actionLine: string): ActionOption['kind'] | null {
  const text = actionLine.toLowerCase();
  // All-in wins outright: "raise all-in" means the All-in button, not Raise.
  if (/all\s*-?\s*in/.test(text)) return 'allin';

  let best: { kind: ActionOption['kind']; at: number } | null = null;
  for (const kind of ['fold', 'check', 'call', 'bet', 'raise'] as const) {
    const at = text.search(new RegExp(`\\b${kind}`));
    if (at !== -1 && (best === null || at < best.at)) best = { kind, at };
  }
  return best?.kind ?? null;
}
