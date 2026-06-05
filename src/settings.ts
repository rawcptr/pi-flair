/**
 * Settings — spinner-verb configuration, model colours, and hardcoded defaults.
 *
 * All runtime state lives in a single internal object, initialised from
 * hardcoded defaults. Persisted user settings (from ~/.pi/agent/flair.json
 * and .pi/flair.json) are overlaid on top via loadSettings() during
 * session_start.
 *
 * Load chain (last wins):
 *   1. Hardcoded defaults (below)
 *   2. ~/.pi/agent/flair.json  (global user overrides)
 *   3. .pi/flair.json          (project-local overrides)
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { type RgbColor } from "./color.js";

/** Persisted-settings shape — the JSON schema for flair.json. */

export interface FlairSettings {
	/** Spinner animation frames — overrides the built-in list. */
	spinner?: string[];
	/** Interval between spinner frames in ms. */
	spinnerIntervalMs?: number;
	/** Interval between shine animation frames in ms. */
	shineIntervalMs?: number;
	/** Verb list for the working-indicator message. */
	verbs?: string[];
	/** Default colour for unrecognised model families. */
	modelFallbackColor?: RgbColor;
	/** User-assigned model colours. */
	modelColors?: Record<string, RgbColor>;
}

// Hardcoded defaults

const DEFAULT_SPINNER = ["·", "✢", "✳", "✶", "✻", "✽"];
const DEFAULT_SPINNER_INTERVAL = 120;
const DEFAULT_SHINE_INTERVAL = 80;
const DEFAULT_VERBS = ["Thinking"];
const DEFAULT_FALLBACK: RgbColor = { r: 193, g: 95, b: 60 };

// Internal runtime state

interface RuntimeState {
	spinnerChars: string[];
	spinnerIntervalMs: number;
	shineIntervalMs: number;
	verbs: string[];
	fallbackColor: RgbColor;
	globalModelColors: Record<string, RgbColor>;
	localModelColors: Record<string, RgbColor>;
}

let state: RuntimeState = createDefaultState();

function createDefaultState(): RuntimeState {
	return {
		spinnerChars: [...DEFAULT_SPINNER],
		spinnerIntervalMs: DEFAULT_SPINNER_INTERVAL,
		shineIntervalMs: DEFAULT_SHINE_INTERVAL,
		verbs: [...DEFAULT_VERBS],
		fallbackColor: { ...DEFAULT_FALLBACK },
		globalModelColors: {},
		localModelColors: {},
	};
}

// Load / reload (starts from defaults then overlays persisted settings)

export function loadSettings(persisted?: FlairSettings, scope?: "global" | "local"): void {
	if (!persisted && scope === undefined) {
		state = createDefaultState();
		return;
	}
	if (!persisted) return;
	if (persisted.spinner) state.spinnerChars = [...persisted.spinner];
	if (persisted.spinnerIntervalMs !== undefined) state.spinnerIntervalMs = persisted.spinnerIntervalMs;
	if (persisted.shineIntervalMs !== undefined) state.shineIntervalMs = persisted.shineIntervalMs;
	if (persisted.verbs) state.verbs = [...persisted.verbs];
	if (persisted.modelFallbackColor) state.fallbackColor = { ...persisted.modelFallbackColor };
	if (scope === "global" && persisted.modelColors) {
		state.globalModelColors = { ...persisted.modelColors };
	}
	if (scope === "local" && persisted.modelColors) {
		state.localModelColors = { ...persisted.modelColors };
	}
	// No scope → backward-compat path (tests, legacy callers)
	if (!scope && persisted.modelColors) {
		state.globalModelColors = { ...persisted.modelColors };
	}
}

// Read accessors

export function getSpinnerChars(): readonly string[] {
	return state.spinnerChars;
}

export function getSpinnerIntervalMs(): number {
	return state.spinnerIntervalMs;
}

export function getShineIntervalMs(): number {
	return state.shineIntervalMs;
}

export function getVerbs(): readonly string[] {
	return state.verbs;
}

export function getFallbackColor(): RgbColor {
	return state.fallbackColor;
}

export function getModelColors(): Readonly<Record<string, RgbColor>> {
	return { ...state.globalModelColors, ...state.localModelColors };
}

// Model colour mutators

export function setModelColor(name: string, color: RgbColor, scope: "global" | "local" = "global"): void {
	const key = name.toLowerCase();
	if (scope === "global") state.globalModelColors[key] = color;
	else state.localModelColors[key] = color;
}

export function deleteModelColor(name: string, scope: "global" | "local" = "global"): boolean {
	const key = name.toLowerCase();
	const target = scope === "global" ? state.globalModelColors : state.localModelColors;
	if (!(key in target)) return false;
	delete target[key];
	return true;
}

export function clearModelColors(scope: "global" | "local" = "global"): void {
	if (scope === "global") state.globalModelColors = {};
	else state.localModelColors = {};
}

/** Report which scope a colour key belongs to. */
export function getColorScope(name: string): "global" | "local" | "both" {
	const key = name.toLowerCase();
	const inGlobal = key in state.globalModelColors;
	const inLocal = key in state.localModelColors;
	if (inGlobal && inLocal) return "both";
	if (inLocal) return "local";
	return "global";
}

/** Return the global color for a key that is shadowed by a local entry, if any. */
export function getShadowedColor(name: string): RgbColor | undefined {
	const key = name.toLowerCase();
	if (key in state.globalModelColors && key in state.localModelColors) {
		return state.globalModelColors[key];
	}
	return undefined;
}


// Persistence snapshot

export function collectSettings(): FlairSettings {
	return {
		modelColors: { ...getModelColors() },
	};
}

// File I/O

/**
 * Read a flair.json file and return parsed FlairSettings.
 * Returns {} if the file is missing or corrupt.
 */
export function readFlairSettings(
	path: string,
	notify?: (msg: string, level: "info" | "warning" | "error") => void,
): FlairSettings {
	try {
		return JSON.parse(readFileSync(path, "utf-8"));
	} catch (cause: any) {
		if (cause?.code !== "ENOENT") {
			notify?.(
				`flair: corrupt settings (${path}): ${String(cause)}`,
				"warning",
			);
		}
	}
	return {};
}

/**
 * Save current runtime state to a flair.json file.
 * Reads existing file (if any), merges current modelColors on top,
 * then writes back. Best-effort (silent on failure).
 */
export function saveFlairSettings(
	path: string,
	scope: "global" | "local",
	notify?: (msg: string, level: "info" | "warning" | "error") => void,
): void {
	try {
		mkdirSync(dirname(path), { recursive: true });
		let existing: Record<string, unknown> = {};
		try {
			existing = JSON.parse(readFileSync(path, "utf-8"));
		} catch (cause: any) {
			if (cause?.code !== "ENOENT") {
				notify?.(
					`flair: corrupt settings file, starting fresh: ${String(cause)}`,
					"warning",
				);
			}
		}
		existing.modelColors =
			scope === "global"
				? { ...state.globalModelColors }
				: { ...state.localModelColors };
		writeFileSync(path, JSON.stringify(existing, null, 2) + "\n");
	} catch {
		notify?.("flair: failed to save settings", "error");
	}
}
