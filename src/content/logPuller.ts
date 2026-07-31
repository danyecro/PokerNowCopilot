import { SEL } from './selectors';
import { LOG_MODAL_TIMEOUT_MS } from '../shared/constants';
import { logEntriesToLines } from '../parser/handParser';

let pulling = false;

export interface PullLogOptions {
  /**
   * Queue behind a pull that is already running instead of giving up. Set for
   * manual pulls: a click has to do something, while an automatic per-hand
   * trigger is happy to be dropped — the next one recovers it.
   */
  waitForFree?: boolean;
}

/**
 * Reads the log page the modal opens on — the hand currently in play, or the
 * one that just ended if no new hand has been dealt yet. This is the automatic
 * per-hand path; for history see `pullLogPages`.
 */
export async function pullLogEntries(opts: PullLogOptions = {}): Promise<Element[]> {
  const session = await openLog(opts);
  if (!session) return [];
  try {
    return Array.from(session.entries.querySelectorAll(SEL.LOG_ENTRY));
  } finally {
    session.done();
  }
}

export interface PullPagesOptions extends PullLogOptions {
  /** Stop paging back once this is happy with the lines collected so far. */
  enough: (chronologicalLines: string[]) => boolean;
  /** Hard stop, so a bad `enough` cannot page through a whole session. */
  maxPages: number;
}

/**
 * Pages back through the log and returns every line collected, oldest first.
 *
 * The modal shows exactly ONE hand per page — the entry list does not scroll
 * into older hands, the "Hand #302 »" button is the only way back. So history
 * has to be walked page by page, and the text has to be taken along as it goes:
 * a page's entry elements are detached the moment the next page renders.
 */
export async function pullLogPages(opts: PullPagesOptions): Promise<string[]> {
  const session = await openLog(opts);
  if (!session) return [];

  const pages: string[][] = [];
  // Every page reached by "older" carries a lower hand number than the last.
  // If that does not drop, the click did not move us and paging is over.
  let lastOlderNum = Number.POSITIVE_INFINITY;

  try {
    for (let page = 0; page < opts.maxPages; page++) {
      const entries = Array.from(session.entries.querySelectorAll(SEL.LOG_ENTRY));
      pages.unshift(logEntriesToLines(entries));   // this page is older than all before it
      if (opts.enough(pages.flat())) break;

      const older = findOlderPageButton(session.modal, lastOlderNum);
      if (!older) break;                            // start of the log reached
      lastOlderNum = older.handNum;

      const before = pageSignature(session.entries);
      reactClick(older.button);
      if (!await waitForPageChange(session.entries, before)) break;  // page never swapped
    }
    return pages.flat();
  } finally {
    session.done();
  }
}

// ── Modal session ────────────────────────────────────────────────────────────

interface LogSession {
  modal: Element;
  entries: Element;
  /** Closes the modal (only if we opened it) and releases the pull lock. */
  done: () => void;
}

async function openLog(opts: PullLogOptions): Promise<LogSession | null> {
  if (pulling) {
    if (!opts.waitForFree) return null;
    if (!await waitUntilFree(6000)) return null;
  }
  pulling = true;

  const release = (closeIt: boolean): void => {
    if (closeIt) closeModal();
    pulling = false;
    removeHideStyle();
  };

  try {
    injectHideStyle();

    // Someone may have the log open already — clicking the button would close it.
    const wasOpen = Boolean(document.querySelector(SEL.LOG_MODAL));
    if (!wasOpen && !openLogModal()) {
      release(false);
      return null;
    }

    const modal = await waitForElement(SEL.LOG_MODAL, LOG_MODAL_TIMEOUT_MS);
    if (!modal) {
      console.warn('[Copilot] Log modal did not appear within timeout');
      release(false);
      return null;
    }

    // The modal renders before its entries are populated.
    await waitForEntriesStable(modal);

    const entries = modal.querySelector(SEL.LOG_ENTRIES);
    if (!entries) {
      release(!wasOpen);
      return null;
    }

    let released = false;
    return {
      modal,
      entries,
      done: () => { if (!released) { released = true; release(!wasOpen); } },
    };
  } catch (e) {
    release(false);
    throw e;
  }
}

/** Clicks the log button, falling back to PokerNow's "L" shortcut. */
function openLogModal(): boolean {
  const openBtn =
    document.querySelector<HTMLElement>(SEL.LOG_OPEN_BUTTON) ??
    document.querySelector<HTMLElement>('.log-button-container button') ??
    document.querySelector<HTMLElement>('.log-button-container') as HTMLElement | null;

  if (openBtn) { reactClick(openBtn); return true; }

  // No button in the DOM (compact layouts hide it) — the table listens for "L".
  console.warn('[Copilot] Log open button not found — trying the "L" shortcut');
  for (const type of ['keydown', 'keyup'] as const) {
    document.dispatchEvent(new KeyboardEvent(type, {
      key: 'l', code: 'KeyL', keyCode: 76, which: 76,
      bubbles: true, cancelable: true,
    }));
  }
  return true;
}

// ── Pagination ───────────────────────────────────────────────────────────────

/**
 * The button leading to the older hand, i.e. the lowest hand number offered.
 * Both slots ("« Hand #304" / "Hand #302 »") carry their target in the label,
 * so the number decides the direction — not the position or the arrow glyph.
 */
function findOlderPageButton(
  modal: Element,
  below: number,
): { button: HTMLElement; handNum: number } | null {
  const candidates = Array.from(
    modal.querySelectorAll<HTMLButtonElement>(SEL.LOG_PAGINATION_BUTTON),
  )
    .filter(b => !b.disabled)
    .map(b => ({ button: b as HTMLElement, handNum: Number(b.textContent?.match(/#(\d+)/)?.[1]) }))
    .filter(c => Number.isFinite(c.handNum) && c.handNum < below)
    .sort((a, b) => a.handNum - b.handNum);

  return candidates[0] ?? null;
}

/** First entry's text plus the entry count — changes whenever a page swaps. */
function pageSignature(entries: Element): string {
  const list = entries.querySelectorAll(SEL.LOG_ENTRY);
  return `${list.length}|${list[0]?.textContent?.trim() ?? ''}`;
}

/** Resolves true once the rendered page differs from `before`. */
function waitForPageChange(entries: Element, before: string): Promise<boolean> {
  return new Promise(resolve => {
    const TIMEOUT = 2500;
    let settle: ReturnType<typeof setTimeout> | null = null;

    const finish = (changed: boolean): void => {
      if (settle) clearTimeout(settle);
      clearTimeout(deadline);
      observer.disconnect();
      resolve(changed);
    };

    const observer = new MutationObserver(() => {
      if (pageSignature(entries) === before) return;
      // Content changed — give the rest of the page a moment to render.
      if (settle) clearTimeout(settle);
      settle = setTimeout(() => finish(true), 150);
    });
    observer.observe(entries, { childList: true, subtree: true });

    const deadline = setTimeout(() => finish(pageSignature(entries) !== before), TIMEOUT);
  });
}

// ── Waiting helpers ──────────────────────────────────────────────────────────

/** Polls until no pull is in flight. Resolves false if it never clears in time. */
function waitUntilFree(timeoutMs: number): Promise<boolean> {
  return new Promise(resolve => {
    const deadline = Date.now() + timeoutMs;
    const tick = (): void => {
      if (!pulling) { resolve(true); return; }
      if (Date.now() >= deadline) { resolve(false); return; }
      setTimeout(tick, 100);
    };
    setTimeout(tick, 100);
  });
}

/**
 * Waits until the entry count in the modal stops growing for 200ms,
 * or until a maximum wait of 1500ms.
 */
function waitForEntriesStable(modal: Element): Promise<void> {
  return new Promise(resolve => {
    const MAX_WAIT = 1500;
    const STABLE_DELAY = 200;
    let lastCount = -1;
    let stableTimer: ReturnType<typeof setTimeout> | null = null;
    const deadline = setTimeout(() => {
      if (stableTimer) clearTimeout(stableTimer);
      observer.disconnect();
      resolve();
    }, MAX_WAIT);

    const observer = new MutationObserver(() => {
      const count = modal.querySelectorAll(SEL.LOG_ENTRY).length;
      if (count !== lastCount) {
        lastCount = count;
        if (stableTimer) clearTimeout(stableTimer);
        stableTimer = setTimeout(() => {
          clearTimeout(deadline);
          observer.disconnect();
          resolve();
        }, STABLE_DELAY);
      }
    });

    observer.observe(modal, { childList: true, subtree: true });

    // Kick off initial check
    const count = modal.querySelectorAll(SEL.LOG_ENTRY).length;
    lastCount = count;
    stableTimer = setTimeout(() => {
      clearTimeout(deadline);
      observer.disconnect();
      resolve();
    }, STABLE_DELAY);
  });
}

function reactClick(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true, view: window }));
}

function waitForElement(selector: string, timeoutMs: number): Promise<Element | null> {
  return new Promise(resolve => {
    const existing = document.querySelector(selector);
    if (existing) { resolve(existing); return; }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) { observer.disconnect(); clearTimeout(timer); resolve(el); }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

function closeModal(): void {
  const closeBtn =
    document.querySelector<HTMLElement>(SEL.LOG_CLOSE_BUTTON) ??
    document.querySelector<HTMLElement>('.modal.log-modal .modal-button-close') ??
    document.querySelector<HTMLElement>('.log-modal button[class*="close"]');
  if (closeBtn) reactClick(closeBtn);
}

const HIDE_STYLE_ID = 'copilot-log-hide';

function injectHideStyle(): void {
  if (document.getElementById(HIDE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HIDE_STYLE_ID;
  style.textContent = `.modal.log-modal { opacity: 0 !important; pointer-events: none !important; }`;
  document.head.appendChild(style);
}

function removeHideStyle(): void {
  document.getElementById(HIDE_STYLE_ID)?.remove();
}
