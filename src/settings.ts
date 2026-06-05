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
	modelColors: Record<string, RgbColor>;
}

let state: RuntimeState = createDefaultState();

function createDefaultState(): RuntimeState {
	return {
		spinnerChars: [...DEFAULT_SPINNER],
		spinnerIntervalMs: DEFAULT_SPINNER_INTERVAL,
		shineIntervalMs: DEFAULT_SHINE_INTERVAL,
		verbs: [...DEFAULT_VERBS],
		fallbackColor: { ...DEFAULT_FALLBACK },
		modelColors: {},
	};
}

// Load / reload (starts from defaults then overlays persisted settings)

export function loadSettings(persisted?: FlairSettings): void {
	state = createDefaultState();
	if (!persisted) return;
	if (persisted.spinner) state.spinnerChars = [...persisted.spinner];
	if (persisted.spinnerIntervalMs !== undefined) state.spinnerIntervalMs = persisted.spinnerIntervalMs;
	if (persisted.shineIntervalMs !== undefined) state.shineIntervalMs = persisted.shineIntervalMs;
	if (persisted.verbs) state.verbs = [...persisted.verbs];
	if (persisted.modelFallbackColor) state.fallbackColor = { ...persisted.modelFallbackColor };
	if (persisted.modelColors) state.modelColors = { ...persisted.modelColors };
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
	return state.modelColors;
}

// Model colour mutators

export function setModelColor(name: string, color: RgbColor): void {
	state.modelColors[name.toLowerCase()] = color;
}

export function deleteModelColor(name: string): boolean {
	const key = name.toLowerCase();
	if (!(key in state.modelColors)) return false;
	delete state.modelColors[key];
	return true;
}

export function clearModelColors(): void {
	state.modelColors = {};
}


// Persistence snapshot

export function collectSettings(): FlairSettings {
	return {
		modelColors: { ...state.modelColors },
	};
}
