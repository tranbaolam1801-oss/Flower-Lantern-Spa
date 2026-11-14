const CHANNEL = 'spa-avatar-updated';

/** A successful upload invalidates local and other open tabs; carries no profile/image data. */
export function notifyAvatarUpdated() {
  window.dispatchEvent(new Event(CHANNEL));
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage('updated');
    channel.close();
  }
}

export function subscribeAvatarUpdated(refresh: () => void) {
  window.addEventListener(CHANNEL, refresh);
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;
  if (channel) channel.onmessage = refresh;
  return () => { window.removeEventListener(CHANNEL, refresh); channel?.close(); };
}
