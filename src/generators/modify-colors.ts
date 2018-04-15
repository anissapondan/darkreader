import {rgbToHSL, hslToRGB, rgbToString, rgbToHexString, RGBA, HSLA} from '../utils/color';
import {scale, clamp} from '../utils/math';
import {applyColorMatrix, createFilterMatrix} from './utils/matrix';
import {FilterConfig} from '../definitions';

const colorModificationCache = new Map<Function, Map<string, string>>();

export function clearColorModificationCache() {
    colorModificationCache.clear();
}

function modifyColorWithCache(rgb: RGBA, filter: FilterConfig, modifyHSL: (hsl: HSLA) => HSLA) {
    let fnCache: Map<string, string>;
    if (colorModificationCache.has(modifyHSL)) {
        fnCache = colorModificationCache.get(modifyHSL);
    } else {
        fnCache = new Map();
        colorModificationCache.set(modifyHSL, fnCache);
    }
    const id = Object.entries(rgb)
        .concat(Object.entries(filter).filter(([key]) => ['mode', 'brightness', 'contrast', 'grayscale', 'sepia'].indexOf(key) >= 0))
        .map(([key, value]) => `${key}:${value}`)
        .join(';');
    if (fnCache.has(id)) {
        return fnCache.get(id);
    }

    const hsl = rgbToHSL(rgb);
    const modified = modifyHSL(hsl);
    const {r, g, b, a} = hslToRGB(modified);
    const [rf, gf, bf] = applyColorMatrix([r, g, b], createFilterMatrix({...filter, mode: 0}));

    const color = (a === 1 ?
        rgbToHexString({r: rf, g: gf, b: bf}) :
        rgbToString({r: rf, g: gf, b: bf, a}));

    fnCache.set(id, color);
    return color;
}

function modifyLightModeHSL({h, s, l, a}) {
    const lMin = 0;
    const lMax = 0.95;
    const sNeutralLim = 0.16;
    const sColored = 0.16;
    const hColored = 40;

    const lx = scale(l, 0, 1, lMin, lMax);

    let hx = h;
    let sx = s;
    if (s < sNeutralLim) {
        sx = sColored;
        hx = hColored;
    }

    return {h: hx, s: sx, l: lx, a};
}

function modifyBgHSL({h, s, l, a}) {
    const lMin = 0.1;
    const lMaxS0 = 0.2;
    const lMaxS1 = 0.4;
    const sNeutralLim = 0.16;
    const sColored = 0.16;
    const hColored = 220;

    const lMax = scale(s, 0, 1, lMaxS0, lMaxS1);
    const lx = (l < lMax ?
        l :
        scale(l, lMax, 1, lMax, lMin));

    let hx = h;
    let sx = s;
    if (s < sNeutralLim) {
        sx = sColored;
        hx = hColored;
    } else if (l > lMax) {
        sx = s * scale(l, lMax, 1, 1, 0.5);
    }

    return {h: hx, s: sx, l: lx, a};
}

export function modifyBackgroundColor(rgb: RGBA, filter: FilterConfig) {
    if (filter.mode === 0) {
        return modifyColorWithCache(rgb, filter, modifyLightModeHSL);
    }
    return modifyColorWithCache(rgb, filter, modifyBgHSL);
}

function modifyFgHSL({h, s, l, a}) {
    const lMax = 0.9;
    const lMinS0 = 0.6;
    const lMinS1 = 0.6;
    const sNeutralLim = 0.2;
    const sColored = 0.16;
    const hColored = 40;

    const lMin = scale(s, 0, 1, lMinS0, lMinS1);
    const lx = (l < lMax ?
        scale(l, 0, lMin, lMax, lMin) :
        l);
    let hx = h;
    let sx = s;
    if (s < sNeutralLim) {
        sx = sColored;
        hx = hColored;
    }

    return {h: hx, s: sx, l: lx, a};
}

export function modifyForegroundColor(rgb: RGBA, filter: FilterConfig) {
    if (filter.mode === 0) {
        return modifyColorWithCache(rgb, filter, modifyLightModeHSL);
    }
    return modifyColorWithCache(rgb, filter, modifyFgHSL);
}

function modifyBorderHSL({h, s, l, a}) {
    const lMinS0 = 0.2;
    const lMinS1 = 0.3;
    const lMaxS0 = 0.4;
    const lMaxS1 = 0.5;

    const lMin = scale(s, 0, 1, lMinS0, lMinS1);
    const lMax = scale(s, 0, 1, lMaxS0, lMaxS1);
    const lx = scale(l, 0, 1, lMax, lMin);

    return {h, s, l: lx, a};
}

export function modifyBorderColor(rgb: RGBA, filter: FilterConfig) {
    if (filter.mode === 0) {
        return modifyColorWithCache(rgb, filter, modifyLightModeHSL);
    }
    return modifyColorWithCache(rgb, filter, modifyBorderHSL);
}

export function modifyShadowColor(rgb: RGBA, filter: FilterConfig) {
    return modifyBackgroundColor(rgb, filter);
}

export function modifyGradientColor(rgb: RGBA, filter: FilterConfig) {
    return modifyBackgroundColor(rgb, filter);
}