"use client";
import { I18nProvider, LanguageToggle, useI18n } from "@/lib/i18n";
import { useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  AudioLines,
  MonitorUp,
  PenTool,
  Leaf,
  Sparkles,
  Code2,
  LockKeyhole,
  Video,
  Check,
  Globe2,
  Heart,
  Server,
} from "lucide-react";
import s from "./Landing.module.css";
import Brand from "./Brand";
const donationUrl = (() => {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_DONATION_URL || "");
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
})();
const places = [
  {
    id: "zen-small",
    name: "Sakura Garden",
    note: "A little calm for your next big idea.",
    icon: "✿",
  },
  {
    id: "beach-small",
    name: "Summer Cove",
    note: "Good conversations. A different kind of tide.",
    icon: "☀",
  },
  {
    id: "camping-small",
    name: "Pine Camp",
    note: "A shared basecamp for whatever comes next.",
    icon: "♧",
  },
  {
    id: "space-small",
    name: "Lunar Outpost",
    note: "For teams with ideas a little out of this world.",
    icon: "✦",
  },
];
export default function Landing() {
  return (
    <I18nProvider>
      <LandingContent />
    </I18nProvider>
  );
}
function LandingContent() {
  const { t, locale } = useI18n();
  const [place, setPlace] = useState(0);
  const current = places[place];
  return (
    <div className={s.page} lang={locale}>
      <a className={s.skip} href="#main">
        {t("Skip to content")}
      </a>
      <header className={s.header}>
        <a
          className={s.brand}
          href="#"
          aria-label={t("Little Office Cloud home")}
        >
          <Brand />
          <span className={s.cloud}>CLOUD</span>
        </a>
        <nav aria-label={t("Main navigation")}>
          <a href="#together">{t("Why Little Office")}</a>
          <a href="#spaces">{t("The spaces")}</a>
          <a href="#plans">{t("Cloud or self-hosted")}</a>
          <a href="#support">{t("Support us")}</a>
        </nav>
        <div className={s.navActions}>
          <LanguageToggle />
          <a className={s.navButton} href="/workspaces">
            {t("Create your office")} <ArrowUpRight size={16} />
          </a>
        </div>
      </header>
      <main id="main">
        <section className={s.hero}>
          <div className={s.heroCopy}>
            <div className={s.eyebrow}>
              <span /> {t("A LITTLE SPACE. A LOT MORE TOGETHER.")}
            </div>
            <h1>
              {t("Different places.")}
              <br />
              {t("Same")} <span>{t("little office.")}</span>
              <sup>✳</sup>
            </h1>
            <p>
              {t(
                "A cozy shared world for your team. Walk over for a quick hello, find a quiet corner, or make something great together.",
              )}
            </p>
            <div className={s.actions}>
              <a className={s.primary} href="/workspaces">
                {t("Create your office")} <ArrowRight size={18} />
              </a>
              <a className={s.textLink} href="#together">
                {t("Take a little tour")} <span>↘</span>
              </a>
            </div>
            <div className={s.heroNote}>
              <Leaf size={15} />{" "}
              {t("Built for people, not another calendar invite.")}
            </div>
          </div>
          <div className={s.heroArt}>
            <div className={s.artHeading}>
              <span>{t("YOUR TEAM’S LITTLE CORNER OF THE INTERNET")}</span>
              <span>↗</span>
            </div>
            <div className={s.window}>
              <div className={s.windowBar}>
                <span className={s.dots}>● ● ●</span>
                <span>{t("Team garden")}</span>
                <span className={s.previewBadge}>
                  {t("Illustrated preview")}
                </span>
              </div>
              <div className={s.mapArea}>
                <img
                  className={s.mapImage}
                  src="/landing/zen-small.svg"
                  alt={t(
                    "Pixel-art sakura garden with cozy workspaces, a koi pond, and cherry blossom trees",
                  )}
                  width="1120"
                  height="720"
                />
                <div className={`${s.person} ${s.ava}`}>
                  <span>{t("Morning, team! ☀")}</span>
                  <img src="/landing/sage.svg" width="46" height="62" alt="" />
                  <b>Ava</b>
                </div>
                <div className={`${s.person} ${s.jun}`}>
                  <img src="/landing/gold.svg" width="46" height="62" alt="" />
                  <b>Jun</b>
                </div>
                <div className={s.roomLabel}>
                  <LockKeyhole size={11} /> {t("A quiet little meeting")}
                </div>
              </div>
              <div className={s.previewTools}>
                <span>
                  <i /> {t("Around the garden")}
                </span>
                <div>
                  <AudioLines size={16} />
                  <Video size={16} />
                  <MonitorUp size={16} />
                  <PenTool size={16} />
                </div>
                <span>{t("Say hello →")}</span>
              </div>
            </div>
            <div className={s.floatingNote}>
              <span className={s.noteIcon}>
                <AudioLines size={20} />
              </span>
              <div>
                <strong>{t("Closer feels better.")}</strong>
                <small>{t("Conversation starts with a little walk.")}</small>
              </div>
              <span>✦</span>
            </div>
          </div>
        </section>
        <div className={s.ribbon}>
          <span>{t("LESS “CAN YOU HEAR ME?”")}</span>
          <span>✳</span>
          <strong>{t("More “nice to see you.”")}</strong>
          <span>✳</span>
          <span>{t("MAKE ROOM FOR THE SMALL MOMENTS")}</span>
        </div>
        <section className={s.together} id="together">
          <div className={s.sectionIntro}>
            <div>
              <div className={s.eyebrow}>
                {t("WORK, WITH A LITTLE MORE LIFE")}
              </div>
              <h2>
                {t("The good parts of an office.")}
                <br />
                {t("Wherever you happen to be.")}
              </h2>
            </div>
            <p>
              {t(
                "Bring back the easy conversations and the feeling of being on the same team. Leave the commute behind.",
              )}
            </p>
          </div>
          <div className={s.features}>
            <article>
              <div className={s.featureDrawing}>
                <img src="/landing/sage.svg" alt="" />
                <span className={s.voiceWave}>▂ ▅ █ ▅ ▂</span>
                <img src="/landing/gold.svg" alt="" />
              </div>
              <AudioLines size={22} />
              <h3>{t("A hello is just a walk away.")}</h3>
              <p>
                {t(
                  "Nearby voice makes casual conversations feel natural. Step into a meeting room when it’s time to focus.",
                )}
              </p>
              <span className={s.featureTag}>
                {t("NEARBY VOICE + MEETING ROOMS")}
              </span>
            </article>
            <article>
              <div className={`${s.featureDrawing} ${s.shareDrawing}`}>
                <div>
                  <span>↗</span>
                  <i />
                  <i />
                  <i />
                </div>
                <div className={s.smallWindow}>✦</div>
              </div>
              <MonitorUp size={22} />
              <h3>{t("Less explaining. More showing.")}</h3>
              <p>
                {t(
                  "Turn on your camera, share your screen, or sketch an idea together on a collaborative whiteboard.",
                )}
              </p>
              <span className={s.featureTag}>
                {t("VIDEO + SCREEN SHARE + WHITEBOARD")}
              </span>
            </article>
            <article>
              <div className={`${s.featureDrawing} ${s.natureDrawing}`}>
                <img src="/landing/cat.svg" alt={t("Pixel cat")} />
                <span>✿</span>
                <img src="/landing/rabbit.svg" alt={t("Pixel rabbit")} />
              </div>
              <Sparkles size={22} />
              <h3>{t("A place that feels like yours.")}</h3>
              <p>
                {t(
                  "Pick a world, create your avatar, and enjoy a few tiny distractions. A little personality goes a long way.",
                )}
              </p>
              <span className={s.featureTag}>
                {t("CUSTOM AVATARS + LIVING WORLDS")}
              </span>
            </article>
          </div>
        </section>
        <section
          className={s.mediaQuality}
          aria-labelledby="media-quality-title"
        >
          <div className={s.eyebrow}>
            {t("EVERY DETAIL. EVERY EXPRESSION.")}
          </div>
          <h2 id="media-quality-title">{t("Feel closer. See clearer.")}</h2>
          <p>
            {t(
              "From a quick hello to a detailed design review, bring your team into the picture.",
            )}
          </p>
          <div className={s.qualityGrid}>
            <article>
              <MonitorUp size={25} />
              <span>{t("UP TO 4K · 60 FPS")}</span>
              <h3>{t("High-resolution screen sharing")}</h3>
              <p>
                {t(
                  "Share the fine details. Present designs, code, and demos with crisp visuals and smooth motion.",
                )}
              </p>
            </article>
            <article>
              <AudioLines size={25} />
              <span>{t("CLEAR VOICE AUDIO")}</span>
              <h3>{t("Every conversation, clearer")}</h3>
              <p>
                {t(
                  "Catch the little things in every conversation, whether you’re chatting nearby or meeting as a team.",
                )}
              </p>
            </article>
            <article>
              <Video size={25} />
              <span>{t("HIGH-RESOLUTION VIDEO")}</span>
              <h3>{t("More face-to-face time")}</h3>
              <p>
                {t(
                  "Make room for everyone with high-resolution camera video and an expansive fullscreen grid.",
                )}
              </p>
            </article>
          </div>
          <small>
            {t(
              "Voice, video, screen sharing, and whiteboards are available when configured. Quality depends on your device, browser, connection, and selected setting.",
            )}
          </small>
        </section>
        <section className={s.spaces} id="spaces">
          <div className={s.eyebrow}>{t("SAME TEAM. FRESH SCENERY.")}</div>
          <h2>{t("Where shall we work today?")}</h2>
          <p>
            {t("A garden kind of morning. A beach kind of afternoon.")}
            <br />
            {t("Explore a few of the worlds built into Little Office.")}
          </p>
          <div
            className={s.tabs}
            role="tablist"
            aria-label={t("Preview a workspace map")}
          >
            {places.map((p, i) => (
              <button
                key={p.id}
                id={`place-${i}`}
                role="tab"
                aria-selected={place === i}
                aria-controls="place-preview"
                tabIndex={place === i ? 0 : -1}
                onClick={() => setPlace(i)}
                onKeyDown={(e) => {
                  let next = i;
                  if (e.key === "ArrowRight") next = (i + 1) % places.length;
                  else if (e.key === "ArrowLeft")
                    next = (i + places.length - 1) % places.length;
                  else if (e.key === "Home") next = 0;
                  else if (e.key === "End") next = places.length - 1;
                  else return;
                  e.preventDefault();
                  setPlace(next);
                  document.getElementById(`place-${next}`)?.focus();
                }}
              >
                <span>{p.icon}</span>
                {t(p.name)}
              </button>
            ))}
          </div>
          <div
            className={s.spacePreview}
            id="place-preview"
            role="tabpanel"
            aria-labelledby={`place-${place}`}
          >
            <img
              src={`/landing/${current.id}.svg`}
              width="1120"
              height="720"
              alt={t("{name} workspace map preview", { name: t(current.name) })}
            />
            <div>
              <span>
                <strong>{t(current.name)}</strong>
                <small>{t(current.note)}</small>
              </span>
              <span className={s.mapCount}>
                0{place + 1} / 04 <ArrowUpRight size={21} />
              </span>
            </div>
          </div>
        </section>
        <section className={s.launch} id="launch">
          <div>
            <div className={s.eyebrow}>
              {t("YOUR OWN LITTLE WORLD, WITHOUT THE SETUP")}
            </div>
            <h2>
              {t("A new home for")}
              <br />
              {t("your remote team.")}
            </h2>
            <p>
              {t(
                "Your office, your choice. Let us host it for you, or run the open-source app on your own server. The same core features, without feature paywalls.",
              )}
            </p>
            <ul>
              <li>
                <Check size={16} />{" "}
                {t("Free to use. Every core feature included.")}
              </li>
              <li>
                <Check size={16} /> {t("One Google account, all your teams")}
              </li>
              <li>
                <Check size={16} /> {t("Workspace roles and member management")}
              </li>
            </ul>
          </div>
          <div className={s.launchCard}>
            <span className={s.launchBadge}>
              {t("CLOUD EDITION · COMING SOON")}
            </span>
            <Globe2 size={38} />
            <h3>{t("Make yourself at home.")}</h3>
            <p>
              {t(
                "Start at the workspace dashboard. Google sign-in will open once configured; live Cloud offices are still in preparation.",
              )}
            </p>
            <a className={s.createButton} href="/workspaces">
              {t("Create your office")} <ArrowUpRight size={16} />
            </a>
            <a
              href="https://github.com/GmBeHappy/little-office"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("Explore the open-source core")} <ArrowUpRight size={16} />
            </a>
          </div>
        </section>
        <section className={s.plans} id="plans" aria-labelledby="plans-title">
          <div className={s.eyebrow}>
            {t("TWO WAYS TO MAKE YOURSELF AT HOME")}
          </div>
          <h2 id="plans-title">{t("Same features. Your choice of home.")}</h2>
          <p>
            {t(
              "Free software, every core feature, no feature paywalls. Choose who runs your office and where your data lives.",
            )}
          </p>
          <div className={s.planGrid}>
            <article>
              <Globe2 size={28} />
              <span className={s.planBadge}>
                {t("WE TAKE CARE OF THE HOSTING")}
              </span>
              <h3>Little Office Cloud</h3>
              <div className={s.planPrice}>
                {t("Free")} <small>{t("Community supported")}</small>
              </div>
              <p>
                {t(
                  "For teams who want a place to meet without managing a server.",
                )}
              </p>
              <ul>
                {[
                  "All core features included",
                  "We run the servers and updates",
                  "Your data lives on our managed infrastructure",
                  "Sign in with Google and invite your team",
                ].map((item) => (
                  <li key={item}>
                    <Check size={17} />
                    {t(item)}
                  </li>
                ))}
              </ul>
              <a className={s.primary} href="/workspaces">
                {t("Create your office")}
                <ArrowUpRight size={17} />
              </a>
              <small>
                {t(
                  "Preview: up to 5 owned workspaces and 50 members per workspace.",
                )}
              </small>
            </article>
            <article>
              <Server size={28} />
              <span className={s.planBadge}>
                {t("YOUR SERVER. YOUR DATA.")}
              </span>
              <h3>{t("Self-hosted")}</h3>
              <div className={s.planPrice}>
                {t("Free")} <small>{t("Your infrastructure costs")}</small>
              </div>
              <p>
                {t(
                  "For teams who want full control over their office and the data they store.",
                )}
              </p>
              <ul>
                {[
                  "All core features included",
                  "Store your data on infrastructure you control",
                  "Manage your own updates, backups, and access",
                  "Capacity depends on your server, not a paid plan",
                ].map((item) => (
                  <li key={item}>
                    <Check size={17} />
                    {t(item)}
                  </li>
                ))}
              </ul>
              <a
                className={s.selfHostButton}
                href="https://github.com/GmBeHappy/little-office#readme"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("Set up your own server")}
                <ArrowUpRight size={17} />
              </a>
              <small>
                {t("Open-source core. Bring your own server and storage.")}
              </small>
            </article>
          </div>
          <p className={s.planNote}>
            {t(
              "Voice, video, screen sharing, whiteboards, avatars, and maps belong in both editions. Donations support hosting, not feature unlocks.",
            )}
          </p>
        </section>
        <section
          className={s.support}
          id="support"
          aria-labelledby="support-title"
        >
          <div className={s.supportIcon}>
            <Heart size={32} />
          </div>
          <div>
            <div className={s.eyebrow}>
              {t("A LITTLE SUPPORT GOES A LONG WAY")}
            </div>
            <h2 id="support-title">
              {t("Help keep Cloud free for everyone.")}
            </h2>
            <p>
              {t(
                "Free offices still need servers. Your optional donation helps cover hosting, storage, and bandwidth, so more teams can find a little place to work together.",
              )}
            </p>
            <small>
              {t(
                "No premium features. No obligation. Just a way to support a service you enjoy.",
              )}
            </small>
          </div>
          <div className={s.supportAction}>
            {donationUrl ? (
              <>
                <a href={donationUrl} target="_blank" rel="noopener noreferrer">
                  <Heart size={17} />
                  {t("Support free Cloud")}
                </a>
                <small>
                  {t(
                    "Donate through our support page. Every little bit helps.",
                  )}
                </small>
              </>
            ) : (
              <>
                <button type="button" disabled>
                  <Heart size={17} />
                  {t("Donations opening soon")}
                </button>
                <small>
                  {t(
                    "We’re preparing a donation link. Thank you for cheering us on.",
                  )}
                </small>
              </>
            )}
          </div>
        </section>
        <section className={s.faq} id="questions">
          <div>
            <div className={s.eyebrow}>{t("A FEW LITTLE ANSWERS")}</div>
            <h2>
              {t("Wondering about")}
              <br />
              {t("something?")}
            </h2>
          </div>
          <div>
            {[
              [
                "Can I create a workspace today?",
                "This preview supports workspace creation, invitations, and live offices. Available sign-in methods depend on your server configuration. The self-hosted source is available on GitHub.",
              ],
              [
                "How does nearby voice work?",
                "Inside an office, move your avatar near a teammate to join their conversation. Meeting rooms give a group a separate place to talk. Your microphone controls stay within reach.",
              ],
              [
                "Is Little Office Cloud free?",
                "Cloud is planned as a free, community-supported service with all core features included. Donations help cover infrastructure, not unlock features. The current preview has capacity limits shown in the comparison above.",
              ],
              [
                "Is the Cloud version open source?",
                "The web app and multi-workspace backend share the Little Office repository. You can use the hosted service or deploy the same core on your own server.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>
                  {t(q)}
                  <span>+</span>
                </summary>
                <p>{t(a)}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <footer className={s.footer}>
        <a className={s.brand} href="#">
          <Brand />
          <span className={s.cloud}>CLOUD</span>
        </a>
        <span>{t("A little closer, wherever you work. ✦")}</span>
        <a
          href="https://github.com/GmBeHappy/little-office"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Code2 size={17} /> {t("Built on Little Office")}{" "}
          <ArrowUpRight size={14} />
        </a>
      </footer>
    </div>
  );
}
