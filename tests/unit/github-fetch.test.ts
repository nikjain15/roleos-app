import { describe, it, expect } from "vitest";
import { extractGitHubUrl, githubHandle } from "@/lib/github-fetch";

describe("github-fetch · URL + handle detection", () => {
  it("extracts a github.com/<handle> from text", () => {
    expect(extractGitHubUrl("https://github.com/torvalds")).toBe("https://github.com/torvalds");
    expect(extractGitHubUrl("my code is at github.com/jane-doe/some-repo, take a look")).toBe(
      "https://github.com/jane-doe",
    );
    expect(extractGitHubUrl("https://www.github.com/octocat?tab=repositories")).toBe(
      "https://github.com/octocat",
    );
  });

  it("ignores reserved (non-profile) paths and non-github URLs", () => {
    expect(extractGitHubUrl("https://github.com/features/actions")).toBeNull();
    expect(extractGitHubUrl("https://github.com/orgs/vercel")).toBeNull();
    expect(extractGitHubUrl("https://gitlab.com/someone")).toBeNull();
    expect(extractGitHubUrl("no link here at all")).toBeNull();
  });

  it("resolves a bare handle from a URL or raw @handle/handle", () => {
    expect(githubHandle("https://github.com/torvalds")).toBe("torvalds");
    expect(githubHandle("@octocat")).toBe("octocat");
    expect(githubHandle("jane-doe")).toBe("jane-doe");
    expect(githubHandle("settings")).toBeNull(); // reserved
    expect(githubHandle("not a handle with spaces")).toBeNull();
  });
});
