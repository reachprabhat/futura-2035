import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient, useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../convex/_generated/api";
import "./style.css";
type Career = {
  title: string;
  description: string[];
  whyItFits: string;
  salaryMinINR: number;
  salaryMaxINR: number;
  salaryBasis: string;
  overseas: string;
  stability: string;
};
type Results = {
  careers: Career[];
  note: string;
  searchKey: string;
  path: string;
  raw: string;
  sources: { title: string; url: string }[];
};
type Story = {
  title: string;
  panels: {
    time: string;
    caption: string;
    imageUrl: string | null;
    imageError?: string;
  }[];
  path: string;
  error?: string;
  raw?: string;
};
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
const message = (e: unknown) =>
  e instanceof ConvexError
    ? String(e.data)
    : "We couldn’t finish that request. Please try again.";
function App() {
  const recommend = useAction(api.ai.recommend),
    illustrate = useAction(api.ai.storyboard);
  const [interests, setInterests] = useState(""),
    [hopes, setHopes] = useState(""),
    [results, setResults] = useState<Results | null>(null),
    [selected, setSelected] = useState<number | null>(null),
    [story, setStory] = useState<Story | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function explore(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStory(null);
    setSelected(null);
    try {
      setResults(await recommend({ interests, hopes }));
      setTimeout(
        () =>
          document
            .getElementById("pathways")
            ?.scrollIntoView({ behavior: "smooth" }),
        100,
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function choose(index: number) {
    if (!results) return;
    setSelected(index);
    setStory(null);
    setBusy(true);
    setError("");
    setTimeout(
      () =>
        document
          .getElementById("storyboard")
          ?.scrollIntoView({ behavior: "smooth" }),
      100,
    );
    try {
      setStory(
        await illustrate({ searchKey: results.searchKey, careerIndex: index }),
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function edit() {
    setResults(null);
    setSelected(null);
    setStory(null);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => document.getElementById("interests")?.focus(), 100);
  }
  return (
    <>
      <header>
        <div className="header-inner">
          <a href="/" className="brand" aria-label="Futura 2035 home">
            <span className="mark">f</span>
            <strong>Futura</strong>
            <span>2035</span>
          </a>
          <span className="pill">PARENT-LED · FUTURE-FOCUSED</span>
        </div>
      </header>
      <main>
        {!results ? (
          <>
            <section className="intro">
              <div>
                <p className="eyebrow">
                  CAREER POSSIBILITIES · SKILLS THAT TRAVEL
                </p>
                <h1>
                  Their interests.
                  <br />
                  Your hopes.
                  <br />
                  <em>Three possible futures.</em>
                </h1>
                <p className="lede">
                  Start with what your child enjoys. Explore promising
                  directions, understand the trade-offs,
                  <br className="desktop" /> and turn curiosity into something
                  they can build.
                </p>
              </div>
              <aside>
                <strong>A direction, not a destiny.</strong>
                <p>
                  Interests are a starting point—not proof of ability. Your
                  child’s own response to real projects should help shape what
                  comes next.
                </p>
              </aside>
            </section>
            <form onSubmit={explore}>
              <div className="input-grid">
                <section>
                  <p className="eyebrow">01 / YOUR CHILD</p>
                  <label htmlFor="interests">What does your child enjoy?</label>
                  <p>
                    Subjects, activities, things they choose to read, make, or
                    discuss.
                  </p>
                  <textarea
                    id="interests"
                    value={interests}
                    onChange={(e) => setInterests(e.target.value)}
                    placeholder="Economics, book writing, food critique"
                    maxLength={800}
                    required
                    disabled={busy}
                  />
                </section>
                <section>
                  <p className="eyebrow">02 / YOUR HOPES</p>
                  <label htmlFor="hopes">
                    What matters to you as a parent?
                  </label>
                  <p>Describe your priorities in your own words.</p>
                  <textarea
                    id="hopes"
                    value={hopes}
                    onChange={(e) => setHopes(e.target.value)}
                    placeholder="Good earning, stability, overseas"
                    maxLength={800}
                    required
                    disabled={busy}
                  />
                </section>
              </div>
              <div className="form-footer">
                <button
                  className="primary"
                  disabled={busy || !interests.trim() || !hopes.trim()}
                >
                  {busy
                    ? "Exploring possible futures…"
                    : "Explore possible futures ↗"}
                </button>
                <small>
                  No login needed. AI suggestions are possibilities, not
                  predictions.
                </small>
              </div>
            </form>
          </>
        ) : (
          <>
            <div className="section-top">
              <button className="text-button" onClick={edit} disabled={busy}>
                ← Edit interests & hopes
              </button>
              <span className="pill">TARGET HORIZON · 2035</span>
            </div>
            <section id="pathways">
              <p className="eyebrow">EXPLORE, COMPARE, THEN PICTURE</p>
              <h2>
                {results.careers.length
                  ? `${["", "One pathway", "Two pathways", "Three pathways"][results.careers.length]} worth exploring`
                  : "Let’s find a clearer direction"}
              </h2>
              <p className="section-description">
                Complementary possibilities. Choose a pathway to picture the
                work and the human contribution.
              </p>
              <div className="profile">
                <span>
                  <strong>THEIR INTERESTS</strong>
                  {interests}
                </span>
                <span>
                  <strong>YOUR HOPES</strong>
                  {hopes}
                </span>
              </div>
              <div className="career-grid">
                {results.careers.map((career, i) => (
                  <article
                    className={`career ${selected === i ? "chosen" : ""}`}
                    key={career.title}
                  >
                    <div className="card-top">
                      <span className="eyebrow">POSSIBLE FUTURE</span>
                      <span className="number">0{i + 1}</span>
                    </div>
                    <h3>{career.title}</h3>
                    <div className="description">
                      {career.description.map((line, j) => (
                        <p key={j}>{line}</p>
                      ))}
                    </div>
                    <div className="fit">
                      <p className="eyebrow">WHY IT FITS</p>
                      <p>{career.whyItFits}</p>
                    </div>
                    <div className="salary">
                      <strong>
                        {money(career.salaryMinINR)} –{" "}
                        {money(career.salaryMaxINR)}
                      </strong>
                      <span>illustrative annual earnings</span>
                      <small>{career.salaryBasis}</small>
                    </div>
                    <dl>
                      <dt>Stability</dt>
                      <dd>{career.stability}</dd>
                      <dt>Overseas possibility</dt>
                      <dd>{career.overseas}</dd>
                    </dl>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => choose(i)}
                    >
                      {selected === i && busy
                        ? "Illustrating their day…"
                        : selected === i
                          ? "View this day again ↗"
                          : "Picture a day in this life ↗"}
                    </button>
                  </article>
                ))}
              </div>
              <p className="note">{results.note}</p>
              {results.sources.length > 0 && (
                <details>
                  <summary>Research behind these possibilities</summary>
                  <ul>
                    {results.sources
                      .filter(
                        (s, i, a) => a.findIndex((t) => t.url === s.url) === i,
                      )
                      .map((s) => (
                        <li key={s.url}>
                          <a href={s.url} target="_blank" rel="noreferrer">
                            {s.title}
                          </a>
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </section>
            {selected !== null && (
              <section id="storyboard" aria-busy={busy}>
                <div className="story-heading">
                  <div>
                    <p className="eyebrow">A GLIMPSE INTO 2035</p>
                    <h2>A day in the life</h2>
                    <p className="career-name">
                      {results.careers[selected].title}
                    </p>
                  </div>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      setSelected(null);
                      setStory(null);
                      document
                        .getElementById("pathways")
                        ?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    Choose another pathway ↑
                  </button>
                </div>
                {busy && (
                  <div className="loading" role="status">
                    <span className="spinner" />
                    <h3>Bringing a possible future to life.</h3>
                    <p>
                      We’re creating the scenes and illustrations. This can take
                      a few minutes.
                    </p>
                  </div>
                )}
                {story && (
                  <>
                    <div className="panel-grid">
                      {story.panels.map((panel, i) => (
                        <figure key={i}>
                          {panel.imageUrl ? (
                            <img src={panel.imageUrl} alt={panel.caption} />
                          ) : (
                            <div className="image-fallback">
                              <span className="number">0{i + 1}</span>
                              <p>Illustration unavailable</p>
                            </div>
                          )}
                          <figcaption>
                            <span className="eyebrow">{panel.time}</span>
                            <p>{panel.caption}</p>
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                    {story.error && (
                      <div className="error" role="alert">
                        <p>{story.error}</p>
                        <p>
                          Your captions and any completed illustrations are
                          kept.
                        </p>
                        <button
                          className="primary"
                          onClick={() => choose(selected)}
                          disabled={busy}
                        >
                          Try again
                        </button>
                      </div>
                    )}
                    <p className="run-path">Path ran: {story.path}</p>
                  </>
                )}
              </section>
            )}
          </>
        )}
        {error && (
          <div className="error" role="alert">
            <p>{error}</p>
            <p className="run-path">
              Path ran:{" "}
              {selected === null
                ? "convex-career-action"
                : "convex-storyboard-action"}
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                selected === null
                  ? document.querySelector("form")?.requestSubmit()
                  : choose(selected)
              }
            >
              Try again
            </button>
          </div>
        )}
        {results && (
          <details className="raw-output">
            <summary>Full raw AI output</summary>
            <pre>
              {JSON.stringify(
                {
                  careerPath: results.path,
                  careerResponse: JSON.parse(results.raw),
                  storyboardPath: story?.path,
                  storyboardResponse: story?.raw ? JSON.parse(story.raw) : null,
                  storyboard: story
                    ? {
                        title: story.title,
                        panels: story.panels,
                        error: story.error,
                      }
                    : null,
                },
                null,
                2,
              )}
            </pre>
          </details>
        )}
        <footer>
          <p>“The future is not a job title. It is what they can do.”</p>
          <span>FUTURA 2035 · POSSIBILITIES, WITH PERSPECTIVE</span>
        </footer>
      </main>
    </>
  );
}
const url = import.meta.env.VITE_CONVEX_URL;
createRoot(document.getElementById("root")!).render(
  url ? (
    <ConvexProvider client={new ConvexReactClient(url)}>
      <App />
    </ConvexProvider>
  ) : (
    <main>
      <h1>Futura 2035</h1>
      <p>
        Connect this app to its new Convex project, then restart development.
      </p>
    </main>
  ),
);
