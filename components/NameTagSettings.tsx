"use client";
import { Mic } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { nameTagColors, type NameTagPreferences } from "@/lib/name-tags";
import { Field, FieldLabel } from "./ui/field";
export function NameTagSettings({
  value,
  onChange,
  name,
}: {
  value: NameTagPreferences;
  onChange: (value: NameTagPreferences) => void;
  name: string;
}) {
  const { t } = useI18n();
  const colors = nameTagColors(value);
  return (
    <section className="name-tag-settings" aria-labelledby="name-tag-heading">
      <div>
        <h4 id="name-tag-heading">{t("Avatar name tags")}</h4>
        <p className="muted">
          {t(
            "Adjust all name tags on your map. Saved for your account on this browser.",
          )}
        </p>
      </div>
      <div className="name-tag-preview" aria-label={t("Name tag preview")}>
        <span
          style={{
            fontSize: value.size,
            background: colors.background,
            color: colors.text,
            padding: `${(3 * value.size) / 12}px ${(6 * value.size) / 12}px`,
            textShadow: colors.outline
              ? "0 1px 2px #faf7e9, 0 -1px 2px #faf7e9"
              : undefined,
          }}
        >
          {t("{name} · you", { name })}
          <Mic size={(14 * value.size) / 12} aria-hidden="true" />
        </span>
      </div>
      <Field>
        <FieldLabel htmlFor="name-tag-size">
          {t("Name tag size")}{" "}
          <output htmlFor="name-tag-size">{value.size} px</output>
        </FieldLabel>
        <input
          id="name-tag-size"
          type="range"
          min={8}
          max={16}
          step={1}
          value={value.size}
          onChange={(event) =>
            onChange({ ...value, size: Number(event.target.value) })
          }
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="name-tag-opacity">
          {t("Background opacity")}{" "}
          <output htmlFor="name-tag-opacity">{value.opacity}%</output>
        </FieldLabel>
        <input
          id="name-tag-opacity"
          type="range"
          min={0}
          max={100}
          step={5}
          value={value.opacity}
          aria-describedby="name-tag-opacity-help"
          onChange={(event) =>
            onChange({ ...value, opacity: Number(event.target.value) })
          }
        />
        <p id="name-tag-opacity-help" className="muted">
          {t("0% is transparent. Name text stays visible.")}
        </p>
      </Field>
    </section>
  );
}
