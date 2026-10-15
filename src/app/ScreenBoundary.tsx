import { Component, type ReactNode } from 'react';
import { bootstrapError } from '../content/bootstrap';
import { Button } from '../ui/Button/Button';
type Props = {
  children: ReactNode;
  onFailure: () => void;
  reload?: () => void;
  /** Another boundary already shows the alert for the same chunk. */
  quiet?: boolean;
  /** A whole screen failed: the fallback takes its `<main>` (docs/02 §12). */
  screen?: string;
};
/** A failed screen or optional chunk must leave the header, dock and navigation
 * usable. Key it by screen so leaving the screen clears the failure. */
export class ScreenBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    try {
      this.props.onFailure();
    } catch {
      /* Reporting cannot replace the usable fallback. No error object or private draft is sent. */
    }
  }
  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.quiet) return null;
    const alert = (
      <section role="alert">
        <p>{bootstrapError.message}</p>
        <Button
          label={bootstrapError.action}
          onClick={
            this.props.reload ??
            // Needed only after a failed chunk: load the helper on the tap.
            (() =>
              void import('./reload-rating').then((module) =>
                module.reloadRatingScreen(),
              ))
          }
        />
      </section>
    );
    return this.props.screen === undefined ? (
      alert
    ) : (
      <main className={this.props.screen}>{alert}</main>
    );
  }
}
