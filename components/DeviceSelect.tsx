"use client";
import { useI18n } from "@/lib/i18n";
import type { useOfficeMedia } from "./Media";
import { Select } from "./Select";
import { useId } from "react";
import { Field, FieldLabel } from "./ui/field";
export function DeviceSelect({
  media,
  kind,
}: {
  media: ReturnType<typeof useOfficeMedia>;
  kind: MediaDeviceKind;
}) {
  const { t } = useI18n();
  const id = useId();
  const [label, value, saved, numbered] =
    kind === "audioinput"
      ? [
          "Microphone",
          media.input,
          "Saved microphone · allow access or reconnect it",
          "Microphone {number}",
        ]
      : kind === "audiooutput"
        ? [
            "Speakers / headphones",
            media.output,
            "Saved speaker · allow access or reconnect it",
            "Speaker {number}",
          ]
        : [
            "Camera",
            media.videoInput,
            "Saved camera · allow access or reconnect it",
            "Camera {number}",
          ];
  const devices = media.devices.filter(
    (d) => d.kind === kind && d.deviceId && d.deviceId !== "default",
  );
  return (
    <Field>
      <FieldLabel htmlFor={id}>{t(label)}</FieldLabel>
      <Select
        id={id}
        label={t(label)}
        value={value}
        disabled={
          media.deviceBusy || (kind === "audiooutput" && !media.outputSupported)
        }
        onChange={(id) => void media.switchDevice(kind, id)}
        options={[
          { value: "", label: t("System default") },
          ...(value && !devices.some((d) => d.deviceId === value)
            ? [{ value, label: t(saved) }]
            : []),
          ...devices.map((d, i) => ({
            value: d.deviceId,
            label: d.label || t(numbered, { number: i + 1 }),
          })),
        ]}
      />
    </Field>
  );
}
