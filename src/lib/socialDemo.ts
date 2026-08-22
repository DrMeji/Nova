/** Demo Networking / Message / Notifications data for local UI work.
 * Production (GitHub) builds never include these — Connect stays empty until real users post.
 */

import type { ArkContact, DirectMessage, MessageAttachment, NetworkPost } from '@/lib/arkSocial';

/** True only in `npm run electron:dev` / Vite DEV. Packaged releases are always clean. */
export const SOCIAL_DEMO_ENABLED = import.meta.env.DEV;

export function buildDemoNetworkPosts(myArkId: string): NetworkPost[] {
  if (!SOCIAL_DEMO_ENABLED) return [];
  const mine = myArkId || '1110000';
  const now = Date.now();
  const ago = (h: number) => new Date(now - h * 3600_000).toISOString();

  const everyone: NetworkPost[] = [
    {
      id: 'demo-post-1',
      ownerArkId: '4820193',
      ownerName: 'Maya Chen',
      title: 'Coffee shop booking site',
      summary: 'Need a clean booking flow + dark menu page before Friday.',
      details: 'Stack: HTML/CSS/JS in ARK Code. Want walk-in vs reservation toggle, and a simple admin list. Happy to pay for a solid pass.',
      intent: 'help',
      paying: true,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(2),
    },
    {
      id: 'demo-post-2',
      ownerArkId: '7193044',
      ownerName: 'Jordan Lee',
      title: 'Habit tracker iPhone mock',
      summary: 'Sharing a first SwiftUI layout for feedback on spacing.',
      details: 'Not stuck — just want eyes on the home screen and streak ring before I lock the design.',
      intent: 'share',
      paying: false,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(5),
    },
    {
      id: 'demo-post-3',
      ownerArkId: '3301882',
      ownerName: 'Sam Okonkwo',
      title: 'Portfolio with case studies',
      summary: 'Looking for someone to tighten typography and mobile nav.',
      details: 'Three case study pages + contact. Prefer someone who’s shipped marketing sites before.',
      intent: 'help',
      paying: true,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(9),
    },
    {
      id: 'demo-post-4',
      ownerArkId: '9056711',
      ownerName: 'Riley Park',
      title: 'Local recipe notebook',
      summary: 'Offline-first notes app — open to co-build the search UI.',
      details: 'ARK Code project. Search should filter by tag and cook time. No payment — just collaboration.',
      intent: 'help',
      paying: false,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(14),
    },
    {
      id: 'demo-post-5',
      ownerArkId: '2288440',
      ownerName: 'Alex Rivera',
      title: 'Pixel pet idle game',
      summary: 'Finished v1 loop — sharing for playtest notes.',
      details: 'Feed / play / sleep buttons work. Want feedback on whether the pet feels alive enough.',
      intent: 'share',
      paying: false,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(20),
    },
    {
      id: 'demo-post-6',
      ownerArkId: '6612039',
      ownerName: 'Chris Nguyen',
      title: 'Expense splitter for roommates',
      summary: 'Stuck on equal vs custom split math — will pay for a fix.',
      details: 'Need fair split when one person covers dinner and another covers rent. Web UI already sketched.',
      intent: 'help',
      paying: true,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(28),
    },
    {
      id: 'demo-post-7',
      ownerArkId: '1044882',
      ownerName: 'Taylor Brooks',
      title: 'Weather dashboard widgets',
      summary: 'Sharing a clean card layout for temp + forecast rows.',
      details: 'Free API + ARK Code. Looking for feedback on spacing and dark theme contrast.',
      intent: 'share',
      paying: false,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(3),
    },
    {
      id: 'demo-post-8',
      ownerArkId: '8733001',
      ownerName: 'Nina Patel',
      title: 'Indie band merch store',
      summary: 'Need product grid + cart before tour weekend — will pay.',
      details: 'Simple static site first. Size chart page and checkout placeholder.',
      intent: 'help',
      paying: true,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(4),
    },
    {
      id: 'demo-post-9',
      ownerArkId: '5521190',
      ownerName: 'Omar Hassan',
      title: 'Study timer with playlists',
      summary: 'Pomodoro UI done — open to co-build the sound picker.',
      details: 'Focus / break modes work. Want nicer animation when a cycle ends.',
      intent: 'help',
      paying: false,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(6),
    },
    {
      id: 'demo-post-10',
      ownerArkId: '4482011',
      ownerName: 'Elena Vogt',
      title: 'Photo booth strip generator',
      summary: 'Finished strip layout — sharing for playtest.',
      details: 'Four frames + caption. Curious if the print preview feels right.',
      intent: 'share',
      paying: false,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(8),
    },
    {
      id: 'demo-post-11',
      ownerArkId: '9910334',
      ownerName: 'Dev Patel',
      title: 'Kanban for freelancers',
      summary: 'Drag-and-drop columns are buggy on touch — will pay for a fix.',
      details: 'Todo / Doing / Done. Need smooth mobile drag without jumping cards.',
      intent: 'help',
      paying: true,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(10),
    },
    {
      id: 'demo-post-12',
      ownerArkId: '7766502',
      ownerName: 'Priya Shah',
      title: 'Language flashcards',
      summary: 'Deck flip animation ready — feedback on empty states welcome.',
      details: 'Front/back cards with keyboard shortcuts. Dark mode only for now.',
      intent: 'share',
      paying: false,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(12),
    },
    {
      id: 'demo-post-13',
      ownerArkId: '3344556',
      ownerName: 'Marcus Cole',
      title: 'Gym PR logger',
      summary: 'Need charts for weekly progress — open to paid help.',
      details: 'Log sets/reps locally. Want a simple line chart without a heavy library.',
      intent: 'help',
      paying: true,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(15),
    },
    {
      id: 'demo-post-14',
      ownerArkId: '2200987',
      ownerName: 'Sofia Berg',
      title: 'Minimal markdown notes',
      summary: 'Live preview works — sharing for typography notes.',
      details: 'Split pane editor. Prefer opinions on line height and code blocks.',
      intent: 'share',
      paying: false,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(18),
    },
    {
      id: 'demo-post-15',
      ownerArkId: '6677881',
      ownerName: 'Kenji Sato',
      title: 'RGB lighting controller UI',
      summary: 'Color picker + presets — stuck on saved scenes list.',
      details: 'Web mock only. Need a clean list with rename/delete actions.',
      intent: 'help',
      paying: false,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(22),
    },
    {
      id: 'demo-post-16',
      ownerArkId: '8899002',
      ownerName: 'Aisha Rahman',
      title: 'Wedding RSVP microsite',
      summary: 'Form works — will pay for prettier confirmation page.',
      details: 'Names + meal choice. Want a calm thank-you screen that matches the invite.',
      intent: 'help',
      paying: true,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(25),
    },
    {
      id: 'demo-post-17',
      ownerArkId: '1122334',
      ownerName: 'Luis Ortega',
      title: 'Street food map pins',
      summary: 'Map markers done — open for icon/style feedback.',
      details: 'Static map with hover cards. No backend yet.',
      intent: 'share',
      paying: false,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(30),
    },
    {
      id: 'demo-post-18',
      ownerArkId: '5566778',
      ownerName: 'Hannah Kim',
      title: 'Podcast episode page',
      summary: 'Need waveform + chapter list before launch — can pay.',
      details: 'Single episode template. Prefer accessible play controls.',
      intent: 'help',
      paying: true,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(33),
    },
    {
      id: 'demo-post-19',
      ownerArkId: '4455667',
      ownerName: 'Grace Lin',
      title: 'Plant watering reminders',
      summary: 'Calendar chips work — want nicer empty-day art.',
      details: 'Local reminders only. Open to icon suggestions.',
      intent: 'share',
      paying: false,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(35),
    },
    {
      id: 'demo-post-20',
      ownerArkId: '7788990',
      ownerName: 'Ben Carter',
      title: 'Board game score tracker',
      summary: 'Need a rematch flow — happy to pay for a clean pass.',
      details: 'Multiplayer local scores. Rematch should reset without losing history.',
      intent: 'help',
      paying: true,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(37),
    },
    {
      id: 'demo-post-21',
      ownerArkId: '2233445',
      ownerName: 'Yuki Tanaka',
      title: 'Tea shop menu board',
      summary: 'Digital menu mock — feedback on type hierarchy welcome.',
      details: 'Categories + prices. Prefer mobile-first columns.',
      intent: 'share',
      paying: false,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(40),
    },
  ];

  const yours: NetworkPost[] = [
    {
      id: 'demo-mine-1',
      ownerArkId: mine,
      ownerName: 'You',
      title: 'Hello World page',
      summary: 'My first ARK Code page — open to polish tips.',
      details: 'Black background, white title, optional theme toggle. Curious if the layout feels centered on phone.',
      intent: 'share',
      paying: false,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(1),
    },
    {
      id: 'demo-mine-2',
      ownerArkId: mine,
      ownerName: 'You',
      title: 'Need CSS help on landing hero',
      summary: 'Hero image keeps fighting the headline on small screens.',
      details: 'Want full-bleed hero with one headline + CTA. Willing to pay for a clean responsive pass.',
      intent: 'help',
      paying: true,
      visibility: 'public',
      githubUrl: '',
      allowedArkIds: [],
      createdAt: ago(7),
    },
    {
      id: 'demo-mine-3',
      ownerArkId: mine,
      ownerName: 'You',
      title: 'Private draft — client dashboard',
      summary: 'Only visible to you in Yours while testing the feed.',
      details: 'Placeholder private post so the Yours tab isn’t empty.',
      intent: 'help',
      paying: false,
      visibility: 'private',
      allowedArkIds: [],
      githubUrl: '',
      createdAt: ago(11),
    },
  ];

  return attachFeedMeta([...yours, ...everyone]);
}

function attachFeedMeta(posts: NetworkPost[]): NetworkPost[] {
  const types = ['web', 'software', 'game', 'mobile', 'site', 'web'];
  const platforms = ['web', 'desktop', 'windows', 'macos', 'ios', 'android', 'web'];
  const labels = ['Web Dev', 'CSS', 'Design', 'UI/UX', 'iOS', 'Product', 'Game Dev', 'Software'];
  return posts.map((p, i) => ({
    ...p,
    projectType: p.projectType || types[i % types.length],
    platform: p.platform || platforms[i % platforms.length],
    categoryLabel: p.categoryLabel || labels[i % labels.length],
    views: p.views ?? 180 + ((i * 173) % 2400),
    replies: p.replies ?? (i * 7) % 48,
    saves: p.saves ?? 4 + ((i * 11) % 96),
    allowDiscussion: p.allowDiscussion !== false,
    codeRequiresApproval: p.codeRequiresApproval !== false,
  }));
}

export function buildDemoContacts(): ArkContact[] {
  if (!SOCIAL_DEMO_ENABLED) return [];
  const agoDays = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();
  return [
    { arkId: '4820193', displayName: 'Maya Chen', addedAt: agoDays(14) },
    { arkId: '7193044', displayName: 'Jordan Lee', addedAt: agoDays(21) },
    { arkId: '3301882', displayName: 'Sam Okonkwo', addedAt: agoDays(10) },
    { arkId: '9056711', displayName: 'Riley Park', addedAt: agoDays(30) },
    { arkId: '2288440', displayName: 'Alex Rivera', addedAt: agoDays(18) },
    { arkId: '6612039', displayName: 'Chris Nguyen', addedAt: agoDays(25) },
    { arkId: '1044882', displayName: 'Taylor Brooks', addedAt: agoDays(40) },
    { arkId: '8733001', displayName: 'Nina Patel', addedAt: agoDays(12) },
    { arkId: '5521190', displayName: 'Omar Hassan', addedAt: agoDays(8) },
    { arkId: '4482011', displayName: 'Elena Vogt', addedAt: agoDays(16) },
    { arkId: '9910334', displayName: 'Dev Patel', addedAt: agoDays(22) },
    { arkId: '7766502', displayName: 'Priya Shah', addedAt: agoDays(28) },
    { arkId: '3344556', displayName: 'Marcus Cole', addedAt: agoDays(35) },
    { arkId: '2200987', displayName: 'Sofia Berg', addedAt: agoDays(45) },
  ];
}

/** Demo peers who “texted you” and are waiting — green unread dot preview (dev only). */
const DEMO_UNREAD_LIST = ['4820193', '9056711', '5521190', '4482011'] as const;
export const DEMO_UNREAD_ARK_IDS: readonly string[] = SOCIAL_DEMO_ENABLED ? DEMO_UNREAD_LIST : [];

const RANDOM_CHATS: Record<string, string[]> = {
  '4820193': ['Did you see that game last night?', 'lol that ending was wild', 'You free later?'],
  '7193044': ['I’m grabbing tacos, want anything?', 'Bring hot sauce', 'On my way'],
  '3301882': [], // full demo thread below
  '9056711': ['Movie night Friday?', 'I’m down for anything funny', 'Deal — my place at 8'],
  '2288440': ['That playlist is fire', 'Send me the link again', 'Got it, thanks!'],
  '6612039': ['Traffic is ridiculous today', 'Take the side street', 'Already did 🙌'],
  '1044882': ['Happy birthday!!', 'Thank you 🎂', 'Party pics later'],
  '8733001': ['Dogs or cats?', 'Dogs forever', 'Fair enough haha'],
  '5521190': ['Rain again…', 'Stay inside and game', 'Hey — you there?'],
  '4482011': ['New cafe opened downtown', 'Is the matcha good?', 'Ping me when you’re free'],
  '9910334': ['Forgot my charger 😭', 'I have an extra', 'You’re a lifesaver'],
  '7766502': ['Random: pineapple on pizza?', 'Never', 'Correct answer'],
  '3344556': ['Gym at 6?', 'Let’s go', 'See you there'],
  '2200987': ['That show is so good', 'No spoilers!!', 'Okay okay 🤐'],
};

/** Minutes ago for last demo message — newer = higher in list. Unread peers are freshest. */
const DEMO_LAST_MSG_MINUTES: Record<string, number> = {
  '4820193': 4,
  '9056711': 12,
  '5521190': 20,
  '4482011': 35,
  '3301882': 8,
  '7193044': 90,
  '2288440': 180,
  '6612039': 400,
  '1044882': 900,
  '8733001': 1200,
  '9910334': 2000,
  '7766502': 3500,
  '3344556': 5000,
  '2200987': 8000,
};

/** Short preview line for the people list. */
export function demoPreviewLine(peerArkId: string): string | null {
  if (peerArkId === '3301882') return 'On it — ping me when you’re free to hop on a quick call.';
  const lines = RANDOM_CHATS[peerArkId];
  if (!lines?.length) return null;
  return lines[lines.length - 1] || null;
}

/** Demo thread with Sam (files) or light random back-and-forth for others. */
export function buildDemoThread(myArkId: string, peerArkId: string): DirectMessage[] {
  if (!SOCIAL_DEMO_ENABLED) return [];
  const me = myArkId || '3218815';
  const t = Date.now();
  const at = (m: number) => new Date(t - m * 60_000).toISOString();

  if (peerArkId === '3301882') {
    const them = '3301882';
    return [
      {
        id: 'demo-dm-1',
        senderArkId: them,
        recipientArkId: me,
        body: 'Hey — saw your Networking post. Still need help on the booking flow?',
        createdAt: at(48),
      },
      {
        id: 'demo-dm-2',
        senderArkId: me,
        recipientArkId: them,
        body: 'Yeah. Walk-in vs reservation is fighting me on mobile.',
        createdAt: at(45),
      },
      {
        id: 'demo-dm-3',
        senderArkId: them,
        recipientArkId: me,
        body: 'Send me the folder and I’ll sketch a cleaner layout.',
        createdAt: at(42),
      },
      {
        id: 'demo-dm-4',
        senderArkId: me,
        recipientArkId: them,
        body: '',
        createdAt: at(40),
        attachment: {
          name: 'coffee-shop-site',
          sizeLabel: '12 files · 2.4 MB',
          kind: 'folder',
        },
      },
      {
        id: 'demo-dm-5',
        senderArkId: them,
        recipientArkId: me,
        body: 'Got it. Here’s a first pass on the hero + booking card.',
        createdAt: at(28),
      },
      {
        id: 'demo-dm-6',
        senderArkId: them,
        recipientArkId: me,
        body: '',
        createdAt: at(27),
        attachment: {
          name: 'booking-hero-v1.zip',
          sizeLabel: '1.8 MB',
          kind: 'file',
        },
      },
      {
        id: 'demo-dm-7',
        senderArkId: me,
        recipientArkId: them,
        body: 'This looks solid. Can you also tweak the menu page spacing?',
        createdAt: at(12),
      },
      {
        id: 'demo-dm-8',
        senderArkId: them,
        recipientArkId: me,
        body: 'On it — ping me when you’re free to hop on a quick call.',
        createdAt: at(8),
      },
    ];
  }

  const lines = RANDOM_CHATS[peerArkId];
  if (!lines?.length) return [];
  const lastMin = DEMO_LAST_MSG_MINUTES[peerArkId] ?? 60;
  // End on their message for unread demos; otherwise end on yours.
  const unread = (DEMO_UNREAD_ARK_IDS as readonly string[]).includes(peerArkId);
  const seq = unread && lines.length % 2 === 0 ? [...lines, lines[lines.length - 1]] : lines;
  return seq.map((body, i) => {
    const fromThem = i % 2 === 0;
    return {
      id: `demo-dm-${peerArkId}-${i}`,
      senderArkId: fromThem ? peerArkId : me,
      recipientArkId: fromThem ? me : peerArkId,
      body,
      createdAt: at(lastMin + (seq.length - 1 - i) * 6),
    };
  });
}

export type DemoGroup = {
  id: string;
  name: string;
  memberArkIds: string[];
  messages: {
    id: string;
    senderArkId: string;
    body: string;
    createdAt: string;
    attachment?: MessageAttachment;
  }[];
};

export function buildDemoGroups(myArkId: string): DemoGroup[] {
  if (!SOCIAL_DEMO_ENABLED) return [];
  const me = myArkId || '3218815';
  const t = Date.now();
  const at = (m: number) => new Date(t - m * 60_000).toISOString();
  return [
    {
      id: 'demo-group-1',
      name: 'Weekend plans',
      memberArkIds: [me, '4820193', '7193044', '8733001'],
      messages: [
        { id: 'dg1-1', senderArkId: '4820193', body: 'Beach or brunch?', createdAt: at(90) },
        { id: 'dg1-2', senderArkId: '7193044', body: 'Brunch first, beach after', createdAt: at(85) },
        { id: 'dg1-3', senderArkId: me, body: 'I’m in — 11am?', createdAt: at(80) },
        { id: 'dg1-4', senderArkId: '8733001', body: 'Perfect. I’ll grab a table.', createdAt: at(70) },
      ],
    },
    {
      id: 'demo-group-2',
      name: 'Game night',
      memberArkIds: [me, '3301882', '1044882', '6612039'],
      messages: [
        { id: 'dg2-1', senderArkId: '1044882', body: 'Who’s bringing snacks?', createdAt: at(120) },
        { id: 'dg2-2', senderArkId: me, body: 'I got chips + soda', createdAt: at(110) },
        { id: 'dg2-3', senderArkId: '3301882', body: 'I’ll bring controllers', createdAt: at(100) },
      ],
    },
  ];
}

export type DemoNotification = {
  id: string;
  kind: 'friend' | 'update' | 'model' | 'system';
  title: string;
  body: string;
  createdAt: string;
  unread?: boolean;
};

export function buildDemoNotifications(): DemoNotification[] {
  if (!SOCIAL_DEMO_ENABLED) return [];
  const t = Date.now();
  const at = (h: number) => new Date(t - h * 3600_000).toISOString();
  return [
    {
      id: 'n1',
      kind: 'friend',
      title: 'Friend request',
      body: 'Maya Chen (4820193) wants to connect.',
      createdAt: at(0.5),
      unread: true,
    },
    {
      id: 'n2',
      kind: 'update',
      title: 'New update available',
      body: 'ARK 0.1.102 is ready — restart to install.',
      createdAt: at(2),
      unread: true,
    },
    {
      id: 'n3',
      kind: 'model',
      title: 'Model finished downloading',
      body: 'Qwen2.5-Coder 7B is ready in Local AI.',
      createdAt: at(5),
      unread: true,
    },
    {
      id: 'n4',
      kind: 'friend',
      title: 'Friend request',
      body: 'Jordan Lee (7193044) sent you a request.',
      createdAt: at(8),
    },
    {
      id: 'n5',
      kind: 'system',
      title: 'Welcome to ARK',
      body: 'Tip: share your 7-digit ARK ID from the sidebar.',
      createdAt: at(12),
    },
    {
      id: 'n6',
      kind: 'model',
      title: 'Model ready',
      body: 'Llama 3.2 Vision finished installing.',
      createdAt: at(18),
    },
    {
      id: 'n7',
      kind: 'update',
      title: 'Update installed',
      body: 'You’re on the latest ARK build.',
      createdAt: at(26),
    },
    {
      id: 'n8',
      kind: 'friend',
      title: 'Friend request accepted',
      body: 'Sam Okonkwo is now in your Message list.',
      createdAt: at(30),
    },
    {
      id: 'n9',
      kind: 'system',
      title: 'New user nearby',
      body: 'Someone on your network just opened ARK for the first time.',
      createdAt: at(40),
    },
    {
      id: 'n10',
      kind: 'model',
      title: 'Download paused',
      body: 'A model download paused — open Models to resume.',
      createdAt: at(48),
    },
  ];
}
