import { pathlightLogoUrl } from "./compressedAssets";

export default function CareerDayHeader({ onHome, parentOnly = false }: { onHome: () => void; parentOnly?: boolean }) {
  return <header className="m-header"><div className="m-header-inner">
    <button className="m-brand" type="button" onClick={onHome} aria-label="Pathlight home"><img src={pathlightLogoUrl} alt="Pathlight. Real paths. Brighter future." /></button>
    {parentOnly && <span className="m-parent-only">Parent-Led</span>}
  </div></header>;
}
