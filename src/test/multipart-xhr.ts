export class UploadXhr extends EventTarget {
  static current: UploadXhr;
  upload = new EventTarget();
  status = 201;
  responseText = JSON.stringify({ file: { fileId: "stored" } });
  headers: Record<string, string> = {};
  aborted = false;
  body?: FormData;
  method = "POST";
  url = "";
  constructor() {
    super();
    UploadXhr.current = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: FormData) {
    this.body = body;
  }
  abort() {
    this.aborted = true;
    this.dispatchEvent(new Event("abort"));
  }
  progress(loaded: number, total = 3 * 1024 * 1024) {
    this.upload.dispatchEvent(
      Object.assign(new Event("progress"), {
        loaded,
        total,
        lengthComputable: true,
      }),
    );
  }
  sent() {
    this.upload.dispatchEvent(new Event("load"));
  }
  respond() {
    this.dispatchEvent(new Event("load"));
  }
}

/** Reuse a test's HTTP response fixtures for the XHR upload boundary. */
export class FixtureUploadXhr extends UploadXhr {
  send(body: FormData) {
    super.send(body);
    void fetch(this.url, { method: this.method, headers: this.headers, body })
      .then(async (response) => {
        this.status = response.status;
        this.responseText = await response.text();
        this.sent();
        this.respond();
      })
      .catch(() => this.dispatchEvent(new Event("error")));
  }
}
