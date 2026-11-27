"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/input";
import {
  ensureLeaflet,
  TILE_OPTIONS,
  TILE_URL,
  useDarkTheme,
  type LeafletMap,
  type LeafletMarker,
} from "@/components/maps/leaflet";
import { getAdminKiosk, updateAdminKiosk, type KioskMachine, type PrinterStatus } from "@/lib/api/kiosk";

const STATUSES: { id: PrinterStatus; label: string }[] = [
  { id: "online", label: "Online" },
  { id: "offline", label: "Offline" },
  { id: "out_of_paper", label: "Out of paper" },
  { id: "paper_jam", label: "Paper jam" },
];

function pesos(minor: number) {
  return (minor / 100).toFixed(2);
}

function toMinor(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export function KioskDesk() {
  const [machine, setMachine] = useState<KioskMachine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paper, setPaper] = useState("240");
  const [status, setStatus] = useState<PrinterStatus>("online");
  const [bw, setBw] = useState("1.00");
  const [color, setColor] = useState("5.00");
  const [lat, setLat] = useState("7.0731");
  const [lng, setLng] = useState("125.6128");
  const [qr, setQr] = useState("");
  const [qrEnabled, setQrEnabled] = useState(true);
  const [baseUrl, setBaseUrl] = useState("");

  const load = useCallback(async () => {
    try {
      const next = (await getAdminKiosk()).machine;
      setMachine(next);
      setPaper(String(next.paperCount));
      setStatus(next.printerStatus);
      setBw(pesos(next.priceBwMinor));
      setColor(pesos(next.priceColorMinor));
      setLat(String(next.lat));
      setLng(String(next.lng));
      setQr(next.paymentQrTemplate);
      setQrEnabled(next.paymentQrEnabled !== false);
      setBaseUrl(next.publicBaseUrl);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the kiosk.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    const priceBwMinor = toMinor(bw);
    const priceColorMinor = toMinor(color);
    const paperCount = Number(paper);
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (priceBwMinor == null || priceColorMinor == null) {
      setNotice("Enter the A4 prices in pesos.");
      return;
    }
    if (!Number.isInteger(paperCount) || paperCount < 0 || paperCount > 2000) {
      setNotice("Sheets in the tray must be a whole number from 0 to 2000.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const next = await updateAdminKiosk({
        paperCount,
        printerStatus: status,
        priceBwMinor,
        priceColorMinor,
        lat: latitude,
        lng: longitude,
        paymentQrTemplate: qr,
        paymentQrEnabled: qrEnabled,
        publicBaseUrl: baseUrl,
      });
      setMachine(next.machine);
      setPaper(String(next.machine.paperCount));
      setStatus(next.machine.printerStatus);
      setBw(pesos(next.machine.priceBwMinor));
      setColor(pesos(next.machine.priceColorMinor));
      setLat(String(next.machine.lat));
      setLng(String(next.machine.lng));
      setQr(next.machine.paymentQrTemplate);
      setQrEnabled(next.machine.paymentQrEnabled !== false);
      setBaseUrl(next.machine.publicBaseUrl);
      setNotice("Kiosk updated. The screen picks this up within a few seconds.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not save the kiosk.");
    } finally {
      setBusy(false);
    }
  }

  async function rotateKey() {
    setBusy(true);
    try {
      const next = await updateAdminKiosk({ rotateCoinKey: true });
      setMachine(next.machine);
      setNotice("Coin key replaced. Update the C# service before the next coin.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not replace the coin key.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !machine) {
    return (
      <ErrorState
        body={error}
        action={<Button variant="secondary" onClick={() => void load()}>Retry</Button>}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Print kiosk</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {machine?.name ?? "GRIDGO Kiosk · Davao"} · tray, printer, A4 prices, and the map pin the kiosk screen follows.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Sheets in tray
            <Input inputMode="numeric" value={paper} onChange={(event) => setPaper(event.target.value)} />
          </label>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Printer status</p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant={status === item.id ? "default" : "outline"}
                  onClick={() => setStatus(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              A4 black & white (₱)
              <Input inputMode="decimal" value={bw} onChange={(event) => setBw(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              A4 color (₱)
              <Input inputMode="decimal" value={color} onChange={(event) => setColor(event.target.value)} />
            </label>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border px-3 py-3">
            <div>
              <p className="text-sm font-semibold">QR payment</p>
              <p className="mt-1 text-sm font-normal text-muted-foreground">
                {qrEnabled
                  ? "Customers can pay by scanning a QR."
                  : "QR payment is off. The kiosk takes coins only."}
              </p>
            </div>
            <Switch
              checked={qrEnabled}
              disabled={!machine}
              aria-label="QR payment"
              onCheckedChange={(checked) => setQrEnabled(checked === true)}
            />
          </div>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Payment QR
            <textarea
              value={qr}
              onChange={(event) => setQr(event.target.value)}
              rows={3}
              className="rounded-[var(--radius-field)] border border-input bg-card px-3 py-2 text-sm"
            />
            <span className="font-normal text-muted-foreground">
              Use {"{amount}"}, {"{order}"}, and {"{session}"}. The kiosk fills them for each job.
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Kiosk address for the upload QR
            <Input
              value={baseUrl}
              placeholder="http://192.168.1.20:5174"
              onChange={(event) => setBaseUrl(event.target.value)}
            />
            <span className="font-normal text-muted-foreground">
              The phone opens this address after scanning. Leave it blank to use the address in the kiosk browser.
            </span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Latitude
              <Input value={lat} onChange={(event) => setLat(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Longitude
              <Input value={lng} onChange={(event) => setLng(event.target.value)} />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="primary" disabled={busy || !machine} onClick={() => void save()}>
              {busy ? "Saving…" : "Save kiosk"}
            </Button>
            {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
          </div>
        </section>

        <div className="flex flex-col gap-4">
          <KioskMap lat={lat} lng={lng} name={machine?.name ?? "GRIDGO Kiosk"} onPick={(nextLat, nextLng) => {
            setLat(nextLat.toFixed(5));
            setLng(nextLng.toFixed(5));
          }} />
          <section className="rounded-2xl border border-border bg-card p-4 text-sm">
            <p className="font-bold">Coin slot</p>
            <p className="mt-1 text-muted-foreground">
              The C# acceptor posts ₱1, ₱5, ₱10, or ₱20 while the pay screen is open.
            </p>
            <p className="mt-3 break-all font-mono text-xs">{machine?.coinKey ?? "Loading key…"}</p>
            <p className="mt-2 text-muted-foreground">
              POST {machine?.hardware.coinsPath ?? "/api/kiosk/hardware/coins"} with header {machine?.hardware.header ?? "X-Kiosk-Coin-Key"}.
            </p>
            <Button className="mt-3" variant="outline" disabled={busy || !machine} onClick={() => void rotateKey()}>
              Replace coin key
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}

function KioskMap({
  lat,
  lng,
  name,
  onPick,
}: {
  lat: string;
  lng: string;
  name: string;
  onPick: (lat: number, lng: number) => void;
}) {
  const dark = useDarkTheme();
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const latitude = Number(lat);
  const longitude = Number(lng);
  const point: [number, number] = [
    Number.isFinite(latitude) ? latitude : 7.0731,
    Number.isFinite(longitude) ? longitude : 125.6128,
  ];

  useEffect(() => {
    const host = node.current;
    if (!host) return;
    let cancelled = false;
    void ensureLeaflet().then((L) => {
      if (cancelled || !node.current) return;
      const map = L.map(node.current).setView(point, 14) as LeafletMap & {
        on: (event: string, handler: (event: { latlng: { lat: number; lng: number } }) => void) => void;
      };
      L.tileLayer(TILE_URL, TILE_OPTIONS).addTo(map);
      const marker = L.marker(point, {
        icon: L.divIcon({
          className: "",
          html: '<div style="width:18px;height:18px;border-radius:99px;background:#ffde58;border:3px solid #1a1a1a"></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
          popupAnchor: [0, -12],
        }),
        alt: name,
      }).addTo(map);
      marker.bindPopup(name);
      map.on("click", (event) => onPickRef.current(event.latlng.lat, event.latlng.lng));
      mapRef.current = map;
      markerRef.current = marker;
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // The map is created once. Later coordinate edits move the marker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    markerRef.current?.setLatLng(point);
  }, [point[0], point[1]]);

  return (
    <div
      ref={node}
      className={`gg-map h-[360px] overflow-hidden rounded-2xl border border-border ${dark ? "gg-map--dark" : ""}`}
      aria-label="Kiosk location"
    />
  );
}
