import type { CredentialEntry, DetectedField, ExtMessage } from '../shared/types';

// ─── Field detection ──────────────────────────────────────────────────────────

function getLabel(el: HTMLElement): string {
  // 1. explicit <label for="...">
  if (el.id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${el.id}"]`);
    if (label) return label.textContent?.trim() ?? '';
  }
  // 2. aria-label
  const aria = el.getAttribute('aria-label');
  if (aria) return aria;
  // 3. placeholder
  const ph = (el as HTMLInputElement).placeholder;
  if (ph) return ph;
  // 4. wrapping label
  const parent = el.closest('label');
  if (parent) return parent.textContent?.trim() ?? '';
  // 5. preceding sibling or nearby text
  const prev = el.previousElementSibling;
  if (prev) return prev.textContent?.trim() ?? '';
  return '';
}

function detectFields(): DetectedField[] {
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input, textarea')
  );

  return inputs
    .filter((el) => {
      const type = (el as HTMLInputElement).type?.toLowerCase() ?? 'text';
      return !['submit', 'button', 'reset', 'image', 'file', 'hidden', 'checkbox', 'radio'].includes(type);
    })
    .map((el) => {
      const type = (el as HTMLInputElement).type?.toLowerCase() ?? 'text';
      const label = getLabel(el);
      const lowerLabel = label.toLowerCase();

      let fieldType: DetectedField['type'] = 'text';
      if (type === 'password') fieldType = 'password';
      else if (type === 'email' || lowerLabel.includes('email')) fieldType = 'email';
      else if (
        lowerLabel.includes('user') ||
        lowerLabel.includes('login') ||
        lowerLabel.includes('account')
      )
        fieldType = 'username';

      // Build a stable CSS selector for this element
      let selector = '';
      if (el.id) {
        selector = `#${CSS.escape(el.id)}`;
      } else if (el.name) {
        selector = `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
      } else {
        // Fall back to nth-child position
        const parent = el.parentElement;
        if (parent) {
          const idx = Array.from(parent.children).indexOf(el) + 1;
          selector = `${el.tagName.toLowerCase()}:nth-child(${idx})`;
        }
      }

      return { selector, type: fieldType, label };
    })
    .filter((f) => f.selector !== '');
}

// ─── Field filling ────────────────────────────────────────────────────────────

function fillField(selector: string, value: string): boolean {
  const el = document.querySelector<HTMLInputElement>(selector);
  if (!el) return false;

  // Use native input value setter so React/Vue state updates fire
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
  } else {
    el.value = value;
  }

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function fillCredential(entry: CredentialEntry): number {
  const fields = detectFields();
  let filled = 0;

  for (const detected of fields) {
    let matchValue: string | undefined;

    if (detected.type === 'password') {
      matchValue = entry.password;
    } else if (detected.type === 'email' || detected.type === 'username') {
      matchValue = entry.username ?? entry.fields.find((f) => f.type === 'email')?.value;
    } else {
      // Try to match by label similarity
      const lowerLabel = detected.label.toLowerCase();
      const matched = entry.fields.find((f) =>
        f.label.toLowerCase().includes(lowerLabel) ||
        lowerLabel.includes(f.label.toLowerCase())
      );
      matchValue = matched?.value;
    }

    if (matchValue && fillField(detected.selector, matchValue)) {
      filled++;
    }
  }

  return filled;
}

// ─── Inline suggestion overlay ────────────────────────────────────────────────

let activeOverlay: HTMLDivElement | null = null;

function removeOverlay() {
  activeOverlay?.remove();
  activeOverlay = null;
}

function showSuggestionOverlay(
  anchorEl: HTMLElement,
  entries: CredentialEntry[],
  onSelect: (entry: CredentialEntry) => void
) {
  removeOverlay();
  if (entries.length === 0) return;

  const rect = anchorEl.getBoundingClientRect();
  const overlay = document.createElement('div');
  overlay.id = '__seravault_overlay__';
  overlay.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    top: ${rect.bottom + window.scrollY + 4}px;
    left: ${rect.left + window.scrollX}px;
    min-width: ${Math.max(rect.width, 240)}px;
    background: #1a1a2e;
    border: 1px solid #4f46e5;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    overflow: hidden;
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    padding: 6px 12px;
    background: #4f46e5;
    color: white;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    gap: 6px;
  `;
  header.innerHTML = `<span style="font-size:14px">🔐</span> SeraVault`;
  overlay.appendChild(header);

  for (const entry of entries.slice(0, 5)) {
    const item = document.createElement('div');
    item.style.cssText = `
      padding: 10px 12px;
      cursor: pointer;
      border-top: 1px solid #2d2d4e;
      color: #e2e8f0;
      transition: background 0.1s;
    `;
    item.innerHTML = `
      <div style="font-weight:600;color:#a5b4fc">${entry.name}</div>
      <div style="color:#94a3b8;font-size:11px;margin-top:2px">${entry.username ?? ''}${entry.url ? ` · ${entry.url}` : ''}</div>
    `;
    item.addEventListener('mouseenter', () => { item.style.background = '#2d2d4e'; });
    item.addEventListener('mouseleave', () => { item.style.background = ''; });
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onSelect(entry);
      removeOverlay();
    });
    overlay.appendChild(item);
  }

  document.body.appendChild(overlay);
  activeOverlay = overlay;
}

// ─── Focus listener: show suggestions on password / username fields ───────────

let cachedEntries: CredentialEntry[] | null = null;

async function getEntries(): Promise<CredentialEntry[]> {
  if (cachedEntries !== null) return cachedEntries;
  const domain = window.location.hostname;
  const response = await chrome.runtime.sendMessage<ExtMessage, ExtMessage>({
    type: 'GET_CREDENTIALS',
    domain,
  });
  if (response.type === 'CREDENTIALS_RESULT') {
    cachedEntries = response.entries;
    return cachedEntries;
  }
  return [];
}

function attachFocusListeners() {
  document.addEventListener(
    'focusin',
    async (e) => {
      const target = e.target as HTMLInputElement;
      if (!target || !['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      const type = target.type?.toLowerCase();
      if (['submit', 'button', 'checkbox', 'radio', 'hidden', 'file'].includes(type)) return;

      const label = getLabel(target).toLowerCase();
      const isRelevant =
        type === 'password' ||
        type === 'email' ||
        label.includes('user') ||
        label.includes('email') ||
        label.includes('login') ||
        label.includes('password');

      if (!isRelevant) return;

      try {
        const entries = await getEntries();
        if (entries.length > 0) {
          showSuggestionOverlay(target, entries, (entry) => {
            fillCredential(entry);
          });
        }
      } catch {
        // Not authenticated or background unavailable
      }
    },
    true
  );

  document.addEventListener('focusout', () => {
    // Delay so mousedown on overlay fires first
    setTimeout(removeOverlay, 150);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') removeOverlay();
  });
}

// ─── Message listener (from popup) ───────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: ExtMessage, _sender, sendResponse) => {
    switch (message.type) {
      case 'GET_PAGE_FIELDS': {
        sendResponse({ type: 'PAGE_FIELDS', fields: detectFields() });
        break;
      }
      case 'FILL_FORM': {
        const count = fillCredential(message.entry);
        sendResponse({ type: 'FIELDS_FILLED', count });
        break;
      }
      case 'FILL_FIELD': {
        const ok = fillField(message.selector, message.value);
        sendResponse({ type: 'FIELDS_FILLED', count: ok ? 1 : 0 });
        break;
      }
      default:
        break;
    }
    return true;
  }
);

attachFocusListeners();

// ─── Token bridge (only active on app.seravault.com) ─────────────────────────
// When the popup asks for a token, we request it from the page via postMessage
// and relay the response back to the background worker.

if (window.location.hostname === 'app.seravault.com') {
  chrome.runtime.onMessage.addListener(
    (message: ExtMessage, _sender, sendResponse) => {
      if (message.type !== 'REQUEST_PAGE_TOKEN') return false;

      const timeout = setTimeout(() => {
        sendResponse({ type: 'ERROR', message: 'Page did not respond — are you signed in at app.seravault.com?' });
      }, 5000);

      const nonce = crypto.randomUUID();

      const handler = (event: MessageEvent) => {
        if (event.source !== window) return;
        if (event.data?.type !== 'SERAVAULT_EXT_TOKEN_RESPONSE') return;
        if (event.data?.nonce !== nonce) return; // reject responses not matching our nonce
        window.removeEventListener('message', handler);
        clearTimeout(timeout);
        if (event.data.error) {
          sendResponse({ type: 'ERROR', message: event.data.error });
        } else {
          sendResponse({ type: 'AUTH_STATE', uid: event.data.uid, email: event.data.email, idToken: event.data.idToken } as any);
        }
      };

      window.addEventListener('message', handler);
      window.postMessage({ type: 'SERAVAULT_EXT_TOKEN_REQUEST', nonce }, window.location.origin);
      return true; // keep channel open for async response
    }
  );
}
