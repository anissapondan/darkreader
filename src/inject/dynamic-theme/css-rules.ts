import {parseURL, getAbsoluteURL} from './url';
import {logWarn} from '../utils/log';

export function iterateCSSRules(rules: CSSRuleList, iterate: (rule: CSSStyleRule) => void) {
    for (let x = 0, len = rules.length; x < len; x++) {
        const rule = rules[x];
        if (rule instanceof CSSMediaRule) {
            for (let y = 0, len1 = rule.media.length; y < len1; y++) {
                const media = rule.media[y];
                if (media.includes('screen') || media.includes('all') || !(media.includes('print') || media.includes('speech'))) {
                    iterateCSSRules(rule.cssRules, iterate);
                }
            }
        } else if (rule instanceof CSSStyleRule) {
            iterate(rule);
        } else if (rule instanceof CSSImportRule) {
            try {
                iterateCSSRules(rule.styleSheet.cssRules, iterate);
            } catch (err) {
                logWarn(err);
            }
        } else {
            logWarn(`CSSRule type not supported`, rule);
        }
    }
}

export function iterateCSSDeclarations(style: CSSStyleDeclaration, iterate: (property: string, value: string) => void) {
    const array = Array.from(style);
    for (let x = 0, len = array.length; x < len; x++) {
        const property = array[x];
        const value = style.getPropertyValue(property).trim();
        if (!value) {
            return;
        }
        iterate(property, value);
    }
}

function isCSSVariable(property: string) {
    return property.startsWith('--') && !property.startsWith('--darkreader');
}

export function getCSSVariables(rules: CSSRuleList) {
    const variables = new Map<string, string>();
    rules && iterateCSSRules(rules, (rule) => {
        rule.style && iterateCSSDeclarations(rule.style, (property, value) => {
            if (isCSSVariable(property)) {
                variables.set(property, value);
            }
        });
    });
    return variables;
}

export function getElementCSSVariables(element: HTMLElement) {
    const variables = new Map<string, string>();
    iterateCSSDeclarations(element.style, (property, value) => {
        if (isCSSVariable(property)) {
            variables.set(property, value);
        }
    });
    return variables;
}

export const cssURLRegex = /url\((('.+?')|(".+?")|([^\)]*?))\)/g;
export const cssImportRegex = /@import (url\()?(('.+?')|(".+?")|([^\)]*?))\)?;?/g;

export function getCSSURLValue(cssURL: string) {
    return cssURL.replace(/^url\((.*)\)$/, '$1').replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
}

export function getCSSBaseBath(url: string) {
    const cssURL = parseURL(url);
    return `${cssURL.protocol}//${cssURL.host}${cssURL.pathname.replace(/\?.*$/, '').replace(/(\/)([^\/]+)$/i, '$1')}`;
}

export function replaceCSSRelativeURLsWithAbsolute($css: string, cssBasePath: string) {
    return $css.replace(cssURLRegex, (match) => {
        const pathValue = getCSSURLValue(match);
        return `url("${getAbsoluteURL(cssBasePath, pathValue)}")`;
    });
}

const cssCommentsRegex = /\/\*[\s\S]*?\*\//g;

export function removeCSSComments($css: string) {
    return $css.replace(cssCommentsRegex, '');
}

const fontFaceRegex = /@font-face\s*{[^}]*}/g;

export function replaceCSSFontFace($css: string) {
    return $css.replace(fontFaceRegex, '');
}

const varRegex = /var\((--[^\s,]+),?\s*([^\(\)]*(\([^\(\)]*\)[^\(\)]*)*\s*)\)/g;

export function replaceCSSVariables(value: string, variables: Map<string, string>) {
    let missing = false;
    const result = value.replace(varRegex, (match, name, fallback) => {
        if (variables.has(name)) {
            return variables.get(name);
        } else if (fallback) {
            return fallback;
        } else {
            logWarn(`Variable ${name} not found`);
            missing = true;
        }
        return match;
    });
    if (missing) {
        return result;
    }
    if (result.match(varRegex)) {
        return replaceCSSVariables(result, variables);
    }
    return result;
}
