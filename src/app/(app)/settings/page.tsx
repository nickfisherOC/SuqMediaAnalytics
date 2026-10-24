import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Settings" };

export default function Page() {
  return (
    <ComingSoon title="Settings" phase={2}>
      Invite people, set roles, and edit brands (name, colours, posting cadence, scoreboard tiles). Until then, invites
      and brands are managed with the seed script described in the README.
    </ComingSoon>
  );
}
