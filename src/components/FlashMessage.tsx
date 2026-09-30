interface FlashMessageProps {
  messages: string[];
  onDismiss: () => void;
}

// App-level confirmation banner for actions whose effect isn't visible on
// the screen the organiser is looking at — e.g. marking a player
// unavailable regenerates rounds shown on a different tab. Stays until
// dismissed or replaced by the next action's message.
export function FlashMessage({ messages, onDismiss }: FlashMessageProps) {
  if (messages.length === 0) return null;
  return (
    <div className="session-adjustment-notice flash-message" role="status">
      <div>
        {messages.map((message) => (
          <p key={message} className="hint">
            {message}
          </p>
        ))}
      </div>
      <button type="button" className="secondary" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
