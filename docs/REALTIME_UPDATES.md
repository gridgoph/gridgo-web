# Live resource updates

The app sends its active role context to the API, which verifies membership and record access. Notification list, stream and read-all share that context. Minimal invalidation events refresh authorized data, and reconnect/foreground reconciliation covers missed ephemeral events.

Live reloads are coalesced and serialized. Request deadlines bound token acquisition, headers and response body reads so a stalled transport cannot block the next queued refresh. Identity changes revalidate protected data, while account boundaries clear old caches and reject late responses.

Refresh backing data without reinitializing in-progress form drafts. Notification links use existing protected workspace destinations. Operations and Admin share the authorized service review queue. Inbox delivery and live data refresh use the authenticated SSE connection.
