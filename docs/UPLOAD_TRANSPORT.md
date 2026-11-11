# Portal upload transport

Every multipart helper in `src/lib/api/client.ts` uses the shared XHR
transport in `src/lib/api/multipart.ts`. Ordinary JSON and download requests
still use the existing 20-second deadline. Clerk token acquisition before an
upload also keeps that deadline.

Uploads have a 60-second sending stall timeout, reset only when the browser
reports more bytes sent, and a 15-minute overall transfer/storage budget.
The overall budget matches the API's default `UPLOAD_REQUEST_TIMEOUT_MS`;
the API remains responsible for each purpose's size and media-type limits.
Once the body is sent, the stall timer stops: waiting for storage is bounded
by the remaining overall budget. No upload or save is retried automatically.

The portal's shared toast host subscribes to upload activity, so the same
notice appears for every helper and inside dialog workflows. It shows:

- Preparing upload while acquiring the token.
- Sending file, with real multipart bytes and percentage when the browser
  reports a total; otherwise the progress bar is indeterminate.
- Saving file after the body has been sent, while awaiting the API response.
- File stored only after a successful API response. Attaching the file or
  saving the surrounding form can still be pending.
- A specific recovery message for a stall, cancellation or timeout. A lost
  response during saving does not claim that the file was never stored.

The notice's Cancel action aborts the current upload, and an `AbortSignal`
passed to the shared request wrapper retains its cancellation reason.
Cancelling a transfer cannot undo storage or a form save already accepted
by the server. Completed notices dismiss after five seconds; interrupted
ones remain until dismissed.

Regression tests cover an upload progressing past 20 seconds, the scout's
fully-sent-body/25-second-response case, stalls, the overall cap, cancellation,
token delays, structured API errors, and the separate visible phases.
