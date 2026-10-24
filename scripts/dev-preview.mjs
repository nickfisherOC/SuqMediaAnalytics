// Runs the app locally in preview mode (built-in sample data, no sign-in),
// even when .env.local has Supabase settings. Next.js never overrides
// variables that are already set, so blanking them here wins.
import { spawn } from "node:child_process";

const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" };
spawn("npx", ["next", "dev", "-p", "3001"], { stdio: "inherit", env, shell: true }).on("exit", (code) => process.exit(code ?? 0));
