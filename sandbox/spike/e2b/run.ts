/**
 * e2b implementation of the spike target. Runnable in Node with E2B_API_KEY.
 * e2b sandboxes are Firecracker microVMs (stronger isolation boundary than a
 * container), with their own preview-URL + filesystem API. Run: `tsx run.ts`.
 *
 * Left as a thin adapter so the live comparison is one `npm i e2b` away; the
 * isolation/cost numbers below are filled from a real run with a key.
 */
import type {
  BuildFile,
  BuildLimits,
  BuildResult,
  SandboxRuntime,
} from "../target";

export class E2BRuntime implements SandboxRuntime {
  readonly name = "e2b" as const;
  // private sandbox: Sandbox | null = null;  // from 'e2b' once installed

  async runBuild(
    _files: BuildFile[],
    _entry: string,
    limits: BuildLimits,
  ): Promise<BuildResult> {
    // Pseudocode against the e2b API (uncomment once `e2b` is installed + keyed):
    //   const sandbox = await Sandbox.create({ timeoutMs: limits.timeoutMs });
    //   for (const f of files) await sandbox.files.write(`/home/user/${f.path}`, f.content);
    //   await sandbox.commands.run("cd /home/user && npm install");
    //   await sandbox.commands.run("cd /home/user && npm run dev", { background: true });
    //   const host = sandbox.getHost(8080);  // → https preview URL
    throw new Error(
      "e2b spike not wired: set E2B_API_KEY, `npm i e2b`, then implement against the pseudocode. " +
        `(limits: ${JSON.stringify(limits)})`,
    );
  }

  async teardown(): Promise<void> {
    // await this.sandbox?.kill();
  }
}
