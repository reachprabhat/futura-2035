import {useQuery} from "convex/react";
import {api} from "../convex/_generated/api";
import CareerDay from "./CareerDay";
import CareerDayHeader from "./CareerDayHeader";
import "./milestone-one.css";

export default function CachedCareerDay({ title, gender }: { title: string; gender: "girl" | "boy" | "unspecified" }) {
  const libraryPreview = new URLSearchParams(location.search).get("library") === "1";
  const archived = useQuery(api.data.cachedCareer, libraryPreview ? "skip" : { title, gender });
  const shared = useQuery(api.sceneLibrary.career, libraryPreview ? { title, gender } : "skip");
  const heroLibrary = useQuery(api.sceneLibrary.career, !libraryPreview ? { title, gender } : "skip");
  const story = libraryPreview ? shared : archived;
  return <div className="m1" data-screen="storyboard"><CareerDayHeader onHome={() => location.assign("/")} /><main className="m-main"><CareerDay title={title} searchKey="" careerIndex={0} panels={story?.panels ?? []} heroSceneId={heroLibrary?.heroSceneId} heroImageUrl={heroLibrary?.heroImageUrl} cachedOnly gender={gender} backLabel="Back to Home" /></main></div>;
}
