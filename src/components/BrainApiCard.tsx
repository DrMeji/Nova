import { useEffect, useState } from 'react';
import { getBrainUrl } from '@/lib/brainUrl';

export function BrainApiCard({ compact }: { compact?: boolean } = {}) {
  const [brainUrl, setBrainUrl] = useState(() => getBrainUrl());
  const [brainToken, setBrainToken] = useState('');
  const [brainTokenCopied, setBrainTokenCopied] = useState(false);
  const [brainContractVersion, setBrainContractVersion] = useState('');
  const [brainPackaged, setBrainPackaged] = useState<boolean | null>(null);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    void Promise.all([
      window.novaDesktop?.brainTokenGet?.(),
      window.novaDesktop?.brainStatus?.(),
    ]).then(([token, status]) => {
      if (token?.url) setBrainUrl(token.url);
      if (token?.token) setBrainToken(token.token);
      if (typeof token?.packaged === 'boolean') setBrainPackaged(token.packaged);
      if (status?.url) setBrainUrl(status.url);
      if (status?.contractVersion) setBrainContractVersion(status.contractVersion);
    }).catch(() => undefined);
  }, []);

  return (
    <div className={`rounded-xl border border-surface-border p-4 space-y-3 ${compact ? '' : ''}`}>
      <div>
        <p className="text-sm font-medium text-content-primary">Brain API</p>
        <p className="text-[11px] text-content-tertiary mt-0.5 leading-relaxed">
          Loopback only on this PC. Any local app can connect to NOVA as its brain over HTTP.
          Packaged NOVA requires a bearer token on chat routes.
        </p>
        {brainPackaged === false && !brainToken ? (
          <p className="text-[11px] font-medium text-amber-400 mt-1.5">
            Auth: off (dev). unpackaged builds accept chat without a token.
          </p>
        ) : brainToken ? (
          <p className="text-[11px] text-emerald-400/90 mt-1.5">Auth: on · bearer token required for chat</p>
        ) : null}
        <p className="text-[10px] text-content-tertiary mt-1">
          Contract {brainContractVersion || 'unavailable'} · port {(() => {
            try { return new URL(brainUrl).port || 'default'; } catch { return 'unavailable'; }
          })()}
        </p>
      </div>
      <div className="grid gap-2">
        <label className="block text-[11px] text-content-tertiary">URL</label>
        <input readOnly value={brainUrl} className="nova-input font-mono text-xs" />
        <label className="block text-[11px] text-content-tertiary">Token</label>
        <input
          readOnly
          type="password"
          value={brainToken || '(none. dev mode)'}
          className="nova-input font-mono text-xs"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="nova-btn-secondary text-xs"
          onClick={() => {
            const clip = `URL: ${brainUrl}\nToken: ${brainToken || ''}`;
            void navigator.clipboard.writeText(clip).then(() => {
              setBrainTokenCopied(true);
              window.setTimeout(() => setBrainTokenCopied(false), 1600);
            });
          }}
        >
          {brainTokenCopied ? 'Copied' : 'Copy URL + token'}
        </button>
        <button
          type="button"
          className="nova-btn-secondary text-xs"
          onClick={() => {
            const curl = `curl "${brainUrl}/v1/chat" -H "Authorization: Bearer ${brainToken}" -H "Content-Type: application/json" -d "{\\"message\\":\\"Hello from my app\\"}"`;
            void navigator.clipboard.writeText(curl).then(() => {
              setFlash('Sample curl copied');
              window.setTimeout(() => setFlash(''), 1600);
            });
          }}
        >
          Copy sample curl
        </button>
        <button
          type="button"
          className="nova-btn-secondary text-xs"
          onClick={() => {
            void window.novaDesktop?.brainTokenRotate?.().then(res => {
              if (res?.token) setBrainToken(res.token);
              if (res?.url) setBrainUrl(res.url);
              setFlash('Token rotated. update Lindsay/clients');
              window.setTimeout(() => setFlash(''), 2200);
            });
          }}
        >
          Rotate token
        </button>
      </div>
      {flash ? <p className="text-[11px] text-emerald-400/90">{flash}</p> : null}
    </div>
  );
}
