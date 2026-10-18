import { useState } from "react";
import type { PlanMonthCardData } from "./PlanMonthCard";

export function PlanPdfMonthCard({ data }: { data: PlanMonthCardData }) {
  const [useFallback, setUseFallback] = useState(false);
  const imageUrl = useFallback ? data.fallbackImageUrl : data.imageUrl;
  return <article className="plan-pdf-month-card">
    {imageUrl && <img className="plan-pdf-month-image" src={imageUrl} alt="" loading="eager" decoding="async" onError={() => {
      if (!useFallback && data.fallbackImageUrl && data.imageUrl !== data.fallbackImageUrl) setUseFallback(true);
    }} />}
    <div className="plan-pdf-month-content">
      <span className="plan-pdf-month-label">MONTH {data.month}</span>
      <h2>{data.title}</h2>
      <p className="plan-pdf-skill-chip"><span>Skill you'll build:</span> <strong>{data.skill}</strong></p>
      <section className="plan-pdf-month-field">
        <h3>Project details</h3>
        <p>{data.details}</p>
      </section>
      <section className="plan-pdf-month-field plan-pdf-success-field">
        <h3>Success criteria</h3>
        <ul>{data.successCriteria.map((line, index) => <li key={index}>{line}</li>)}</ul>
      </section>
      <p className="plan-pdf-time"><strong>Time:</strong> {data.time}</p>
    </div>
  </article>;
}
