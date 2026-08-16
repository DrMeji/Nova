/** Live Google Calendar helpers (OAuth access token). */

import { apiErrorMessage, desktopRequest } from '@/lib/httpDesktop';

async function calGet<T>(token: string, path: string) {
  const url = path.startsWith('http') ? path : `https://www.googleapis.com/calendar/v3${path}`;
  const res = await desktopRequest(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token.trim()}` },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Calendar error'));
  return res.data as T;
}

async function calPost<T>(token: string, path: string, body: unknown) {
  const url = path.startsWith('http') ? path : `https://www.googleapis.com/calendar/v3${path}`;
  const res = await desktopRequest(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Calendar error'));
  return res.data as T;
}

export async function verifyCalendarToken(token: string): Promise<{ label: string }> {
  if (!token.trim()) throw new Error('Paste a Google OAuth access token with Calendar scope');
  const list = await calGet<{ items?: { id?: string; summary?: string; primary?: boolean }[] }>(
    token,
    '/users/me/calendarList?maxResults=5',
  );
  const primary = list.items?.find(c => c.primary) || list.items?.[0];
  return { label: primary?.summary || 'Google Calendar' };
}

type CalEvent = {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  htmlLink?: string;
  location?: string;
};

export async function listUpcomingEvents(token: string, limit = 10) {
  const now = new Date().toISOString();
  const result = await calGet<{ items?: CalEvent[] }>(
    token,
    `/calendars/primary/events?maxResults=${limit}&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(now)}`,
  );
  return result.items ?? [];
}

/** Default window: start = +1 hour from now, duration 1 hour. */
function defaultEventWindow() {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start, end };
}

/** Pull a short title from create/schedule phrasing. */
function parseEventTitle(userText: string): string {
  const titled = userText.match(
    /(?:create|add|schedule|new)\s+(?:an?\s+)?(?:event|meeting|appointment)\s*(?:called|titled|named|:)\s*(.+)$/i,
  );
  if (titled?.[1]) {
    return titled[1].replace(/[?.!]+$/, '').trim().slice(0, 120) || 'Event from ARK';
  }
  const bare = userText.match(
    /(?:create|add|schedule|new)\s+(?:an?\s+)?(?:event|meeting|appointment)\s+(.+)$/i,
  );
  if (bare?.[1]) {
    const cleaned = bare[1]
      .replace(/\b(for|at|on|tomorrow|today|next\s+\w+)\b.*$/i, '')
      .replace(/[?.!]+$/, '')
      .trim()
      .slice(0, 120);
    if (cleaned) return cleaned;
  }
  return 'Event from ARK';
}

export async function createCalendarEvent(
  token: string,
  summary: string,
  start: Date,
  end: Date,
) {
  return calPost<CalEvent>(token, '/calendars/primary/events', {
    summary: summary.slice(0, 200),
    start: {
      dateTime: start.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    },
    end: {
      dateTime: end.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    },
  });
}

function formatWhen(ev: CalEvent) {
  const start = ev.start?.dateTime || ev.start?.date;
  if (!start) return '';
  try {
    const d = new Date(start);
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: ev.start?.dateTime ? 'numeric' : undefined,
      minute: ev.start?.dateTime ? '2-digit' : undefined,
    });
  } catch {
    return start;
  }
}

export async function runCalendarLive(
  token: string,
  userText: string,
  opts?: { permissions?: string[] },
): Promise<string> {
  const account = await verifyCalendarToken(token);
  const lower = userText.toLowerCase();
  const perms = opts?.permissions || [];

  if (/\b(create|add|schedule|new)\b/.test(lower) && /event|meeting|appointment/.test(lower)) {
    if (perms.length > 0 && !perms.includes('write')) {
      return [
        'Calendar · permission needed',
        '',
        'Creating events needs Write. Enable it under Plugins → Google Calendar → Permissions.',
      ].join('\n');
    }
    const title = parseEventTitle(userText);
    const { start, end } = defaultEventWindow();
    const created = await createCalendarEvent(token, title, start, end);
    const when = formatWhen(created) || start.toLocaleString();
    return [
      `Calendar · created (@${account.label})`,
      '',
      created.summary || title,
      when,
      created.htmlLink || '',
      '',
      'Live write via Google Calendar API.',
    ].filter(Boolean).join('\n');
  }

  const events = await listUpcomingEvents(token);
  if (events.length === 0) {
    return [
      `Calendar · upcoming (@${account.label})`,
      '',
      'No upcoming events on the primary calendar.',
    ].join('\n');
  }

  return [
    `Calendar · upcoming (@${account.label})`,
    '',
    ...events.slice(0, 10).map((ev, i) => {
      const when = formatWhen(ev);
      const loc = ev.location ? ` · ${ev.location}` : '';
      return `${i + 1}. ${ev.summary || '(no title)'}${when ? `\n   ${when}` : ''}${loc}${ev.htmlLink ? `\n   ${ev.htmlLink}` : ''}`;
    }),
    '',
    'Live data from Google Calendar.',
  ].join('\n');
}
