/**
 * The sizes other people's platforms enforce.
 *
 * This is data that expires. Every one of these numbers is a product decision
 * at a company that will change it without telling anyone, so the file carries
 * the date it was last checked and the checking is a maintenance task, not a
 * one-off. Treat a preset as a good default, not as a guarantee — and if a
 * layout looks wrong, the platform's own guidance wins over this list.
 */
import { aspectRatio } from './aspect.js';
import type { Size } from './types.js';

/** When these dimensions were last checked against the platforms' own docs. */
export const PRESETS_LAST_REVIEWED = '2026-08-24';

export interface ImagePreset extends Size {
    id: string;
    platform: string;
    name: string;
    /** Reduced aspect ratio, e.g. "16:9". */
    ratio: string;
    notes?: string;
}

interface PresetSeed {
    id: string;
    platform: string;
    name: string;
    width: number;
    height: number;
    notes?: string;
}

const SEEDS: readonly PresetSeed[] = [
    // Instagram
    { id: 'instagram-square', platform: 'Instagram', name: 'Square post', width: 1080, height: 1080 },
    { id: 'instagram-portrait', platform: 'Instagram', name: 'Portrait post', width: 1080, height: 1350, notes: 'The tallest the feed will show without cropping.' },
    { id: 'instagram-landscape', platform: 'Instagram', name: 'Landscape post', width: 1080, height: 566 },
    { id: 'instagram-story', platform: 'Instagram', name: 'Story or Reel', width: 1080, height: 1920, notes: 'Keep text clear of the top and bottom 250px, where the interface sits.' },
    { id: 'instagram-profile', platform: 'Instagram', name: 'Profile picture', width: 320, height: 320, notes: 'Displayed as a circle.' },

    // Facebook
    { id: 'facebook-post', platform: 'Facebook', name: 'Shared link image', width: 1200, height: 630 },
    { id: 'facebook-cover', platform: 'Facebook', name: 'Page cover', width: 820, height: 312, notes: 'Cropped to 640x360 on phones.' },
    { id: 'facebook-profile', platform: 'Facebook', name: 'Profile picture', width: 720, height: 720 },
    { id: 'facebook-story', platform: 'Facebook', name: 'Story', width: 1080, height: 1920 },
    { id: 'facebook-event', platform: 'Facebook', name: 'Event cover', width: 1920, height: 1005 },

    // X
    { id: 'x-post', platform: 'X', name: 'Post image', width: 1600, height: 900 },
    { id: 'x-header', platform: 'X', name: 'Profile header', width: 1500, height: 500 },
    { id: 'x-profile', platform: 'X', name: 'Profile picture', width: 400, height: 400, notes: 'Displayed as a circle.' },

    // LinkedIn
    { id: 'linkedin-post', platform: 'LinkedIn', name: 'Post image', width: 1200, height: 627 },
    { id: 'linkedin-cover', platform: 'LinkedIn', name: 'Personal cover', width: 1584, height: 396 },
    { id: 'linkedin-company-cover', platform: 'LinkedIn', name: 'Company cover', width: 1128, height: 191 },
    { id: 'linkedin-logo', platform: 'LinkedIn', name: 'Company logo', width: 300, height: 300 },

    // YouTube
    { id: 'youtube-thumbnail', platform: 'YouTube', name: 'Video thumbnail', width: 1280, height: 720, notes: 'Under 2 MB, and legible at 210px wide in a sidebar.' },
    { id: 'youtube-banner', platform: 'YouTube', name: 'Channel banner', width: 2560, height: 1440, notes: 'Only the middle 1546x423 is safe on every device.' },
    { id: 'youtube-profile', platform: 'YouTube', name: 'Channel picture', width: 800, height: 800 },

    // Pinterest
    { id: 'pinterest-pin', platform: 'Pinterest', name: 'Standard pin', width: 1000, height: 1500 },
    { id: 'pinterest-square', platform: 'Pinterest', name: 'Square pin', width: 1000, height: 1000 },

    // TikTok
    { id: 'tiktok-video', platform: 'TikTok', name: 'Video cover', width: 1080, height: 1920 },
    { id: 'tiktok-profile', platform: 'TikTok', name: 'Profile picture', width: 200, height: 200 },

    // The open web
    { id: 'open-graph', platform: 'Web', name: 'Open Graph image', width: 1200, height: 630, notes: 'What Facebook, LinkedIn, Slack and most previews read from og:image.' },
    { id: 'twitter-card', platform: 'Web', name: 'Summary card, large image', width: 1200, height: 628 },
    { id: 'email-header', platform: 'Web', name: 'Email header', width: 600, height: 200, notes: '600px is the width every email client agrees on.' },
];

export const PRESETS: readonly ImagePreset[] = Object.freeze(
    SEEDS.map((seed) =>
        Object.freeze({
            ...seed,
            ratio: aspectRatio(seed.width, seed.height).label,
        }),
    ),
);

/** Platform names in the order they appear above. */
export const PRESET_PLATFORMS: readonly string[] = Object.freeze([
    ...new Set(PRESETS.map((preset) => preset.platform)),
]);

export function findPreset(id: string): ImagePreset | null {
    return PRESETS.find((preset) => preset.id === id) ?? null;
}

/** Every preset for one platform. Matching is case-insensitive. */
export function presetsFor(platform: string): ImagePreset[] {
    const wanted = platform.trim().toLowerCase();
    return PRESETS.filter((preset) => preset.platform.toLowerCase() === wanted);
}

export interface IconSize {
    size: number;
    /** Where this size is used, and what writes it. */
    purpose: string;
}

/** Favicon sizes still worth shipping, and what each is for. */
export const FAVICON_SIZES: readonly IconSize[] = Object.freeze([
    { size: 16, purpose: 'Browser tab' },
    { size: 32, purpose: 'Taskbar and bookmark bar' },
    { size: 48, purpose: 'Windows site shortcut' },
    { size: 180, purpose: 'apple-touch-icon, iOS home screen' },
    { size: 192, purpose: 'Android home screen, web app manifest' },
    { size: 512, purpose: 'Splash screen, web app manifest' },
]);

/**
 * Maskable icon sizes for a web app manifest. Android crops these to whatever
 * shape the launcher uses, so keep anything that must survive inside the
 * middle 80% — the safe zone is a circle of 40% radius from the centre.
 */
export const MASKABLE_ICON_SIZES: readonly number[] = Object.freeze([192, 512]);

/** The fraction of a maskable icon guaranteed to be visible after cropping. */
export const MASKABLE_SAFE_ZONE = 0.8;
