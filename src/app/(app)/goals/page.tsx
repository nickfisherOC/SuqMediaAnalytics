import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Goals" };

export default function Page() {
  return (
    <ComingSoon title="Goals" phase={6}>
      Goals per brand with deadlines (for example, 1,000 PeopleSuq followers before Episode 1), whether you&apos;re on
      pace, the weekly rate needed, and posting cadence against target.
    </ComingSoon>
  );
}
