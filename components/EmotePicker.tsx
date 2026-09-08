"use client";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import thai from "emoji-picker-react/dist/data/emojis-th.js";
import { useI18n } from "@/lib/i18n";
export default function EmotePicker({
  choose,
}: {
  choose: (emoji: string) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <EmojiPicker
      key={locale}
      emojiStyle={EmojiStyle.NATIVE}
      theme={Theme.LIGHT}
      emojiData={locale === "th" ? thai : undefined}
      width="100%"
      height={360}
      searchPlaceholder={t("Search emoji")}
      searchClearButtonLabel={t("Clear search")}
      previewConfig={{ showPreview: false }}
      onEmojiClick={(data) => choose(data.emoji)}
    />
  );
}
