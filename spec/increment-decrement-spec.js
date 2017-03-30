const { Range } = require('atom');
const path = require('path');
const pkg = require('../package.json');
const { locate, update } = require('../lib/actions/increment-decrement');

describe('Increment/Decrement Action', () => {
	let editor;
	const filePath = path.resolve(__dirname, './fixtures/numbers.txt');
	const runCommand = name => atom.commands.dispatch(atom.views.getView(editor), name);
	const getCursorPos = () => editor.getCursorBufferPosition();

	beforeEach(() => {
		waitsForPromise(() => atom.packages.activatePackage(pkg.name));
		waitsForPromise(() => atom.packages.activatePackage('language-html'));
		waitsForPromise(() => atom.workspace.open(filePath).then(ed => editor = ed));
	});

	afterEach(() => {
		editor.destroy();
		editor = null;
	});

	it('should locate proper number', () => {
		expect(locate(editor, [0, 0])).toEqual(new Range([0, 0], [0, 1]));
		expect(locate(editor, [0, 1])).toEqual(new Range([0, 0], [0, 1]));

		expect(locate(editor, [1, 0])).toEqual(new Range([1, 0], [1, 2]));
		expect(locate(editor, [1, 1])).toEqual(new Range([1, 0], [1, 2]));
		expect(locate(editor, [1, 2])).toEqual(new Range([1, 0], [1, 2]));

		expect(locate(editor, [2, 0])).toEqual(new Range([2, 0], [2, 5]));
		expect(locate(editor, [2, 3])).toEqual(new Range([2, 0], [2, 5]));
		expect(locate(editor, [2, 5])).toEqual(new Range([2, 0], [2, 5]));

		expect(locate(editor, [3, 0])).toEqual(new Range([3, 0], [3, 6]));
		expect(locate(editor, [3, 5])).toEqual(new Range([3, 0], [3, 6]));

		expect(locate(editor, [5, 0])).toEqual(new Range([5, 0], [5, 8]));
		expect(locate(editor, [5, 1])).toEqual(new Range([5, 0], [5, 8]));
		expect(locate(editor, [5, 4])).toEqual(new Range([5, 0], [5, 8]));

		expect(locate(editor, [6, 0])).toEqual(new Range([6, 0], [6, 4]));
		expect(locate(editor, [6, 2])).toEqual(new Range([6, 0], [6, 4]));
		expect(locate(editor, [6, 4])).toEqual(new Range([6, 0], [6, 4]));

		expect(locate(editor, [7, 0])).toEqual(new Range([7, 0], [7, 4]));
		expect(locate(editor, [7, 2])).toEqual(new Range([7, 0], [7, 4]));
		expect(locate(editor, [7, 4])).toEqual(new Range([7, 0], [7, 4]));
		expect(locate(editor, [7, 5])).toEqual(new Range([7, 1], [7, 8]));
		expect(locate(editor, [7, 8])).toEqual(new Range([7, 1], [7, 8]));

		expect(locate(editor, [10, 0])).toEqual(new Range([10, 0], [10, 4]));
	});

	it('should update number', () => {
		expect(update('1', 1)).toBe('2');
		expect(update('1', 0.1)).toBe('1.1');
		expect(update('1', 0.3)).toBe('1.3');
		expect(update('1', -0.3)).toBe('0.7');
		expect(update('1', 10)).toBe('11');

		expect(update('0.5', 1)).toBe('1.5');
		expect(update('0.5', 0.3)).toBe('0.8');
		expect(update('0.5', -0.6)).toBe('-0.1');

		// trim integer part
		expect(update('.5', 0.1)).toBe('.6');
		expect(update('.5', 1)).toBe('1.5');
		expect(update('-.5', -.1)).toBe('-.6');
		expect(update('-.5', 1)).toBe('.5');

		expect(update('0010', 1)).toBe('0011');
		expect(update('-0010', 1)).toBe('-0009');
		expect(update('0010', 10000)).toBe('10010');
		expect(update('-0010.100', 1.3)).toBe('-0008.800');
	});
});
