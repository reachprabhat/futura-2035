import { useState } from "react";

export default function CareerDayHeader({ onBack, onHome }: { onBack: () => void; onHome: () => void }) {
  const [favourite, setFavourite] = useState(false);
  return <header className="m-header"><div className="m-header-inner">
    <button className="day-header-back" aria-label="Back to career" onClick={onBack}><svg className="m-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5m6-6-6 6 6 6" /></svg></button>
    <button className="m-brand" onClick={onHome} aria-label="Futura 2035 home"><span className="m-brand-mark">f<span /></span><strong>Futura</strong><span className="m-year">2035</span></button>
    <button className="day-heart" aria-label="Save this career" aria-pressed={favourite} onClick={() => setFavourite(value => !value)}><svg className="m-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20 4 12C-2 5 7 0 12 7c5-7 14-2 8 5Z" /></svg></button>
  </div></header>;
}
