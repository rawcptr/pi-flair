/**
 * Color types, parsing, and ANSI escape helpers.
 */

// Types

export interface RgbColor {
    r: number;
    g: number;
    b: number;
}

// Parsing

/** Parse a hex colour string e.g. `#c15f3c` or `c15f3c`. */
export function parseHex(hex: string): RgbColor | null {
    const cleaned = hex.replace(/^#/, "");
    const m = cleaned.match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return null;
    return {
        r: parseInt(m[1]!, 16),
        g: parseInt(m[2]!, 16),
        b: parseInt(m[3]!, 16),
    };
}

/** Parse an `rgb(r, g, b)` string. */
export function parseRgb(str: string): RgbColor | null {
    const m = str.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (!m) return null;
    return {
        r: Math.min(255, parseInt(m[1]!)),
        g: Math.min(255, parseInt(m[2]!)),
        b: Math.min(255, parseInt(m[3]!)),
    };
}

/** Try hex first, then rgb(). Returns null if neither matches. */
export function parseColor(str: string): RgbColor | null {
    const trimmed = str.trim();
    return parseHex(trimmed) ?? parseRgb(trimmed);
}

// Formatting

export function formatColor(c: RgbColor): string {
    return `rgb(${c.r}, ${c.g}, ${c.b})`;
}
export function formatColorHex(c: RgbColor): string {
	const toHex = (n: number) => n.toString(16).padStart(2, '0');
	return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}


// ANSI escapes

export const RESET = "\x1b[0m";

/**
 * 24-bit ANSI foreground escape.
 * @param brightness 0 = pure colour, 1 = white.
 */
export function ansiFg(c: RgbColor, brightness = 0): string {
    const r = Math.round(c.r + (255 - c.r) * brightness);
    const g = Math.round(c.g + (255 - c.g) * brightness);
    const b = Math.round(c.b + (255 - c.b) * brightness);
    return `\x1b[38;2;${r};${g};${b}m`;
}

// Shine utility

/**
 * Apply a shine sweep across text with the given colours.
 * A bright band moves left-to-right — characters closer to shinePos
 * get higher brightness.
 */
export function shineText(
    text: string,
    colors: RgbColor[],
    shinePos: number,
    baseBrightness = 0.2,
): string {
    return (
        [...text]
            .map((ch, i) => {
                const color = colors[i % colors.length]!;
                let factor = baseBrightness;
                if (shinePos >= 0) {
                    const dist = Math.abs(i - shinePos);
                    if (dist === 0) factor = 0.7;
                    else if (dist === 1) factor = 0.35;
                }
                return ansiFg(color, factor) + ch;
            })
            .join("") + RESET
    );
}

/**
 * Find a brand colour for a model ID via family-based matching.
 *
 * Pure function — takes the colour map and fallback explicitly.
 *
 * Strategy: split the model ID into lowercase segments (by `/`, `-`, `.`,
 * `_`, ` `), then check each segment against the colour map keys. This
 * means any model whose name contains "claude" (e.g.
 * "anthropic/claude-sonnet-4-20250514") will match the "claude" colour.
 *
 * If nothing matches, the fallback colour is returned.
 */
export function lookupModelColor(
    modelId: string,
    modelColors: Record<string, RgbColor>,
    fallbackColor: RgbColor,
): RgbColor {
    const lower = modelId.toLowerCase();

    // Normalize keys once for case-insensitive lookup
    const normalized: Record<string, RgbColor> = {};
    for (const [k, v] of Object.entries(modelColors)) {
        normalized[k.toLowerCase()] = v;
    }

    // 1. Exact (including custom user-added keys)
    if (lower in normalized) return normalized[lower]!;

    // 2. If it's a provider/model format, explicitly check both:
    if (lower.includes("/")) {
        const [provider, model] = lower.split("/");
        if (provider && provider in normalized) return normalized[provider]!;
        if (model && model in normalized) return normalized[model]!;
    }

    // 3. Check each name/segment against normalized keys
    const segments = lower.split(/[/\-\s._]+/).filter(Boolean);
    for (const seg of segments) {
        if (seg in normalized) return normalized[seg]!;
    }

    // 4. Longest prefix/suffix match
    let best: { name: string; color: RgbColor } | undefined;
    for (const [name, color] of Object.entries(normalized)) {
        if (lower.startsWith(name) || lower.endsWith(name)) {
            if (!best || name.length > best.name.length) {
                best = { name, color };
            }
        }
    }
    if (best) return best.color;

    // 5. Fallback
    return fallbackColor;
}
