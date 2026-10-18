import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export type FaqPage = "landing" | "results";

export function FaqBootstrap() {
  const seedDefaults = useMutation(api.faqs.seedDefaults);
  useEffect(() => { void seedDefaults({}).catch(() => {}); }, [seedDefaults]);
  return null;
}

export function ManagedFaqSection({ page, className }: { page: FaqPage; className: string }) {
  const faqs = useQuery(api.faqs.list, { page });
  if (!faqs?.length) return null;
  return <section className={className} aria-label="Frequently asked questions">
    {faqs.map(faq => <details className="m-accordion" key={faq.id}>
      <summary>{faq.question}</summary>
      <div><p>{faq.answer}</p></div>
    </details>)}
  </section>;
}
