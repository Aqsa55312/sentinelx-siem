/**
 * Ambient login backdrop: a slow coordinate grid with a radar sweep.
 * Purely decorative, CSS-driven, and disabled by prefers-reduced-motion.
 */
export default function LoginBackdrop() {
  return (
    <div className="login-backdrop" aria-hidden="true">
      <div className="login-grid" />

      <div className="login-radar">
        <span className="radar-ring ring-1" />
        <span className="radar-ring ring-2" />
        <span className="radar-ring ring-3" />
        <span className="radar-cross radar-cross-x" />
        <span className="radar-cross radar-cross-y" />
        <span className="radar-pulse" />
        <span className="radar-sweep" />
        <span className="radar-core" />
        <span className="radar-blip blip-1" />
        <span className="radar-blip blip-2" />
        <span className="radar-blip blip-3" />
        <span className="radar-blip blip-4" />
      </div>

      <span className="login-coord coord-1">scan / 360°</span>
      <span className="login-coord coord-2">n 47.21 / e 008.54</span>
    </div>
  );
}
