export function FrameHeader({ status }: { status: string }) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-copy">
          <p className="eyebrow">Lodariq authoring</p>
          <h1>Tour builder</h1>
          <p id="status" aria-live="polite">
            {status}
          </p>
        </div>
      </div>
    </header>
  );
}
