
# Go Programmer

Production Go in 2026. **Boring on purpose, strict by tooling, illegal states unrepresentable by convention.**

## Philosophy

Go gives you fewer type-system tools than Python, TypeScript, or Rust:

- No sum types — only `interface{}` with type-switch.
- No exhaustiveness check from the compiler — only the `exhaustive` linter.
- No `Option<T>` — only `nil` and the eternal trap of "is this nil interface or nil concrete?".
- No `Result<T, E>` — only `(T, error)`, no compiler enforcement of unwrapping.
- No newtype that prevents primitive coercion — `type UserID string` is still implicitly convertible from a literal when used carelessly.

**This is the whole point of the skill.** Where the language is weak, the linter bundle becomes the type checker, and code patterns become the type system. Treat `golangci-lint v2` with the configuration in `golangci-strict.md` as if it were `tsc --strict` or `basedpyright`. Treat `nilaway` and `go test -race` as if they were Miri.

The skill enforces five non-negotiables:

1. **Parse-don't-validate at every boundary.** HTTP/RPC/CLI/config gets parsed into a domain struct constructed only via `New*(...)` smart constructors. Once inside the domain, no further validation. See `data-modeling.md`.
2. **`(T, error)` everywhere.** No panics in library code. No bare `_ = err`. Errors are wrapped with `%w` and asserted with `errors.Is` / `errors.As`. Typed error structs for anything a caller can branch on. See `error-handling.md`.
3. **Sealed interfaces for variants.** Sum types via a sealed unexported method, dispatched through a `type switch`, with the `exhaustive` linter checking completeness. See `type-patterns.md`.
4. **`context.Context` is the first parameter.** Always. No `context.Background()` inside leaf functions. No goroutine without context-driven shutdown. No `time.Now()` in domain code — inject a clock. See `concurrency.md`.
5. **Generated, not hand-written, for external contracts.** `sqlc` for DB, `oapi-codegen` for OpenAPI servers and clients, `protoc-gen-go` + `protoc-gen-connect-go` for RPC. Hand-rolled marshalling is a regression. See `sqlc-pgx.md`, `grpc-connect.md`.

## Hard rules — tooling

| Category | Use | Never |
|---|---|---|
| Go version | **1.23+** (range-over-func, iter package, slog stable) | <1.22 |
| Module | `go modules` + `go work` for monorepos | dep, GOPATH layouts |
| Format | **`gofumpt`** (stricter gofmt) + `goimports -local <module>` | bare `gofmt` |
| Linter | **`golangci-lint v2`** with the strict bundle in `golangci-strict.md` | bare `go vet` |
| Nil checker | **`nilaway`** (Uber, stable since 2024) in CI | hope |
| Vet bundle | `go vet` + `fieldalignment` + `shadow` | "tests cover it" |
| Tests | `go test -race -shuffle=on -count=1` | `-count` cache, no race |
| Goroutine leaks | `go.uber.org/goleak` in `TestMain` | "looks fine" |
| Mock | `go.uber.org/mock` (gomock successor) | hand-written stubs |
| DB | `sqlc` + `jackc/pgx/v5` + `goose` migrations | `database/sql` + `gorm` |
| HTTP framework | **`gin-gonic/gin`** (de facto, ~48% of Go API repos) — `go-chi/chi` for minimalist, `connectrpc/connect-go` for RPC | `echo` (smaller eco), `fiber` (fasthttp = non-stdlib), `gorilla/mux` (in maintenance mode) |
| HTTP client | `net/http.Client` with explicit timeouts and a tuned `Transport`; `go-retryablehttp` for retry/backoff | untuned default clients |
| RPC | **`connectrpc/connect-go`** (gRPC-compatible, HTTP/1.1-friendly, browser-friendly) | hand-rolled `grpc-go` unless you specifically need bidi streaming features Connect lacks |
| Validation | `go-playground/validator/v10` for HTTP boundary + `bufbuild/protovalidate-go` for proto + smart constructors for domain | ad-hoc `if len(s) == 0` chains |
| Config | `caarlos0/env/v11` (struct-tag env) | `viper` unless you actually need file+env+flag merging |
| Logging | **`log/slog`** (stdlib, Go 1.21+) | logrus, zap, zerolog (all superseded) |
| CLI | `spf13/cobra` + `huh` for prompts | hand-rolled `os.Args` parsing past 2 flags |
| TUI | `charm.land/bubbletea/v2` + `bubbles/v2` + `lipgloss/v2` — see `bubbletea-v2.md` for CJK/IME | bubbletea v1 if you need IME |
| LLM / agent | direct `net/http` + Connect | langchaingo by default |

A single CI command should be the gate:

```bash
gofumpt -l . && \
  golangci-lint run ./... && \
  nilaway ./... && \
  go test -race -shuffle=on -count=1 ./...
```

If any of these fails, the change is not done. Period. See [golangci-strict.md](golangci-strict.md) for the per-linter rationale and the deliberate `nolint:` policy.

Scaffold a new project with `bun run "$SKILL_DIR/scripts/go/new-project.ts" <name>`. For the supported arguments, run `bun run "$SKILL_DIR/scripts/go/new-project.ts" --help`.

After editing Go files, run `bash "$SKILL_DIR/scripts/go/check-no-excuse-rules.sh" <changed Go files>` from the project directory. The checker uses the local Go toolchain to read source without building your project or resolving its modules.

## Hard rules — code

Read these per-file references for the canonical patterns:

- **Types & data** → [type-patterns.md](type-patterns.md), [data-modeling.md](data-modeling.md) — branded named types, smart constructors with unexported fields, sealed interfaces as sum types. Prefer values for immutable, safely copyable types; avoid copying locks.
- **Errors & resources** → [error-handling.md](error-handling.md) — sentinel vs typed struct, `errors.Is/As`, `%w` wrapping, one `httperr.Write` funnel for HTTP, and immediate `defer` cleanup (`bodyclose` / `sqlclosecheck`).
- **Concurrency** → [concurrency.md](concurrency.md) — `context.Context` discipline, `errgroup`, `sync.OnceValue`, `goleak`, `-race`, channel selection rules.
- **Library choice** → [libraries.md](libraries.md) — rationale and production defaults, including data and analytics with Arrow, DuckDB and Gonum.
- **HTTP backend** → [backend-stack.md](backend-stack.md) — `gin` server skeleton, middleware ordering, SSE/streaming with `http.Flusher`, structured slog logging, graceful shutdown.
- **RPC** → [grpc-connect.md](grpc-connect.md) — when to pick Connect vs grpc-go, codegen pipeline, protovalidate, streaming.
- **DB** → [sqlc-pgx.md](sqlc-pgx.md) — compile-time-safe SQL via sqlc + pgx connection pool + migrations via goose + testcontainers in CI.
- **CLI** → [cobra-stack.md](cobra-stack.md) — cobra layout, slog integration, graceful shutdown on signals, fang-style colored help.
- **TUI** → [bubbletea-v2.md](bubbletea-v2.md) — v2 model, `SetVirtualCursor(false)` + `tea.View{Cursor}` for CJK IME.
- **Testing** → [testing.md](testing.md) — table-driven tests, `require` vs `assert`, `autogold` snapshots, `rapid` property tests, `testcontainers` for integration, `goleak` for goroutine leaks.
- **Bootstrap** → [bootstrap.md](bootstrap.md) — generated project layout (`cmd/`, `internal/`, `pkg/`), Taskfile, CI.
- **Strict config** → [golangci-strict.md](golangci-strict.md) — canonical `.golangci.yml`, linter whitelist and rationale.
- **One-liners** → [one-liners.md](one-liners.md) — `go run` scripts with `//go:build ignore`, `gorun`-style invocation.

## The 250 pure LOC ceiling

The checker reports pure LOC per file: nonblank physical lines containing source, not comment-only lines (including block comments). A line with code and a comment counts once; nonblank lines in a raw string are source, even if they look like comments.

200–250 pure LOC is a warning band. More than 250 fails the check: split by responsibility, keeping one cohesive type and its methods per file. In the rare cases permitted by the [code-smell reference](../code-smells.md#acceptable-exceptions-rare-require-justification), add `// allow: SIZE_OK — <reason>` to report the count without failing the size check. Generated files remain excluded.

The `cmd/server/main.go` is the most common violator. Refactor it: `main.go` only wires `os.Args` → `cmd.Execute()`. Anything else lives in `internal/`.

## Existing codebases — non-strict project

When editing an existing `.go` file that doesn't follow these rules: **write new code in strict style, don't refactor existing code in the same change.** Use the `remove-ai-slops` skill for branch-scope cleanup.

## Activation

This skill activates whenever you write or modify any `.go` file, `go.mod`, `go.sum`, `.golangci.yml`, `Taskfile.yml`, or any of the codegen specs (`*.proto`, `*.sql` next to `sqlc.yaml`, `openapi.yaml` next to `oapi-codegen.yaml`). Even one-off scripts get the strict treatment — that is what `//go:build ignore` + `go run` is for: production hygiene with throwaway ergonomics.

The references contain the recipes. **Read them before writing code. Re-read them when the model drifts.** The post-write architectural review loop is non-negotiable.
