import test from 'node:test';
import assert from 'node:assert/strict';
import {
    aspectRatio,
    FAVICON_SIZES,
    findPreset,
    MASKABLE_ICON_SIZES,
    PRESET_PLATFORMS,
    PRESETS,
    PRESETS_LAST_REVIEWED,
    presetsFor,
} from '../dist/esm/index.js';

test('every preset has a unique id and a sane size', () => {
    assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length);
    for (const preset of PRESETS) {
        assert.ok(preset.width > 0 && preset.height > 0, preset.id);
        assert.ok(Number.isInteger(preset.width) && Number.isInteger(preset.height), preset.id);
        assert.ok(preset.platform && preset.name, preset.id);
        assert.equal(preset.ratio, aspectRatio(preset.width, preset.height).label, preset.id);
    }
});

test('lookups', () => {
    const square = findPreset('instagram-square');
    assert.deepEqual([square.width, square.height], [1080, 1080]);
    assert.equal(square.ratio, '1:1');
    assert.equal(findPreset('nope'), null);

    assert.ok(presetsFor('Instagram').length >= 4);
    assert.ok(presetsFor('instagram').length >= 4, 'matching is case-insensitive');
    assert.deepEqual(presetsFor('MySpace'), []);
    for (const platform of PRESET_PLATFORMS) {
        assert.ok(presetsFor(platform).length > 0, platform);
    }
});

test('the sizes people actually look up are right', () => {
    assert.deepEqual(
        [findPreset('open-graph').width, findPreset('open-graph').height],
        [1200, 630],
        'the og:image size every preview reader assumes',
    );
    assert.deepEqual([findPreset('youtube-thumbnail').width, findPreset('youtube-thumbnail').height], [1280, 720]);
    assert.equal(findPreset('youtube-thumbnail').ratio, '16:9');
    assert.deepEqual([findPreset('instagram-story').width, findPreset('instagram-story').height], [1080, 1920]);
    assert.equal(findPreset('instagram-story').ratio, '9:16');
});

test('the table says when it was last checked', () => {
    // These are other companies' product decisions and they expire. A date
    // that cannot be parsed is worse than no date at all.
    assert.match(PRESETS_LAST_REVIEWED, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!Number.isNaN(Date.parse(PRESETS_LAST_REVIEWED)));
});

test('icon sizes', () => {
    assert.ok(FAVICON_SIZES.some((icon) => icon.size === 180 && icon.purpose.includes('iOS')));
    assert.deepEqual(
        FAVICON_SIZES.map((icon) => icon.size),
        [...FAVICON_SIZES.map((icon) => icon.size)].sort((a, b) => a - b),
        'listed smallest first',
    );
    for (const size of MASKABLE_ICON_SIZES) {
        assert.ok(FAVICON_SIZES.some((icon) => icon.size === size), `${size} is also a favicon size`);
    }
});
