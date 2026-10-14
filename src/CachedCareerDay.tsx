import {useQuery} from "convex/react";
import {api} from "../convex/_generated/api";
import CareerDay from "./CareerDay";
import CareerDayHeader from "./CareerDayHeader";
import "./milestone-one.css";

export default function CachedCareerDay({ title, gender }: { title: string; gender: "girl" | "boy" | "unspecified" }) {
  const libraryPreview = new URLSearchParams(location.search).get("library") === "1";
  const archived = useQuery(api.data.cachedCareer, libraryPreview ? "skip" : { title, gender });
  const shared = useQuery(api.sceneLibrary.career, libraryPreview ? { title, gender } : "skip");
  const story = libraryPreview ? shared : archived;
  return <div className="m1 m-with-nav" data-screen="storyboard"><CareerDayHeader onBack={() => location.assign("/")} onHome={() => location.assign("/")} /><main className="m-main"><CareerDay title={title} searchKey="" careerIndex={0} panels={story?.panels ?? []} cachedOnly /></main></div>;
}
