import {useQuery} from "convex/react";
import {api} from "../convex/_generated/api";
import CareerDay from "./CareerDay";
import CareerDayHeader from "./CareerDayHeader";
import "./milestone-one.css";

export default function CachedCareerDay({ title, gender }: { title: string; gender: "girl" | "boy" | "unspecified" }) {
  const story = useQuery(api.data.cachedCareer, { title, gender });
  return <div className="m1 m-with-nav" data-screen="storyboard"><CareerDayHeader onBack={() => location.assign("/")} onHome={() => location.assign("/")} /><main className="m-main"><CareerDay title={title} searchKey="" careerIndex={0} panels={story?.panels ?? []} cachedOnly /></main></div>;
}
