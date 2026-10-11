export const STYLES = `
    [data-ppp-hidden] { display: none !important; }
    .ppp-controls { display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0; }
    .ppp-controls[hidden], .ppp-button[hidden] { display: none !important; }
    .ppp-button { background: transparent; border: 0; color: var(--spice-subtext, #b3b3b3); cursor: pointer; padding: 4px; width: 24px; height: 32px; display: inline-flex; align-items: center; justify-content: center; }
    .ppp-button:hover { color: var(--spice-text, #fff); }
    .ppp-button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    .ppp-button[aria-pressed="true"] { color: var(--spice-button, #1ed760); }
    .ppp-button:disabled { opacity: .5; cursor: wait; }
    .ppp-tooltip { color: var(--spice-text, #fff); background-color: var(--spice-card, #282828); text-overflow: ellipsis; -webkit-line-clamp: 4; -webkit-box-orient: vertical; border-radius: 4px; max-width: 50ch; padding: 4px 8px; display: -webkit-box; overflow: hidden; box-shadow: 0 16px 24px #0000004d, 0 6px 8px #0003; font-size: 14px !important; animation: ppp-tooltip-in .2s ease-in-out; }
    @keyframes ppp-tooltip-in { from { opacity: 0; } to { opacity: 1; } }
    .ppp-settings { display: grid; gap: 18px; padding: 8px; }
    .ppp-settings label { display: grid; gap: 8px; }
    .ppp-settings label.ppp-toggle { display: flex; align-items: center; gap: 10px; }
    .ppp-settings select { width: 100%; padding: 10px; background: var(--spice-card, #282828); color: var(--spice-text, #fff); border: 1px solid #777; border-radius: 4px; }
    .ppp-settings-actions { display: flex; justify-content: flex-end; padding-top: 6px; }
    .ppp-save { border: 0; border-radius: 9999px; padding: 12px 24px; background: var(--spice-button, #1ed760); color: var(--spice-main, #121212); font: inherit; font-weight: 700; cursor: pointer; }
    .ppp-save:hover { transform: scale(1.04); filter: brightness(1.06); }
    .ppp-save:active { transform: scale(1); }
    .ppp-save:focus-visible { outline: 3px solid var(--spice-text, #fff); outline-offset: 3px; }
    .ppp-save:disabled { opacity: .5; cursor: wait; transform: none; }
    .ppp-settings p { margin: 0; line-height: 1.5; }
  `;
