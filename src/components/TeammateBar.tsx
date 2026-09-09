import { useMemo, useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { githubPermissionToAccess, type GitHubCollaborator } from '@/lib/github';
import {
  accessLabel,
  AREA_SUGGESTIONS,
  type TeamAccess,
  type TeammateAssignment,
} from '@/lib/arkTeam';
import { formatArkId, isArkUserId, normalizeArkId } from '@/lib/arkUserId';
import { NovaMark } from '@/components/NovaMark';

type Person = GitHubCollaborator & { arkId?: string; displayName?: string };

type Props = {
  people: Person[];
  assignments: TeammateAssignment[];
  myAccess: TeamAccess;
  canInvite: boolean;
  onInvite: (username: string, access: TeamAccess) => void;
  onAssign: (login: string, area: string) => void;
};

function Face({ title }: { person: Person; title: string }) {
  return (
    <span
      title={title}
      className="w-7 h-7 flex items-center justify-center"
    >
      <NovaMark className="w-3.5 h-3.5 text-content-primary" title={title} />
    </span>
  );
}

export function TeammateBar({
  people,
  assignments,
  myAccess,
  canInvite,
  onInvite,
  onAssign,
}: Props) {
  const [open, setOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [access, setAccess] = useState<TeamAccess>('read');
  const [trust, setTrust] = useState(false);

  const areaFor = (login: string) => assignments.find(a => a.login.toLowerCase() === login.toLowerCase())?.area;

  const shown = useMemo(() => people.slice(0, 6), [people]);
  if (!people.length && !canInvite) return null;

  const needsTrust = access === 'write' || access === 'full';

  return (
    <div className="absolute bottom-12 left-3 z-20">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 rounded-full border border-surface-border bg-ark-navy-950/95 pl-1 pr-2.5 py-1 shadow-lg hover:bg-surface-hover"
        title="Teammates on this project"
      >
        <span className="flex -space-x-2">
          {shown.length === 0 ? (
            <span className="w-7 h-7 rounded-full bg-surface-hover border border-surface-border flex items-center justify-center text-[10px] text-content-tertiary">
              +
            </span>
          ) : (
            shown.map(p => (
              <Face
                key={p.login}
                person={p}
                title={`${p.displayName || p.login}${areaFor(p.login) ? ` · ${areaFor(p.login)}` : ''}`}
              />
            ))
          )}
          {people.length > 6 && (
            <span className="w-7 h-7 rounded-full bg-surface-hover border-2 border-ark-navy-950 flex items-center justify-center text-[9px] text-content-secondary">
              +{people.length - 6}
            </span>
          )}
        </span>
        <span className="text-[11px] text-content-secondary pr-0.5">
          {people.length <= 1
            ? (people.length === 1 ? 'Just you' : 'Invite')
            : `${people.length} on this project`}
        </span>
      </button>

      {open && (
        <div className="absolute bottom-11 left-0 w-72 rounded-2xl border border-surface-border bg-ark-navy-950 shadow-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-content-primary">Teammates</p>
            <button type="button" onClick={() => setOpen(false)} className="text-content-tertiary">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {people.length === 0 && (
            <p className="text-[11px] text-content-tertiary mb-2">No teammates yet.</p>
          )}
          <ul className="space-y-2 max-h-48 overflow-auto mb-2">
            {people.map(p => (
              <li key={p.login} className="flex items-start gap-2">
                <Face person={p} title={p.login} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-content-primary truncate">
                    {p.arkId ? (p.displayName || `NOVA ${formatArkId(p.arkId)}`) : `@${p.login}`}
                  </p>
                  <p className="text-[10px] text-content-tertiary">
                    {p.arkId ? formatArkId(p.arkId) : accessLabel(githubPermissionToAccess(p))}
                    {p.arkId ? ` · ${accessLabel(githubPermissionToAccess(p))}` : ''}
                  </p>
                  {canInvite ? (
                    <select
                      value={areaFor(p.login) || ''}
                      onChange={e => onAssign(p.login, e.target.value)}
                      className="mt-1 w-full bg-ark-navy-900 border border-surface-border rounded-md text-[10px] text-content-secondary px-1.5 py-1"
                    >
                      <option value="">Assign an area…</option>
                      {AREA_SUGGESTIONS.map(a => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  ) : areaFor(p.login) ? (
                    <p className="text-[10px] text-sky-300/90 mt-0.5">Working on {areaFor(p.login)}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {canInvite && (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-surface-border py-1.5 text-[11px] text-content-secondary hover:text-content-primary"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Invite teammate
            </button>
          )}
        </div>
      )}

      {inviteOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-ark-navy-950 p-4 shadow-xl">
            <p className="text-sm font-medium text-content-primary mb-3">Invite a teammate</p>
            <input
              value={username}
              onChange={e => setUsername(e.target.value.replace(/^@/, ''))}
              placeholder="NOVA ID or GitHub username"
              className="w-full bg-ark-navy-900 border border-surface-border rounded-lg px-3 py-2 text-sm text-content-primary mb-2"
            />
            <div className="flex gap-1 mb-2">
              {(['read', 'write', 'full'] as TeamAccess[]).map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => {
                    setAccess(a);
                    if (a === 'read') setTrust(false);
                  }}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] ${
                    access === a
                      ? 'border-sky-500/50 bg-sky-500/10 text-sky-200'
                      : 'border-surface-border text-content-tertiary'
                  }`}
                >
                  {accessLabel(a)}
                </button>
              ))}
            </div>
            {needsTrust && (
              <label className="flex items-start gap-2 text-[11px] text-content-secondary mb-3">
                <input type="checkbox" checked={trust} onChange={e => setTrust(e.target.checked)} className="mt-0.5" />
                I trust {isArkUserId(normalizeArkId(username)) ? formatArkId(normalizeArkId(username)) : `@${username || 'this person'}`} with {accessLabel(access).toLowerCase()} on this project.
              </label>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setInviteOpen(false)} className="flex-1 text-xs py-2 rounded-lg text-content-tertiary hover:bg-surface-hover">
                Cancel
              </button>
              <button
                type="button"
                disabled={!username.trim() || (needsTrust && !trust)}
                onClick={() => {
                  onInvite(username.trim(), access);
                  setInviteOpen(false);
                  setUsername('');
                  setAccess('read');
                  setTrust(false);
                }}
                className="flex-1 text-xs py-2 rounded-lg bg-sky-600 text-white disabled:opacity-40"
              >
                Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

