import { pathlightLogoUrl } from "./compressedAssets";

export default function BrandLogo() {
  return <a className="admin-brand" href="/" aria-label="Pathlight home"><img src={pathlightLogoUrl} alt="Pathlight. Real paths. Brighter future." /></a>;
}
