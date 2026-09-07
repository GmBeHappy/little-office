import th from "./th.json";
export type Locale = "en" | "th";
type Params = Record<string, string | number>;
const thai: Record<string, string> = th;
const format = (text: string, params: Params) =>
  text.replace(/\{(\w+)\}/g, (match, key) => String(params[key] ?? match));
// Server notices keep their English wire format. Match only known templates;
// participant names and user-entered content are never translated.
const templates = Object.keys(thai)
  .filter((key) => key.includes("{"))
  .map((key) => {
    const names = [...key.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
    const pattern = key
      .split(/\{\w+\}/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("(.+?)");
    return { key, names, pattern: new RegExp(`^${pattern}$`, "s") };
  });
export function translate(
  locale: Locale,
  key: string,
  params?: Params,
): string {
  if (locale === "en") return format(key, params || {});
  if (thai[key]) return format(thai[key], params || {});
  for (const template of templates) {
    const match = key.match(template.pattern);
    if (match) {
      const values = Object.fromEntries(
        template.names.map((name, i) => [
          name,
          name === "error" || name === "map"
            ? translate(locale, match[i + 1])
            : match[i + 1],
        ]),
      );
      return format(thai[template.key], values);
    }
  }
  return key;
}
