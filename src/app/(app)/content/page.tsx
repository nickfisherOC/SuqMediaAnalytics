import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Content Lab" };

export default function Page() {
  return (
    <ComingSoon title="Content Lab" phase={6}>
      Every video across all four platforms, with combined views, growth since posting and tags, plus the 31-day series
      tracker. Cross-platform matching arrives with the social connectors in phase 4.
    </ComingSoon>
  );
}
