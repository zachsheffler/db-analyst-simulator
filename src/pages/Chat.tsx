/** Placeholder for the chat panel (to be wired up later). */
export function ChatPanel() {
  return (
    <div className="chat">
      <div className="chat-log">
        <div className="chat-msg system">Chat is not connected yet. Your employer's contact will appear here.</div>
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
        }}
      >
        <input type="text" placeholder="Message… (coming soon)" disabled />
        <button type="submit" disabled>
          Send
        </button>
      </form>
    </div>
  )
}
