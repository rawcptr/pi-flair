# pi-flair

When pi is working, the TUI footer shows a spinner and a spinner-verb. pi-flair
colours that message (that you can change) with a color you choose & sweeps a bright
band across it left-to-right.
It also cycles through randomised spinner-verbs on every model turn if you add them to the config.

https://github.com/user-attachments/assets/1efba3de-6201-422e-ad56-4f04ad62148e


## Install

```bash
pi install git:github.com/rawcptr/pi-flair
```

## Usage

### Commands

| Command | What it does |
| --- | --- |
| `/flair help` | Show usage help |
| `/flair list` | List all configured model colours |
| `/flair add <name> <colour>` | Assign or update a model colour (multiple names allowed: `/flair add llama mistral #ff8800`) |
| `/flair remove <name>` | Remove a model colour assignment |
| `/flair clear` | Clear all model colours |
| `/flair reset` | Restore defaults (empty colour map) |

### Colour formats

```text
# Hex (with or without #)
/flair add deepseek #4d6bfe
/flair add claude d97757

# RGB
/flair add gpt rgb(48, 48, 48)

# Multiple names, one colour
/flair add llama mistral #ff8800
```

Both model names and colour values are matched case-insensitively.

## Configuration

All settings are optional. They can be set in two JSON files, loaded in order
(last wins):

1. **Global**: `~/.pi/agent/flair.json`
2. **Project-local**: `.pi/flair.json` (relative to the project root)

If a file is missing or malformed, it is silently skipped (a warning is
logged). If no settings files exist, hardcoded defaults are used.

Example configuration file:

```json
{
  "spinner": ["·", "✢", "✳", "✶", "✻", "✽"],
  "spinnerIntervalMs": 120,
  "shineIntervalMs": 80,
  "verbs": ["Thinking"],
  "modelFallbackColor": { "r": 193, "g": 95, "b": 60 },
  "modelColors": {
    "claude": { "r": 217, "g": 119, "b": 87 },
    "deepseek": { "r": 77, "g": 107, "b": 254 },
    "gemini": { "r": 173, "g": 137, "b": 235 }
  }
}
```

Check out the full sample [configuration file](./.pi/flair.json).

### Settings reference

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `spinner` | `string[]` | `["·", "✢", "✳", "✶", "✻", "✽"]` | Spinner animation frames, displayed in sequence |
| `spinnerIntervalMs` | `number` | `120` | Interval between spinner frames in milliseconds |
| `shineIntervalMs` | `number` | `80` | Interval between shine animation frames in milliseconds |
| `verbs` | `string[]` | `["Thinking"]` | Verb list for the working-indicator message. Picked randomly at the start of each agent turn. Append entries like `"Processing"`, `"Analysing"`, `"Reasoning"` |
| `modelColors` | `Record<string, RgbColor>` | `{}` | Model-name → RGB colour mapping. Keys are matched case-insensitively against model IDs. Colours use `{ r, g, b }` with values 0–255 |
| `modelFallbackColor` | `RgbColor` | `{ r: 193, g: 95, b: 60 }` | Fallback colour used when no model in `modelColors` matches the active model ID |

### Model colour lookup strategy

When pi selects a model, its model ID (e.g. `anthropic/claude-sonnet-4-20250514`)
is matched against the `modelColors` map in the following order:

1. **Exact match** — the full model ID must appear as a key (case-insensitive)
2. **Provider/model split** — if the ID contains `/`, both the provider
   segment and the model segment are checked individually
3. **Segment extraction** — the ID is split on `/`, `-`, `.`, `_`, and
   whitespace; each segment is checked as a colour key
4. **Longest prefix/suffix** — the colour key that is a prefix or suffix of
   the model ID wins (picking the longest match)
5. **Fallback** — `modelFallbackColor` is used

This means a mapping like `"claude" → orange` will match any model whose
ID contains a `claude` segment (e.g. `claude-sonnet-4-20250514`,
`anthropic/claude-3-opus`).

## License

MIT
