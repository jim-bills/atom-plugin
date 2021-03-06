'use babel';

import parseHTML from '@emmetio/html-matcher';
import SyntaxModel from './syntax-model';
import BufferStreamReader from '../buffer-stream';

/**
 * Creates DOM-like model for given text editor
 * @param  {TextEditor} editor
 * @param  {String}     syntax
 * @return {Node}
 */
export default function create(editor, syntax) {
	const stream = new BufferStreamReader(editor.getBuffer());
	const xml = syntax === 'xml';

	try {
		return new SyntaxModel(parseHTML(stream, { xml }), 'html', syntax || 'html');
	} catch (err) {
		console.warn(err);
	}
}
