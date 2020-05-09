import {iterateShadowNodes} from '../utils/dom';
import {isDefinedSelectorSupported} from '../../utils/platform';
import {shouldManageStyle, STYLE_SELECTOR} from './style-manager';

let observer: MutationObserver = null;

interface ChangedStyles {
    created: (HTMLStyleElement | HTMLLinkElement)[];
    updated: (HTMLStyleElement | HTMLLinkElement)[];
    removed: (HTMLStyleElement | HTMLLinkElement)[];
    moved: (HTMLStyleElement | HTMLLinkElement)[];
}

function getAllManageableStyles(nodes: Array<Node>) {
    const results: (HTMLLinkElement | HTMLStyleElement)[] = [];
    for (let n = 0, len = nodes.length; n < len; n++) {
        const node = nodes[n];
        if (node instanceof Element) {
            if (shouldManageStyle(node)) {
                results.push(node as HTMLLinkElement | HTMLStyleElement);
            }
        }
        if (node instanceof Element || node instanceof ShadowRoot) {
            results.push(
                ...Array.from<HTMLLinkElement | HTMLStyleElement>(
                    node.querySelectorAll(STYLE_SELECTOR)
                ).filter(shouldManageStyle)
            );
        }
    }
    return results;
}

const undefinedGroups = new Map<string, Set<Element>>();
let elementsDefinitionCallback: (elements: Element[]) => void;

function collectUndefinedElements(root: ParentNode) {
    if (!isDefinedSelectorSupported()) {
        return;
    }
    const querySelector = root.querySelectorAll(':not(:defined)');
    for (let x = 0, len18 = querySelector.length; x < len18; x++) {
        const el = querySelector[x];
        const tag = el.tagName.toLowerCase();
        if (!undefinedGroups.has(tag)) {
            undefinedGroups.set(tag, new Set());
            customElementsWhenDefined(tag).then(() => {
                if (elementsDefinitionCallback) {
                    const elements = undefinedGroups.get(tag);
                    undefinedGroups.delete(tag);
                    elementsDefinitionCallback(Array.from(elements));
                }
            });
        }
        undefinedGroups.get(tag).add(el);
    }
}

function customElementsWhenDefined(tag: string) {
    return new Promise((resolve) => {
        // `customElements.whenDefined` is not available in extensions
        // https://bugs.chromium.org/p/chromium/issues/detail?id=390807
        if (window.customElements && typeof window.customElements.whenDefined === 'function') {
            customElements.whenDefined(tag).then(resolve);
        } else {
            const checkIfDefined = () => {
                const elements = undefinedGroups.get(tag);
                if (elements && elements.size > 0) {
                    if (elements.values().next().value.matches(':defined')) {
                        resolve();
                    } else {
                        requestAnimationFrame(checkIfDefined);
                    }
                }
            };
            requestAnimationFrame(checkIfDefined);
        }
    });
}

function watchWhenCustomElementsDefined(callback: (elements: Element[]) => void) {
    elementsDefinitionCallback = callback;
}

function unsubscribeFromDefineCustomElements() {
    elementsDefinitionCallback = null;
    undefinedGroups.clear();
}

const shadowObservers = new Set<MutationObserver>();
let nodesShadowObservers = new WeakMap<Node, MutationObserver>();

function unsubscribeFromShadowRootChanges() {
    shadowObservers.forEach((o) => o.disconnect());
    shadowObservers.clear();
    nodesShadowObservers = new WeakMap();
}

export function watchForStyleChanges(update: (styles: ChangedStyles) => void) {
    if (observer) {
        observer.disconnect();
        shadowObservers.forEach((o) => o.disconnect());
        shadowObservers.clear();
        nodesShadowObservers = new WeakMap();
    }

    function handleMutations(mutations: MutationRecord[]) {
        const createdStyles = new Set<HTMLLinkElement | HTMLStyleElement>();
        const updatedStyles = new Set<HTMLLinkElement | HTMLStyleElement>();
        const removedStyles = new Set<HTMLLinkElement | HTMLStyleElement>();
        const movedStyles = new Set<HTMLLinkElement | HTMLStyleElement>();

        const additions = new Set<Node>();
        const deletions = new Set<Node>();
        const styleUpdates = new Set<HTMLLinkElement | HTMLStyleElement>();
        for (let mut = 0, len = mutations.length; mut < len; mut++) {
            const m: MutationRecord = mutations[mut];
            for (let an = 0, len2 = m.addedNodes.length; an < len2; an++) {
                additions.add(m.addedNodes[an]);
            }
            for (let an = 0, len3 = m.removedNodes.length; an < len3; an++) {
                deletions.add(m.removedNodes[an]);
            }
            if (m.type === 'attributes' && shouldManageStyle(m.target)) {
                styleUpdates.add(m.target as HTMLLinkElement | HTMLStyleElement);
            }
        }
        const aArray = [...additions];
        const dArray = [...deletions];
        const styleAdditions = getAllManageableStyles(aArray);
        const styleDeletions = getAllManageableStyles(dArray);
        for (let aa = 0, len4 = aArray.length; aa < len4; aa++) {
            iterateShadowNodes(aArray[aa], (host) => {
                const shadowStyles = getAllManageableStyles([...host.shadowRoot.children]);
                if (shadowStyles.length > 0) {
                    styleAdditions.push(...shadowStyles);
                }
            });
        }
        for (let dd = 0, len5 = dArray.length; dd < len5; dd++) {
            iterateShadowNodes(dArray[dd], (host) => {
                const shadowStyles = getAllManageableStyles([...host.shadowRoot.children]);
                if (shadowStyles.length > 0) {
                    styleAdditions.push(...shadowStyles);
                }
            });
        }

        styleDeletions.forEach((style) => {
            if (style.isConnected) {
                movedStyles.add(style);
            } else {
                removedStyles.add(style);
            }
        });
        styleUpdates.forEach((style) => {
            if (!removedStyles.has(style)) {
                updatedStyles.add(style);
            }
        });
        styleAdditions.forEach((style) => {
            if (!(removedStyles.has(style) || movedStyles.has(style) || updatedStyles.has(style))) {
                createdStyles.add(style);
            }
        });

        if (createdStyles.size + removedStyles.size + updatedStyles.size > 0) {
            update({
                created: Array.from(createdStyles),
                updated: Array.from(updatedStyles),
                removed: Array.from(removedStyles),
                moved: Array.from(movedStyles),
            });
        }

        additions.forEach((n) => {
            if (n.isConnected) {
                iterateShadowNodes(n, subscribeForShadowRootChanges);
                if (n instanceof Element) {
                    collectUndefinedElements(n);
                }
            }
        });
    }

    function subscribeForShadowRootChanges(node: Element) {
        if (nodesShadowObservers.has(node) || node.shadowRoot == null) {
            return;
        }
        const shadowObserver = new MutationObserver(handleMutations);
        shadowObserver.observe(node.shadowRoot, mutationObserverOptions);
        shadowObservers.add(shadowObserver);
        nodesShadowObservers.set(node, shadowObserver);
    }

    const mutationObserverOptions = {childList: true, subtree: true, attributes: true, attributeFilter: ['rel', 'disabled']};
    observer = new MutationObserver(handleMutations);
    observer.observe(document.documentElement, mutationObserverOptions);
    iterateShadowNodes(document.documentElement, subscribeForShadowRootChanges);

    watchWhenCustomElementsDefined((hosts) => {
        const newStyles = getAllManageableStyles(hosts.map((h) => h.shadowRoot));
        update({created: newStyles, updated: [], removed: [], moved: []});
        hosts.forEach((h) => subscribeForShadowRootChanges(h));
    });
    collectUndefinedElements(document);
}

export function stopWatchingForStyleChanges() {
    if (observer) {
        observer.disconnect();
        observer = null;
        unsubscribeFromShadowRootChanges();
        unsubscribeFromDefineCustomElements();
    }
}
