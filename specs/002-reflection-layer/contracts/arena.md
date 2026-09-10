# Reflection Arena Contract

## Supported names

| Name | Selected strategy |
|---|---|
| `react` | ReAct |
| `plan-and-execute` | Plan-and-Execute |
| `reflect:react` | Reflection wrapping ReAct |
| `reflect:plan-and-execute` | Reflection wrapping Plan-and-Execute |

Existing names remain unchanged and do not invoke Reflection.

## CLI behavior

The `--strategies` value and npm-compatible positional strategy form accept comma-separated supported names. Unknown names fail explicitly. Output uses the selected name as the section heading and includes answer, complete trace, and metrics.
