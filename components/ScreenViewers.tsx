"use client";
import { Eye } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { Person } from "@/shared/world";
import { Avatar } from "./Avatar";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "./ui/dialog";

export function ScreenViewers({
  people,
  publisher,
  name,
  compact = false,
}: {
  people: Person[];
  publisher: string;
  name: string;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const viewers = people.filter(
    (person) => person.watching === publisher && person.id !== publisher,
  );
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="plain"
          className={compact ? "screen-viewers-badge" : "media-view-button"}
          aria-label={t("Viewers of {name}'s screen", { name })}
        >
          <Eye size={compact ? 14 : 18} />
          <span aria-live="polite">
            {t("{count} watching", { count: viewers.length })}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="screen-viewers-dialog" closeLabel={t("Close")}>
        <DialogTitle>{t("Who's watching")}</DialogTitle>
        <p>{t("People with {name}'s large screen view open.", { name })}</p>
        {viewers.length ? (
          <ul aria-label={t("Screen viewers")}>
            {viewers.map((person) => (
              <li key={person.id}>
                <Avatar color={person.avatar} />
                <span>{person.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t("No one is watching yet.")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
