import { Mail, ExternalLink } from "lucide-react";

// Organisation block at the foot of the landing page: who runs Ready Force
// Labs, how to bring it to a class or cohort, and a closing brand band.

const CONTACT_EMAIL = "info@readyforcecyber.org";
const WEBSITE_URL = "https://readyforcecyber.org";

const PILLARS = [
  { name: "Learn", body: "Career-aligned curricula for learners at every stage." },
  { name: "Practice", body: "Real-world labs, coaching, and cohort experiences." },
  { name: "Prove", body: "Skills evidence, badges, and readiness reporting." },
];

function LogoTile({ size, alt }: { size: "md" | "lg"; alt: string }) {
  const box = size === "lg" ? "w-16 h-16 sm:w-20 sm:h-20" : "w-14 h-14 sm:w-16 sm:h-16";
  return (
    <div
      className={`${box} shrink-0 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center`}
    >
      <img src="/rfc-logo.svg" alt={alt} className="w-3/4 h-3/4" />
    </div>
  );
}

export function AboutReadyForce() {
  return (
    <section aria-labelledby="about-rfc-heading" className="w-full">
      <div className="max-w-5xl mx-auto px-4 py-16 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* Mission */}
        <div className="min-w-0">
          <div className="flex items-start gap-4 sm:gap-5">
            <LogoTile size="lg" alt="Ready Force Cyber" />
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs font-extrabold uppercase tracking-[0.18em] text-cyan-700">
                501(c)(3) workforce development nonprofit
              </p>
              <h2
                id="about-rfc-heading"
                className="mt-1 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-950 leading-[1.1]"
              >
                Building pathways into cyber and AI careers
              </h2>
            </div>
          </div>

          <p className="mt-6 text-base sm:text-lg leading-relaxed text-slate-600">
            Ready Force Cyber builds inclusive technology talent pipelines through accessible
            cybersecurity education, practical AI literacy, hands-on skill development, and career
            navigation. Our programs help learners build confidence while giving educators and
            workforce partners clear evidence of job-ready growth.
          </p>

          <ul className="mt-8 pt-8 border-t border-slate-200 grid gap-6 sm:grid-cols-3 sm:gap-0">
            {PILLARS.map((p, i) => (
              <li
                key={p.name}
                className={
                  i === 0
                    ? "sm:pr-6"
                    : "sm:px-6 sm:border-l sm:border-slate-200 pt-6 sm:pt-0 border-t border-slate-200 sm:border-t-0"
                }
              >
                <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-cyan-700">
                  {p.name}
                </p>
                <p className="mt-2 text-slate-600 leading-relaxed">{p.body}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* Work with us */}
        <aside className="rounded-3xl border border-cyan-200 bg-white p-6 sm:p-7 shadow-sm">
          <p className="text-[11px] sm:text-xs font-extrabold uppercase tracking-[0.18em] text-cyan-700">
            Work with us
          </p>
          <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 leading-tight">
            Bring Ready Force Labs to your learners
          </h3>
          <p className="mt-3 text-slate-600 leading-relaxed">
            Contact Ready Force Cyber about classroom programs, workforce cohorts, instructor
            support, partnerships, or a customized training experience.
          </p>

          <div className="mt-6 space-y-3">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="flex items-center justify-center gap-2.5 w-full rounded-2xl bg-slate-950 px-5 py-3.5 font-bold text-white hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400/50"
            >
              <Mail className="w-5 h-5" aria-hidden="true" />
              Email Ready Force Cyber
            </a>
            <a
              href={WEBSITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2.5 w-full rounded-2xl border border-slate-200 bg-white px-5 py-3.5 font-bold text-slate-950 hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400/50"
            >
              Visit our website
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>

          <p className="mt-5 text-center text-sm text-slate-500">
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-slate-700 hover:underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </aside>
      </div>

      {/* Brand band */}
      <div className="bg-[#020617]">
        <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <LogoTile size="md" alt="" />
            <div className="min-w-0">
              <p className="text-lg font-extrabold uppercase tracking-[0.14em] text-white">
                Ready Force Cyber
              </p>
              <p className="text-sm text-slate-400">
                Cybersecurity, AI literacy, and workforce development training.
              </p>
            </div>
          </div>
          {/* The three pillars again as a sign-off. Labels, not links — there
              is nowhere for them to go yet, and dead buttons are worse. */}
          <ul className="flex flex-wrap gap-2 sm:gap-3" aria-label="Learn, Practice, Prove">
            {PILLARS.map((p) => (
              <li
                key={p.name}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-xs font-extrabold uppercase tracking-[0.18em] text-cyan-300"
              >
                {p.name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
