"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ImageUp,
  LayoutPanelTop,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { SamplePhoto } from "@/app/supplier/_components/SamplePhoto";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  actionsFor,
  orderMoved,
  orderWithFirst,
  orderWithout,
  photoName,
  photoTitle,
  removalCopy,
  REMOVAL_ORDERS_NOTE,
} from "@/lib/listing-photos";
import { LISTING_CAPS, type Listing } from "@/lib/listings";
import { cn } from "@/lib/utils";

type Photo = Listing["photos"][number];

export type PhotoReorder = {
  action: "remove" | "make-first" | "earlier" | "later";
  fileId: string;
  fileIds: string[];
};

type Props = {
  photos: Photo[];
  listingName: string;
  busy: boolean;
  /** The photo being swapped for a new upload, shown as "Replacing…". */
  replacingFileId: string | null;
  adding: boolean;
  /** What the last change did, in a sentence ("Photo 2 is now the wide sample."). */
  notice: string | null;
  /** Id of the Add control; the readiness checklist focuses it. */
  addId: string;
  onAdd: (file: File) => void;
  onReplace: (photo: Photo, index: number, file: File) => void;
  onReorder: (change: PhotoReorder) => void;
};

const ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * The listing's sample photos: the wide sample first and wide, then the rest.
 *
 * Each photo carries a labelled "Edit" menu — Make wide sample, Move earlier,
 * Move later, Replace photo, Remove photo — so nothing hides behind a bare
 * icon. The shop reported an unlabelled trash icon it never found (#90).
 */
export function ListingPhotoManager({
  photos,
  listingName,
  busy,
  replacingFileId,
  adding,
  notice,
  addId,
  onAdd,
  onReplace,
  onReorder,
}: Props) {
  const [toRemove, setToRemove] = useState<string | null>(null);
  const addInput = useRef<HTMLInputElement | null>(null);
  const replaceInput = useRef<HTMLInputElement | null>(null);
  const replaceTarget = useRef<string | null>(null);
  const triggers = useRef(new Map<string, HTMLElement>());
  const addButton = useRef<HTMLButtonElement | null>(null);
  // Where keyboard focus lands once the API answers: the photo that moved, the
  // photo now in the removed one's place, or Add when none are left.
  const focusNext = useRef<{ fileId?: string; index?: number } | null>(null);

  const ids = photos.map((photo) => photo.fileId);

  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    const fileId =
      target.fileId && ids.includes(target.fileId)
        ? target.fileId
        : target.index != null
          ? ids[Math.min(target.index, ids.length - 1)]
          : undefined;
    const element = fileId ? triggers.current.get(fileId) : addButton.current;
    (element ?? addButton.current)?.focus();
    // `photos` is the API's answer; run once per answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  function reorder(action: PhotoReorder["action"], fileId: string) {
    const index = ids.indexOf(fileId);
    const fileIds =
      action === "remove"
        ? orderWithout(ids, fileId)
        : action === "make-first"
          ? orderWithFirst(ids, fileId)
          : orderMoved(ids, fileId, action === "earlier" ? -1 : 1);
    focusNext.current = action === "remove" ? { index } : { fileId };
    onReorder({ action, fileId, fileIds });
  }

  function pickReplacement(fileId: string) {
    replaceTarget.current = fileId;
    replaceInput.current?.click();
  }

  const removeIndex = toRemove ? ids.indexOf(toRemove) : -1;
  const removing = removeIndex >= 0 ? photos[removeIndex] : null;
  const copy = removing ? removalCopy(removeIndex, photos.length) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="@container">
        <ul
          aria-label="Sample photos, in board order"
          className="m-0 grid list-none grid-cols-2 gap-3 p-0 @md:grid-cols-3 @2xl:grid-cols-4"
        >
          {photos.map((photo, index) => {
            const name = photoName(index);
            const title = photoTitle(index);
            const replacing = replacingFileId === photo.fileId;
            const wide = index === 0;
            return (
              <li
                key={photo.fileId}
                className={cn("flex min-w-0 flex-col gap-2", wide && "col-span-2")}
              >
                <div className="relative">
                  <SamplePhoto
                    fileId={photo.fileId}
                    alt={`${title}: ${photo.altText ?? listingName}`}
                    className={wide ? "aspect-[4/3]" : undefined}
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "text-caption pointer-events-none absolute top-2.5 left-2.5 rounded-full border px-2 py-0.5",
                      wide
                        ? "border-transparent bg-foreground text-background"
                        : "border-outline bg-card/90 text-foreground",
                    )}
                  >
                    {title}
                  </span>
                  {replacing ? (
                    <span className="text-caption bg-card/85 text-foreground absolute inset-0 flex items-center justify-center">
                      Replacing…
                    </span>
                  ) : null}
                </div>
                {wide ? (
                  <p className="text-caption text-text-secondary m-0">
                    Clients see this one first.
                  </p>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    disabled={busy}
                    aria-label={`Edit ${name}`}
                    ref={(element: HTMLElement | null) => {
                      if (element) triggers.current.set(photo.fileId, element);
                      else triggers.current.delete(photo.fileId);
                    }}
                    render={
                      <Button
                        type="button"
                        size="sm"
                        fullWidth
                        className="justify-between"
                      />
                    }
                  >
                    <span className="flex items-center gap-1.5">
                      <Pencil aria-hidden />
                      Edit
                    </span>
                    <ChevronDown aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-56">
                    <PhotoMenuItems
                      actions={actionsFor(index, photos.length)}
                      onChoose={(action) => {
                        if (action === "replace") pickReplacement(photo.fileId);
                        else if (action === "remove") setToRemove(photo.fileId);
                        else reorder(action, photo.fileId);
                      }}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
          {photos.length < LISTING_CAPS.photos ? (
            <li
              className={cn("flex min-w-0 flex-col", photos.length === 0 && "col-span-2")}
            >
              <button
                ref={addButton}
                type="button"
                id={addId}
                disabled={busy}
                onClick={() => addInput.current?.click()}
                className={cn(
                  "rounded-card border-outline bg-surface text-foreground hover:bg-overlay-hover active:bg-overlay-pressed flex min-h-11 min-w-11 cursor-pointer flex-col items-center justify-center gap-1 border border-dashed px-3 text-center disabled:cursor-not-allowed disabled:opacity-[0.38]",
                  photos.length === 0 ? "aspect-[4/3]" : "aspect-square",
                )}
              >
                <Plus aria-hidden className="size-5" />
                <span className="text-body">
                  {adding
                    ? "Adding…"
                    : photos.length === 0
                      ? "Add the wide sample"
                      : "Add photo"}
                </span>
                <span className="text-caption text-text-muted">
                  {photos.length} of {LISTING_CAPS.photos}
                </span>
              </button>
            </li>
          ) : null}
        </ul>
      </div>

      <p
        role="status"
        aria-live="polite"
        className="text-caption text-text-secondary m-0 min-h-5"
      >
        {notice ?? ""}
      </p>

      <input
        ref={addInput}
        type="file"
        aria-label="Add a sample photo"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            focusNext.current = { index: photos.length };
            onAdd(file);
          }
          event.target.value = "";
        }}
      />
      <input
        ref={replaceInput}
        type="file"
        aria-label="Choose a replacement photo"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          const fileId = replaceTarget.current;
          replaceTarget.current = null;
          event.target.value = "";
          const index = fileId ? ids.indexOf(fileId) : -1;
          const photo = index >= 0 ? photos[index] : undefined;
          if (!file || !photo) return;
          focusNext.current = { index };
          onReplace(photo, index, file);
        }}
      />

      <AlertDialog
        open={removing != null}
        onOpenChange={(open) => {
          if (!open) setToRemove(null);
        }}
      >
        <AlertDialogContent>
          {removing && copy ? (
            <>
              <AlertDialogHeader>
                <div className="w-24 self-center sm:self-start">
                  <SamplePhoto
                    fileId={removing.fileId}
                    alt={`${photoTitle(removeIndex)}: ${removing.altText ?? listingName}`}
                    enlarge={false}
                  />
                </div>
                <AlertDialogTitle>{copy.title}</AlertDialogTitle>
                <AlertDialogDescription>
                  {copy.body} {REMOVAL_ORDERS_NOTE}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction
                  variant="danger"
                  onClick={() => {
                    const fileId = removing.fileId;
                    setToRemove(null);
                    reorder("remove", fileId);
                  }}
                >
                  {copy.action}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const ITEM_COPY = {
  "make-first": { label: "Make wide sample", icon: LayoutPanelTop },
  earlier: { label: "Move earlier", icon: ArrowLeft },
  later: { label: "Move later", icon: ArrowRight },
  replace: { label: "Replace photo…", icon: ImageUp },
  remove: { label: "Remove photo…", icon: Trash2 },
} as const;

function PhotoMenuItems({
  actions,
  onChoose,
}: {
  actions: ReturnType<typeof actionsFor>;
  onChoose: (action: ReturnType<typeof actionsFor>[number]) => void;
}) {
  const arrange = actions.filter((action) => action !== "replace" && action !== "remove");
  const change = actions.filter((action) => action === "replace" || action === "remove");
  return (
    <>
      {arrange.length ? (
        <>
          <DropdownMenuGroup>
            {arrange.map((action) => {
              const { label, icon: Icon } = ITEM_COPY[action];
              return (
                <DropdownMenuItem key={action} onClick={() => onChoose(action)}>
                  <Icon aria-hidden />
                  {label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
        </>
      ) : null}
      <DropdownMenuGroup>
        {change.map((action) => {
          const { label, icon: Icon } = ITEM_COPY[action];
          return (
            <DropdownMenuItem
              key={action}
              variant={action === "remove" ? "destructive" : "default"}
              onClick={() => onChoose(action)}
            >
              <Icon aria-hidden />
              {label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuGroup>
    </>
  );
}
