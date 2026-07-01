export function FrameHeader({ status }: { status: string }) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-copy">
          <p className="eyebrow">Lodariq</p>
          <h1>Experience editor</h1>
          <p id="status" aria-live="polite">
            {status}
          </p>
        </div>
      </div>
    </header>
  );
}
