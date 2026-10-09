/**
 * A page that fails to render fails alone.
 *
 * Without a boundary, one malformed record anywhere in a page unmounts the
 * whole application — the navigation, the topbar, the way out — and leaves a
 * blank screen with no explanation. Each shell wraps its outlet in this, so a
 * failure is reported inside the page's own column, the shell keeps working,
 * and moving to another page clears it.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button, ErrorState } from './primitives';

interface Props {
  children: ReactNode;
  /** Changing this clears the failure — the shells pass the path. */
  resetKey: string;
}

interface State {
  error: Error | null;
}

export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept for whoever opens the console; the page shows no stack.
    console.error('Page failed to render', error, info.componentStack);
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ display: 'grid', gap: 'var(--space-4)', paddingTop: 'var(--space-8)' }}>
        <ErrorState
          title="This page could not be shown"
          body="Something on it failed to draw. Nothing was changed, and the rest of the application still works — try again, or go somewhere else from the navigation."
          onRetry={() => this.setState({ error: null })}
        />
        <div>
          <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
            Reload the application
          </Button>
        </div>
      </div>
    );
  }
}
