# scripts/lib/resolve-omp.sh — source it, then call resolve_omp. Never returns node_modules/.bin/omp.
resolve_omp() {
  if [ -n "${PSTACK_OMP_BIN:-}" ]; then printf '%s\n' "$PSTACK_OMP_BIN"; return 0; fi
  clean_path=$(printf '%s' "$PATH" | tr ':' '\n' | grep -v '/node_modules/\.bin$' | paste -sd: -)
  PATH="$clean_path" command -v omp
}
