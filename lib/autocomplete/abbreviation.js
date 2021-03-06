'use babel';

import { createSnippetsRegistry, isStylesheet } from '@emmetio/expand-abbreviation';
import { convertToCSSSnippets } from '@emmetio/css-snippets-resolver';
import { findMarker, markAbbreviation } from '../abbreviation-marker';
import expandAbbreviation from '../expand-abbreviation';
import detectSyntax, { hasAutoActivateContext } from '../detect-syntax';
import { getAutocompleteManager, getPrefix, hasScope } from '../utils';

const baseClass = 'emmet-expand-completion';
const completionsCache = new Map();

/**
 * Autocomplete provider factory for Atom’s autocomplete+ package.
 * All Emmet abbreviations are expanded as a part of autocomplete suggestion.
 */
export default function(selector) {
	return {
		selector,
		suggestionPriority: 100,
		getSuggestions(event) {
			const {editor, bufferPosition, activatedManually} = event;
			const autoActivate = hasAutoActivateContext(editor);
			const isStylesheetSyntax = isStylesheet(detectSyntax(editor));
			const prefix = isStylesheetSyntax
				? getStylesheetPrefix(editor, bufferPosition)
				: getMarkupPrefix(editor, bufferPosition);

			let result = [];

			if (autoActivate || activatedManually) {
				result.push(getExpandedAbbreviationCompletion(event));
			}


			// Add Emmet completions for given prefix, but only of caret is in
			// element prefix. If no prefix, add completions only if activated manually
			if ((prefix && autoActivate) || activatedManually) {
				if (isStylesheetSyntax || isInElementNameContext(editor, prefix, bufferPosition)) {
					result = result.concat(getSnippetsCompletions(editor, prefix));
				}
			}

			return result.filter(Boolean);
		},

		onDidInsertSuggestion({editor, suggestion, triggerPosition}) {
			if (suggestion.marker && !suggestion.marker.destroyed) {
				// Manually completed expanded abbreviation.
				// Use a bit of hackery here: if `replacementSuffix` doesn’t match
				// actual cursor prefix from editor, `autocomplete-plus` won’t
				// insert suggestion. We should handle this case manually.
				//
				// To check if `autocomplete-plus` actually inserted snippet,
				// we can simply compare abbreviation marker range with trigger
				// position: if ranges’ end doesn’t equal trigger position, then
				// completion wasn’t inserted
				const markerRange = suggestion.marker.getRange();
				const manager = getAutocompleteManager();
				if (manager && !markerRange.end.isEqual(triggerPosition)) {
					// Move cursor at the end of abbreviation range outside of
					// undo transaction to properly restore abbreviation marker
					// on undo
					const cursor = editor.getLastCursor();
					cursor.setBufferPosition(markerRange.end);

					editor.transact(() => {
						cursor.selection.setBufferRange(markerRange);
						manager.snippetsManager.insertSnippet(suggestion.snippet, editor, cursor);
						suggestion.marker.destroy();
					});
				}
			}
		}
	};
}

/**
 * Returns completion option for Emmet abbreviation found in given autocomplete
 * invocation options
 * @param {Object}  event Autocomplete invocation event
 * @return {Object} Completion with expanded Emmet abbreviation or `null` if
 * no valid abbreviation found at given context
 */
function getExpandedAbbreviationCompletion({editor, bufferPosition, prefix, activatedManually}) {
	// We should expand marked abbreviation only.
	// If there’s no marked abbreviation, try to mark it but only if
	// user invoked automomplete popup manually
	let marker = findMarker(editor, bufferPosition);
	if (!marker && activatedManually) {
		marker = markAbbreviation(editor, bufferPosition, activatedManually);
	}

	if (marker) {
		const snippet = marker.model.snippet;

		// For some syntaxes like Pug, it’s possible that extracted abbreviation
		// matches prefix itself (e.g. `li.class` expands to `li.class` in Pug)
		// In this case skip completion output.
		if (removeFields(snippet) === prefix) {
			return null;
		}

		return {
			snippet,
			marker,
			type: 'snippet',
			className: `${baseClass} ${getClassModifier(snippet)}`,
			replacementPrefix: editor.getTextInBufferRange(marker.getRange())
		};
	}
}

/**
 * Returns CSS class with size modifier depending on the size of given snippet
 * @param {String} snippet
 * @return {String}
 */
function getClassModifier(snippet) {
	switch (snippet.split('\n').length) {
		case 1:
			return '';
		case 2:
		case 3:
			return `${baseClass}__medium`;
		default:
			return `${baseClass}__small`;
	}
}

/**
 * Returns snippets completions for given editor.
 * @param  {TextEditor} editor
 * @param  {String} prefix
 * @return {String[]}
 */
function getSnippetsCompletions(editor, prefix) {
	const syntax = detectSyntax(editor);
	if (isStylesheet(syntax)) {
		return getStylesheetSnippetsCompletions(editor, prefix);
	} else if (syntax) {
		return getMarkupSnippetsCompletions(editor, prefix);
	}

	return [];
}

/**
 * Returns completions for markup languages (HTML, Slim, Pug, etc.)
 * @param  {TextEditor} editor
 * @param  {String} prefix
 * @return {Array}
 */
function getMarkupSnippetsCompletions(editor, prefix) {
	const syntax = detectSyntax(editor);

	if (!completionsCache.has(syntax)) {
		// Create cache with Emmet snippets completions
		const registry = createSnippetsRegistry(syntax);
		const field = (index, placeholder) => placeholder || '';
		const completions = registry.all({type: 'string'}).map(snippet => ({
			text: snippet.key,
			type: 'snippet',
			rightLabel: expandAbbreviation(snippet.value, editor, { syntax, field })
		}));

		completionsCache.set(syntax, completions);
	}

	let completions = completionsCache.get(syntax);

	if (prefix) {
		completions = completions.filter(completion => completion.text.indexOf(prefix) === 0);
	}

	return completions.map(completion => Object.assign({ replacementPrefix: prefix }, completion));
}

/**
 * Returns completions for stylesheet languages (CSS, SCSS, Less etc.)
 * @param  {TextEditor} editor
 * @param  {String} prefix
 * @return {Array}
 */
function getStylesheetSnippetsCompletions(editor, prefix) {
	if (hasScope(editor, 'meta.property-value')) {
		return false;
	}

	const syntax = detectSyntax(editor);

	if (!completionsCache.has(syntax)) {
		// Create cache with Emmet snippets completions
		const registry = createSnippetsRegistry(syntax);
		const snippets = convertToCSSSnippets(registry);
		const completions = snippets.map(snippet => {
			let rightLabel = snippet.property;
			let description;
			const keywords = snippet.keywords();
			if (keywords.length) {
				rightLabel += ` <span class="emmet-snippet-keywords">${removeFields(keywords.join(' | '))}</span>`;
				description = 'Contains embedded keywords. Type `-` or `:` and first embedded keyword letters for completion.';
			}

			return {
				text: snippet.key,
				type: 'snippet',
				rightLabelHTML: rightLabel,
				description
			};
		});

		completionsCache.set(syntax, completions);
	}

	let completions = completionsCache.get(syntax);

	if (prefix) {
		completions = completions.filter(completion => completion.text.indexOf(prefix) === 0);
	}

	return completions.map(completion => Object.assign({ replacementPrefix: prefix }, completion));
}

/**
 * Check if given `getSuggestions()` event is invoked inside element name context
 * @param  {AbbreviationMarker} marker
 * @param  {TextEditor}         editor
 * @param  {Point}              bufferPosition
 * @param  {String}             prefix
 * @return {Boolean}
 */
function isInElementNameContext(editor, prefix, bufferPosition) {
	const marker = findMarker(editor);
	if (!marker) {
		return false;
	}

	const markerRange = marker.editorMarker.getBufferRange();
	const abbr = marker.model.abbreviation;
	const offset = bufferPosition.column - prefix.length - markerRange.start.column;

	if (offset === 0) {
		// Word prefix is at the beginning of abbreviation: it’s an element
		// context for sure
		return true;
	} else if (offset > 0) {
		// Check if prefix is at the element bound, e.g. right after operator
		return /[>^+()]/.test(abbr[offset - 1]);
	}

	return false;
}

/**
 * Returns completion prefix for markup syntax from given position in editor
 * @param  {TextEditor} editor
 * @param  {Point} pos
 * @return {String}
 */
function getMarkupPrefix(editor, pos) {
	return getPrefix(editor, pos, /[\w:-]+$/);
}

/**
 * Returns completion prefix for stylesheet syntax from given position in editor
 * @param  {TextEditor} editor
 * @param  {Point} pos
 * @return {String}
 */
function getStylesheetPrefix(editor, pos) {
	return getPrefix(editor, pos, /[\w-@$]+$/);
}

/**
 * Quick and dirty way to remove fields from given string
 * @param  {String} str
 * @return {String}
 */
function removeFields(str) {
	return str.replace(/\$\{\d+(:[^}]+)?\}/g, '');
}
