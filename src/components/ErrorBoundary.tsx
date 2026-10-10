import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  /** Stable id for freeze/build reports (e.g. "shell", "chat", "workspace"). */
  boundaryId: string;
  children: ReactNode;
  /** Optional compact fallback when a pane fails without taking down the shell. */
  fallbackTitle?: string;
};

type State = {
  error: Error | null;
  info: ErrorInfo | null;
};

/**
 * Pane-scoped recovery — one throw must not white-screen the whole app.
 * Copy report includes boundary id + component stack for freeze diagnostics.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info });
    try {
      console.error(`[NOVA ErrorBoundary:${this.props.boundaryId}]`, error, info?.componentStack);
    } catch { /* ignore */ }
  }

  private reloadPane = () => {
    this.setState({ error: null, info: null });
  };

  private copyReport = async () => {
    const { boundaryId } = this.props;
    const { error, info } = this.state;
    const text = [
      `NOVA ErrorBoundary · ${boundaryId}`,
      `at: ${new Date().toISOString()}`,
      `message: ${error?.message || 'unknown'}`,
      error?.stack ? `stack:\n${error.stack}` : '',
      info?.componentStack ? `componentStack:\n${info.componentStack}` : '',
    ].filter(Boolean).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      } catch { /* ignore */ }
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const title = this.props.fallbackTitle || 'This pane hit an error';
    return (
      <div
        className="h-full min-h-0 flex flex-col items-center justify-center gap-3 px-6 text-center bg-nova-navy-950"
        role="alert"
        data-nova-error-boundary={this.props.boundaryId}
      >
        <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-content-tertiary">
          NOVA · {this.props.boundaryId}
        </p>
        <p className="text-sm font-medium text-content-primary">{title}</p>
        <p className="text-xs text-content-secondary max-w-md leading-relaxed break-words">
          {error.message || 'Unexpected render failure'}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
          <button
            type="button"
            onClick={this.reloadPane}
            className="px-3 py-1.5 text-xs rounded-md bg-white/10 hover:bg-white/15 text-content-primary"
          >
            Reload pane
          </button>
          <button
            type="button"
            onClick={() => { void this.copyReport(); }}
            className="px-3 py-1.5 text-xs rounded-md border border-white/15 text-content-secondary hover:text-content-primary"
          >
            Copy report
          </button>
        </div>
      </div>
    );
  }
}
