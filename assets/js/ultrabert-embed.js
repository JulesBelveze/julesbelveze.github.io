(() => {
  const frame = document.getElementById('ultrabert-predictions');
  if (!frame) return;

  window.addEventListener('message', event => {
    if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
    const message = event.data;
    if (!message || message.type !== 'ultrabert-explorer-height') return;
    if (!Number.isFinite(message.height) || message.height < 320 || message.height > 3000) return;
    frame.style.height = `${message.height}px`;
  });

  frame.hidden = false;
})();
