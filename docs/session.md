# OMP session paths

OMP stores persistent session transcripts below the active agent directory:

```text
<agentDir>/sessions/<encoded-cwd>/*.jsonl
```

`<agentDir>` is profile-aware. The default is `~/.omp/agent`; a named OMP profile uses `~/.omp/profiles/<profile>/agent`. `PI_CODING_AGENT_DIR` overrides the agent directory for the default profile. An explicit `--session-dir` can select another storage root for that process and takes precedence over the default path.

The current OMP 18.3 path encoder canonicalizes the working directory first. A directory under the home directory uses `-` followed by the home-relative path with `/`, `\`, and `:` replaced by `-`. A directory under the system temporary root uses `-tmp` followed by the temp-relative path with those separators replaced. A directory outside both roots uses the legacy absolute form `--<absolute-path-with-separators-replaced>--`. Symlink-equivalent paths resolve to the same canonical bucket.

Examples:

```text
/home/vmn/code/ompstack
  agentDir/sessions/-code-ompstack/
/tmp/pstack-run-123
  agentDir/sessions/-tmp-pstack-run-123/
/opt/work/ompstack
  agentDir/sessions/--opt-work-ompstack--/
```

The directory name is a storage bucket, not a session identifier. Each `*.jsonl` file is one session transcript. OMP may migrate legacy directory names when the bucket is opened. A recall operation must treat the current working-directory bucket as the scope and must not search sibling project buckets unless the operator explicitly asks for another project.

This document records the encoding used by the pinned OMP source. See `packages/coding-agent/src/session/session-paths.ts` in `.upstream/oh-my-pi` for the canonical implementation and `SessionManager.getDefaultSessionDir` for the session-root call path.
