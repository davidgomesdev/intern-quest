# Agents

## Task tracking

Items/tasks/issues the user mentions refer to the GitHub Project **Abre Portas**:
https://github.com/users/davidgomesdev/projects/33 (owner `davidgomesdev`, project #33, repo `davidgomesdev/intern-quest`).

Look them up with `gh`:

```sh
gh project item-list 33 --owner davidgomesdev
gh issue view <number> --repo davidgomesdev/intern-quest
```

## Before starting work

Before implementing anything, check whether a task for it already exists (`gh issue list --repo davidgomesdev/intern-quest --search "<keywords>"`, or the project items above). If so, read it, follow it, and update its status (and comment/close it) when done.

Does not apply to `fill-batch` / `fill-entity` runs: those never touch tasks.
