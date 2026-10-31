import { WorkFrame } from "@/components/shell/work-frame";

export default function ProductionLayout({ children }: { children: React.ReactNode }) {
  return <WorkFrame>{children}</WorkFrame>;
}
