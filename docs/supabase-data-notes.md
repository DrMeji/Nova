# Supabase data notes (ARK hosted backend)

## model_catalog

Local ARK Engine catalog is authoritative for desktop inference. If `model_catalog` is empty on hosted Supabase, ARK desktop does not depend on it for GGUF picks — seed rows only if cloud sync of catalog metadata is needed.

## chat_messages

There is **no UPDATE RLS policy** on `chat_messages`. Edits and deletes are **local-only** in the desktop app; cloud history is append-only from the client.

## profiles / display_name

OAuth sign-in should set `display_name` from provider metadata; email sign-in uses email local-part. Verify trigger on hosted project when enabling social login.

## Realtime (DM / calls)

Confirm `supabase_realtime` publication includes `dm_messages` and call signaling tables on the hosted project before shipping Message/Call nav.

## lookup_ark_user

Client must throttle lookups (max ~1 req / 2s). Never request or display another user's email — ARK ID only.

## provider_connections

Metadata only — **no API key columns**. Keys stay in OS-encrypted desktop storage.
