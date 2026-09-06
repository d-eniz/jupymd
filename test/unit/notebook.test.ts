import {strict as assert} from 'node:assert';
import {describe, it} from 'mocha';
import {getExecutableCellIndex, getExecutableCellIndices, getEditorPositionForCodeOffset, parseMarkdownCodeFences} from '../../src/notebook/NotebookCellIndex';
import {languageSupportRegistry as languages} from '../../src/languages/LanguageSupport';
import {parseNotebook} from '../../src/components/types';
import {stripAnsiSequences} from '../../src/utils/textOutput';

describe('Markdown cell identity', () => {
    it('counts notebook code cells, including other languages, but excludes prose and noeval', () => {
        const md = ['# Note', '```python', 'x = 1', '```', '```javascript', '2', '```',
            '```python .noeval', 'example', '```', '```python', 'print(x)', '```'].join('\n');
        assert.deepEqual(getExecutableCellIndices(md, 'python'), [0, 2]);
        assert.equal(getExecutableCellIndex(md, 10, 'python'), 2);
        assert.equal(getExecutableCellIndex(md, 4, 'python'), null);
        assert.equal(getExecutableCellIndex(md, 7, 'python'), null);
    });
    it('distinguishes identical sources by position after insertion and deletion (#54)', () => {
        const cell = '```python\nprint(1)\n```';
        assert.equal(getExecutableCellIndex(`${cell}\n${cell}`, 3, 'python'), 1);
        assert.equal(getExecutableCellIndex(`prose\n${cell}\n${cell}\n${cell}`, 7, 'python'), 2);
        assert.equal(getExecutableCellIndex(cell, 0, 'python'), 0);
    });
    it('recomputes identity after moving an executable cell across an excluded example', () => {
        const md = ['```python .noeval', 'example', '```', '```python', 'print("B")', '```', '```python', 'print("A")', '```'].join('\n');
        assert.equal(getExecutableCellIndex(md, 6, 'python'), 1);
        assert.equal(getExecutableCellIndex(md, 0, 'python'), null);
    });
    it('handles CRLF, tilde fences and backticks nested inside longer fences', () => {
        const md = '~~~~python\r\nprint(1)\r\n~~~~\r\n````python\r\n```\r\n````';
        assert.deepEqual(parseMarkdownCodeFences(md).map(f => [f.lineStart, f.lineEnd]), [[0,2],[3,5]]);
        assert.deepEqual(getExecutableCellIndices(md, 'python'), [0,1]);
    });
    it('excludes markdown-only cells and supports a discovered kernel language', () => {
        assert.deepEqual(getExecutableCellIndices('```python active="md"\nx\n```', 'python'), []);
        assert.equal(getExecutableCellIndex('```customlang\nx\n```', 0, 'customlang'), 0);
    });
    it('maps click offsets to editor positions and clamps offsets outside the source', () => {
        assert.deepEqual(getEditorPositionForCodeOffset('abc\ndef', 10, 5), {line:12, ch:1});
        assert.deepEqual(getEditorPositionForCodeOffset('abc', 10, -4), {line:11, ch:0});
        assert.deepEqual(getEditorPositionForCodeOffset('abc', 10, 99), {line:11, ch:3});
    });
});
describe('Language contracts', () => {
    for (const [alias, kernel] of [['py','python'],['jl','julia'],['sh','bash'],['node','javascript'],['ts','typescript'],['r','r'],['rust','rust']]) {
        it(`${alias} matches ${kernel}`, () => assert.equal(languages.matches(alias,kernel),true));
    }
    it('rejects mismatched kernels and preserves unknown language matching', () => {
        assert.equal(languages.matches('python','julia'),false);
        assert.equal(languages.matches('c++','C++'),true);
        assert.equal(languages.matches('c++','C++17'),false);
    });
});
describe('Notebook data and text', () => {
    it('rejects malformed notebook containers with useful errors', () => {
        for (const raw of ['null','{}','{"cells":{}}']) assert.throws(() => parseNotebook(raw), /missing cells array/);
        assert.throws(() => parseNotebook('{'), SyntaxError);
    });
    it('preserves output data while parsing', () => {
        const notebook = {cells:[{cell_type:'code',source:['1'], outputs:[{output_type:'stream',text:'é 漢字 🧪 e\u0301'}]}]};
        assert.deepEqual(parseNotebook(JSON.stringify(notebook)), notebook);
    });
    it('strips terminal control sequences without changing Unicode text', () => {
        assert.equal(stripAnsiSequences('\u001b[31mé 漢字 🧪 e\u0301\u001b[0m\n'), 'é 漢字 🧪 e\u0301\n');
    });
});
